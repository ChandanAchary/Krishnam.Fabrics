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
  p_reason TEXT
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
  IF p_reason IS NULL OR char_length(trim(p_reason)) < 50 THEN
    RAISE EXCEPTION 'Reason must be at least 50 characters' USING ERRCODE = 'P0001';
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
