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
