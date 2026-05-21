-- =============================================================================
-- LabourFlow — Optional seed data (development only)
-- =============================================================================
-- Run AFTER you have created your first auth user via Supabase Dashboard.
-- This seeds three sample labourers; attendance & salaries flow from there.
-- =============================================================================

INSERT INTO public.labourers (name, phone, designation, daily_wage, advance, joining_date, is_active) VALUES
  ('Ramesh Kumar', '9876543210', 'Mason',       450.00, 5000.00, CURRENT_DATE - INTERVAL '60 days', TRUE),
  ('Suresh Babu',  NULL,         'Helper',      380.00,    0.00, CURRENT_DATE - INTERVAL '30 days', TRUE),
  ('Priya Devi',   '8765432109', 'Painter',     420.00, 2000.00, CURRENT_DATE - INTERVAL '90 days', TRUE)
ON CONFLICT DO NOTHING;
