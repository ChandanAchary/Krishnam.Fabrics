'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { LabourerForm, type LabourerFormValues } from '@/components/labourers/LabourerForm';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { useSettings } from '@/context/SettingsContext';

export function LabourerNewPage() {
  const toast = useToast();
  const router = useRouter();
  const { settings } = useSettings();
  const [submitting, setSubmitting] = useState(false);
  const [defaultWage, setDefaultWage] = useState<number>(400);

  useEffect(() => {
    const w = parseFloat(settings.default_daily_wage);
    if (Number.isFinite(w)) setDefaultWage(w);
  }, [settings.default_daily_wage]);

  const handleSubmit = async (values: LabourerFormValues) => {
    setSubmitting(true);
    const { data, error } = await supabase
      .from('labourers')
      .insert({
        name: values.name.trim(),
        phone: values.phone?.trim() || null,
        designation: values.designation,
        daily_wage: values.daily_wage,
        advance: values.advance ?? 0,
        joining_date: values.joining_date,
        is_active: true,
      })
      .select('id')
      .single();
    setSubmitting(false);

    if (error) {
      toast.error(`Could not save labourer: ${error.message}`);
      return;
    }
    toast.success(`${values.name} added.`);
    router.push(`/labourers/${data.id}`);
  };

  return (
    <div>
      <PageHeader
        title="Add labourer"
        description="Create a new labourer profile. An initial salary record for the current month is created automatically."
        breadcrumbs={
          <Link href="/labourers" className="inline-flex items-center gap-1 hover:text-brand-600">
            <ArrowLeft className="h-3 w-3" /> Labourers
          </Link>
        }
      />
      <Card className="max-w-2xl">
        <LabourerForm
          defaultValues={{ daily_wage: defaultWage }}
          onSubmit={handleSubmit}
          submitting={submitting}
          submitLabel="Save Labourer"
        />
      </Card>
    </div>
  );
}
