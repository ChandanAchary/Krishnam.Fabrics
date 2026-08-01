'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import type { Labourer, LabourerAdvance } from '@/types/database';

export function useAdvanceActions(labourer: Labourer | null, onChanged: () => void) {
  const toast = useToast();

  const [recordOpen, setRecordOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [deleteAdvance, setDeleteAdvance] = useState<{ open: boolean; advance?: LabourerAdvance; reason: string }>({
    open: false,
    reason: '',
  });
  const [deleting, setDeleting] = useState(false);

  const handleRecordAdvance = async (values: { given_on: string; amount: number; note: string }) => {
    if (!labourer) return;
    setRecording(true);
    const { error } = await supabase.rpc('record_labourer_advance', {
      p_labourer_id: labourer.id,
      p_given_on: values.given_on,
      p_amount: values.amount,
      p_note: values.note || null,
    });
    setRecording(false);
    if (error) {
      toast.error(`Could not record advance: ${error.message}`);
      return;
    }
    toast.success('Advance recorded.');
    setRecordOpen(false);
    onChanged();
  };

  const handleDeleteAdvance = async () => {
    if (!deleteAdvance.advance) return;
    setDeleting(true);
    const { error } = await supabase.rpc('admin_delete_advance', {
      p_advance_id: deleteAdvance.advance.id,
      p_reason: deleteAdvance.reason || null,
    });
    setDeleting(false);
    if (error) {
      toast.error(`Delete failed: ${error.message}`);
      return;
    }
    toast.success('Advance deleted.');
    setDeleteAdvance({ open: false, reason: '' });
    onChanged();
  };

  return {
    recordOpen,
    setRecordOpen,
    recording,
    handleRecordAdvance,
    deleteAdvance,
    setDeleteAdvance,
    deleting,
    handleDeleteAdvance,
  };
}
