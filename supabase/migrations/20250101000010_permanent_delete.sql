-- =============================================================================
-- LabourFlow — Permanent labourer delete + relaxed salary delete
-- =============================================================================
-- 1. admin_delete_labourer(): permanently removes a labourer and ALL of their
--    dependent rows (attendance, monthly_salaries, recalculation_log). All of
--    those FKs are ON DELETE RESTRICT, so they must be cleared explicitly.
--    Admin-only; captures the full labourer row in the audit log first.
-- 2. admin_delete_salary(): the mandatory min-50-char reason is dropped — a
--    salary record can now be deleted without entering any reason.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Permanently delete a labourer and every record that references it.
-- -----------------------------------------------------------------------------
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

  -- Capture the full record BEFORE deletion (LF-NFR20 audit trail).
  PERFORM public.write_audit(
    'delete_labourer', 'labourers', v_row.id,
    to_jsonb(v_row),
    NULL,
    p_reason
  );

  -- Deleting attendance rows would normally fire trg_attendance_recalc, which
  -- recomputes (and re-creates) salary + recalc-log rows and refuses to run on
  -- locked months. Disable it for this operation; DDL is transactional, so a
  -- rollback (on any error below) restores the trigger automatically.
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

-- A matching DELETE policy so the cascade is permitted under RLS. The function
-- runs as its (table-owner) definer and bypasses RLS, but this keeps intent
-- explicit and allows admins should a direct delete ever be needed.
DROP POLICY IF EXISTS labourers_delete_admin ON public.labourers;
CREATE POLICY labourers_delete_admin ON public.labourers
  FOR DELETE TO authenticated USING (public.is_admin());

-- -----------------------------------------------------------------------------
-- Relax salary deletion: no reason required (was min 50 chars).
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
