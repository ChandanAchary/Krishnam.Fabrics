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

-- 3. Recalculate uses fixed multipliers (P×1, H×0.5, A×0, 1.5×1.5, DD×2)
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
  v_old_salary := COALESCE(v_existing.calculated_salary, 0);

  INSERT INTO public.monthly_salaries (
    labourer_id, month, year,
    days_present, half_days_count, double_duty_count, one_and_half_duty_count, absent_count,
    effective_days, daily_wage_used, calculated_salary, last_recalculated_at
  )
  VALUES (
    p_labourer_id, p_month, p_year,
    v_present, v_half, v_dd, v_oneandhalf, v_absent,
    v_effective, v_wage, v_calc, now()
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
      'daily_wage_used', v_wage
    ),
    p_trigger_reason
  );

  RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_monthly_salary(UUID, SMALLINT, SMALLINT, TEXT, BOOLEAN)
  TO authenticated;

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
