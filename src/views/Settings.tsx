'use client';

import { useEffect, useState } from 'react';
import { Building2, Coins, Mail, Save, Wallet, Clock } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ChangeEmailCard } from '@/components/settings/ChangeEmailCard';
import { ChangePasswordCard } from '@/components/settings/ChangePasswordCard';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { logAudit } from '@/lib/audit';

export function SettingsPage() {
  const { settings, saveSetting, loading } = useSettings();
  const toast = useToast();
  const [form, setForm] = useState({
    company_name: '',
    currency_symbol: '',
    default_daily_wage: '',
    notification_email: '',
    timezone: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      company_name: settings.company_name,
      currency_symbol: settings.currency_symbol,
      default_daily_wage: settings.default_daily_wage,
      notification_email: settings.notification_email,
      timezone: settings.timezone,
    });
  }, [settings]);

  const handleSave = async () => {
    if (!form.company_name.trim()) {
      toast.error('Company name is required.');
      return;
    }
    if (!form.currency_symbol.trim()) {
      toast.error('Currency symbol is required.');
      return;
    }
    const wageNum = parseFloat(form.default_daily_wage);
    if (!Number.isFinite(wageNum) || wageNum < 1) {
      toast.error('Default daily wage must be a positive number ≥ 1.');
      return;
    }
    if (form.notification_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.notification_email)) {
      toast.error('Notification email is invalid.');
      return;
    }
    setSaving(true);
    const before = { ...settings };
    try {
      await Promise.all([
        saveSetting('company_name', form.company_name.trim()),
        saveSetting('currency_symbol', form.currency_symbol.trim()),
        saveSetting('default_daily_wage', wageNum.toFixed(2)),
        saveSetting('notification_email', form.notification_email.trim()),
        saveSetting('timezone', form.timezone.trim() || 'Asia/Kolkata'),
      ]);
      await logAudit({
        action: 'update_settings',
        table: 'platform_settings',
        oldValue: before,
        newValue: form,
      });
      toast.success('Settings saved.');
    } catch (e) {
      toast.error(`Failed to save: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="Settings" description="Configure company, currency, defaults and notifications." />
      <Card className="max-w-2xl">
        <CardHeader title="Platform settings" description="Applies to all users of this deployment." />
        <div className="space-y-4">
          <Input
            label="Company name"
            required
            leftIcon={<Building2 className="h-4 w-4" />}
            value={form.company_name}
            onChange={(e) => setForm({ ...form, company_name: e.target.value })}
            placeholder="e.g. Sunrise Constructions"
            disabled={loading}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Currency symbol"
              required
              leftIcon={<Coins className="h-4 w-4" />}
              value={form.currency_symbol}
              onChange={(e) => setForm({ ...form, currency_symbol: e.target.value })}
              placeholder="₹"
              maxLength={3}
              disabled={loading}
            />
            <Input
              label="Default daily wage"
              required
              type="number"
              min="1"
              step="0.01"
              leftIcon={<Wallet className="h-4 w-4" />}
              value={form.default_daily_wage}
              onChange={(e) => setForm({ ...form, default_daily_wage: e.target.value })}
              placeholder="400.00"
              hint="Pre-fill value when creating a new labourer. Does not affect existing labourers."
              disabled={loading}
            />
          </div>
          <Input
            label="Notification email"
            type="email"
            leftIcon={<Mail className="h-4 w-4" />}
            value={form.notification_email}
            onChange={(e) => setForm({ ...form, notification_email: e.target.value })}
            placeholder="admin@your-company.com"
            hint="Used for month-lock notifications (optional)."
            disabled={loading}
          />
          <Input
            label="Display timezone"
            leftIcon={<Clock className="h-4 w-4" />}
            value={form.timezone}
            onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            placeholder="Asia/Kolkata"
            hint="Database stores UTC. UI displays in your local browser timezone."
            disabled={loading}
          />
        </div>
        <div className="flex justify-end pt-4">
          <Button variant="primary" onClick={handleSave} loading={saving} leftIcon={<Save className="h-4 w-4" />}>
            Save settings
          </Button>
        </div>
      </Card>

      <div className="mt-6">
        <h2 className="text-base font-semibold text-slate-900 mb-1">Account security</h2>
        <p className="text-sm text-slate-500 mb-4">
          Email and password changes are verified with a one-time code sent to your email (via Brevo).
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl">
          <ChangeEmailCard />
          <ChangePasswordCard />
        </div>
      </div>
    </div>
  );
}
