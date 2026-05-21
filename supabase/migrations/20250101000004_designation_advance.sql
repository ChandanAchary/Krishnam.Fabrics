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
