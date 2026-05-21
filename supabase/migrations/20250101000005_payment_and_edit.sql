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
