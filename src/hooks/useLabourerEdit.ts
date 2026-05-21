'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import type { Labourer } from '@/types/database';
import type { LabourerFormValues } from '@/components/labourers/LabourerForm';

export function useLabourerEdit(labourer: Labourer | null, onChanged: () => void) {
  const { isAdmin } = useAuth();
  const toast = useToast();

  const [editOpen, setEditOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [wagePrompt, setWagePrompt] = useState<{ open: boolean; pending?: LabourerFormValues; newWage?: number }>({
    open: false,
  });
  const [joiningPrompt, setJoiningPrompt] = useState<{ open: boolean; pending?: LabourerFormValues }>({
    open: false,
  });
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  const persistProfileFields = async (values: LabourerFormValues) => {
    if (!labourer) return { ok: false, error: 'No labourer' };
    const oldValue = {
      name: labourer.name,
      phone: labourer.phone,
      designation: labourer.designation,
      joining_date: labourer.joining_date,
    };
    const { error } = await supabase
      .from('labourers')
      .update({
        name: values.name.trim(),
        phone: values.phone?.trim() || null,
        designation: values.designation,
        joining_date: values.joining_date,
      })
      .eq('id', labourer.id);
    if (error) return { ok: false, error: error.message };
    await logAudit({
      action: 'edit_labourer',
      table: 'labourers',
      recordId: labourer.id,
      oldValue,
      newValue: {
        name: values.name,
        phone: values.phone,
        designation: values.designation,
        joining_date: values.joining_date,
      },
    });

    // Advance change: persist + recalc current month net via RPC (BR-aligned).
    if (Number(values.advance ?? 0) !== Number(labourer.advance)) {
      const { error: advErr } = await supabase.rpc('change_advance', {
        p_labourer_id: labourer.id,
        p_new_advance: values.advance ?? 0,
      });
      if (advErr) return { ok: false, error: advErr.message };
    }
    return { ok: true, error: null };
  };

  const handleEditSubmit = async (values: LabourerFormValues) => {
    if (!labourer) return;
    const wageChanged = Number(values.daily_wage) !== Number(labourer.daily_wage);
    const joiningChanged = values.joining_date !== labourer.joining_date;

    if (joiningChanged) {
      if (!isAdmin) {
        toast.error("Only admins can change a labourer's joining date.");
        return;
      }
      setJoiningPrompt({ open: true, pending: values });
      return;
    }
    if (wageChanged) {
      setWagePrompt({ open: true, pending: values, newWage: values.daily_wage });
      return;
    }
    setSavingEdit(true);
    const result = await persistProfileFields(values);
    setSavingEdit(false);
    if (!result.ok) {
      toast.error(`Update failed: ${result.error}`);
      return;
    }
    toast.success('Profile updated');
    setEditOpen(false);
    onChanged();
  };

  const confirmJoiningChange = async () => {
    if (!joiningPrompt.pending) return;
    const values = joiningPrompt.pending;
    setJoiningPrompt({ open: false });
    const wageChanged = labourer && Number(values.daily_wage) !== Number(labourer.daily_wage);
    if (wageChanged) {
      setWagePrompt({ open: true, pending: values, newWage: values.daily_wage });
      return;
    }
    setSavingEdit(true);
    const result = await persistProfileFields(values);
    setSavingEdit(false);
    if (!result.ok) {
      toast.error(`Update failed: ${result.error}`);
      return;
    }
    toast.success('Profile updated. Past records preserved.');
    setEditOpen(false);
    onChanged();
  };

  const applyWageChange = async (policy: 'current_month' | 'future_only') => {
    if (!labourer || !wagePrompt.pending || wagePrompt.newWage === undefined) return;
    const values = wagePrompt.pending;
    setSavingEdit(true);
    const result = await persistProfileFields(values);
    if (!result.ok) {
      setSavingEdit(false);
      toast.error(`Update failed: ${result.error}`);
      return;
    }
    const { error: e2 } = await supabase.rpc('change_daily_wage', {
      p_labourer_id: labourer.id,
      p_new_wage: values.daily_wage,
      p_policy: policy,
    });
    setSavingEdit(false);
    if (e2) {
      toast.error(`Wage change failed: ${e2.message}`);
      return;
    }
    toast.success(
      policy === 'current_month' ? 'Wage updated. Current month recalculated.' : 'Wage updated for future months.'
    );
    setWagePrompt({ open: false });
    setEditOpen(false);
    onChanged();
  };

  const handleDeactivate = async () => {
    if (!labourer) return;
    const newActive = !labourer.is_active;
    const { error } = await supabase
      .from('labourers')
      .update({ is_active: newActive })
      .eq('id', labourer.id);
    if (error) {
      toast.error(`Failed: ${error.message}`);
      return;
    }
    await logAudit({
      action: newActive ? 'activate_labourer' : 'deactivate_labourer',
      table: 'labourers',
      recordId: labourer.id,
      oldValue: { is_active: labourer.is_active },
      newValue: { is_active: newActive },
    });
    toast.success(newActive ? `${labourer.name} reactivated` : `${labourer.name} deactivated`);
    setDeactivateOpen(false);
    onChanged();
  };

  return {
    editOpen, setEditOpen,
    savingEdit,
    wagePrompt, setWagePrompt,
    joiningPrompt, setJoiningPrompt,
    deactivateOpen, setDeactivateOpen,
    handleEditSubmit,
    confirmJoiningChange,
    applyWageChange,
    handleDeactivate,
  };
}
