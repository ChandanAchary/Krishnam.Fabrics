-- =============================================================================
-- LabourFlow — Account OTP store (for Brevo email/password change verification)
-- =============================================================================
-- One-time codes for verifying admin email change and password change. Codes are
-- stored hashed (SHA-256). Only the `account-otp` Edge Function (service role)
-- reads/writes this table — RLS is enabled with NO policies, so the anon and
-- authenticated roles have zero access.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.auth_otps (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose      TEXT NOT NULL,
  code_hash    TEXT NOT NULL,
  new_email    TEXT,
  attempts     SMALLINT NOT NULL DEFAULT 0,
  max_attempts SMALLINT NOT NULL DEFAULT 5,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT auth_otps_purpose_valid CHECK (purpose IN ('email_change', 'password_change'))
);

CREATE INDEX IF NOT EXISTS idx_auth_otps_user_purpose
  ON public.auth_otps (user_id, purpose, created_at DESC);

ALTER TABLE public.auth_otps ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies → only the service role (Edge Function) can access.

-- Housekeeping helper: purge expired/consumed codes (safe to call from the function).
CREATE OR REPLACE FUNCTION public.purge_expired_otps()
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.auth_otps
   WHERE expires_at < now() - INTERVAL '1 day'
      OR consumed_at IS NOT NULL;
$$;
