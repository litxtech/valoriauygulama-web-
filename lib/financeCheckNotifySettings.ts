import { supabase } from '@/lib/supabase';

export const FINANCE_CHECK_NOTIFY_LEAD_OPTIONS: { days: number; label: string }[] = [
  { days: 0, label: 'Vade günü' },
  { days: 1, label: '1 gün önce' },
  { days: 3, label: '3 gün önce' },
  { days: 7, label: '7 gün önce' },
  { days: 14, label: '14 gün önce' },
];

export type FinanceCheckNotifySettings = {
  enabled: boolean;
  notifyStaffIds: string[];
  notifyStartTime: string;
  notifyFirstDate: string | null;
  notifyLeadDays: number[];
  timezone: string;
  lastSentAt: string | null;
};

const DEFAULT: FinanceCheckNotifySettings = {
  enabled: false,
  notifyStaffIds: [],
  notifyStartTime: '08:00',
  notifyFirstDate: null,
  notifyLeadDays: [0, 7],
  timezone: 'Europe/Istanbul',
  lastSentAt: null,
};

function normalizeLeadDays(days: number[] | null | undefined): number[] {
  const uniq = [...new Set((days ?? [0, 7]).map((d) => Math.max(0, Math.min(60, Math.trunc(d)))))].sort(
    (a, b) => a - b,
  );
  return uniq.length ? uniq : [0, 7];
}

export async function fetchFinanceCheckNotifySettings(
  organizationId: string,
): Promise<FinanceCheckNotifySettings> {
  const { data, error } = await supabase
    .from('finance_check_notify_settings')
    .select('enabled, notify_staff_ids, notify_start_time, notify_first_date, notify_lead_days, timezone, last_sent_at')
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error || !data) return { ...DEFAULT };
  const row = data as {
    enabled?: boolean;
    notify_staff_ids?: string[] | null;
    notify_start_time?: string | null;
    notify_first_date?: string | null;
    notify_lead_days?: number[] | null;
    timezone?: string | null;
    last_sent_at?: string | null;
  };
  const timeRaw = row.notify_start_time ?? '08:00:00';
  const hhmm = timeRaw.slice(0, 5);
  const firstDate = row.notify_first_date?.trim()?.slice(0, 10) || null;
  return {
    enabled: row.enabled === true,
    notifyStaffIds: (row.notify_staff_ids ?? []).filter(Boolean),
    notifyStartTime: hhmm,
    notifyFirstDate: firstDate,
    notifyLeadDays: normalizeLeadDays(row.notify_lead_days),
    timezone: row.timezone?.trim() || 'Europe/Istanbul',
    lastSentAt: row.last_sent_at ?? null,
  };
}

export async function saveFinanceCheckNotifySettings(
  organizationId: string,
  patch: Pick<
    FinanceCheckNotifySettings,
    'enabled' | 'notifyStaffIds' | 'notifyStartTime' | 'notifyFirstDate' | 'notifyLeadDays'
  >,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const hhmm = patch.notifyStartTime.trim();
  if (!/^\d{2}:\d{2}$/.test(hhmm)) {
    return { ok: false, message: 'Saat formatı HH:MM olmalı (örn. 08:00).' };
  }
  const [h, m] = hhmm.split(':').map(Number);
  if (h > 23 || m > 59) {
    return { ok: false, message: 'Geçersiz saat.' };
  }

  let notifyFirstDate: string | null = patch.notifyFirstDate?.trim()?.slice(0, 10) || null;
  if (notifyFirstDate && !/^\d{4}-\d{2}-\d{2}$/.test(notifyFirstDate)) {
    return { ok: false, message: 'Tarih formatı YYYY-MM-DD olmalı.' };
  }

  const leadDays = normalizeLeadDays(patch.notifyLeadDays);
  if (leadDays.length === 0) {
    return { ok: false, message: 'En az bir bildirim günü seçin (ör. vade günü).' };
  }

  const unique = [...new Set(patch.notifyStaffIds.filter(Boolean))];
  const { error } = await supabase.from('finance_check_notify_settings').upsert(
    {
      organization_id: organizationId,
      enabled: patch.enabled,
      notify_staff_ids: unique,
      notify_start_time: `${hhmm}:00`,
      notify_first_date: notifyFirstDate,
      notify_lead_days: leadDays,
      timezone: 'Europe/Istanbul',
    },
    { onConflict: 'organization_id' },
  );
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
