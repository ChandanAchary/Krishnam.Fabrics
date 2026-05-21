-- =============================================================================
-- LabourFlow — Initial Schema (IEEE 830 §5)
-- =============================================================================
-- Creates all 7 application tables, constraints, indexes, and audit triggers.
-- All tables use UUID primary keys and TIMESTAMPTZ for timestamps.
-- Hard deletes are prohibited per [LF-CON05].
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 5.1 labourers — workforce master table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.labourers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  phone         TEXT,
  daily_wage    NUMERIC(10, 2) NOT NULL,
  joining_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT labourers_name_length CHECK (char_length(trim(name)) BETWEEN 2 AND 100),
  CONSTRAINT labourers_phone_format CHECK (
    phone IS NULL OR phone ~ '^(\+[1-9][0-9]{7,14}|[0-9]{10})$'
  ),
  CONSTRAINT labourers_wage_range CHECK (daily_wage >= 1 AND daily_wage <= 99999.99),
  CONSTRAINT labourers_joining_not_future CHECK (joining_date <= CURRENT_DATE)
);

CREATE INDEX IF NOT EXISTS idx_labourers_active_name ON public.labourers (is_active, lower(name));
CREATE INDEX IF NOT EXISTS idx_labourers_phone ON public.labourers (phone) WHERE phone IS NOT NULL;

COMMENT ON TABLE public.labourers IS 'Workforce master. Hard delete prohibited (LF-CON05). Use is_active=false for soft delete.';

-- -----------------------------------------------------------------------------
-- 5.2 attendance — one row per labourer per day (retained indefinitely)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  labourer_id  UUID NOT NULL REFERENCES public.labourers(id) ON DELETE RESTRICT,
  date         DATE NOT NULL,
  status       TEXT NOT NULL DEFAULT 'absent',
  recorded_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  edit_reason  TEXT,
  CONSTRAINT attendance_status_valid CHECK (status IN ('present', 'absent', 'half_day')),
  CONSTRAINT attendance_not_future CHECK (date <= CURRENT_DATE),
  CONSTRAINT attendance_unique_per_day UNIQUE (labourer_id, date)
);

CREATE INDEX IF NOT EXISTS idx_att_labourer_date ON public.attendance (labourer_id, date);
CREATE INDEX IF NOT EXISTS idx_att_date         ON public.attendance (date);
CREATE INDEX IF NOT EXISTS idx_att_month        ON public.attendance (
  EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date)
);

COMMENT ON TABLE public.attendance IS
  'Date-wise attendance retention (LF-NFR18 / BR-13): rows preserved permanently.';

-- -----------------------------------------------------------------------------
-- 5.3 monthly_salaries — UPSERTed; rows are never deleted by recalculation
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.monthly_salaries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  labourer_id           UUID NOT NULL REFERENCES public.labourers(id) ON DELETE RESTRICT,
  month                 SMALLINT NOT NULL,
  year                  SMALLINT NOT NULL,
  days_present          SMALLINT NOT NULL DEFAULT 0,
  half_days_count       SMALLINT NOT NULL DEFAULT 0,
  effective_days        NUMERIC(5, 1) NOT NULL DEFAULT 0.0,
  daily_wage_used       NUMERIC(10, 2) NOT NULL,
  calculated_salary     NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  payment_status        TEXT NOT NULL DEFAULT 'not_paid',
  paid_on               TIMESTAMPTZ,
  payment_reference     TEXT,
  last_recalculated_at  TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ms_month_valid     CHECK (month BETWEEN 1 AND 12),
  CONSTRAINT ms_year_valid      CHECK (year BETWEEN 2020 AND 2099),
  CONSTRAINT ms_payment_valid   CHECK (payment_status IN ('paid', 'not_paid')),
  CONSTRAINT ms_counts_nonneg   CHECK (days_present >= 0 AND half_days_count >= 0),
  CONSTRAINT ms_unique_labourer_month UNIQUE (labourer_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_ms_labourer_month_year ON public.monthly_salaries (labourer_id, month, year);
CREATE INDEX IF NOT EXISTS idx_ms_payment             ON public.monthly_salaries (payment_status, year, month);
CREATE INDEX IF NOT EXISTS idx_ms_year_month          ON public.monthly_salaries (year DESC, month DESC);

COMMENT ON TABLE public.monthly_salaries IS
  'Salary history retention (LF-NFR19 / BR-14): rows updated in place, never deleted by recalculation.';

-- -----------------------------------------------------------------------------
-- 5.4 platform_settings — key/value app configuration
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL DEFAULT '',
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- -----------------------------------------------------------------------------
-- 5.5 audit_logs — immutable (no UPDATE/DELETE) ; retained indefinitely
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  table_name  TEXT,
  record_id   UUID,
  old_value   JSONB,
  new_value   JSONB,
  ip_address  TEXT,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_user      ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action    ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_table     ON public.audit_logs (table_name);
CREATE INDEX IF NOT EXISTS idx_audit_created   ON public.audit_logs (created_at DESC);

COMMENT ON TABLE public.audit_logs IS
  'Immutable audit trail (LF-FR73 / LF-NFR21). RLS denies UPDATE/DELETE for all roles.';

-- -----------------------------------------------------------------------------
-- 5.6 month_locks — per-month freeze; unlocking retained with reason
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.month_locks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month          SMALLINT NOT NULL,
  year           SMALLINT NOT NULL,
  is_locked      BOOLEAN NOT NULL DEFAULT TRUE,
  locked_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  locked_at      TIMESTAMPTZ,
  unlocked_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  unlocked_at    TIMESTAMPTZ,
  lock_reason    TEXT,
  unlock_reason  TEXT,
  CONSTRAINT ml_month_valid CHECK (month BETWEEN 1 AND 12),
  CONSTRAINT ml_year_valid  CHECK (year BETWEEN 2020 AND 2099),
  CONSTRAINT ml_unique_month UNIQUE (month, year)
);

CREATE INDEX IF NOT EXISTS idx_ml_locked ON public.month_locks (is_locked);

-- -----------------------------------------------------------------------------
-- 5.7 recalculation_log
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recalculation_log (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_salary_id      UUID REFERENCES public.monthly_salaries(id) ON DELETE SET NULL,
  labourer_id            UUID NOT NULL REFERENCES public.labourers(id) ON DELETE RESTRICT,
  month                  SMALLINT NOT NULL,
  year                   SMALLINT NOT NULL,
  triggered_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  triggered_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  old_calculated_salary  NUMERIC(12, 2),
  new_calculated_salary  NUMERIC(12, 2),
  trigger_reason         TEXT,
  CONSTRAINT rl_month_valid CHECK (month BETWEEN 1 AND 12)
);

CREATE INDEX IF NOT EXISTS idx_rl_labourer_month ON public.recalculation_log (labourer_id, year, month);
CREATE INDEX IF NOT EXISTS idx_rl_triggered      ON public.recalculation_log (triggered_at DESC);

-- -----------------------------------------------------------------------------
-- 5.8 app_users — role mapping (role stored in custom JWT claim app_role)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_users (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  role        TEXT NOT NULL DEFAULT 'manager',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT app_users_role_valid CHECK (role IN ('admin', 'manager'))
);

COMMENT ON TABLE public.app_users IS
  'Application-level user profile and role. Role mirrored into JWT claim app_role.';

-- -----------------------------------------------------------------------------
-- updated_at auto-update trigger
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_labourers_touch_updated_at ON public.labourers;
CREATE TRIGGER trg_labourers_touch_updated_at
  BEFORE UPDATE ON public.labourers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Default platform settings
-- -----------------------------------------------------------------------------
INSERT INTO public.platform_settings (key, value, description) VALUES
  ('company_name',       'LabourFlow Co.', 'Organisation name displayed in headers and PDF reports.'),
  ('currency_symbol',    '₹',              'Currency symbol prefixed to monetary values.'),
  ('default_daily_wage', '400.00',         'Pre-fill value when creating a new labourer (BR-11).'),
  ('notification_email', '',               'Admin email for month-lock notifications.'),
  ('timezone',           'Asia/Kolkata',   'Display timezone for the deployment (DB stores UTC).')
ON CONFLICT (key) DO NOTHING;
