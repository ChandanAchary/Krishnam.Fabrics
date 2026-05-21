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
