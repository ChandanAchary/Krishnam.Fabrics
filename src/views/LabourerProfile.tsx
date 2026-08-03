'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Edit3, Power, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Drawer } from '@/components/ui/Drawer';
import { DeleteWithReasonModal } from '@/components/ui/DeleteWithReasonModal';
import { LabourerForm } from '@/components/labourers/LabourerForm';
import { ProfileCard } from '@/components/labourers/ProfileCard';
import { SalaryHistoryTable } from '@/components/labourers/SalaryHistoryTable';
import { WageChangeModal } from '@/components/labourers/WageChangeModal';
import { AdvanceHistoryTable } from '@/components/labourers/AdvanceHistoryTable';
import { RecordAdvanceModal } from '@/components/labourers/RecordAdvanceModal';
import { AttendanceCalendar } from '@/components/attendance/AttendanceCalendar';
import { AttendanceHistoryTable } from '@/components/attendance/AttendanceHistoryTable';
import { EditAttendanceModal } from '@/components/attendance/EditAttendanceModal';
import { useLabourerEdit } from '@/hooks/useLabourerEdit';
import { useAttendanceActions } from '@/hooks/useAttendanceActions';
import { useAdvanceActions } from '@/hooks/useAdvanceActions';
import { supabase } from '@/lib/supabase';
import { fmtMonthYear } from '@/lib/date';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import type { AttendanceRecord, AttendanceStatus, Labourer, LabourerAdvance, MonthlySalary } from '@/types/database';

export function LabourerProfilePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { isAdmin } = useAuth();
  const toast = useToast();

  const [labourer, setLabourer] = useState<Labourer | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [salaries, setSalaries] = useState<MonthlySalary[]>([]);
  const [advances, setAdvances] = useState<LabourerAdvance[]>([]);
  const [loading, setLoading] = useState(true);

  // History filter state
  const [historyFromDate, setHistoryFromDate] = useState('');
  const [historyToDate, setHistoryToDate] = useState('');
  const [historyStatus, setHistoryStatus] = useState<AttendanceStatus | 'all'>('all');

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [lab, att, sal, adv] = await Promise.all([
      supabase.from('labourers').select('*').eq('id', id).single(),
      supabase.from('attendance').select('*').eq('labourer_id', id).order('date', { ascending: false }),
      supabase
        .from('monthly_salaries')
        .select('*')
        .eq('labourer_id', id)
        .order('year', { ascending: false })
        .order('month', { ascending: false }),
      supabase.from('labourer_advances').select('*').eq('labourer_id', id).order('given_on', { ascending: false }),
    ]);
    if (lab.error) toast.error(`Could not load: ${lab.error.message}`);
    if (adv.error) toast.error(`Could not load advance history: ${adv.error.message}`);
    setLabourer((lab.data as Labourer) ?? null);
    setAttendance((att.data as AttendanceRecord[]) ?? []);
    setSalaries((sal.data as MonthlySalary[]) ?? []);
    setAdvances((adv.data as LabourerAdvance[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const edit = useLabourerEdit(labourer, load, () => router.push('/labourers'));
  const att = useAttendanceActions(labourer, load);
  const adv = useAdvanceActions(labourer, load);

  const now = new Date();
  const [profileMonth, setProfileMonth] = useState<{ year: number; month: number }>({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });
  const selectedMonthSalary = useMemo(
    () => salaries.find((s) => s.year === profileMonth.year && s.month === profileMonth.month) ?? null,
    [salaries, profileMonth]
  );

  if (loading) {
    return (
      <div>
        <div className="mb-6 space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="card space-y-4 p-5">
            <Skeleton className="h-4 w-24" />
            <SkeletonText lines={5} />
          </div>
          <div className="card space-y-4 p-5 lg:col-span-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-48 w-full rounded-lg" />
          </div>
        </div>
        <div className="card p-5">
          <Skeleton className="mb-4 h-4 w-40" />
          <SkeletonText lines={4} />
        </div>
      </div>
    );
  }
  if (!labourer) {
    return (
      <div>
        <PageHeader title="Labourer not found" />
        <EmptyState
          title="This labourer could not be found"
          description="It may have been removed or you don't have access."
          action={
            <Button onClick={() => router.push('/labourers')} variant="secondary">
              <ArrowLeft className="h-4 w-4" /> Back to list
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={labourer.name}
        description={`Member since ${labourer.joining_date}`}
        breadcrumbs={
          <Link href="/labourers" className="inline-flex items-center gap-1 hover:text-brand-600">
            <ArrowLeft className="h-3 w-3" /> Labourers
          </Link>
        }
        action={
          <>
            <Button variant="secondary" onClick={() => edit.setEditOpen(true)} leftIcon={<Edit3 className="h-4 w-4" />}>
              Edit
            </Button>
            <Button
              variant={labourer.is_active ? 'secondary' : 'success'}
              onClick={() => edit.setDeactivateOpen(true)}
              leftIcon={<Power className="h-4 w-4" />}
            >
              {labourer.is_active ? 'Deactivate' : 'Reactivate'}
            </Button>
            {isAdmin && (
              <Button
                variant="danger"
                onClick={() => edit.setPermanentOpen(true)}
                leftIcon={<Trash2 className="h-4 w-4" />}
              >
                Delete permanently
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <ProfileCard labourer={labourer} currentMonthSalary={selectedMonthSalary} monthLabel={fmtMonthYear(profileMonth.month, profileMonth.year)} />
        <Card className="lg:col-span-2">
          <CardHeader
            title="Attendance calendar"
            description={isAdmin ? 'Click any day to edit. Reason required.' : 'View attendance by month.'}
          />
          <AttendanceCalendar
            records={attendance}
            joiningDate={labourer.joining_date}
            isAdmin={isAdmin}
            onEdit={att.openEditAttendance}
            onMonthChange={(year, month) => setProfileMonth({ year, month })}
          />
        </Card>
      </div>

      <AttendanceHistoryTable
        records={attendance}
        isAdmin={isAdmin}
        fromDate={historyFromDate}
        toDate={historyToDate}
        status={historyStatus}
        onFromDateChange={setHistoryFromDate}
        onToDateChange={setHistoryToDate}
        onStatusChange={setHistoryStatus}
        onEdit={(r) => att.openEditAttendance(r.date, r)}
        onDelete={(r) => att.setDeleteAttendance({ open: true, record: r, reason: '' })}
      />

      <SalaryHistoryTable salaries={salaries} />

      <div className="mt-6">
        <AdvanceHistoryTable
          advances={advances}
          isAdmin={isAdmin}
          onRecordAdvance={adv.openRecord}
          onEdit={adv.openEdit}
          onDelete={(a) => adv.setDeleteAdvance({ open: true, advance: a, reason: '' })}
        />
      </div>

      <Drawer
        open={edit.editOpen}
        onClose={() => edit.setEditOpen(false)}
        title="Edit labourer"
        description="Update name, phone, daily wage or joining date."
      >
        <LabourerForm
          defaultValues={{
            name: labourer.name,
            phone: labourer.phone ?? '',
            designation: labourer.designation ?? '',
            daily_wage: Number(labourer.daily_wage),
            joining_date: labourer.joining_date,
            is_active: labourer.is_active,
          }}
          onSubmit={edit.handleEditSubmit}
          submitting={edit.savingEdit}
          submitLabel="Save changes"
        />
      </Drawer>

      <ConfirmDialog
        open={edit.joiningPrompt.open}
        title="Change joining date?"
        description="Changing the joining date may affect past attendance records and which days a labourer appears on. Past records are preserved but their interpretation may shift. Proceed?"
        confirmLabel="Yes, change joining date"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={edit.confirmJoiningChange}
        onCancel={() => edit.setJoiningPrompt({ open: false })}
      />

      <WageChangeModal
        open={edit.wagePrompt.open}
        newWage={edit.wagePrompt.newWage}
        busy={edit.savingEdit}
        onCancel={() => edit.setWagePrompt({ open: false })}
        onApply={edit.applyWageChange}
      />

      <ConfirmDialog
        open={edit.deactivateOpen}
        title={labourer.is_active ? `Deactivate ${labourer.name}?` : `Reactivate ${labourer.name}?`}
        description={
          labourer.is_active
            ? `${labourer.name} will no longer appear in future attendance sheets. Their past records will be preserved.`
            : `${labourer.name} will appear in the daily attendance list again.`
        }
        confirmLabel={labourer.is_active ? 'Deactivate' : 'Reactivate'}
        variant={labourer.is_active ? 'danger' : 'primary'}
        onConfirm={edit.handleDeactivate}
        onCancel={() => edit.setDeactivateOpen(false)}
      />

      <ConfirmDialog
        open={edit.permanentOpen}
        title={`Permanently delete ${labourer.name}?`}
        description={`This permanently removes ${labourer.name} along with ALL of their attendance and salary history. This cannot be undone — to simply hide the labourer, use Deactivate instead. A record of this deletion is kept in the audit log.`}
        confirmLabel="Delete permanently"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={edit.handlePermanentDelete}
        onCancel={() => edit.setPermanentOpen(false)}
      />

      <EditAttendanceModal
        open={att.editAttendance.open}
        date={att.editAttendance.date}
        current={att.editAttendance.current}
        onClose={() => att.setEditAttendance({ open: false })}
        onSave={att.submitEditAttendance}
        busy={att.savingAttendance}
      />

      <DeleteWithReasonModal
        open={att.deleteAttendance.open}
        title="Delete attendance record?"
        reason={att.deleteAttendance.reason}
        busy={att.deletingAttendance}
        onReasonChange={(v) => att.setDeleteAttendance({ ...att.deleteAttendance, reason: v })}
        onCancel={() => att.setDeleteAttendance({ open: false, reason: '' })}
        onConfirm={att.handleDeleteAttendance}
      />

      <RecordAdvanceModal
        open={adv.modal.open}
        mode={adv.modal.mode}
        initialValues={
          adv.modal.advance
            ? { given_on: adv.modal.advance.given_on, amount: Number(adv.modal.advance.amount), note: adv.modal.advance.note ?? '' }
            : undefined
        }
        busy={adv.saving}
        onCancel={adv.closeModal}
        onSubmit={adv.handleSubmit}
      />

      <DeleteWithReasonModal
        open={adv.deleteAdvance.open}
        title="Delete advance record?"
        description="This permanently removes the advance entry and recalculates that month's salary. The old value is captured in the audit log."
        reason={adv.deleteAdvance.reason}
        minLength={0}
        busy={adv.deleting}
        onReasonChange={(v) => adv.setDeleteAdvance({ ...adv.deleteAdvance, reason: v })}
        onCancel={() => adv.setDeleteAdvance({ open: false, reason: '' })}
        onConfirm={adv.handleDeleteAdvance}
      />
    </div>
  );
}
