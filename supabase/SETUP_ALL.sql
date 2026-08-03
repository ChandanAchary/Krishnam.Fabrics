-- =============================================================================
-- LabourFlow (Next.js) — COMPLETE SETUP (schema + admin_exists + seeded admin)
-- Paste into Supabase Dashboard → SQL Editor and RUN, OR apply via:
--   npx supabase db push
-- Idempotent. Seeded admin → rathdash347@gmail.com / Admin@8488
-- =============================================================================


-- >>> FILE: migrations/20250101000000_initial_schema.sql

-- =============================================================================
-- LabourFlow — Initial Schema (IEEE 830 §5)
-- =============================================================================
-- Creates all 7 application tables, constraints, indexes, and audit triggers.
-- All tables use UUID primary keys and TIMESTAMPTZ for timestamps.
-- Hard deletes are prohibited per [LF-CON05].
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 5.1 labourers — workforce master table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.labourers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  phone         TEXT,
  daily_wage    NUMERIC(10, 2) NOT NULL,
  joining_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT labourers_name_length CHECK (char_length(trim(name)) BETWEEN 2 AND 100),
  CONSTRAINT labourers_phone_format CHECK (
    phone IS NULL OR phone ~ '^(\+[1-9][0-9]{7,14}|[0-9]{10})$'
  ),
  CONSTRAINT labourers_wage_range CHECK (daily_wage >= 1 AND daily_wage <= 99999.99),
  CONSTRAINT labourers_joining_not_future CHECK (joining_date <= CURRENT_DATE)
);

CREATE INDEX IF NOT EXISTS idx_labourers_active_name ON public.labourers (is_active, lower(name));
CREATE INDEX IF NOT EXISTS idx_labourers_phone ON public.labourers (phone) WHERE phone IS NOT NULL;

COMMENT ON TABLE public.labourers IS 'Workforce master. Hard delete prohibited (LF-CON05). Use is_active=false for soft delete.';

-- -----------------------------------------------------------------------------
-- 5.2 attendance — one row per labourer per day (retained indefinitely)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  labourer_id  UUID NOT NULL REFERENCES public.labourers(id) ON DELETE RESTRICT,
  date         DATE NOT NULL,
  status       TEXT NOT NULL DEFAULT 'absent',
  recorded_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  edit_reason  TEXT,
  CONSTRAINT attendance_status_valid CHECK (status IN ('present', 'absent', 'half_day')),
  CONSTRAINT attendance_not_future CHECK (date <= CURRENT_DATE),
  CONSTRAINT attendance_unique_per_day UNIQUE (labourer_id, date)
);

CREATE INDEX IF NOT EXISTS idx_att_labourer_date ON public.attendance (labourer_id, date);
CREATE INDEX IF NOT EXISTS idx_att_date         ON public.attendance (date);
CREATE INDEX IF NOT EXISTS idx_att_month        ON public.attendance (
  EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date)
);

COMMENT ON TABLE public.attendance IS
  'Date-wise attendance retention (LF-NFR18 / BR-13): rows preserved permanently.';

-- -----------------------------------------------------------------------------
-- 5.3 monthly_salaries — UPSERTed; rows are never deleted by recalculation
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.monthly_salaries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  labourer_id           UUID NOT NULL REFERENCES public.labourers(id) ON DELETE RESTRICT,
  month                 SMALLINT NOT NULL,
  year                  SMALLINT NOT NULL,
  days_present          SMALLINT NOT NULL DEFAULT 0,
  half_days_count       SMALLINT NOT NULL DEFAULT 0,
  effective_days        NUMERIC(5, 1) NOT NULL DEFAULT 0.0,
  daily_wage_used       NUMERIC(10, 2) NOT NULL,
  calculated_salary     NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  payment_status        TEXT NOT NULL DEFAULT 'not_paid',
  paid_on               TIMESTAMPTZ,
  payment_reference     TEXT,
  last_recalculated_at  TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ms_month_valid     CHECK (month BETWEEN 1 AND 12),
  CONSTRAINT ms_year_valid      CHECK (year BETWEEN 2020 AND 2099),
  CONSTRAINT ms_payment_valid   CHECK (payment_status IN ('paid', 'not_paid')),
  CONSTRAINT ms_counts_nonneg   CHECK (days_present >= 0 AND half_days_count >= 0),
  CONSTRAINT ms_unique_labourer_month UNIQUE (labourer_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_ms_labourer_month_year ON public.monthly_salaries (labourer_id, month, year);
CREATE INDEX IF NOT EXISTS idx_ms_payment             ON public.monthly_salaries (payment_status, year, month);
CREATE INDEX IF NOT EXISTS idx_ms_year_month          ON public.monthly_salaries (year DESC, month DESC);

COMMENT ON TABLE public.monthly_salaries IS
  'Salary history retention (LF-NFR19 / BR-14): rows updated in place, never deleted by recalculation.';

-- -----------------------------------------------------------------------------
-- 5.4 platform_settings — key/value app configuration
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL DEFAULT '',
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- -----------------------------------------------------------------------------
-- 5.5 audit_logs — immutable (no UPDATE/DELETE) ; retained indefinitely
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  table_name  TEXT,
  record_id   UUID,
  old_value   JSONB,
  new_value   JSONB,
  ip_address  TEXT,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_user      ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action    ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_table     ON public.audit_logs (table_name);
CREATE INDEX IF NOT EXISTS idx_audit_created   ON public.audit_logs (created_at DESC);

COMMENT ON TABLE public.audit_logs IS
  'Immutable audit trail (LF-FR73 / LF-NFR21). RLS denies UPDATE/DELETE for all roles.';

-- -----------------------------------------------------------------------------
-- 5.6 month_locks — per-month freeze; unlocking retained with reason
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.month_locks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month          SMALLINT NOT NULL,
  year           SMALLINT NOT NULL,
  is_locked      BOOLEAN NOT NULL DEFAULT TRUE,
  locked_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  locked_at      TIMESTAMPTZ,
  unlocked_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  unlocked_at    TIMESTAMPTZ,
  lock_reason    TEXT,
  unlock_reason  TEXT,
  CONSTRAINT ml_month_valid CHECK (month BETWEEN 1 AND 12),
  CONSTRAINT ml_year_valid  CHECK (year BETWEEN 2020 AND 2099),
  CONSTRAINT ml_unique_month UNIQUE (month, year)
);

CREATE INDEX IF NOT EXISTS idx_ml_locked ON public.month_locks (is_locked);

-- -----------------------------------------------------------------------------
-- 5.7 recalculation_log
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recalculation_log (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_salary_id      UUID REFERENCES public.monthly_salaries(id) ON DELETE SET NULL,
  labourer_id            UUID NOT NULL REFERENCES public.labourers(id) ON DELETE RESTRICT,
  month                  SMALLINT NOT NULL,
  year                   SMALLINT NOT NULL,
  triggered_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  triggered_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  old_calculated_salary  NUMERIC(12, 2),
  new_calculated_salary  NUMERIC(12, 2),
  trigger_reason         TEXT,
  CONSTRAINT rl_month_valid CHECK (month BETWEEN 1 AND 12)
);

CREATE INDEX IF NOT EXISTS idx_rl_labourer_month ON public.recalculation_log (labourer_id, year, month);
CREATE INDEX IF NOT EXISTS idx_rl_triggered      ON public.recalculation_log (triggered_at DESC);

-- -----------------------------------------------------------------------------
-- 5.8 app_users — role mapping (role stored in custom JWT claim app_role)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_users (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  role        TEXT NOT NULL DEFAULT 'manager',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT app_users_role_valid CHECK (role IN ('admin', 'manager'))
);

COMMENT ON TABLE public.app_users IS
  'Application-level user profile and role. Role mirrored into JWT claim app_role.';

-- -----------------------------------------------------------------------------
-- updated_at auto-update trigger
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_labourers_touch_updated_at ON public.labourers;
CREATE TRIGGER trg_labourers_touch_updated_at
  BEFORE UPDATE ON public.labourers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Default platform settings
-- -----------------------------------------------------------------------------
INSERT INTO public.platform_settings (key, value, description) VALUES
  ('company_name',       'LabourFlow Co.', 'Organisation name displayed in headers and PDF reports.'),
  ('currency_symbol',    '₹',              'Currency symbol prefixed to monetary values.'),
  ('default_daily_wage', '400.00',         'Pre-fill value when creating a new labourer (BR-11).'),
  ('notification_email', '',               'Admin email for month-lock notifications.'),
  ('timezone',           'Asia/Kolkata',   'Display timezone for the deployment (DB stores UTC).')
ON CONFLICT (key) DO NOTHING;

-- >>> FILE: migrations/20250101000001_functions.sql

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

-- >>> FILE: migrations/20250101000002_rls_policies.sql

-- =============================================================================
-- LabourFlow — Row Level Security Policies (IEEE 830 §4.3 / LF-NFR09)
-- =============================================================================
-- All application tables enforce RLS. The anon (public) role has NO access.
-- Authenticated users can read all application data; writes are restricted by
-- role (admin vs manager) and by month-lock state.
-- =============================================================================

ALTER TABLE public.labourers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_salaries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.month_locks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recalculation_log  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users          ENABLE ROW LEVEL SECURITY;

-- Drop any pre-existing policies (idempotent re-run)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- labourers
-- -----------------------------------------------------------------------------
CREATE POLICY labourers_select_authed ON public.labourers
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY labourers_insert_authed ON public.labourers
  FOR INSERT TO authenticated WITH CHECK (TRUE);

CREATE POLICY labourers_update_authed ON public.labourers
  FOR UPDATE TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- No DELETE: soft-delete only via is_active=false (LF-CON05)

-- -----------------------------------------------------------------------------
-- attendance — INSERT/UPDATE blocked when month is locked
-- -----------------------------------------------------------------------------
CREATE POLICY attendance_select_authed ON public.attendance
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY attendance_insert_authed ON public.attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    NOT public.is_month_locked(
      EXTRACT(MONTH FROM date)::SMALLINT,
      EXTRACT(YEAR  FROM date)::SMALLINT
    )
  );

CREATE POLICY attendance_update_authed ON public.attendance
  FOR UPDATE TO authenticated
  USING (
    NOT public.is_month_locked(
      EXTRACT(MONTH FROM date)::SMALLINT,
      EXTRACT(YEAR  FROM date)::SMALLINT
    )
  )
  WITH CHECK (
    NOT public.is_month_locked(
      EXTRACT(MONTH FROM date)::SMALLINT,
      EXTRACT(YEAR  FROM date)::SMALLINT
    )
  );

-- DELETE allowed only to admin and only with audit + reason (LF-NFR20)
CREATE POLICY attendance_delete_admin ON public.attendance
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- -----------------------------------------------------------------------------
-- monthly_salaries
--   - Payment status fields editable always (BR-08)
--   - Other field updates require month to be unlocked (BR-10)
-- -----------------------------------------------------------------------------
CREATE POLICY ms_select_authed ON public.monthly_salaries
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY ms_insert_authed ON public.monthly_salaries
  FOR INSERT TO authenticated
  WITH CHECK (NOT public.is_month_locked(month, year));

CREATE POLICY ms_update_authed ON public.monthly_salaries
  FOR UPDATE TO authenticated USING (TRUE) WITH CHECK (TRUE);
-- Note: SECURITY DEFINER functions enforce locked-month semantics in code paths
-- that recalc; only the payment_status path bypasses (BR-08).

-- Only admin may DELETE a salary record (LF-NFR20)
CREATE POLICY ms_delete_admin ON public.monthly_salaries
  FOR DELETE TO authenticated USING (public.is_admin());

-- -----------------------------------------------------------------------------
-- platform_settings — admin only writes; all authed reads
-- -----------------------------------------------------------------------------
CREATE POLICY ps_select_authed ON public.platform_settings
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY ps_insert_admin ON public.platform_settings
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY ps_update_admin ON public.platform_settings
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY ps_delete_admin ON public.platform_settings
  FOR DELETE TO authenticated USING (public.is_admin());

-- -----------------------------------------------------------------------------
-- audit_logs — INSERT only (immutable). Admin reads (LF-FR74).
-- -----------------------------------------------------------------------------
CREATE POLICY audit_insert_authed ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (TRUE);

CREATE POLICY audit_select_admin ON public.audit_logs
  FOR SELECT TO authenticated USING (public.is_admin());

-- Intentionally NO UPDATE or DELETE policies → all UPDATE/DELETE attempts fail.

-- -----------------------------------------------------------------------------
-- month_locks — admin-only writes
-- -----------------------------------------------------------------------------
CREATE POLICY ml_select_authed ON public.month_locks
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY ml_insert_admin ON public.month_locks
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY ml_update_admin ON public.month_locks
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- recalculation_log — read for admin (audit insight), insert via SECURITY DEFINER
-- -----------------------------------------------------------------------------
CREATE POLICY rl_select_admin ON public.recalculation_log
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY rl_insert_authed ON public.recalculation_log
  FOR INSERT TO authenticated WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- app_users — users see their own row; admin sees all; only admin writes role
-- -----------------------------------------------------------------------------
CREATE POLICY appusers_select_self_or_admin ON public.app_users
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY appusers_insert_admin ON public.app_users
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY appusers_update_admin ON public.app_users
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- >>> FILE: migrations/20250101000003_admin_delete.sql

-- =============================================================================
-- LabourFlow — Admin Manual Delete RPCs (LF-NFR20)
-- =============================================================================
-- "Manual deletion of any attendance or monthly_salaries record is restricted
--  to Admin role only, requires a reason (min 50 chars), and automatically
--  creates an audit_logs entry capturing the full old_value before deletion."
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Hard-delete a single attendance record (admin only, min-50-char reason).
-- Triggers downstream recalc of the affected month.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_attendance(
  p_attendance_id UUID,
  p_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_row     public.attendance%ROWTYPE;
  v_locked  BOOLEAN;
  v_month   SMALLINT;
  v_year    SMALLINT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can delete attendance records' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR char_length(trim(p_reason)) < 50 THEN
    RAISE EXCEPTION 'Reason must be at least 50 characters' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_row FROM public.attendance WHERE id = p_attendance_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Attendance record % not found', p_attendance_id;
  END IF;

  v_month := EXTRACT(MONTH FROM v_row.date)::SMALLINT;
  v_year  := EXTRACT(YEAR  FROM v_row.date)::SMALLINT;

  SELECT EXISTS (
    SELECT 1 FROM public.month_locks
    WHERE month = v_month AND year = v_year AND is_locked = TRUE
  ) INTO v_locked;
  IF v_locked THEN
    RAISE EXCEPTION 'Month %-% is locked. Unlock before deleting.', v_year, v_month
      USING ERRCODE = 'P0001';
  END IF;

  -- Audit BEFORE delete (capture full old_value)
  PERFORM public.write_audit(
    'delete_attendance', 'attendance', v_row.id,
    to_jsonb(v_row),
    NULL,
    p_reason
  );

  DELETE FROM public.attendance WHERE id = p_attendance_id;
  -- attendance_recalc_trigger will pick up the DELETE and recompute salary.

  RETURN p_attendance_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_attendance(UUID, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- Hard-delete a monthly_salaries record (admin only). Use case: tidy up
-- a record for a labourer who never had any attendance and was added by mistake.
-- The system will lazily recreate the row on next recalc if needed.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_salary(
  p_salary_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_row    public.monthly_salaries%ROWTYPE;
  v_locked BOOLEAN;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can delete salary records' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.monthly_salaries WHERE id = p_salary_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Salary record % not found', p_salary_id;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.month_locks
    WHERE month = v_row.month AND year = v_row.year AND is_locked = TRUE
  ) INTO v_locked;
  IF v_locked THEN
    RAISE EXCEPTION 'Month %-% is locked. Unlock before deleting.', v_row.year, v_row.month
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.write_audit(
    'delete_salary', 'monthly_salaries', v_row.id,
    to_jsonb(v_row),
    NULL,
    p_reason
  );

  DELETE FROM public.monthly_salaries WHERE id = p_salary_id;
  RETURN p_salary_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_salary(UUID, TEXT) TO authenticated;

-- >>> FILE: migrations/20250101000004_designation_advance.sql

-- =============================================================================
-- LabourFlow — Designation, Advance Payment & Net Salary (prototype parity)
-- =============================================================================
-- Extends the SRS baseline with three operational fields requested from the
-- Figma prototype:
--   1. labourers.designation       — job role (Mason, Helper, …)
--   2. labourers.advance           — advance/commission paid to the labourer
--   3. monthly_salaries.advance_deducted (snapshot) + net_salary (gross - advance)
--
-- Gross salary  = effective_days × daily_wage_used  (existing calculated_salary)
-- Net salary    = gross − advance_deducted
-- advance_deducted is snapshotted from the labourer's current advance at each
-- recalculation (recalc is blocked for locked months, so history stays frozen).
-- =============================================================================

-- ---- Schema changes ---------------------------------------------------------
ALTER TABLE public.labourers
  ADD COLUMN IF NOT EXISTS designation TEXT,
  ADD COLUMN IF NOT EXISTS advance NUMERIC(10, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.labourers
  DROP CONSTRAINT IF EXISTS labourers_advance_nonneg;
ALTER TABLE public.labourers
  ADD CONSTRAINT labourers_advance_nonneg CHECK (advance >= 0 AND advance <= 9999999.99);

ALTER TABLE public.monthly_salaries
  ADD COLUMN IF NOT EXISTS advance_deducted NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_salary NUMERIC(12, 2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_labourers_designation ON public.labourers (designation);

-- ---- Updated salary engine: snapshot advance + compute net ------------------
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
  v_wage_current   NUMERIC(10, 2);
  v_advance        NUMERIC(10, 2);
  v_calc           NUMERIC(12, 2);
  v_net            NUMERIC(12, 2);
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

  SELECT
    COUNT(*) FILTER (WHERE status = 'present'),
    COUNT(*) FILTER (WHERE status = 'half_day')
  INTO v_present, v_half
  FROM public.attendance
  WHERE labourer_id = p_labourer_id
    AND EXTRACT(MONTH FROM date)::SMALLINT = p_month
    AND EXTRACT(YEAR  FROM date)::SMALLINT = p_year;

  v_effective := v_present + (v_half * 0.5);

  SELECT * INTO v_existing FROM public.monthly_salaries
   WHERE labourer_id = p_labourer_id AND month = p_month AND year = p_year;

  -- Wage uses snapshot semantics (BR-04). Advance always reflects current value.
  SELECT daily_wage, advance INTO v_wage_current, v_advance
    FROM public.labourers WHERE id = p_labourer_id;
  IF v_wage_current IS NULL THEN
    RAISE EXCEPTION 'Labourer % not found', p_labourer_id;
  END IF;

  IF v_existing.id IS NULL OR p_update_wage THEN
    v_wage := v_wage_current;
  ELSE
    v_wage := v_existing.daily_wage_used;
  END IF;

  v_calc := v_effective * v_wage;
  v_net  := v_calc - COALESCE(v_advance, 0);
  v_old_salary := COALESCE(v_existing.calculated_salary, 0);

  INSERT INTO public.monthly_salaries (
    labourer_id, month, year, days_present, half_days_count, effective_days,
    daily_wage_used, calculated_salary, advance_deducted, net_salary, last_recalculated_at
  )
  VALUES (
    p_labourer_id, p_month, p_year, v_present, v_half, v_effective,
    v_wage, v_calc, COALESCE(v_advance, 0), v_net, now()
  )
  ON CONFLICT (labourer_id, month, year) DO UPDATE
    SET days_present         = EXCLUDED.days_present,
        half_days_count      = EXCLUDED.half_days_count,
        effective_days       = EXCLUDED.effective_days,
        daily_wage_used      = EXCLUDED.daily_wage_used,
        calculated_salary    = EXCLUDED.calculated_salary,
        advance_deducted     = EXCLUDED.advance_deducted,
        net_salary           = EXCLUDED.net_salary,
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
                       'half_days_count', v_half, 'daily_wage_used', v_wage,
                       'advance_deducted', COALESCE(v_advance, 0), 'net_salary', v_net),
    p_trigger_reason
  );

  RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_monthly_salary(UUID, SMALLINT, SMALLINT, TEXT, BOOLEAN)
  TO authenticated;

-- ---- Updated new-labourer init: seed advance + net --------------------------
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
    daily_wage_used, calculated_salary, advance_deducted, net_salary, last_recalculated_at
  ) VALUES (
    NEW.id, v_m, v_y, 0, 0, 0.0,
    NEW.daily_wage, 0.00, COALESCE(NEW.advance, 0), 0.00 - COALESCE(NEW.advance, 0), now()
  )
  ON CONFLICT (labourer_id, month, year) DO NOTHING;

  PERFORM public.write_audit('add_labourer', 'labourers', NEW.id, NULL, to_jsonb(NEW), NULL);
  RETURN NEW;
END;
$$;

-- ---- Helper to update advance and recalc current month (unlocked) -----------
CREATE OR REPLACE FUNCTION public.change_advance(
  p_labourer_id UUID,
  p_new_advance NUMERIC
)
RETURNS public.labourers
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_old   public.labourers%ROWTYPE;
  v_new   public.labourers%ROWTYPE;
  v_m SMALLINT := EXTRACT(MONTH FROM CURRENT_DATE)::SMALLINT;
  v_y SMALLINT := EXTRACT(YEAR  FROM CURRENT_DATE)::SMALLINT;
  v_locked BOOLEAN;
BEGIN
  IF p_new_advance IS NULL OR p_new_advance < 0 OR p_new_advance > 9999999.99 THEN
    RAISE EXCEPTION 'Advance must be between 0 and 9,999,999.99';
  END IF;

  SELECT * INTO v_old FROM public.labourers WHERE id = p_labourer_id;
  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Labourer % not found', p_labourer_id;
  END IF;

  UPDATE public.labourers SET advance = p_new_advance WHERE id = p_labourer_id RETURNING * INTO v_new;

  PERFORM public.write_audit(
    'change_wage', 'labourers', p_labourer_id,
    jsonb_build_object('advance', v_old.advance),
    jsonb_build_object('advance', p_new_advance),
    'advance_change'
  );

  -- Refresh current month net if it isn't locked
  SELECT EXISTS (SELECT 1 FROM public.month_locks
                 WHERE month = v_m AND year = v_y AND is_locked = TRUE) INTO v_locked;
  IF NOT v_locked THEN
    PERFORM public.recalculate_monthly_salary(p_labourer_id, v_m, v_y, 'advance_change', FALSE);
  END IF;

  RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.change_advance(UUID, NUMERIC) TO authenticated;

-- ---- Backfill net_salary for any pre-existing rows --------------------------
UPDATE public.monthly_salaries
   SET net_salary = calculated_salary - advance_deducted
 WHERE net_salary = 0 AND calculated_salary <> 0;

-- >>> FILE: migrations/20250101000005_payment_and_edit.sql

-- =============================================================================
-- LabourFlow — Payment amount/method + optional edit reason
-- =============================================================================
-- 1. monthly_salaries gains paid_amount + payment_method, captured when a salary
--    is marked Paid (Amount Paid + Online / Bank / Cash).
-- 2. edit_attendance no longer requires a reason (reason becomes optional).
-- =============================================================================

-- ---- Schema: payment amount + method ----------------------------------------
ALTER TABLE public.monthly_salaries
  ADD COLUMN IF NOT EXISTS paid_amount    NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS payment_method TEXT;

ALTER TABLE public.monthly_salaries
  DROP CONSTRAINT IF EXISTS ms_payment_method_valid;
ALTER TABLE public.monthly_salaries
  ADD CONSTRAINT ms_payment_method_valid
  CHECK (payment_method IS NULL OR payment_method IN ('online', 'bank', 'cash'));

-- ---- mark_salary_paid: now records amount + method --------------------------
DROP FUNCTION IF EXISTS public.mark_salary_paid(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.mark_salary_paid(
  p_salary_id UUID,
  p_reference TEXT DEFAULT NULL,
  p_amount NUMERIC DEFAULT NULL,
  p_method TEXT DEFAULT NULL
)
RETURNS public.monthly_salaries
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_old public.monthly_salaries%ROWTYPE;
  v_new public.monthly_salaries%ROWTYPE;
  v_amount NUMERIC(12, 2);
BEGIN
  SELECT * INTO v_old FROM public.monthly_salaries WHERE id = p_salary_id;
  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Salary record % not found', p_salary_id;
  END IF;

  IF p_method IS NOT NULL AND p_method NOT IN ('online', 'bank', 'cash') THEN
    RAISE EXCEPTION 'Invalid payment method %', p_method;
  END IF;

  -- Default the paid amount to the net salary when not explicitly supplied.
  v_amount := COALESCE(p_amount, v_old.net_salary);
  IF v_amount < 0 THEN
    RAISE EXCEPTION 'Paid amount cannot be negative';
  END IF;

  UPDATE public.monthly_salaries
     SET payment_status    = 'paid',
         paid_on           = now(),
         paid_amount       = v_amount,
         payment_method    = p_method,
         payment_reference = p_reference
   WHERE id = p_salary_id
   RETURNING * INTO v_new;

  PERFORM public.write_audit(
    'mark_paid', 'monthly_salaries', p_salary_id,
    jsonb_build_object('payment_status', v_old.payment_status, 'paid_on', v_old.paid_on),
    jsonb_build_object('payment_status', 'paid', 'paid_on', v_new.paid_on,
                       'paid_amount', v_amount, 'payment_method', p_method,
                       'payment_reference', p_reference),
    NULL
  );

  RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_salary_paid(UUID, TEXT, NUMERIC, TEXT) TO authenticated;

-- ---- mark_salary_unpaid: also clears amount + method ------------------------
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
         paid_amount       = NULL,
         payment_method    = NULL,
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

-- ---- edit_attendance: reason is now OPTIONAL --------------------------------
CREATE OR REPLACE FUNCTION public.edit_attendance(
  p_attendance_id UUID,
  p_new_status TEXT,
  p_reason TEXT DEFAULT NULL
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
         edit_reason = NULLIF(trim(COALESCE(p_reason, '')), ''),
         recorded_by = auth.uid(),
         recorded_at = now()
   WHERE id = p_attendance_id
  RETURNING * INTO v_new;

  PERFORM public.write_audit(
    'edit_attendance', 'attendance', p_attendance_id,
    jsonb_build_object('status', v_old.status, 'date', v_old.date),
    jsonb_build_object('status', v_new.status, 'date', v_new.date),
    NULLIF(trim(COALESCE(p_reason, '')), '')
  );

  RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.edit_attendance(UUID, TEXT, TEXT) TO authenticated;

-- >>> FILE: migrations/20250101000006_account_otp.sql

-- =============================================================================
-- LabourFlow — Account OTP store (for Brevo email/password change verification)
-- =============================================================================
-- One-time codes for verifying admin email change and password change. Codes are
-- stored hashed (SHA-256). Only the `account-otp` Edge Function (service role)
-- reads/writes this table — RLS is enabled with NO policies, so the anon and
-- authenticated roles have zero access.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.auth_otps (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose      TEXT NOT NULL,
  code_hash    TEXT NOT NULL,
  new_email    TEXT,
  attempts     SMALLINT NOT NULL DEFAULT 0,
  max_attempts SMALLINT NOT NULL DEFAULT 5,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT auth_otps_purpose_valid CHECK (purpose IN ('email_change', 'password_change'))
);

CREATE INDEX IF NOT EXISTS idx_auth_otps_user_purpose
  ON public.auth_otps (user_id, purpose, created_at DESC);

ALTER TABLE public.auth_otps ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies → only the service role (Edge Function) can access.

-- Housekeeping helper: purge expired/consumed codes (safe to call from the function).
CREATE OR REPLACE FUNCTION public.purge_expired_otps()
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.auth_otps
   WHERE expires_at < now() - INTERVAL '1 day'
      OR consumed_at IS NOT NULL;
$$;

-- >>> FILE: migrations/20250101000007_auth_reset_otp.sql

-- =============================================================================
-- LabourFlow — Auth: password-reset OTP support
-- =============================================================================
-- 1. Allow the 'password_reset' purpose in auth_otps (used by the public
--    forgot-password flow, in addition to email_change / password_change).
-- 2. find_user_id_by_email(): lets the server reset route resolve a user id
--    from an email without exposing the auth schema. SECURITY DEFINER,
--    granted to service_role only.
-- =============================================================================

ALTER TABLE public.auth_otps DROP CONSTRAINT IF EXISTS auth_otps_purpose_valid;
ALTER TABLE public.auth_otps
  ADD CONSTRAINT auth_otps_purpose_valid
  CHECK (purpose IN ('email_change', 'password_change', 'password_reset'));

CREATE OR REPLACE FUNCTION public.find_user_id_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE sql SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(trim(p_email)) LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.find_user_id_by_email(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_user_id_by_email(TEXT) TO service_role;

-- Count of provisioned application users (used by /api/auth/status to decide
-- between the first-run Register screen and the Login screen).
CREATE OR REPLACE FUNCTION public.app_user_count()
RETURNS INTEGER
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int FROM public.app_users;
$$;

GRANT EXECUTE ON FUNCTION public.app_user_count() TO service_role, anon, authenticated;

-- >>> FILE: migrations/20250101000008_admin_helpers.sql

-- =============================================================================
-- LabourFlow — admin_exists() helper
-- =============================================================================
-- Lets the public auth screens decide what to show:
--   • admin_exists() = false → no admin yet → show "Create admin account".
--   • admin_exists() = true  → show "Login with email & password".
-- SECURITY DEFINER so it can read app_users regardless of the caller's RLS.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_exists()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.app_users WHERE role = 'admin');
$$;

GRANT EXECUTE ON FUNCTION public.admin_exists() TO anon, authenticated, service_role;

-- >>> FILE: migrations/20250101000009_seed_admin.sql

-- =============================================================================
-- LabourFlow — Seed the admin account (runs via `supabase db push`)
-- =============================================================================
-- Creates (or resets) a ready-to-use, pre-confirmed admin login — no email is
-- sent, so it works even when SMTP/email isn't configured. Idempotent.
--
--   Email:    rathdash347@gmail.com
--   Password: Admin@8488
-- =============================================================================

DO $$
DECLARE
  v_email    TEXT := 'rathdash347@gmail.com';
  v_password TEXT := 'Admin@8488';
  v_name     TEXT := 'Administrator';
  v_uid      UUID;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(v_email);

  IF v_uid IS NULL THEN
    v_uid := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      v_email, extensions.crypt(v_password, extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', v_name),
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_uid::text, v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
      'email', now(), now(), now()
    );
  ELSE
    UPDATE auth.users
       SET encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           updated_at = now()
     WHERE id = v_uid;
  END IF;

  INSERT INTO public.app_users (user_id, full_name, role)
  VALUES (v_uid, v_name, 'admin')
  ON CONFLICT (user_id) DO UPDATE SET role = 'admin';

  RAISE NOTICE 'Seeded admin: %', v_email;
END $$;

-- >>> FILE: migrations/20250101000010_permanent_delete.sql

-- =============================================================================
-- LabourFlow — Permanent labourer delete
-- =============================================================================
-- Permanently removes a labourer and ALL dependent rows (attendance,
-- monthly_salaries, recalculation_log — all ON DELETE RESTRICT). Admin-only;
-- captures the full labourer row in the audit log before deletion.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.admin_delete_labourer(
  p_labourer_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_row public.labourers%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can permanently delete labourers' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.labourers WHERE id = p_labourer_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Labourer % not found', p_labourer_id;
  END IF;

  PERFORM public.write_audit(
    'delete_labourer', 'labourers', v_row.id,
    to_jsonb(v_row),
    NULL,
    p_reason
  );

  ALTER TABLE public.attendance DISABLE TRIGGER trg_attendance_recalc;

  DELETE FROM public.recalculation_log WHERE labourer_id = p_labourer_id;
  DELETE FROM public.attendance        WHERE labourer_id = p_labourer_id;
  DELETE FROM public.monthly_salaries  WHERE labourer_id = p_labourer_id;
  DELETE FROM public.labourers         WHERE id = p_labourer_id;

  ALTER TABLE public.attendance ENABLE TRIGGER trg_attendance_recalc;

  RETURN p_labourer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_labourer(UUID, TEXT) TO authenticated;

DROP POLICY IF EXISTS labourers_delete_admin ON public.labourers;
CREATE POLICY labourers_delete_admin ON public.labourers
  FOR DELETE TO authenticated USING (public.is_admin());


-- >>> FILE: migrations/20250101000011_attendance_types.sql

-- =============================================================================
-- Krishnam HRMS — 5 attendance types + multiplier-based salary calc
-- =============================================================================
-- Adds two new statuses on top of present/absent/half_day:
--   • 'double_duty'        (DD)  — multiplier 2.0
--   • 'one_and_half_duty'  (1.5) — multiplier 1.5
-- monthly_salaries gains per-status counts; recalculate_monthly_salary uses
-- fixed multipliers (P=1, H=0.5, A=0, 1.5=1.5, DD=2). dashboard_summary's
-- "present today" now means "any non-absent attendance" (P + H + DD + 1.5).
-- =============================================================================

-- 1. Allow 5 attendance statuses
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_status_valid;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_status_valid
  CHECK (status IN ('present', 'absent', 'half_day', 'double_duty', 'one_and_half_duty'));

-- 2. New per-status counts on monthly_salaries
ALTER TABLE public.monthly_salaries
  ADD COLUMN IF NOT EXISTS double_duty_count       SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS one_and_half_duty_count SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS absent_count            SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE public.monthly_salaries DROP CONSTRAINT IF EXISTS ms_counts_nonneg;
ALTER TABLE public.monthly_salaries ADD CONSTRAINT ms_counts_nonneg
  CHECK (days_present >= 0 AND half_days_count >= 0
         AND double_duty_count >= 0 AND one_and_half_duty_count >= 0
         AND absent_count >= 0);

-- 4. dashboard_summary — "present today" = any non-absent attendance
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

  SELECT count(*) FILTER (WHERE status <> 'absent')
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

-- 5. save_daily_attendance — accept new statuses + extend summary return
CREATE OR REPLACE FUNCTION public.save_daily_attendance(
  p_date DATE,
  p_entries JSONB,
  p_overwrite BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_entry          JSONB;
  v_labourer_id    UUID;
  v_status         TEXT;
  v_month          SMALLINT;
  v_year           SMALLINT;
  v_locked         BOOLEAN;
  v_present_cnt    INT := 0;
  v_absent_cnt     INT := 0;
  v_half_cnt       INT := 0;
  v_dd_cnt         INT := 0;
  v_oneandhalf_cnt INT := 0;
  v_existing       RECORD;
  v_old_value      JSONB;
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

    IF v_status NOT IN ('present', 'absent', 'half_day', 'double_duty', 'one_and_half_duty') THEN
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

    IF    v_status = 'present'           THEN v_present_cnt    := v_present_cnt + 1;
    ELSIF v_status = 'absent'            THEN v_absent_cnt     := v_absent_cnt + 1;
    ELSIF v_status = 'half_day'          THEN v_half_cnt       := v_half_cnt + 1;
    ELSIF v_status = 'double_duty'       THEN v_dd_cnt         := v_dd_cnt + 1;
    ELSIF v_status = 'one_and_half_duty' THEN v_oneandhalf_cnt := v_oneandhalf_cnt + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'date', p_date,
    'present', v_present_cnt,
    'absent', v_absent_cnt,
    'half_day', v_half_cnt,
    'double_duty', v_dd_cnt,
    'one_and_half_duty', v_oneandhalf_cnt,
    'month', v_month,
    'year', v_year
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_daily_attendance(DATE, JSONB, BOOLEAN) TO authenticated;

-- 6. edit_attendance — accept new statuses
-- NOTE: p_reason keeps its DEFAULT NULL from migration 005. Postgres rejects a
-- CREATE OR REPLACE that REMOVES an existing parameter default (SQLSTATE 42P13),
-- so the default must be carried forward here even though the body ignores it.
CREATE OR REPLACE FUNCTION public.edit_attendance(
  p_attendance_id UUID,
  p_new_status TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS public.attendance
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_old    public.attendance%ROWTYPE;
  v_new    public.attendance%ROWTYPE;
  v_month  SMALLINT;
  v_year   SMALLINT;
  v_locked BOOLEAN;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can edit past attendance' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR char_length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Reason must be at least 10 characters' USING ERRCODE = 'P0001';
  END IF;
  IF p_new_status NOT IN ('present', 'absent', 'half_day', 'double_duty', 'one_and_half_duty') THEN
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
     SET status      = p_new_status,
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


-- >>> FILE: migrations/20250101000012_monthly_advances.sql

-- =============================================================================
-- Krishnam HRMS — Month-wise advance ledger + salary calculation fix
-- =============================================================================
-- Problem 1: labourers.advance is a single running balance with no month
-- attached to it. change_advance() re-stamps whatever that one number
-- currently is onto whichever month is being recalculated — there is no way
-- to record "₹500 given in July, ₹300 given in August" separately.
--
-- Problem 2: migration 20250101000011 replaced recalculate_monthly_salary()
-- to add the double-duty/half-day multipliers, but its INSERT/UPDATE column
-- list dropped advance_deducted/net_salary entirely (they were introduced by
-- migration 20250101000004). Since then every recalculation either zeroes
-- net_salary (new rows) or leaves it frozen at a stale pre-011 value
-- (existing rows), even though calculated_salary (gross) keeps updating.
--
-- This migration:
--   1. Adds labourer_advances — a dated ledger, many rows per labourer per
--      month allowed.
--   2. Adds record_labourer_advance() / admin_delete_advance() to write to
--      it (mirrors change_advance / admin_delete_attendance).
--   3. Replaces recalculate_monthly_salary() to (a) keep 011's 5-status
--      aggregation and (b) restore advance_deducted/net_salary — now sourced
--      from SUM(labourer_advances.amount) for that specific month instead of
--      the old single labourers.advance field.
--   4. Backfills each labourer's existing advance balance as a single
--      legacy ledger entry dated at their joining_date. This is purely
--      additive — no existing monthly_salaries row is touched or
--      recalculated by this migration, so already-locked/paid months keep
--      exactly the values they have today.
--
-- labourers.advance and change_advance() are left in place (no data loss)
-- but are no longer written to by the app after this ships.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. labourer_advances — dated ledger, multiple entries per labourer/month
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.labourer_advances (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  labourer_id  UUID NOT NULL REFERENCES public.labourers(id) ON DELETE RESTRICT,
  given_on     DATE NOT NULL,
  amount       NUMERIC(10, 2) NOT NULL,
  note         TEXT,
  recorded_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT la_amount_range CHECK (amount > 0 AND amount <= 9999999.99),
  CONSTRAINT la_not_future CHECK (given_on <= CURRENT_DATE)
);

CREATE INDEX IF NOT EXISTS idx_la_labourer_given_on ON public.labourer_advances (labourer_id, given_on);
CREATE INDEX IF NOT EXISTS idx_la_month ON public.labourer_advances (
  EXTRACT(YEAR FROM given_on), EXTRACT(MONTH FROM given_on)
);

COMMENT ON TABLE public.labourer_advances IS
  'Month-wise advance ledger. Multiple dated entries per labourer are expected; recalculate_monthly_salary() sums entries within a calendar month for advance_deducted.';

ALTER TABLE public.labourer_advances ENABLE ROW LEVEL SECURITY;

CREATE POLICY la_select_authed ON public.labourer_advances
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY la_insert_authed ON public.labourer_advances
  FOR INSERT TO authenticated
  WITH CHECK (
    NOT public.is_month_locked(
      EXTRACT(MONTH FROM given_on)::SMALLINT,
      EXTRACT(YEAR  FROM given_on)::SMALLINT
    )
  );

-- Corrections (edit/remove a mistaken entry) require admin, same as
-- attendance/salary manual-delete (LF-NFR20).
CREATE POLICY la_update_admin ON public.labourer_advances
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (
    public.is_admin()
    AND NOT public.is_month_locked(
      EXTRACT(MONTH FROM given_on)::SMALLINT,
      EXTRACT(YEAR  FROM given_on)::SMALLINT
    )
  );

CREATE POLICY la_delete_admin ON public.labourer_advances
  FOR DELETE TO authenticated USING (public.is_admin());

-- -----------------------------------------------------------------------------
-- 2. record_labourer_advance — validated insert + audit + immediate recalc
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_labourer_advance(
  p_labourer_id UUID,
  p_given_on DATE,
  p_amount NUMERIC,
  p_note TEXT DEFAULT NULL
)
RETURNS public.labourer_advances
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_row    public.labourer_advances%ROWTYPE;
  v_month  SMALLINT;
  v_year   SMALLINT;
  v_locked BOOLEAN;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 9999999.99 THEN
    RAISE EXCEPTION 'Advance amount must be between 0.01 and 9,999,999.99' USING ERRCODE = 'P0001';
  END IF;
  IF p_given_on IS NULL OR p_given_on > CURRENT_DATE THEN
    RAISE EXCEPTION 'Advance date cannot be in the future' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.labourers WHERE id = p_labourer_id) THEN
    RAISE EXCEPTION 'Labourer % not found', p_labourer_id;
  END IF;

  v_month := EXTRACT(MONTH FROM p_given_on)::SMALLINT;
  v_year  := EXTRACT(YEAR  FROM p_given_on)::SMALLINT;

  SELECT EXISTS (
    SELECT 1 FROM public.month_locks
    WHERE month = v_month AND year = v_year AND is_locked = TRUE
  ) INTO v_locked;
  IF v_locked THEN
    RAISE EXCEPTION 'Month %-% is locked. Unlock before recording an advance.', v_year, v_month
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.labourer_advances (labourer_id, given_on, amount, note, recorded_by)
  VALUES (p_labourer_id, p_given_on, p_amount, NULLIF(trim(COALESCE(p_note, '')), ''), auth.uid())
  RETURNING * INTO v_row;

  PERFORM public.write_audit(
    'record_advance', 'labourer_advances', v_row.id,
    NULL,
    jsonb_build_object('labourer_id', p_labourer_id, 'given_on', p_given_on, 'amount', p_amount, 'note', p_note),
    p_note
  );

  PERFORM public.recalculate_monthly_salary(p_labourer_id, v_month, v_year, 'advance_recorded', FALSE);

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_labourer_advance(UUID, DATE, NUMERIC, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. admin_delete_advance — remove a mistaken entry (admin only)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_advance(
  p_advance_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_row    public.labourer_advances%ROWTYPE;
  v_month  SMALLINT;
  v_year   SMALLINT;
  v_locked BOOLEAN;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can delete advance records' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.labourer_advances WHERE id = p_advance_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Advance record % not found', p_advance_id;
  END IF;

  v_month := EXTRACT(MONTH FROM v_row.given_on)::SMALLINT;
  v_year  := EXTRACT(YEAR  FROM v_row.given_on)::SMALLINT;

  SELECT EXISTS (
    SELECT 1 FROM public.month_locks
    WHERE month = v_month AND year = v_year AND is_locked = TRUE
  ) INTO v_locked;
  IF v_locked THEN
    RAISE EXCEPTION 'Month %-% is locked. Unlock before deleting.', v_year, v_month
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.write_audit(
    'delete_advance', 'labourer_advances', v_row.id,
    to_jsonb(v_row),
    NULL,
    p_reason
  );

  DELETE FROM public.labourer_advances WHERE id = p_advance_id;

  PERFORM public.recalculate_monthly_salary(v_row.labourer_id, v_month, v_year, 'advance_deleted', FALSE);

  RETURN p_advance_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_advance(UUID, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. recalculate_monthly_salary — restore advance_deducted/net_salary,
--    now sourced from the month-wise ledger instead of labourers.advance.
--    Keeps migration 011's 5-status aggregation unchanged.
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
  v_dd             SMALLINT := 0;
  v_oneandhalf     SMALLINT := 0;
  v_absent         SMALLINT := 0;
  v_effective      NUMERIC(6, 1);
  v_wage           NUMERIC(10, 2);
  v_calc           NUMERIC(12, 2);
  v_advance        NUMERIC(10, 2);
  v_net            NUMERIC(12, 2);
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

  -- Aggregate per status
  SELECT
    COUNT(*) FILTER (WHERE status = 'present'),
    COUNT(*) FILTER (WHERE status = 'half_day'),
    COUNT(*) FILTER (WHERE status = 'double_duty'),
    COUNT(*) FILTER (WHERE status = 'one_and_half_duty'),
    COUNT(*) FILTER (WHERE status = 'absent')
  INTO v_present, v_half, v_dd, v_oneandhalf, v_absent
  FROM public.attendance
  WHERE labourer_id = p_labourer_id
    AND EXTRACT(MONTH FROM date)::SMALLINT = p_month
    AND EXTRACT(YEAR  FROM date)::SMALLINT = p_year;

  v_effective := v_present * 1.0 + v_half * 0.5 + v_dd * 2.0 + v_oneandhalf * 1.5;

  -- Sum this specific month's advance entries from the ledger (BR-aligned:
  -- an advance only affects the month it was actually given in).
  SELECT COALESCE(SUM(amount), 0) INTO v_advance
  FROM public.labourer_advances
  WHERE labourer_id = p_labourer_id
    AND EXTRACT(MONTH FROM given_on)::SMALLINT = p_month
    AND EXTRACT(YEAR  FROM given_on)::SMALLINT = p_year;

  -- Determine wage (snapshot semantics preserved)
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
  v_net  := v_calc - v_advance;
  v_old_salary := COALESCE(v_existing.calculated_salary, 0);

  INSERT INTO public.monthly_salaries (
    labourer_id, month, year,
    days_present, half_days_count, double_duty_count, one_and_half_duty_count, absent_count,
    effective_days, daily_wage_used, calculated_salary, advance_deducted, net_salary, last_recalculated_at
  )
  VALUES (
    p_labourer_id, p_month, p_year,
    v_present, v_half, v_dd, v_oneandhalf, v_absent,
    v_effective, v_wage, v_calc, v_advance, v_net, now()
  )
  ON CONFLICT (labourer_id, month, year) DO UPDATE
    SET days_present             = EXCLUDED.days_present,
        half_days_count          = EXCLUDED.half_days_count,
        double_duty_count        = EXCLUDED.double_duty_count,
        one_and_half_duty_count  = EXCLUDED.one_and_half_duty_count,
        absent_count             = EXCLUDED.absent_count,
        effective_days           = EXCLUDED.effective_days,
        daily_wage_used          = EXCLUDED.daily_wage_used,
        calculated_salary        = EXCLUDED.calculated_salary,
        advance_deducted         = EXCLUDED.advance_deducted,
        net_salary               = EXCLUDED.net_salary,
        last_recalculated_at     = EXCLUDED.last_recalculated_at
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
    jsonb_build_object(
      'calculated_salary', v_calc,
      'days_present', v_present,
      'half_days_count', v_half,
      'double_duty_count', v_dd,
      'one_and_half_duty_count', v_oneandhalf,
      'absent_count', v_absent,
      'daily_wage_used', v_wage,
      'advance_deducted', v_advance,
      'net_salary', v_net
    ),
    p_trigger_reason
  );

  RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_monthly_salary(UUID, SMALLINT, SMALLINT, TEXT, BOOLEAN)
  TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. Backfill: carry each labourer's existing advance balance forward as a
--    single legacy ledger entry dated at their joining_date. Purely additive
--    — does not touch any existing monthly_salaries row, so already-computed
--    (including locked/paid) months are unaffected by this migration.
-- -----------------------------------------------------------------------------
INSERT INTO public.labourer_advances (labourer_id, given_on, amount, note)
SELECT id, joining_date, advance, 'Migrated from legacy advance balance'
FROM public.labourers
WHERE advance > 0;

-- -----------------------------------------------------------------------------
-- 6. labourers.advance / change_advance() are now legacy. Left in place
--    (no destructive change) but no longer written to by the app.
-- -----------------------------------------------------------------------------
COMMENT ON COLUMN public.labourers.advance IS
  'Deprecated as of migration 20250101000012 — superseded by public.labourer_advances (month-wise ledger). Retained for backward compatibility; no longer written by the app.';

COMMENT ON FUNCTION public.change_advance(UUID, NUMERIC) IS
  'Deprecated as of migration 20250101000012 — use record_labourer_advance() instead. Retained for backward compatibility only.';


-- >>> FILE: migrations/20250101000013_advance_edit_and_carry_forward.sql

-- =============================================================================
-- Krishnam HRMS — Edit advance entries + automatic negative-balance carry-forward
-- =============================================================================
-- 1. edit_labourer_advance() — admin can correct a manually-entered advance
--    (date/amount/note) in place instead of delete-and-recreate. Blocked for
--    system-generated (carry-forward) rows and for locked months.
--
-- 2. Automatic carry-forward: if a month's net_salary is negative, the
--    shortfall is pushed into the FIRST DAY of the next month as a dedicated,
--    system-tagged advance entry, and that next month is recalculated once
--    (never cascading further in the same operation). If the source month's
--    attendance later changes such that it's no longer negative, the
--    carry-forward entry is automatically shrunk/removed and the next month
--    recalculated again — always kept in sync with the source month.
--
-- Policy (confirmed): if the next month is already LOCKED when a carry-
-- forward needs to be created, updated, or removed, the whole triggering
-- action (attendance edit, advance entry, wage change, etc.) fails with a
-- clear error — nothing is silently dropped, and month M is left exactly as
-- it was before the action that would have created the conflict.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Schema: tag carry-forward rows so they can be found/updated/removed
--    idempotently, and relax the future-date check for that one system case.
-- -----------------------------------------------------------------------------
ALTER TABLE public.labourer_advances
  ADD COLUMN IF NOT EXISTS is_carry_forward BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS source_month SMALLINT,
  ADD COLUMN IF NOT EXISTS source_year SMALLINT;

ALTER TABLE public.labourer_advances DROP CONSTRAINT IF EXISTS la_not_future;
ALTER TABLE public.labourer_advances ADD CONSTRAINT la_not_future
  CHECK (is_carry_forward OR given_on <= CURRENT_DATE);

CREATE UNIQUE INDEX IF NOT EXISTS uq_la_carry_forward_source
  ON public.labourer_advances (labourer_id, source_month, source_year)
  WHERE is_carry_forward;

COMMENT ON COLUMN public.labourer_advances.is_carry_forward IS
  'TRUE for system-generated rows created by recalculate_monthly_salary() when a month''s net_salary is negative. Not directly editable/deletable by clients.';

-- Prevent a client from faking a system-generated row via direct table access
-- (RPCs bypass RLS via SECURITY DEFINER regardless, so this only closes the
-- direct-table-write path — same defense-in-depth pattern as the rest of RLS).
DROP POLICY IF EXISTS la_insert_authed ON public.labourer_advances;
CREATE POLICY la_insert_authed ON public.labourer_advances
  FOR INSERT TO authenticated
  WITH CHECK (
    is_carry_forward = FALSE
    AND NOT public.is_month_locked(
      EXTRACT(MONTH FROM given_on)::SMALLINT,
      EXTRACT(YEAR  FROM given_on)::SMALLINT
    )
  );

-- -----------------------------------------------------------------------------
-- 2. edit_labourer_advance — correct a manually-entered advance in place
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.edit_labourer_advance(
  p_advance_id UUID,
  p_given_on DATE,
  p_amount NUMERIC,
  p_note TEXT DEFAULT NULL
)
RETURNS public.labourer_advances
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_old       public.labourer_advances%ROWTYPE;
  v_new       public.labourer_advances%ROWTYPE;
  v_old_month SMALLINT;
  v_old_year  SMALLINT;
  v_new_month SMALLINT;
  v_new_year  SMALLINT;
  v_locked    BOOLEAN;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can edit advance records' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_old FROM public.labourer_advances WHERE id = p_advance_id;
  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Advance record % not found', p_advance_id;
  END IF;

  IF v_old.is_carry_forward THEN
    RAISE EXCEPTION 'This entry was generated automatically from %-%''s negative balance and can''t be edited directly — edit that month''s attendance instead.',
      v_old.source_year, v_old.source_month USING ERRCODE = 'P0001';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 9999999.99 THEN
    RAISE EXCEPTION 'Advance amount must be between 0.01 and 9,999,999.99' USING ERRCODE = 'P0001';
  END IF;
  IF p_given_on IS NULL OR p_given_on > CURRENT_DATE THEN
    RAISE EXCEPTION 'Advance date cannot be in the future' USING ERRCODE = 'P0001';
  END IF;

  v_old_month := EXTRACT(MONTH FROM v_old.given_on)::SMALLINT;
  v_old_year  := EXTRACT(YEAR  FROM v_old.given_on)::SMALLINT;
  v_new_month := EXTRACT(MONTH FROM p_given_on)::SMALLINT;
  v_new_year  := EXTRACT(YEAR  FROM p_given_on)::SMALLINT;

  SELECT EXISTS (
    SELECT 1 FROM public.month_locks
    WHERE month = v_old_month AND year = v_old_year AND is_locked = TRUE
  ) INTO v_locked;
  IF v_locked THEN
    RAISE EXCEPTION 'Month %-% is locked. Unlock before editing.', v_old_year, v_old_month
      USING ERRCODE = 'P0001';
  END IF;

  IF v_new_month <> v_old_month OR v_new_year <> v_old_year THEN
    SELECT EXISTS (
      SELECT 1 FROM public.month_locks
      WHERE month = v_new_month AND year = v_new_year AND is_locked = TRUE
    ) INTO v_locked;
    IF v_locked THEN
      RAISE EXCEPTION 'Month %-% is locked. Unlock before moving this advance there.', v_new_year, v_new_month
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE public.labourer_advances
     SET given_on = p_given_on,
         amount   = p_amount,
         note     = NULLIF(trim(COALESCE(p_note, '')), '')
   WHERE id = p_advance_id
  RETURNING * INTO v_new;

  PERFORM public.write_audit(
    'edit_advance', 'labourer_advances', v_new.id,
    to_jsonb(v_old),
    to_jsonb(v_new),
    p_note
  );

  PERFORM public.recalculate_monthly_salary(v_old.labourer_id, v_old_month, v_old_year, 'advance_edited', FALSE);
  IF v_new_month <> v_old_month OR v_new_year <> v_old_year THEN
    PERFORM public.recalculate_monthly_salary(v_old.labourer_id, v_new_month, v_new_year, 'advance_edited', FALSE);
  END IF;

  RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.edit_labourer_advance(UUID, DATE, NUMERIC, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. admin_delete_advance — also block deleting system-generated rows,
--    same reasoning as edit.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_advance(
  p_advance_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_row    public.labourer_advances%ROWTYPE;
  v_month  SMALLINT;
  v_year   SMALLINT;
  v_locked BOOLEAN;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can delete advance records' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.labourer_advances WHERE id = p_advance_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Advance record % not found', p_advance_id;
  END IF;

  IF v_row.is_carry_forward THEN
    RAISE EXCEPTION 'This entry was generated automatically from %-%''s negative balance and can''t be deleted directly — edit that month''s attendance instead.',
      v_row.source_year, v_row.source_month USING ERRCODE = 'P0001';
  END IF;

  v_month := EXTRACT(MONTH FROM v_row.given_on)::SMALLINT;
  v_year  := EXTRACT(YEAR  FROM v_row.given_on)::SMALLINT;

  SELECT EXISTS (
    SELECT 1 FROM public.month_locks
    WHERE month = v_month AND year = v_year AND is_locked = TRUE
  ) INTO v_locked;
  IF v_locked THEN
    RAISE EXCEPTION 'Month %-% is locked. Unlock before deleting.', v_year, v_month
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.write_audit(
    'delete_advance', 'labourer_advances', v_row.id,
    to_jsonb(v_row),
    NULL,
    p_reason
  );

  DELETE FROM public.labourer_advances WHERE id = p_advance_id;

  PERFORM public.recalculate_monthly_salary(v_row.labourer_id, v_month, v_year, 'advance_deleted', FALSE);

  RETURN p_advance_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_advance(UUID, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. recalculate_monthly_salary — add automatic, self-correcting, single-hop
--    carry-forward of a negative net_salary into the next month.
--    p_apply_carry_forward defaults TRUE for every normal caller (attendance
--    trigger, change_daily_wage, advance RPCs, recalculate_month_for_all);
--    the recursive call into next month passes FALSE so it can never chain
--    past one hop.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_monthly_salary(
  p_labourer_id UUID,
  p_month SMALLINT,
  p_year  SMALLINT,
  p_trigger_reason TEXT DEFAULT 'manual',
  p_update_wage BOOLEAN DEFAULT FALSE,
  p_apply_carry_forward BOOLEAN DEFAULT TRUE
)
RETURNS public.monthly_salaries
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_locked         BOOLEAN;
  v_present        SMALLINT := 0;
  v_half           SMALLINT := 0;
  v_dd             SMALLINT := 0;
  v_oneandhalf     SMALLINT := 0;
  v_absent         SMALLINT := 0;
  v_effective      NUMERIC(6, 1);
  v_wage           NUMERIC(10, 2);
  v_calc           NUMERIC(12, 2);
  v_advance        NUMERIC(10, 2);
  v_net            NUMERIC(12, 2);
  v_existing       public.monthly_salaries%ROWTYPE;
  v_new            public.monthly_salaries%ROWTYPE;
  v_old_salary     NUMERIC(12, 2);
  v_next_month     SMALLINT;
  v_next_year      SMALLINT;
  v_next_locked    BOOLEAN;
  v_cf_id          UUID;
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

  -- Aggregate per status
  SELECT
    COUNT(*) FILTER (WHERE status = 'present'),
    COUNT(*) FILTER (WHERE status = 'half_day'),
    COUNT(*) FILTER (WHERE status = 'double_duty'),
    COUNT(*) FILTER (WHERE status = 'one_and_half_duty'),
    COUNT(*) FILTER (WHERE status = 'absent')
  INTO v_present, v_half, v_dd, v_oneandhalf, v_absent
  FROM public.attendance
  WHERE labourer_id = p_labourer_id
    AND EXTRACT(MONTH FROM date)::SMALLINT = p_month
    AND EXTRACT(YEAR  FROM date)::SMALLINT = p_year;

  v_effective := v_present * 1.0 + v_half * 0.5 + v_dd * 2.0 + v_oneandhalf * 1.5;

  -- Sum this specific month's advance entries from the ledger, including any
  -- carry-forward that already landed here from the previous month.
  SELECT COALESCE(SUM(amount), 0) INTO v_advance
  FROM public.labourer_advances
  WHERE labourer_id = p_labourer_id
    AND EXTRACT(MONTH FROM given_on)::SMALLINT = p_month
    AND EXTRACT(YEAR  FROM given_on)::SMALLINT = p_year;

  -- Determine wage (snapshot semantics preserved)
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
  v_net  := v_calc - v_advance;
  v_old_salary := COALESCE(v_existing.calculated_salary, 0);

  INSERT INTO public.monthly_salaries (
    labourer_id, month, year,
    days_present, half_days_count, double_duty_count, one_and_half_duty_count, absent_count,
    effective_days, daily_wage_used, calculated_salary, advance_deducted, net_salary, last_recalculated_at
  )
  VALUES (
    p_labourer_id, p_month, p_year,
    v_present, v_half, v_dd, v_oneandhalf, v_absent,
    v_effective, v_wage, v_calc, v_advance, v_net, now()
  )
  ON CONFLICT (labourer_id, month, year) DO UPDATE
    SET days_present             = EXCLUDED.days_present,
        half_days_count          = EXCLUDED.half_days_count,
        double_duty_count        = EXCLUDED.double_duty_count,
        one_and_half_duty_count  = EXCLUDED.one_and_half_duty_count,
        absent_count             = EXCLUDED.absent_count,
        effective_days           = EXCLUDED.effective_days,
        daily_wage_used          = EXCLUDED.daily_wage_used,
        calculated_salary        = EXCLUDED.calculated_salary,
        advance_deducted         = EXCLUDED.advance_deducted,
        net_salary               = EXCLUDED.net_salary,
        last_recalculated_at     = EXCLUDED.last_recalculated_at
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
    jsonb_build_object(
      'calculated_salary', v_calc,
      'days_present', v_present,
      'half_days_count', v_half,
      'double_duty_count', v_dd,
      'one_and_half_duty_count', v_oneandhalf,
      'absent_count', v_absent,
      'daily_wage_used', v_wage,
      'advance_deducted', v_advance,
      'net_salary', v_net
    ),
    p_trigger_reason
  );

  -- ---- Carry-forward (single hop, self-correcting) --------------------------
  IF p_apply_carry_forward THEN
    IF p_month = 12 THEN
      v_next_month := 1;
      v_next_year  := p_year + 1;
    ELSE
      v_next_month := p_month + 1;
      v_next_year  := p_year;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.month_locks
      WHERE month = v_next_month AND year = v_next_year AND is_locked = TRUE
    ) INTO v_next_locked;

    SELECT id INTO v_cf_id FROM public.labourer_advances
     WHERE labourer_id = p_labourer_id AND is_carry_forward
       AND source_month = p_month AND source_year = p_year;

    IF v_net < 0 THEN
      IF v_next_locked THEN
        RAISE EXCEPTION
          'Month %-% would end with a negative net salary that must carry forward into %-%, but %-% is locked. Unlock %-% first.',
          p_year, p_month, v_next_year, v_next_month, v_next_year, v_next_month, v_next_year, v_next_month
          USING ERRCODE = 'P0001';
      END IF;

      IF v_cf_id IS NULL THEN
        INSERT INTO public.labourer_advances (
          labourer_id, given_on, amount, note, is_carry_forward, source_month, source_year
        ) VALUES (
          p_labourer_id,
          make_date(v_next_year, v_next_month, 1),
          -v_net,
          'Carry Forward: Negative balance from the previous month''s salary.',
          TRUE, p_month, p_year
        );
        PERFORM public.write_audit(
          'carry_forward_advance', 'labourer_advances', NULL, NULL,
          jsonb_build_object('labourer_id', p_labourer_id, 'amount', -v_net,
                             'source_month', p_month, 'source_year', p_year),
          'auto'
        );
      ELSE
        UPDATE public.labourer_advances SET amount = -v_net WHERE id = v_cf_id;
        PERFORM public.write_audit(
          'carry_forward_advance', 'labourer_advances', v_cf_id,
          NULL, jsonb_build_object('amount', -v_net), 'auto'
        );
      END IF;

      PERFORM public.recalculate_monthly_salary(
        p_labourer_id, v_next_month, v_next_year, 'carry_forward', FALSE, FALSE
      );

    ELSIF v_cf_id IS NOT NULL THEN
      -- No longer negative — the previously-pushed carry-forward is stale; remove it.
      IF v_next_locked THEN
        RAISE EXCEPTION
          'Month %-% is no longer negative, but the carry-forward entry in locked month %-% can''t be removed automatically. Unlock %-% first.',
          p_year, p_month, v_next_year, v_next_month, v_next_year, v_next_month
          USING ERRCODE = 'P0001';
      END IF;

      DELETE FROM public.labourer_advances WHERE id = v_cf_id;
      PERFORM public.write_audit(
        'remove_carry_forward_advance', 'labourer_advances', v_cf_id,
        jsonb_build_object('source_month', p_month, 'source_year', p_year), NULL, 'auto'
      );

      PERFORM public.recalculate_monthly_salary(
        p_labourer_id, v_next_month, v_next_year, 'carry_forward_removed', FALSE, FALSE
      );
    END IF;
  END IF;

  RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_monthly_salary(UUID, SMALLINT, SMALLINT, TEXT, BOOLEAN, BOOLEAN)
  TO authenticated;


-- >>> FILE: migrations/20250101000014_fix_recalculate_overload.sql

-- =============================================================================
-- Krishnam HRMS — Fix duplicate recalculate_monthly_salary() overload
-- =============================================================================
-- Migration 20250101000013 added a 6th parameter (p_apply_carry_forward) to
-- recalculate_monthly_salary() via CREATE OR REPLACE. Postgres identifies a
-- function by its (name, parameter-type-list) — changing the parameter COUNT
-- does not replace the existing function, it registers a second, separate
-- overload. That left two versions coexisting:
--   recalculate_monthly_salary(uuid, smallint, smallint, text, boolean)          -- old, 5-arg
--   recalculate_monthly_salary(uuid, smallint, smallint, text, boolean, boolean) -- new, 6-arg
--
-- Every existing caller (the attendance trigger, change_daily_wage,
-- record_labourer_advance, admin_delete_advance, edit_labourer_advance,
-- recalculate_month_for_all) invokes it with exactly 5 arguments. Since the
-- 6-arg version's 6th parameter has a default, a 5-arg call matches BOTH
-- overloads — Postgres can't pick one, so every such call fails with
-- "function ... is not unique". Because attendance writes fire this on every
-- save via trg_attendance_recalc, this broke attendance save/edit entirely.
--
-- Fix: drop the stale 5-arg overload. The 6-arg version (whose extra
-- parameter defaults to TRUE) is a strict superset of the old behavior for
-- every existing call site, so nothing else needs to change.
-- =============================================================================

DROP FUNCTION IF EXISTS public.recalculate_monthly_salary(UUID, SMALLINT, SMALLINT, TEXT, BOOLEAN);
