import { supabase } from '@/lib/supabase';
import { sendBulkToStaff } from '@/lib/notificationService';

export type HotelIssueArchiveCategory = 'risk' | 'maintenance' | 'organization' | 'inspection' | 'other';

export type HotelIssueArchiveMediaRow = {
  id: string;
  record_id: string;
  media_type: 'image' | 'video';
  storage_path: string | null;
  public_url: string;
  thumbnail_url: string | null;
  sort_order: number;
  created_at?: string;
};

export type HotelIssueArchiveRow = {
  id: string;
  organization_id: string;
  record_no: string | null;
  category: HotelIssueArchiveCategory;
  note: string;
  location_label: string | null;
  room_number: string | null;
  created_by_staff_id: string;
  created_at: string;
  updated_at: string;
  creator?: { full_name: string | null } | null;
  media?: HotelIssueArchiveMediaRow[];
};

export const HOTEL_ISSUE_ARCHIVE_CATEGORIES: {
  value: HotelIssueArchiveCategory;
  label: string;
  icon: string;
  color: string;
}[] = [
  { value: 'risk', label: 'Risk / Sorun', icon: 'warning-outline', color: '#dc2626' },
  { value: 'maintenance', label: 'Bakım / Onarım', icon: 'hammer-outline', color: '#d97706' },
  { value: 'organization', label: 'Düzenleme', icon: 'grid-outline', color: '#2563eb' },
  { value: 'inspection', label: 'Kontrol / Gözlem', icon: 'eye-outline', color: '#0d9488' },
  { value: 'other', label: 'Diğer', icon: 'document-text-outline', color: '#64748b' },
];

export function hotelIssueArchiveCategoryLabel(value: string | null | undefined): string {
  return HOTEL_ISSUE_ARCHIVE_CATEGORIES.find((c) => c.value === value)?.label ?? 'Diğer';
}

export function hotelIssueArchiveCategoryIcon(value: string | null | undefined): string {
  return HOTEL_ISSUE_ARCHIVE_CATEGORIES.find((c) => c.value === value)?.icon ?? 'document-text-outline';
}

export function hotelIssueArchiveCategoryMeta(value: string | null | undefined) {
  return HOTEL_ISSUE_ARCHIVE_CATEGORIES.find((c) => c.value === value) ?? HOTEL_ISSUE_ARCHIVE_CATEGORIES[4];
}

const LIST_SELECT =
  'id, record_no, category, note, location_label, room_number, created_by_staff_id, created_at, creator:staff!hotel_issue_archive_created_by_staff_id_fkey(full_name), media:hotel_issue_archive_media(id, media_type, public_url, thumbnail_url, sort_order)';

const DETAIL_SELECT =
  'id, organization_id, record_no, category, note, location_label, room_number, created_by_staff_id, created_at, updated_at, creator:staff!hotel_issue_archive_created_by_staff_id_fkey(full_name), media:hotel_issue_archive_media(id, record_id, media_type, storage_path, public_url, thumbnail_url, sort_order, created_at)';

export async function listHotelIssueArchive(args: { category?: HotelIssueArchiveCategory; search?: string; limit?: number } = {}) {
  let q = supabase
    .from('hotel_issue_archive')
    .select(LIST_SELECT)
    .order('created_at', { ascending: false })
    .limit(args.limit ?? 200);

  if (args.category) q = q.eq('category', args.category);
  if (args.search && args.search.trim()) {
    const term = args.search.trim();
    q = q.or(
      `note.ilike.%${term}%,location_label.ilike.%${term}%,room_number.ilike.%${term}%,record_no.ilike.%${term}%`
    );
  }
  return await q;
}

export async function getHotelIssueArchive(id: string) {
  return await supabase.from('hotel_issue_archive').select(DETAIL_SELECT).eq('id', id).maybeSingle();
}

export async function createHotelIssueArchive(
  organizationId: string,
  staffId: string,
  input: {
    category: HotelIssueArchiveCategory;
    note: string;
    locationLabel?: string | null;
    roomNumber?: string | null;
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
    category: input.category,
    note: input.note.trim(),
    location_label: input.locationLabel?.trim() || null,
    room_number: input.roomNumber?.trim() || null,
  };
  const { data, error } = await supabase.from('hotel_issue_archive').insert(payload).select('id, record_no').single();
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
    const mediaRes = await supabase.from('hotel_issue_archive_media').insert(rows);
    if (mediaRes.error) return { data, error: mediaRes.error };
  }

  return { data, error: null };
}

export async function deleteHotelIssueArchive(id: string) {
  return await supabase.from('hotel_issue_archive').delete().eq('id', id);
}

type HotelIssueArchiveNotifyRecord = {
  id: string;
  record_no?: string | null;
  category: HotelIssueArchiveCategory;
  note: string;
  location_label?: string | null;
  room_number?: string | null;
  creator_name?: string | null;
};

/** Yeni kayıt oluşturulunca tüm personele push gönderir (yönetici yönlendirme ile kapatılabilir). */
export async function notifyHotelIssueArchiveCreated(args: {
  organizationId: string;
  createdByStaffId: string;
  creatorName?: string | null;
  record: HotelIssueArchiveNotifyRecord;
}) {
  const catMeta = hotelIssueArchiveCategoryMeta(args.record.category);
  const locationPart = args.record.room_number
    ? `Oda ${args.record.room_number}`
    : args.record.location_label?.trim() || 'Konum belirtilmedi';
  const creatorPart = args.creatorName?.trim() || args.record.creator_name?.trim() || 'Personel';
  const title = `${catMeta.value === 'risk' ? '⚠️' : '📋'} Otel kaydı · ${locationPart}`;
  const summary = args.record.note.trim().slice(0, 140);
  const body = `${creatorPart} · ${hotelIssueArchiveCategoryLabel(args.record.category)}\n${summary}`;
  const href = `/staff/hotel-issue-archive/${args.record.id}`;

  return await sendBulkToStaff({
    target: 'all_staff',
    organizationId: args.organizationId,
    title,
    body,
    createdByStaffId: args.createdByStaffId,
    notificationType: 'hotel_issue_archive_created',
    category: 'staff',
    data: {
      screen: href,
      url: href,
      hotelIssueArchiveId: args.record.id,
      recordNo: args.record.record_no ?? null,
    },
    excludeStaffIds: [args.createdByStaffId],
  });
}
