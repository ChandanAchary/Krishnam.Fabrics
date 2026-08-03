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
