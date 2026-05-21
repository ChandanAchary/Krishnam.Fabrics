-- =============================================================================
-- LabourFlow — Seed the admin account
-- =============================================================================
-- Creates (or resets) a ready-to-use admin login, pre-confirmed so it can sign
-- in immediately. Safe to re-run (idempotent). Run AFTER the schema migrations.
--
--   Email:    rathdash347@gmail.com
--   Password: Admin@8488
-- =============================================================================

DO $$
DECLARE
  v_email    TEXT := 'rathdash347@gmail.com';
  v_password TEXT := 'Admin@8488';
  v_name     TEXT := 'Administrator';
  v_uid      UUID;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(v_email);

  IF v_uid IS NULL THEN
    -- Create the auth user from scratch, already email-confirmed.
    v_uid := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      v_email, extensions.crypt(v_password, extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', v_name),
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
    -- Already exists → reset password + ensure confirmed.
    UPDATE auth.users
       SET encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           updated_at = now()
     WHERE id = v_uid;
  END IF;

  -- Ensure the application role is admin.
  INSERT INTO public.app_users (user_id, full_name, role)
  VALUES (v_uid, v_name, 'admin')
  ON CONFLICT (user_id) DO UPDATE SET role = 'admin';

  RAISE NOTICE 'Seeded admin: % (uid %)', v_email, v_uid;
END $$;
