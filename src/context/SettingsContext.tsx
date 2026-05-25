'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { setCurrencySymbol } from '@/lib/money';
import { useAuth } from './AuthContext';

interface SettingsMap {
  company_name: string;
  currency_symbol: string;
  default_daily_wage: string;
  notification_email: string;
  timezone: string;
  [k: string]: string;
}

interface SettingsApi {
  settings: SettingsMap;
  loading: boolean;
  refresh: () => Promise<void>;
  saveSetting: (key: string, value: string) => Promise<void>;
}

const DEFAULTS: SettingsMap = {
  company_name: 'Krishnam Fabrics',
  currency_symbol: '₹',
  default_daily_wage: '400.00',
  notification_email: '',
  timezone: 'Asia/Kolkata',
};

const SettingsContext = createContext<SettingsApi | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [settings, setSettings] = useState<SettingsMap>(DEFAULTS);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from('platform_settings').select('key, value');
      if (!error && data) {
        const map: SettingsMap = { ...DEFAULTS };
        for (const row of data) map[row.key] = row.value;
        setSettings(map);
        setCurrencySymbol(map.currency_symbol || '₹');
      }
    } finally {
      setLoading(false);
    }
  }, [session]);

  const saveSetting = useCallback(
    async (key: string, value: string) => {
      const { error } = await supabase
        .from('platform_settings')
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;
      setSettings((prev) => ({ ...prev, [key]: value }));
      if (key === 'currency_symbol') setCurrencySymbol(value);
    },
    []
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<SettingsApi>(
    () => ({ settings, loading, refresh, saveSetting }),
    [settings, loading, refresh, saveSetting]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsApi {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
