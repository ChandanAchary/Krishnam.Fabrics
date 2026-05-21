'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import type { AttendanceRecord, AttendanceStatus, Labourer } from '@/types/database';

export function useAttendanceActions(labourer: Labourer | null, onChanged: () => void) {
  const toast = useToast();

  const [editAttendance, setEditAttendance] = useState<{ open: boolean; date?: string; current?: AttendanceRecord }>(
    { open: false }
  );
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [deleteAttendance, setDeleteAttendance] = useState<{ open: boolean; record?: AttendanceRecord; reason: string }>(
    { open: false, reason: '' }
  );
  const [deletingAttendance, setDeletingAttendance] = useState(false);

  const openEditAttendance = (date: string, current?: AttendanceRecord) => {
    setEditAttendance({ open: true, date, current });
  };

  const submitEditAttendance = async (newStatus: AttendanceStatus, reason: string) => {
    if (!editAttendance.open || !editAttendance.date || !labourer) return;
    setSavingAttendance(true);
    try {
      if (editAttendance.current) {
        const { error } = await supabase.rpc('edit_attendance', {
          p_attendance_id: editAttendance.current.id,
          p_new_status: newStatus,
          p_reason: reason || null,
        });
        if (error) {
          toast.error(`Edit failed: ${error.message}`);
          return;
        }
        toast.success('Attendance updated. Salary recalculated.');
      } else {
        const { error } = await supabase.rpc('save_daily_attendance', {
          p_date: editAttendance.date,
          p_entries: [{ labourer_id: labourer.id, status: newStatus, edit_reason: reason || null }],
          p_overwrite: false,
        });
        if (error) {
          toast.error(`Save failed: ${error.message}`);
          return;
        }
        toast.success('Attendance recorded.');
      }
      setEditAttendance({ open: false });
      onChanged();
    } finally {
      setSavingAttendance(false);
    }
  };

  const handleDeleteAttendance = async () => {
    if (!deleteAttendance.record) return;
    if (deleteAttendance.reason.trim().length < 50) {
      toast.error('Reason must be at least 50 characters.');
      return;
    }
    setDeletingAttendance(true);
    const { error } = await supabase.rpc('admin_delete_attendance', {
      p_attendance_id: deleteAttendance.record.id,
      p_reason: deleteAttendance.reason,
    });
    setDeletingAttendance(false);
    if (error) {
      toast.error(`Delete failed: ${error.message}`);
      return;
    }
    toast.success('Attendance deleted. Salary recalculated.');
    setDeleteAttendance({ open: false, reason: '' });
    onChanged();
  };

  return {
    editAttendance, setEditAttendance,
    savingAttendance,
    deleteAttendance, setDeleteAttendance,
    deletingAttendance,
    openEditAttendance,
    submitEditAttendance,
    handleDeleteAttendance,
  };
}
