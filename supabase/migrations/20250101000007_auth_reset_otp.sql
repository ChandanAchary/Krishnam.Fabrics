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
