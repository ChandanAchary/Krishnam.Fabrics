'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import type { Labourer, LabourerAdvance } from '@/types/database';

export function useAdvanceActions(labourer: Labourer | null, onChanged: () => void) {
  const toast = useToast();

  const [modal, setModal] = useState<{ open: boolean; mode: 'create' | 'edit'; advance?: LabourerAdvance }>({
    open: false,
    mode: 'create',
  });
  const [saving, setSaving] = useState(false);
  const [deleteAdvance, setDeleteAdvance] = useState<{ open: boolean; advance?: LabourerAdvance; reason: string }>({
    open: false,
    reason: '',
  });
  const [deleting, setDeleting] = useState(false);

  const openRecord = () => setModal({ open: true, mode: 'create' });
  const openEdit = (advance: LabourerAdvance) => setModal({ open: true, mode: 'edit', advance });
  const closeModal = () => setModal({ open: false, mode: 'create' });

  const handleSubmit = async (values: { given_on: string; amount: number; note: string }) => {
    if (!labourer) return;
    setSaving(true);
    const { error } =
      modal.mode === 'edit' && modal.advance
        ? await supabase.rpc('edit_labourer_advance', {
            p_advance_id: modal.advance.id,
            p_given_on: values.given_on,
            p_amount: values.amount,
            p_note: values.note || null,
          })
        : await supabase.rpc('record_labourer_advance', {
            p_labourer_id: labourer.id,
            p_given_on: values.given_on,
            p_amount: values.amount,
            p_note: values.note || null,
          });
    setSaving(false);
    if (error) {
      toast.error(`Could not save advance: ${error.message}`);
      return;
    }
    toast.success(modal.mode === 'edit' ? 'Advance updated.' : 'Advance recorded.');
    closeModal();
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
    modal,
    openRecord,
    openEdit,
    closeModal,
    saving,
    handleSubmit,
    deleteAdvance,
    setDeleteAdvance,
    deleting,
    handleDeleteAdvance,
  };
}
