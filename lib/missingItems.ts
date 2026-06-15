import { supabase } from '@/lib/supabase';
import type { MissingItemArea } from '@/lib/missingItemsCatalog';

export type { MissingItemArea };

export type MissingItemPriority = 'low' | 'medium' | 'high';
export type MissingItemStatus = 'open' | 'resolved';

export type MissingItemRow = {
  id: string;
  title: string;
  description: string | null;
  priority: MissingItemPriority;
  status: MissingItemStatus;
  area: MissingItemArea;
  report_id: string | null;
  item_key: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  reminder_count: number;
  created_by_staff_id: string;
  resolved_by_staff_id: string | null;
  creator?: { full_name: string | null } | null;
  resolver?: { full_name: string | null } | null;
};

export type MissingItemReportRow = {
  id: string;
  area: MissingItemArea;
  note: string | null;
  priority: MissingItemPriority;
  status: MissingItemStatus;
  item_count: number;
  created_at: string;
  resolved_at: string | null;
  created_by_staff_id: string;
  resolved_by_staff_id: string | null;
  creator?: { full_name: string | null } | null;
  resolver?: { full_name: string | null } | null;
  items?: Pick<MissingItemRow, 'id' | 'title' | 'item_key' | 'status'>[];
};

export async function listMissingItemReports(
  area: MissingItemArea,
  status: MissingItemStatus
): Promise<{ data: MissingItemReportRow[]; error?: string }> {
  const { data, error } = await supabase
    .from('missing_item_reports')
    .select(
      `
      id,
      area,
      note,
      priority,
      status,
      item_count,
      created_at,
      resolved_at,
      created_by_staff_id,
      resolved_by_staff_id,
      creator:staff!missing_item_reports_created_by_staff_id_fkey(full_name),
      resolver:staff!missing_item_reports_resolved_by_staff_id_fkey(full_name),
      items:missing_items(id, title, item_key, status)
    `
    )
    .eq('area', area)
    .eq('status', status)
    .order(status === 'open' ? 'created_at' : 'resolved_at', { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as MissingItemReportRow[] };
}

const REPORT_DETAIL_SELECT = `
  id,
  area,
  note,
  priority,
  status,
  item_count,
  created_at,
  resolved_at,
  created_by_staff_id,
  resolved_by_staff_id,
  creator:staff!missing_item_reports_created_by_staff_id_fkey(full_name),
  resolver:staff!missing_item_reports_resolved_by_staff_id_fkey(full_name),
  items:missing_items(id, title, item_key, status)
`;

export async function getMissingItemReport(
  id: string
): Promise<{ data: MissingItemReportRow | null; error?: string }> {
  const { data, error } = await supabase
    .from('missing_item_reports')
    .select(REPORT_DETAIL_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data: (data as MissingItemReportRow | null) ?? null };
}

/** Raporu olmayan eski tekli kayıtlar (geriye dönük uyumluluk). */
export async function listLegacyMissingItems(
  area: MissingItemArea,
  status: MissingItemStatus
): Promise<{ data: MissingItemRow[]; error?: string }> {
  const { data, error } = await supabase
    .from('missing_items')
    .select(
      `
      id,
      title,
      description,
      priority,
      status,
      area,
      report_id,
      item_key,
      created_at,
      updated_at,
      resolved_at,
      reminder_count,
      created_by_staff_id,
      resolved_by_staff_id,
      creator:staff!missing_items_created_by_staff_id_fkey(full_name),
      resolver:staff!missing_items_resolved_by_staff_id_fkey(full_name)
    `
    )
    .eq('area', area)
    .eq('status', status)
    .is('report_id', null)
    .order(status === 'open' ? 'created_at' : 'resolved_at', { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as MissingItemRow[] };
}

export async function getLegacyMissingItem(
  id: string
): Promise<{ data: MissingItemRow | null; error?: string }> {
  const { data, error } = await supabase
    .from('missing_items')
    .select(
      `
      id,
      title,
      description,
      priority,
      status,
      area,
      report_id,
      item_key,
      created_at,
      updated_at,
      resolved_at,
      reminder_count,
      created_by_staff_id,
      resolved_by_staff_id,
      creator:staff!missing_items_created_by_staff_id_fkey(full_name),
      resolver:staff!missing_items_resolved_by_staff_id_fkey(full_name)
    `
    )
    .eq('id', id)
    .is('report_id', null)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data: (data as MissingItemRow | null) ?? null };
}

export type MissingHistoryEntry =
  | { kind: 'report'; area: MissingItemArea; resolvedAt: string; data: MissingItemReportRow }
  | { kind: 'legacy'; area: MissingItemArea; resolvedAt: string; data: MissingItemRow };

export async function listMissingItemsHistory(
  areaFilter: MissingItemArea | 'all' = 'all',
  limit = 120
): Promise<{ data: MissingHistoryEntry[]; error?: string }> {
  const areas: MissingItemArea[] = areaFilter === 'all' ? ['kitchen', 'hotel'] : [areaFilter];
  const entries: MissingHistoryEntry[] = [];

  for (const area of areas) {
    const [repRes, legRes] = await Promise.all([
      listMissingItemReports(area, 'resolved'),
      listLegacyMissingItems(area, 'resolved'),
    ]);
    if (repRes.error) return { data: [], error: repRes.error };
    if (legRes.error) return { data: [], error: legRes.error };

    for (const r of repRes.data) {
      const resolvedAt = r.resolved_at ?? r.created_at;
      entries.push({ kind: 'report', area, resolvedAt, data: r });
    }
    for (const l of legRes.data) {
      const resolvedAt = l.resolved_at ?? l.created_at;
      entries.push({ kind: 'legacy', area, resolvedAt, data: l });
    }
  }

  entries.sort((a, b) => new Date(b.resolvedAt).getTime() - new Date(a.resolvedAt).getTime());
  return { data: entries.slice(0, limit) };
}

export async function getMissingAreaCounts(): Promise<{
  data: Record<MissingItemArea, { open: number; resolved: number }>;
  error?: string;
}> {
  const empty = { kitchen: { open: 0, resolved: 0 }, hotel: { open: 0, resolved: 0 } };
  const { data, error } = await supabase.from('missing_item_reports').select('area, status');

  if (error) return { data: empty, error: error.message };

  const counts = { ...empty };
  for (const row of data ?? []) {
    const area = row.area as MissingItemArea;
    if (area !== 'kitchen' && area !== 'hotel') continue;
    if (row.status === 'open') counts[area].open += 1;
    else if (row.status === 'resolved') counts[area].resolved += 1;
  }

  const { data: legacy, error: legacyErr } = await supabase
    .from('missing_items')
    .select('area, status')
    .is('report_id', null);

  if (legacyErr) return { data: counts, error: legacyErr.message };

  for (const row of legacy ?? []) {
    const area = row.area as MissingItemArea;
    if (area !== 'kitchen' && area !== 'hotel') continue;
    if (row.status === 'open') counts[area].open += 1;
    else if (row.status === 'resolved') counts[area].resolved += 1;
  }

  return { data: counts };
}

export type CreateMissingReportItem = {
  key?: string;
  label: string;
};

export async function createMissingItemReport(params: {
  area: MissingItemArea;
  items: CreateMissingReportItem[];
  note?: string;
  priority?: MissingItemPriority;
}): Promise<{ reportId?: string; error?: string }> {
  const labels = params.items.map((i) => i.label.trim()).filter(Boolean);
  if (labels.length === 0) return { error: 'En az bir eksik seçin.' };

  const keys = params.items
    .filter((i) => i.label.trim())
    .map((i) => (i.key?.trim() ? i.key.trim() : ''));

  const { data, error } = await supabase.rpc('create_missing_item_report', {
    p_area: params.area,
    p_titles: labels,
    p_item_keys: keys,
    p_note: params.note?.trim() || null,
    p_priority: params.priority ?? 'medium',
  });

  if (error) {
    const msg = error.message ?? '';
    const pushGlitch = /523|502|504|timeout|edge function|send-expo-push/i.test(msg);
    return { error: pushGlitch ? 'NOTIFY_PUSH_FAILED' : msg };
  }
  return { reportId: data as string };
}

/** Bildirim push hatası; rapor genelde kaydedilmiştir. */
export function isMissingReportNotifyOnlyError(code: string | undefined): boolean {
  return code === 'NOTIFY_PUSH_FAILED';
}

export async function resolveMissingItemReport(reportId: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('missing_item_reports')
    .update({ status: 'resolved' })
    .eq('id', reportId)
    .eq('status', 'open');
  return error ? { error: error.message } : {};
}

export async function resolveMissingItemLine(itemId: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('missing_items')
    .update({ status: 'resolved' })
    .eq('id', itemId)
    .eq('status', 'open');
  return error ? { error: error.message } : {};
}

export async function resolveLegacyMissingItem(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from('missing_items').update({ status: 'resolved' }).eq('id', id).eq('status', 'open');
  return error ? { error: error.message } : {};
}
