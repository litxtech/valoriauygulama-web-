import { supabase } from '@/lib/supabase';
import { sendBulkToStaff } from '@/lib/notificationService';

export type FaultRecordStatus = 'resolved' | 'pending' | 'unresolved';

export type FaultRecordCategory =
  | 'electrical'
  | 'plumbing'
  | 'furniture'
  | 'electronics'
  | 'hvac'
  | 'appliance'
  | 'other';

export type FaultRecordMediaRow = {
  id: string;
  record_id: string;
  media_type: 'image' | 'video';
  storage_path: string | null;
  public_url: string;
  thumbnail_url: string | null;
  sort_order: number;
  created_at?: string;
};

export type FaultRecordRow = {
  id: string;
  organization_id: string;
  record_no: string | null;
  room_number: string | null;
  location_label: string | null;
  category: FaultRecordCategory;
  fault_description: string;
  work_done: string | null;
  materials_used: string | null;
  result_note: string | null;
  resolved_by_name: string | null;
  status: FaultRecordStatus;
  occurred_at: string | null;
  resolved_at: string | null;
  created_by_staff_id: string;
  created_at: string;
  updated_at: string;
  creator?: { full_name: string | null } | null;
  media?: FaultRecordMediaRow[];
};

export const FAULT_RECORD_CATEGORIES: { value: FaultRecordCategory; label: string; icon: string }[] = [
  { value: 'electrical', label: 'Elektrik', icon: 'flash-outline' },
  { value: 'plumbing', label: 'Su / Tesisat', icon: 'water-outline' },
  { value: 'hvac', label: 'Klima / Isıtma', icon: 'thermometer-outline' },
  { value: 'furniture', label: 'Mobilya', icon: 'bed-outline' },
  { value: 'electronics', label: 'Elektronik', icon: 'tv-outline' },
  { value: 'appliance', label: 'Beyaz Eşya', icon: 'cube-outline' },
  { value: 'other', label: 'Diğer', icon: 'construct-outline' },
];

export const FAULT_RECORD_STATUSES: { value: FaultRecordStatus; label: string; color: string }[] = [
  { value: 'resolved', label: 'Giderildi', color: '#16a34a' },
  { value: 'pending', label: 'Beklemede', color: '#d97706' },
  { value: 'unresolved', label: 'Giderilemedi', color: '#dc2626' },
];

export function faultCategoryLabel(value: string | null | undefined): string {
  return FAULT_RECORD_CATEGORIES.find((c) => c.value === value)?.label ?? 'Diğer';
}

export function faultCategoryIcon(value: string | null | undefined): string {
  return FAULT_RECORD_CATEGORIES.find((c) => c.value === value)?.icon ?? 'construct-outline';
}

export function faultStatusMeta(value: string | null | undefined) {
  return FAULT_RECORD_STATUSES.find((s) => s.value === value) ?? FAULT_RECORD_STATUSES[0];
}

const LIST_SELECT =
  'id, record_no, room_number, location_label, category, fault_description, status, created_at, occurred_at, resolved_at, resolved_by_name, created_by_staff_id';

const DETAIL_SELECT =
  'id, organization_id, record_no, room_number, location_label, category, fault_description, work_done, materials_used, result_note, resolved_by_name, status, occurred_at, resolved_at, created_by_staff_id, created_at, updated_at, creator:staff!fault_records_created_by_staff_id_fkey(full_name), media:fault_record_media(id, record_id, media_type, storage_path, public_url, thumbnail_url, sort_order, created_at)';

export async function listFaultRecords(args: { status?: FaultRecordStatus; search?: string; limit?: number } = {}) {
  let q = supabase
    .from('fault_records')
    .select(LIST_SELECT)
    .order('created_at', { ascending: false })
    .limit(args.limit ?? 200);

  if (args.status) q = q.eq('status', args.status);
  if (args.search && args.search.trim()) {
    const term = args.search.trim();
    q = q.or(
      `fault_description.ilike.%${term}%,room_number.ilike.%${term}%,record_no.ilike.%${term}%,materials_used.ilike.%${term}%`
    );
  }
  return await q;
}

export async function getFaultRecord(id: string) {
  return await supabase.from('fault_records').select(DETAIL_SELECT).eq('id', id).maybeSingle();
}

export async function createFaultRecord(
  organizationId: string,
  staffId: string,
  input: {
    roomNumber?: string | null;
    locationLabel?: string | null;
    category: FaultRecordCategory;
    faultDescription: string;
    workDone?: string | null;
    materialsUsed?: string | null;
    resultNote?: string | null;
    resolvedByName?: string | null;
    status: FaultRecordStatus;
    occurredAt?: string | null;
    media?: Array<{
      publicUrl: string;
      storagePath?: string | null;
      mediaType: 'image' | 'video';
      thumbnailUrl?: string | null;
      sortOrder?: number;
    }>;
  }
) {
  const payload = {
    organization_id: organizationId,
    created_by_staff_id: staffId,
    room_number: input.roomNumber?.trim() || null,
    location_label: input.locationLabel?.trim() || null,
    category: input.category,
    fault_description: input.faultDescription.trim(),
    work_done: input.workDone?.trim() || null,
    materials_used: input.materialsUsed?.trim() || null,
    result_note: input.resultNote?.trim() || null,
    resolved_by_name: input.resolvedByName?.trim() || null,
    status: input.status,
    occurred_at: input.occurredAt || null,
    resolved_at: input.status === 'resolved' ? new Date().toISOString() : null,
  };
  const { data, error } = await supabase.from('fault_records').insert(payload).select('id, record_no').single();
  if (error || !data) return { data, error };

  const media = input.media ?? [];
  if (media.length > 0) {
    const rows = media.map((m, i) => ({
      organization_id: organizationId,
      record_id: data.id,
      media_type: m.mediaType,
      storage_path: m.storagePath ?? null,
      public_url: m.publicUrl,
      thumbnail_url: m.thumbnailUrl ?? null,
      sort_order: m.sortOrder ?? i,
      created_by_staff_id: staffId,
    }));
    const mediaRes = await supabase.from('fault_record_media').insert(rows);
    if (mediaRes.error) return { data, error: mediaRes.error };
  }

  return { data, error: null };
}

export async function updateFaultRecord(
  id: string,
  patch: Partial<{
    room_number: string | null;
    location_label: string | null;
    category: FaultRecordCategory;
    fault_description: string;
    work_done: string | null;
    materials_used: string | null;
    result_note: string | null;
    resolved_by_name: string | null;
    status: FaultRecordStatus;
    occurred_at: string | null;
    resolved_at: string | null;
  }>
) {
  return await supabase.from('fault_records').update(patch).eq('id', id).select('id').single();
}

export async function setFaultRecordStatus(id: string, status: FaultRecordStatus) {
  return await updateFaultRecord(id, {
    status,
    resolved_at: status === 'resolved' ? new Date().toISOString() : null,
  });
}

export async function deleteFaultRecord(id: string) {
  return await supabase.from('fault_records').delete().eq('id', id);
}

/** Arıza kaydı oluşturulunca organizasyondaki tüm personele (oluşturan hariç) in-app + push bildirim gönderir. */
export async function notifyFaultRecordCreated(args: {
  organizationId: string;
  createdByStaffId: string;
  record: {
    id: string;
    record_no?: string | null;
    room_number?: string | null;
    location_label?: string | null;
    category: FaultRecordCategory;
    fault_description: string;
    status: FaultRecordStatus;
    resolved_by_name?: string | null;
  };
}) {
  const roomPart = args.record.room_number
    ? `Oda ${args.record.room_number}`
    : args.record.location_label || 'Konum belirtilmedi';
  const statusLabel = faultStatusMeta(args.record.status).label;
  const title = `🔧 Arıza kaydı · ${roomPart}`;
  const summary = args.record.fault_description.trim().slice(0, 140);
  const solverPart = args.record.resolved_by_name?.trim() ? ` · Gideren: ${args.record.resolved_by_name.trim()}` : '';
  const body = `${faultCategoryLabel(args.record.category)} · ${statusLabel}${solverPart}\n${summary}`;
  const href = `/staff/fault-records/${args.record.id}`;

  return await sendBulkToStaff({
    target: 'all_staff',
    organizationId: args.organizationId,
    title,
    body,
    createdByStaffId: args.createdByStaffId,
    notificationType: 'fault_record_created',
    category: 'staff',
    data: {
      screen: href,
      url: href,
      faultRecordId: args.record.id,
      recordNo: args.record.record_no ?? null,
    },
    excludeStaffIds: [args.createdByStaffId],
  });
}
