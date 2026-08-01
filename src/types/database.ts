// Generated TypeScript types mirroring the Supabase schema (IEEE 830 §5).
// In production, regenerate with: `supabase gen types typescript --linked > database.ts`.

export type AppRole = 'admin' | 'manager';
export type AttendanceStatus =
  | 'present'
  | 'absent'
  | 'half_day'
  | 'double_duty'
  | 'one_and_half_duty';
export type PaymentStatus = 'paid' | 'not_paid';
export type PaymentMethod = 'online' | 'bank' | 'cash';

export interface Labourer {
  id: string;
  name: string;
  phone: string | null;
  designation: string | null;
  daily_wage: number;
  advance: number;
  joining_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface LabourerAdvance {
  id: string;
  labourer_id: string;
  given_on: string;
  amount: number;
  note: string | null;
  recorded_by: string | null;
  recorded_at: string;
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  labourer_id: string;
  date: string;
  status: AttendanceStatus;
  recorded_by: string | null;
  recorded_at: string;
  edit_reason: string | null;
}

export interface MonthlySalary {
  id: string;
  labourer_id: string;
  month: number;
  year: number;
  days_present: number;
  half_days_count: number;
  double_duty_count: number;
  one_and_half_duty_count: number;
  absent_count: number;
  effective_days: number;
  daily_wage_used: number;
  calculated_salary: number;
  advance_deducted: number;
  net_salary: number;
  payment_status: PaymentStatus;
  paid_on: string | null;
  paid_amount: number | null;
  payment_method: PaymentMethod | null;
  payment_reference: string | null;
  last_recalculated_at: string | null;
  created_at: string;
}

export interface PlatformSetting {
  key: string;
  value: string;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  table_name: string | null;
  record_id: string | null;
  old_value: unknown | null;
  new_value: unknown | null;
  ip_address: string | null;
  reason: string | null;
  created_at: string;
}

export interface MonthLock {
  id: string;
  month: number;
  year: number;
  is_locked: boolean;
  locked_by: string | null;
  locked_at: string | null;
  unlocked_by: string | null;
  unlocked_at: string | null;
  lock_reason: string | null;
  unlock_reason: string | null;
}

export interface RecalculationLog {
  id: string;
  monthly_salary_id: string | null;
  labourer_id: string;
  month: number;
  year: number;
  triggered_by: string | null;
  triggered_at: string;
  old_calculated_salary: number | null;
  new_calculated_salary: number | null;
  trigger_reason: string | null;
}

export interface AppUser {
  user_id: string;
  full_name: string | null;
  role: AppRole;
  created_at: string;
}

// RPC return shapes
export interface DashboardSummary {
  active_labourers: number;
  present_today: number;
  today_recorded_count: number;
  today_attendance_taken: boolean;
  unpaid_total: number;
  due_total: number;
  unpaid_count: number;
  current_month: number;
  current_year: number;
}

export interface SaveAttendanceResult {
  date: string;
  present: number;
  absent: number;
  half_day: number;
  double_duty: number;
  one_and_half_duty: number;
  month: number;
  year: number;
}

export interface SalaryMonth {
  year: number;
  month: number;
}
