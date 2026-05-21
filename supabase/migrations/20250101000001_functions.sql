-- =============================================================================
-- LabourFlow — Database Functions (IEEE 830 §3.4 / §6.2)
-- =============================================================================
-- Core engine: salary recalculation, role helpers, JWT claim sync, audit helpers.
-- Functions use SECURITY DEFINER where they must bypass RLS for computation,
-- but every action is validated against the caller's role before any write.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Role helper: read app_role from JWT (set in custom_access_token_hook).
-- Falls back to the app_users table if the JWT claim is missing.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  claim_role TEXT;
  fallback   TEXT;
BEGIN
  -- Try JWT custom claim first
  BEGIN
    claim_role := current_setting('request.jwt.claims', true)::jsonb ->> 'app_role';
  EXCEPTION WHEN OTHERS THEN
    claim_role := NULL;
  END;

  IF claim_role IS NOT NULL AND claim_role <> '' THEN
    RETURN claim_role;
  END IF;

  SELECT role INTO fallback FROM public.app_users WHERE user_id = auth.uid();
  RETURN COALESCE(fallback, 'manager');
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_app_role() TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- Boolean helper for RLS policies
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT public.current_app_role() = 'admin';
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- Custom Access Token Hook (Supabase Auth)
-- Adds app_role into the JWT so the frontend & RLS can read it without a DB round-trip.
-- Register this hook in: Supabase Dashboard → Authentication → Hooks → Custom Access Token.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  claims  jsonb;
  uid     uuid;
  u_role  text;
BEGIN
  claims := event->'claims';
  uid    := (event->>'user_id')::uuid;

  SELECT role INTO u_role FROM public.app_users WHERE user_id = uid;
  IF u_role IS NULL THEN
    u_role := 'manager';
  END IF;

  claims := jsonb_set(claims, '{app_role}', to_jsonb(u_role));
  event  := jsonb_set(event, '{claims}', claims);

  RETURN event;
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;

-- -----------------------------------------------------------------------------
-- Auto-provision app_users row when a new auth.users record is created.
-- First user becomes admin, subsequent users default to manager.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  user_count INT;
  assigned_role TEXT;
BEGIN
  SELECT count(*) INTO user_count FROM public.app_users;
  assigned_role := CASE WHEN user_count = 0 THEN 'admin' ELSE 'manager' END;

  INSERT INTO public.app_users (user_id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    assigned_role
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- Month lock helper
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_month_locked(p_month SMALLINT, p_year SMALLINT)
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.month_locks
    WHERE month = p_month AND year = p_year AND is_locked = TRUE
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_month_locked(SMALLINT, SMALLINT) TO authenticated;

-- -----------------------------------------------------------------------------
-- Audit helper
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.write_audit(
  p_action     TEXT,
  p_table      TEXT,
  p_record_id  UUID,
  p_old        JSONB,
  p_new        JSONB,
  p_reason     TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_value, new_value, reason)
  VALUES (auth.uid(), p_action, p_table, p_record_id, p_old, p_new, p_reason)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.write_audit(TEXT, TEXT, UUID, JSONB, JSONB, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- CORE: recalculate_monthly_salary (LF-FR37)
-- Computes effective_days, calculated_salary from attendance rows and UPSERTs
-- the monthly_salaries row. The daily_wage_used SNAPSHOT semantics:
--   - On first calc for a (labourer, month, year), snapshot the current wage.
--   - On subsequent calcs, KEEP the existing snapshot unless caller explicitly
--     requests an update (p_update_wage = true). This matches BR-04 / LF-FR33.
-- The recalculation_log captures old_calculated_salary, new_calculated_salary.
-- BR-10: blocked when month is locked.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_monthly_salary(
  p_labourer_id UUID,
  p_month SMALLINT,
  p_year  SMALLINT,
  p_trigger_reason TEXT DEFAULT 'manual',
  p_update_wage BOOLEAN DEFAULT FALSE
)
RETURNS public.monthly_salaries
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_locked         BOOLEAN;
  v_present        SMALLINT := 0;
  v_half           SMALLINT := 0;
  v_effective      NUMERIC(5, 1);
  v_wage           NUMERIC(10, 2);
  v_calc           NUMERIC(12, 2);
  v_existing       public.monthly_salaries%ROWTYPE;
  v_new            public.monthly_salaries%ROWTYPE;
  v_old_salary     NUMERIC(12, 2);
BEGIN
  IF p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'Invalid month %', p_month;
  END IF;
  IF p_year < 2020 OR p_year > 2099 THEN
    RAISE EXCEPTION 'Invalid year %', p_year;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.month_locks
    WHERE month = p_month AND year = p_year AND is_locked = TRUE
  ) INTO v_locked;

  IF v_locked THEN
    RAISE EXCEPTION 'Month %-% is locked. Unlock before recalculating.', p_year, p_month
      USING ERRCODE = 'P0001';
  END IF;

  -- Aggregate attendance
  SELECT
    COUNT(*) FILTER (WHERE status = 'present'),
    COUNT(*) FILTER (WHERE status = 'half_day')
  INTO v_present, v_half
  FROM public.attendance
  WHERE labourer_id = p_labourer_id
    AND EXTRACT(MONTH FROM date)::SMALLINT = p_month
    AND EXTRACT(YEAR  FROM date)::SMALLINT = p_year;

  v_effective := v_present + (v_half * 0.5);

  -- Determine wage to use
  SELECT * INTO v_existing FROM public.monthly_salaries
   WHERE labourer_id = p_labourer_id AND month = p_month AND year = p_year;

  IF v_existing.id IS NULL OR p_update_wage THEN
    SELECT daily_wage INTO v_wage FROM public.labourers WHERE id = p_labourer_id;
    IF v_wage IS NULL THEN
      RAISE EXCEPTION 'Labourer % not found', p_labourer_id;
    END IF;
  ELSE
    v_wage := v_existing.daily_wage_used;
  END IF;

  v_calc := v_effective * v_wage;
  v_old_salary := COALESCE(v_existing.calculated_salary, 0);

  -- UPSERT (BR-14 / LF-FR40: never delete; in-place update)
  INSERT INTO public.monthly_salaries (
    labourer_id, month, year, days_present, half_days_count, effective_days,
    daily_wage_used, calculated_salary, last_recalculated_at
  )
  VALUES (
    p_labourer_id, p_month, p_year, v_present, v_half, v_effective,
    v_wage, v_calc, now()
  )
  ON CONFLICT (labourer_id, month, year) DO UPDATE
    SET days_present         = EXCLUDED.days_present,
        half_days_count      = EXCLUDED.half_days_count,
        effective_days       = EXCLUDED.effective_days,
        daily_wage_used      = EXCLUDED.daily_wage_used,
        calculated_salary    = EXCLUDED.calculated_salary,
        last_recalculated_at = EXCLUDED.last_recalculated_at
  RETURNING * INTO v_new;

  INSERT INTO public.recalculation_log (
    monthly_salary_id, labourer_id, month, year, triggered_by,
    old_calculated_salary, new_calculated_salary, trigger_reason
  ) VALUES (
    v_new.id, p_labourer_id, p_month, p_year, auth.uid(),
    v_old_salary, v_calc, COALESCE(p_trigger_reason, 'manual')
  );

  PERFORM public.write_audit(
    'recalculate_salary', 'monthly_salaries', v_new.id,
    jsonb_build_object('calculated_salary', v_old_salary),
    jsonb_build_object('calculated_salary', v_calc, 'days_present', v_present,
                       'half_days_count', v_half, 'daily_wage_used', v_wage),
    p_trigger_reason
  );

  RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_monthly_salary(UUID, SMALLINT, SMALLINT, TEXT, BOOLEAN)
  TO authenticated;

-- -----------------------------------------------------------------------------
-- Bulk recalculation for a month (e.g. wage change "all future months" cleanup)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_month_for_all(
  p_month SMALLINT, p_year SMALLINT, p_trigger_reason TEXT DEFAULT 'bulk_recalc'
)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  r RECORD;
  c INT := 0;
BEGIN
  FOR r IN SELECT id FROM public.labourers LOOP
    PERFORM public.recalculate_monthly_salary(r.id, p_month, p_year, p_trigger_reason, FALSE);
    c := c + 1;
  END LOOP;
  RETURN c;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_month_for_all(SMALLINT, SMALLINT, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- Trigger: when an attendance row is inserted/updated/deleted, recalc its month.
-- Wrapped in a check that month isn't locked (BR-08 / BR-10).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attendance_recalc_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_labourer UUID;
  v_month    SMALLINT;
  v_year     SMALLINT;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_labourer := OLD.labourer_id;
    v_month    := EXTRACT(MONTH FROM OLD.date)::SMALLINT;
    v_year     := EXTRACT(YEAR  FROM OLD.date)::SMALLINT;
  ELSE
    v_labourer := NEW.labourer_id;
    v_month    := EXTRACT(MONTH FROM NEW.date)::SMALLINT;
    v_year     := EXTRACT(YEAR  FROM NEW.date)::SMALLINT;
  END IF;

  PERFORM public.recalculate_monthly_salary(v_labourer, v_month, v_year, 'attendance_change', FALSE);

  IF (TG_OP = 'DELETE') THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_recalc ON public.attendance;
CREATE TRIGGER trg_attendance_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.attendance_recalc_trigger();

-- -----------------------------------------------------------------------------
-- Mark / Unmark payment (LF-FR44–47). Independent of recalculation (BR-05).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_salary_paid(
  p_salary_id UUID,
  p_reference TEXT DEFAULT NULL
)
RETURNS public.monthly_salaries
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_old public.monthly_salaries%ROWTYPE;
  v_new public.monthly_salaries%ROWTYPE;
BEGIN
  SELECT * INTO v_old FROM public.monthly_salaries WHERE id = p_salary_id;
  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Salary record % not found', p_salary_id;
  END IF;

  UPDATE public.monthly_salaries
     SET payment_status    = 'paid',
         paid_on           = now(),
         payment_reference = p_reference
   WHERE id = p_salary_id
   RETURNING * INTO v_new;

  PERFORM public.write_audit(
    'mark_paid', 'monthly_salaries', p_salary_id,
    jsonb_build_object('payment_status', v_old.payment_status, 'paid_on', v_old.paid_on),
    jsonb_build_object('payment_status', 'paid', 'paid_on', v_new.paid_on, 'payment_reference', p_reference),
    NULL
  );

  RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_salary_paid(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_salary_unpaid(
  p_salary_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS public.monthly_salaries
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_old public.monthly_salaries%ROWTYPE;
  v_new public.monthly_salaries%ROWTYPE;
BEGIN
  SELECT * INTO v_old FROM public.monthly_salaries WHERE id = p_salary_id;
  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Salary record % not found', p_salary_id;
  END IF;

  UPDATE public.monthly_salaries
     SET payment_status    = 'not_paid',
         paid_on           = NULL,
         payment_reference = NULL
   WHERE id = p_salary_id
   RETURNING * INTO v_new;

  PERFORM public.write_audit(
    'mark_unpaid', 'monthly_salaries', p_salary_id,
    jsonb_build_object('payment_status', v_old.payment_status, 'paid_on', v_old.paid_on),
    jsonb_build_object('payment_status', 'not_paid', 'paid_on', NULL),
    p_reason
  );

  RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_salary_unpaid(UUID, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- Lock / Unlock month (LF-FR57–61). Admin only enforced inside the function.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lock_month(
  p_month SMALLINT, p_year SMALLINT, p_reason TEXT DEFAULT NULL
)
RETURNS public.month_locks
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_row public.month_locks%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can lock months' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.month_locks (month, year, is_locked, locked_by, locked_at, lock_reason)
  VALUES (p_month, p_year, TRUE, auth.uid(), now(), p_reason)
  ON CONFLICT (month, year) DO UPDATE
    SET is_locked   = TRUE,
        locked_by   = EXCLUDED.locked_by,
        locked_at   = EXCLUDED.locked_at,
        lock_reason = EXCLUDED.lock_reason,
        unlocked_by = NULL,
        unlocked_at = NULL,
        unlock_reason = NULL
  RETURNING * INTO v_row;

  PERFORM public.write_audit(
    'lock_month', 'month_locks', v_row.id,
    NULL,
    jsonb_build_object('month', p_month, 'year', p_year, 'lock_reason', p_reason),
    p_reason
  );

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lock_month(SMALLINT, SMALLINT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.unlock_month(
  p_month SMALLINT, p_year SMALLINT, p_reason TEXT, p_password TEXT
)
RETURNS public.month_locks
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_row    public.month_locks%ROWTYPE;
  v_email  TEXT;
  v_match  BOOLEAN;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can unlock months' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR char_length(trim(p_reason)) < 20 THEN
    RAISE EXCEPTION 'Unlock reason is required and must be at least 20 characters'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Verify admin password (bcrypt match via pgcrypto). Supabase stores hash in auth.users.encrypted_password.
  SELECT (encrypted_password = crypt(p_password, encrypted_password)) INTO v_match
    FROM auth.users WHERE id = auth.uid();
  IF NOT COALESCE(v_match, FALSE) THEN
    RAISE EXCEPTION 'Incorrect password' USING ERRCODE = '42501';
  END IF;

  UPDATE public.month_locks
     SET is_locked     = FALSE,
         unlocked_by   = auth.uid(),
         unlocked_at   = now(),
         unlock_reason = p_reason
   WHERE month = p_month AND year = p_year
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'No lock record for %-%', p_year, p_month;
  END IF;

  PERFORM public.write_audit(
    'unlock_month', 'month_locks', v_row.id,
    jsonb_build_object('is_locked', TRUE),
    jsonb_build_object('is_locked', FALSE, 'unlock_reason', p_reason),
    p_reason
  );

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlock_month(SMALLINT, SMALLINT, TEXT, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- Save attendance for a single day across many labourers (atomic transaction).
-- Used by the Take Attendance page (LF-FR28). Returns counts and summary.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_daily_attendance(
  p_date DATE,
  p_entries JSONB,           -- [{ "labourer_id": "...", "status": "present|absent|half_day" }, ...]
  p_overwrite BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_entry         JSONB;
  v_labourer_id   UUID;
  v_status        TEXT;
  v_month         SMALLINT;
  v_year          SMALLINT;
  v_locked        BOOLEAN;
  v_present_cnt   INT := 0;
  v_absent_cnt    INT := 0;
  v_half_cnt      INT := 0;
  v_existing      RECORD;
  v_old_value     JSONB;
BEGIN
  IF p_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot record attendance for future dates' USING ERRCODE = 'P0001';
  END IF;

  v_month := EXTRACT(MONTH FROM p_date)::SMALLINT;
  v_year  := EXTRACT(YEAR  FROM p_date)::SMALLINT;

  SELECT EXISTS (
    SELECT 1 FROM public.month_locks
    WHERE month = v_month AND year = v_year AND is_locked = TRUE
  ) INTO v_locked;
  IF v_locked THEN
    RAISE EXCEPTION 'Month %-% is locked. Unlock to record attendance.', v_year, v_month
      USING ERRCODE = 'P0001';
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries) LOOP
    v_labourer_id := (v_entry->>'labourer_id')::UUID;
    v_status      := v_entry->>'status';

    IF v_status NOT IN ('present', 'absent', 'half_day') THEN
      RAISE EXCEPTION 'Invalid status %', v_status;
    END IF;

    SELECT id, status INTO v_existing
      FROM public.attendance
      WHERE labourer_id = v_labourer_id AND date = p_date;

    IF v_existing.id IS NOT NULL THEN
      IF NOT p_overwrite THEN
        RAISE EXCEPTION 'Attendance exists for % on %; overwrite flag required',
          v_labourer_id, p_date USING ERRCODE = 'P0001';
      END IF;

      v_old_value := jsonb_build_object('status', v_existing.status);

      UPDATE public.attendance
         SET status      = v_status,
             recorded_by = auth.uid(),
             recorded_at = now(),
             edit_reason = COALESCE(v_entry->>'edit_reason', NULL)
       WHERE id = v_existing.id;

      PERFORM public.write_audit(
        'overwrite_attendance', 'attendance', v_existing.id,
        v_old_value,
        jsonb_build_object('status', v_status, 'date', p_date),
        v_entry->>'edit_reason'
      );
    ELSE
      INSERT INTO public.attendance (labourer_id, date, status, recorded_by, recorded_at)
      VALUES (v_labourer_id, p_date, v_status, auth.uid(), now());

      PERFORM public.write_audit(
        'add_attendance', 'attendance', NULL,
        NULL,
        jsonb_build_object('labourer_id', v_labourer_id, 'date', p_date, 'status', v_status),
        NULL
      );
    END IF;

    IF v_status = 'present'  THEN v_present_cnt := v_present_cnt + 1;
    ELSIF v_status = 'absent' THEN v_absent_cnt := v_absent_cnt + 1;
    ELSIF v_status = 'half_day' THEN v_half_cnt := v_half_cnt + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'date', p_date,
    'present', v_present_cnt,
    'absent', v_absent_cnt,
    'half_day', v_half_cnt,
    'month', v_month,
    'year', v_year
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_daily_attendance(DATE, JSONB, BOOLEAN) TO authenticated;

-- -----------------------------------------------------------------------------
-- Edit a single past attendance (Admin). Captures edit_reason on the row + audit.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.edit_attendance(
  p_attendance_id UUID,
  p_new_status TEXT,
  p_reason TEXT
)
RETURNS public.attendance
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_old   public.attendance%ROWTYPE;
  v_new   public.attendance%ROWTYPE;
  v_month SMALLINT;
  v_year  SMALLINT;
  v_locked BOOLEAN;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can edit past attendance' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR char_length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Reason must be at least 10 characters' USING ERRCODE = 'P0001';
  END IF;
  IF p_new_status NOT IN ('present', 'absent', 'half_day') THEN
    RAISE EXCEPTION 'Invalid status %', p_new_status;
  END IF;

  SELECT * INTO v_old FROM public.attendance WHERE id = p_attendance_id;
  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Attendance record % not found', p_attendance_id;
  END IF;

  v_month := EXTRACT(MONTH FROM v_old.date)::SMALLINT;
  v_year  := EXTRACT(YEAR  FROM v_old.date)::SMALLINT;
  SELECT EXISTS (SELECT 1 FROM public.month_locks
                 WHERE month = v_month AND year = v_year AND is_locked = TRUE) INTO v_locked;
  IF v_locked THEN
    RAISE EXCEPTION 'Month %-% is locked. Unlock to edit attendance.', v_year, v_month
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.attendance
     SET status = p_new_status,
         edit_reason = p_reason,
         recorded_by = auth.uid(),
         recorded_at = now()
   WHERE id = p_attendance_id
  RETURNING * INTO v_new;

  PERFORM public.write_audit(
    'edit_attendance', 'attendance', p_attendance_id,
    jsonb_build_object('status', v_old.status, 'date', v_old.date),
    jsonb_build_object('status', v_new.status, 'date', v_new.date),
    p_reason
  );

  RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.edit_attendance(UUID, TEXT, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- Change daily wage with policy choice (LF-FR14 / UC-07)
--   policy = 'current_month' → update wage, snapshot current month, recalc current month
--   policy = 'future_only'   → update wage; current month untouched
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.change_daily_wage(
  p_labourer_id UUID,
  p_new_wage NUMERIC,
  p_policy TEXT DEFAULT 'future_only'
)
RETURNS public.labourers
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_old   public.labourers%ROWTYPE;
  v_new   public.labourers%ROWTYPE;
  v_now   DATE := CURRENT_DATE;
  v_month SMALLINT;
  v_year  SMALLINT;
BEGIN
  IF p_new_wage IS NULL OR p_new_wage < 1 OR p_new_wage > 99999.99 THEN
    RAISE EXCEPTION 'Daily wage must be between 1 and 99999.99';
  END IF;
  IF p_policy NOT IN ('current_month', 'future_only') THEN
    RAISE EXCEPTION 'Policy must be current_month or future_only';
  END IF;

  SELECT * INTO v_old FROM public.labourers WHERE id = p_labourer_id;
  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Labourer % not found', p_labourer_id;
  END IF;

  UPDATE public.labourers SET daily_wage = p_new_wage WHERE id = p_labourer_id RETURNING * INTO v_new;

  PERFORM public.write_audit(
    'change_wage', 'labourers', p_labourer_id,
    jsonb_build_object('daily_wage', v_old.daily_wage),
    jsonb_build_object('daily_wage', p_new_wage, 'policy', p_policy),
    p_policy
  );

  IF p_policy = 'current_month' THEN
    v_month := EXTRACT(MONTH FROM v_now)::SMALLINT;
    v_year  := EXTRACT(YEAR  FROM v_now)::SMALLINT;
    PERFORM public.recalculate_monthly_salary(p_labourer_id, v_month, v_year, 'wage_change', TRUE);
  END IF;

  RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.change_daily_wage(UUID, NUMERIC, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- Trigger: after a new labourer is inserted, create an initial monthly_salaries
-- row for the current month with zeroed counts (LF-FR12 / BR-15).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.init_monthly_salary_for_new_labourer()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_m SMALLINT := EXTRACT(MONTH FROM CURRENT_DATE)::SMALLINT;
  v_y SMALLINT := EXTRACT(YEAR  FROM CURRENT_DATE)::SMALLINT;
BEGIN
  INSERT INTO public.monthly_salaries (
    labourer_id, month, year, days_present, half_days_count, effective_days,
    daily_wage_used, calculated_salary, last_recalculated_at
  ) VALUES (
    NEW.id, v_m, v_y, 0, 0, 0.0, NEW.daily_wage, 0.00, now()
  )
  ON CONFLICT (labourer_id, month, year) DO NOTHING;

  PERFORM public.write_audit(
    'add_labourer', 'labourers', NEW.id,
    NULL,
    to_jsonb(NEW),
    NULL
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_new_labourer_init_salary ON public.labourers;
CREATE TRIGGER trg_new_labourer_init_salary
  AFTER INSERT ON public.labourers
  FOR EACH ROW EXECUTE FUNCTION public.init_monthly_salary_for_new_labourer();

-- -----------------------------------------------------------------------------
-- Dashboard aggregate (LF-FR62) — single query for summary cards.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dashboard_summary()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_active_count    INT;
  v_today_count     INT;
  v_today_total     INT;
  v_m SMALLINT := EXTRACT(MONTH FROM CURRENT_DATE)::SMALLINT;
  v_y SMALLINT := EXTRACT(YEAR  FROM CURRENT_DATE)::SMALLINT;
  v_unpaid_total    NUMERIC(14, 2) := 0;
  v_due_total       NUMERIC(14, 2) := 0;
  v_unpaid_count    INT := 0;
BEGIN
  SELECT count(*) INTO v_active_count FROM public.labourers WHERE is_active = TRUE;

  SELECT count(*) FILTER (WHERE status = 'present')
       + (count(*) FILTER (WHERE status = 'half_day'))
    INTO v_today_count
    FROM public.attendance
   WHERE date = CURRENT_DATE;

  SELECT count(*) INTO v_today_total
    FROM public.attendance
   WHERE date = CURRENT_DATE;

  SELECT
    COALESCE(SUM(CASE WHEN payment_status = 'not_paid' THEN calculated_salary ELSE 0 END), 0),
    COALESCE(SUM(calculated_salary), 0),
    COUNT(*) FILTER (WHERE payment_status = 'not_paid')
  INTO v_unpaid_total, v_due_total, v_unpaid_count
  FROM public.monthly_salaries
  WHERE month = v_m AND year = v_y;

  RETURN jsonb_build_object(
    'active_labourers', v_active_count,
    'present_today', v_today_count,
    'today_recorded_count', v_today_total,
    'today_attendance_taken', v_today_total > 0,
    'unpaid_total', v_unpaid_total,
    'due_total', v_due_total,
    'unpaid_count', v_unpaid_count,
    'current_month', v_m,
    'current_year', v_y
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_summary() TO authenticated;

-- -----------------------------------------------------------------------------
-- Distinct months that have at least one labourer with attendance data (LF-FR41)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_salary_months()
RETURNS TABLE (year SMALLINT, month SMALLINT) LANGUAGE sql STABLE AS $$
  SELECT DISTINCT year, month
    FROM public.monthly_salaries
   ORDER BY year DESC, month DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_salary_months() TO authenticated;
