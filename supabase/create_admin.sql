-- =============================================================================
-- LabourFlow — Activate the admin account
-- =============================================================================
-- The user "admin@labourflow.com" was already created via the Supabase signup
-- API, but Supabase requires email confirmation before first login. This script
-- (a) confirms the email so you can log in WITHOUT needing SMTP, and
-- (b) guarantees the application role is 'admin'.
--
-- HOW TO RUN (one time):
--   Supabase Dashboard → SQL Editor → New query → paste this whole file → Run.
--
-- PREREQUISITE: the 5 migration files in supabase/migrations/ must already be
-- applied (they create public.app_users and the role trigger).
-- =============================================================================

-- It is also fully self-contained: if the auth user does not exist yet (e.g. you
-- reset the database), it will be created here, pre-confirmed.

DO $$
DECLARE
  v_email TEXT := 'admin@labourflow.com';
  v_password TEXT := 'Admin@LabourFlow2026';
  v_uid UUID;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = v_email;

  IF v_uid IS NULL THEN
    -- Create the auth user from scratch, already confirmed.
    v_uid := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      v_email, extensions.crypt(v_password, extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Administrator"}',
      now(), now(), '', '', '', ''
    );

    INSERT INTO auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_uid::text, v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
      'email', now(), now(), now()
    );
  ELSE
    -- User exists (created via the signup API) → just confirm the email.
    UPDATE auth.users
       SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
           updated_at = now()
     WHERE id = v_uid;
  END IF;

  -- Guarantee the application role is admin (overrides the manager default).
  INSERT INTO public.app_users (user_id, full_name, role)
  VALUES (v_uid, 'Administrator', 'admin')
  ON CONFLICT (user_id) DO UPDATE SET role = 'admin';

  RAISE NOTICE 'Admin ready: % (uid %)', v_email, v_uid;
END $$;
