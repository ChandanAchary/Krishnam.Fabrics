'use client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/Input';
import { Combobox } from '@/components/ui/Combobox';
import { Button } from '@/components/ui/Button';
import { todayISO } from '@/lib/date';

export const DESIGNATIONS = [
  'Mason',
  'Helper',
  'Carpenter',
  'Electrician',
  'Plumber',
  'Painter',
  'Welder',
  'Supervisor',
  'Driver',
  'Other',
] as const;

export const labourerFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters')
    .regex(/^[A-Za-z\s.\-']+$/, 'Letters, spaces, hyphens and apostrophes only'),
  phone: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .refine(
      (v) => !v || /^[0-9]{10}$/.test(v) || /^\+[1-9][0-9]{7,14}$/.test(v),
      { message: '10-digit number or E.164 (+91…) format' }
    ),
  designation: z.string().trim().min(1, 'Designation is required'),
  daily_wage: z
    .number({ invalid_type_error: 'Wage is required' })
    .min(1, 'Minimum wage is 1')
    .max(99999.99, 'Maximum wage is 99,999.99'),
  joining_date: z
    .string()
    .min(1, 'Joining date is required')
    .refine((v) => v <= todayISO(), 'Joining date cannot be in the future'),
  is_active: z.boolean().default(true),
});

export type LabourerFormValues = z.infer<typeof labourerFormSchema>;

interface LabourerFormProps {
  defaultValues?: Partial<LabourerFormValues>;
  onSubmit: (values: LabourerFormValues) => Promise<void> | void;
  submitting?: boolean;
  submitLabel?: string;
  showActive?: boolean;
}

export function LabourerForm({
  defaultValues,
  onSubmit,
  submitting,
  submitLabel = 'Save Labourer',
  showActive = false,
}: LabourerFormProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LabourerFormValues>({
    resolver: zodResolver(labourerFormSchema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      phone: defaultValues?.phone ?? '',
      designation: defaultValues?.designation ?? '',
      daily_wage: defaultValues?.daily_wage ?? 400,
      joining_date: defaultValues?.joining_date ?? todayISO(),
      is_active: defaultValues?.is_active ?? true,
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Input
        label="Full name"
        required
        autoComplete="off"
        placeholder="e.g. Ramesh Kumar"
        error={errors.name?.message}
        {...register('name')}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Phone (optional)"
          type="tel"
          placeholder="9876543210 or +919876543210"
          error={errors.phone?.message}
          {...register('phone')}
        />
        <Controller
          control={control}
          name="designation"
          render={({ field }) => (
            <Combobox
              label="Designation"
              required
              value={field.value ?? ''}
              onChange={field.onChange}
              options={DESIGNATIONS}
              placeholder="Type or select a role…"
              hint="Type to search, pick from the list, or enter a custom role."
              allowCustom
              error={errors.designation?.message}
            />
          )}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Daily wage"
          type="number"
          required
          step="0.01"
          min="1"
          max="99999.99"
          placeholder="400.00"
          error={errors.daily_wage?.message}
          {...register('daily_wage', { valueAsNumber: true })}
        />
        <Input
          label="Joining date"
          type="date"
          required
          max={todayISO()}
          error={errors.joining_date?.message}
          {...register('joining_date')}
        />
      </div>
      {showActive && (
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            {...register('is_active')}
          />
          <span>Active (appears in daily attendance)</span>
        </label>
      )}
      <div className="flex justify-end pt-2">
        <Button type="submit" variant="primary" loading={submitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
