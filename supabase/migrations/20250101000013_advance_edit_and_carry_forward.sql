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
          p_year, p_month, v_next_year, v_next_month, v_next_year, v_next_month
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
