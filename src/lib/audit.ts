import { supabase } from './supabase';

export type AuditAction =
  | 'add_labourer'
  | 'edit_labourer'
  | 'deactivate_labourer'
  | 'activate_labourer'
  | 'add_attendance'
  | 'edit_attendance'
  | 'overwrite_attendance'
  | 'mark_paid'
  | 'mark_unpaid'
  | 'recalculate_salary'
  | 'lock_month'
  | 'unlock_month'
  | 'change_wage'
  | 'export_report'
  | 'update_settings'
  | 'delete_attendance'
  | 'delete_salary';

export async function logAudit(opts: {
  action: AuditAction;
  table?: string | null;
  recordId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
}) {
  const { action, table = null, recordId = null, oldValue = null, newValue = null, reason = null } = opts;
  const { error } = await supabase.from('audit_logs').insert({
    action,
    table_name: table,
    record_id: recordId,
    old_value: oldValue,
    new_value: newValue,
    reason,
  });
  if (error) {
    // Audit failure should not block primary action; just log.
    // eslint-disable-next-line no-console
    console.warn('[audit] failed to write log:', error.message);
  }
}
