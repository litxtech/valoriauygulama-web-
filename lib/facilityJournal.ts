import { supabase } from '@/lib/supabase';
import type { FacilityJournalMediaLabel } from '@/lib/facilityJournalMedia';
import { invalidateFacilityJournalListCache } from '@/lib/facilityJournalCache';

export type FacilityJournalRecordStatus = 'draft' | 'published' | 'archived';

export type FacilityJournalRecordTypeRow = {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
};

export type FacilityJournalMediaRow = {
  id: string;
  record_id: string;
  media_type: 'image' | 'video';
  storage_path: string;
  public_url: string;
  thumbnail_url: string | null;
  label: FacilityJournalMediaLabel;
  sort_order: number;
};

export type FacilityJournalRecordRow = {
  id: string;
  organization_id: string;
  type_id: string;
  reference_code: string;
  title: string;
  description: string | null;
  location_detail: string | null;
  counterparty_name: string | null;
  record_date: string;
  status: FacilityJournalRecordStatus;
  created_by_staff_id: string;
  created_at: string;
  updated_at: string;
  type?: FacilityJournalRecordTypeRow | null;
  creator?: { full_name: string | null } | null;
  media?: FacilityJournalMediaRow[];
};

export type FacilityJournalAccessRow = {
  id: string;
  record_id: string;
  staff_id: string;
  can_view: boolean;
  staff?: { full_name: string | null; department?: string | null } | null;
};

export type FacilityJournalGuestAccessRow = {
  id: string;
  record_id: string;
  guest_id: string;
  can_view: boolean;
  guest?: {
    full_name: string | null;
    status?: string | null;
    rooms?: { room_number: string } | { room_number: string }[] | null;
  } | null;
};

/** Otelde anlık konaklayan / bekleyen misafirler (eşya kullanım kaydı görünürlük seçimi). */
export type PresentGuestForFacilityJournal = {
  id: string;
  full_name: string | null;
  photo_url: string | null;
  status: string | null;
  room_number: string | null;
};

/** Liste: gömülü medya yok (2. sorgu ile kapak birleştirilir — daha hızlı RLS). */
const LIST_RECORDS_SELECT = `
  id,
  reference_code,
  title,
  record_date,
  created_at,
  type:facility_journal_record_types(name, icon)
`;

const LIST_MEDIA_SELECT = 'record_id, public_url, media_type, sort_order, thumbnail_url';
const LIST_MEDIA_PER_RECORD = 4;
const LIST_PAGE_SIZE = 80;

const DETAIL_SELECT = `
  id,
  organization_id,
  type_id,
  reference_code,
  title,
  description,
  location_detail,
  counterparty_name,
  record_date,
  status,
  created_by_staff_id,
  created_at,
  updated_at,
  type:facility_journal_record_types(id, name, slug, icon),
  creator:staff!facility_journal_records_created_by_staff_id_fkey(full_name),
  media:facility_journal_media(id, media_type, storage_path, public_url, thumbnail_url, label, sort_order)
`;

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ğüşıöçĞÜŞİÖÇ]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'tip';
}

export const DEFAULT_FACILITY_JOURNAL_TYPES = [
  { name: 'Kullanım', slug: 'kullanim', icon: 'play-circle-outline' },
  { name: 'Kurulum', slug: 'kurulum', icon: 'construct-outline' },
  { name: 'Bakım', slug: 'bakim', icon: 'build-outline' },
  { name: 'Zimmet', slug: 'zimmet', icon: 'clipboard-outline' },
] as const;

export async function listFacilityJournalRecordTypes(organizationId: string, activeOnly = true) {
  let q = supabase
    .from('facility_journal_record_types')
    .select('id, organization_id, name, slug, icon, sort_order, is_active')
    .eq('organization_id', organizationId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (activeOnly) q = q.eq('is_active', true);
  return await q;
}

/** Uzak DB turu atlamak için hafif sayım (tam liste çekmez). */
export async function facilityJournalTypeCount(organizationId: string): Promise<number> {
  const { count, error } = await supabase
    .from('facility_journal_record_types')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId);
  if (error) return 0;
  return count ?? 0;
}

export async function seedDefaultFacilityJournalTypes(organizationId: string, createdByStaffId: string) {
  const existingCount = await facilityJournalTypeCount(organizationId);
  if (existingCount > 0) return { data: null, seeded: false };

  const rows = DEFAULT_FACILITY_JOURNAL_TYPES.map((t, i) => ({
    organization_id: organizationId,
    name: t.name,
    slug: t.slug,
    icon: t.icon,
    sort_order: i,
    created_by_staff_id: createdByStaffId,
  }));
  const { data, error } = await supabase.from('facility_journal_record_types').insert(rows).select('*');
  return { data, error, seeded: true };
}

export async function upsertFacilityJournalRecordType(args: {
  organizationId: string;
  staffId: string;
  id?: string;
  name: string;
  icon?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}) {
  const payload = {
    organization_id: args.organizationId,
    name: args.name.trim(),
    slug: slugify(args.name),
    icon: args.icon ?? 'document-text-outline',
    sort_order: args.sortOrder ?? 0,
    is_active: args.isActive ?? true,
    created_by_staff_id: args.staffId,
  };
  if (args.id) {
    return await supabase
      .from('facility_journal_record_types')
      .update({
        name: payload.name,
        slug: payload.slug,
        icon: payload.icon,
        sort_order: payload.sort_order,
        is_active: payload.is_active,
      })
      .eq('id', args.id)
      .select('*')
      .single();
  }
  return await supabase.from('facility_journal_record_types').insert(payload).select('*').single();
}

type ListMediaRow = {
  record_id: string;
  public_url: string;
  media_type: 'image' | 'video';
  sort_order: number;
  thumbnail_url: string | null;
};

function listMediaRowToJournalMedia(m: ListMediaRow): FacilityJournalMediaRow {
  return {
    id: `${m.record_id}-${m.sort_order}`,
    record_id: m.record_id,
    public_url: m.public_url,
    media_type: m.media_type,
    sort_order: m.sort_order,
    storage_path: '',
    thumbnail_url: m.thumbnail_url,
    label: 'general',
  };
}

function attachListCoverMedia(
  records: FacilityJournalRecordRow[],
  mediaRows: ListMediaRow[] | null
): FacilityJournalRecordRow[] {
  if (!mediaRows?.length) return records.map((r) => ({ ...r, media: [] }));

  const byRecord = new Map<string, ListMediaRow[]>();
  for (const m of mediaRows) {
    const list = byRecord.get(m.record_id) ?? [];
    list.push(m);
    byRecord.set(m.record_id, list);
  }

  return records.map((r) => {
    const sorted = (byRecord.get(r.id) ?? []).sort((a, b) => a.sort_order - b.sort_order);
    const slice = sorted.slice(0, LIST_MEDIA_PER_RECORD);
    return {
      ...r,
      media: slice.map(listMediaRowToJournalMedia),
    };
  });
}

/** Kayıtlar + kapak medyası (gömülü join yerine iki sorgu — liste ekranı hızlı açılır). */
export async function listFacilityJournalRecords() {
  const { data: records, error: recErr } = await supabase
    .from('facility_journal_records')
    .select(LIST_RECORDS_SELECT)
    .order('created_at', { ascending: false })
    .limit(LIST_PAGE_SIZE);

  if (recErr) return { data: null, error: recErr };
  const rows = (records ?? []) as FacilityJournalRecordRow[];
  if (rows.length === 0) return { data: [], error: null };

  const ids = rows.map((r) => r.id);
  const { data: media, error: mediaErr } = await supabase
    .from('facility_journal_media')
    .select(LIST_MEDIA_SELECT)
    .in('record_id', ids)
    .order('sort_order', { ascending: true });

  if (mediaErr) return { data: attachListCoverMedia(rows, null), error: mediaErr };

  return {
    data: attachListCoverMedia(rows, (media ?? []) as ListMediaRow[]),
    error: null,
  };
}

export async function getFacilityJournalRecord(id: string) {
  return await supabase.from('facility_journal_records').select(DETAIL_SELECT).eq('id', id).maybeSingle();
}

export async function createFacilityJournalRecord(
  organizationId: string,
  staffId: string,
  input: {
    typeId: string;
    title: string;
    description?: string | null;
    locationDetail?: string | null;
    counterpartyName?: string | null;
    recordDate?: string;
    status?: FacilityJournalRecordStatus;
    media: Array<{
      storagePath: string;
      publicUrl: string;
      mediaType: 'image' | 'video';
      label?: FacilityJournalMediaLabel;
      thumbnailUrl?: string | null;
      sortOrder?: number;
    }>;
    viewerStaffIds?: string[];
    viewerGuestIds?: string[];
  }
) {
  const { data: rpcRows, error: recErr } = await supabase.rpc('facility_journal_create_record', {
    p_type_id: input.typeId,
    p_title: input.title.trim(),
    p_description: input.description?.trim() || null,
    p_location_detail: input.locationDetail?.trim() || null,
    p_counterparty_name: input.counterpartyName?.trim() || null,
    p_record_date: input.recordDate ?? new Date().toISOString().slice(0, 10),
    p_status: input.status ?? 'published',
  });

  const record = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
  if (recErr || !record?.id) {
    const msg = recErr?.message ?? 'Kayıt oluşturulamadı';
    if (/function.*does not exist|schema cache/i.test(msg)) {
      return {
        data: null,
        error:
          'Veritabanı güncellemesi eksik: Supabase’de 303_facility_journal_insert_rpc_and_rls.sql migration çalıştırın.',
      };
    }
    return { data: null, error: msg };
  }

  const viewerIds = (input.viewerStaffIds ?? []).filter((id) => id && id !== staffId);
  const guestViewerIds = [...new Set((input.viewerGuestIds ?? []).filter(Boolean))];

  const afterRecordTasks: Promise<{ error: string | null }>[] = [];

  if (input.media.length > 0) {
    const mediaRows = input.media.map((m, i) => ({
      record_id: record.id,
      media_type: m.mediaType,
      storage_path: m.storagePath,
      public_url: m.publicUrl,
      thumbnail_url: m.thumbnailUrl ?? null,
      label: m.label ?? 'general',
      sort_order: m.sortOrder ?? i,
    }));
    afterRecordTasks.push(
      supabase.from('facility_journal_media').insert(mediaRows).then(({ error }) => ({ error: error?.message ?? null }))
    );
  }

  if (viewerIds.length > 0) {
    const accessRows = viewerIds.map((sid) => ({
      record_id: record.id,
      staff_id: sid,
      can_view: true,
      granted_by_staff_id: staffId,
    }));
    afterRecordTasks.push(
      supabase
        .from('facility_journal_record_access')
        .insert(accessRows)
        .then(({ error }) => ({ error: error?.message ?? null }))
    );
  }

  if (guestViewerIds.length > 0) {
    const guestRows = guestViewerIds.map((guest_id) => ({
      record_id: record.id,
      guest_id,
      can_view: true,
      granted_by_staff_id: staffId,
    }));
    afterRecordTasks.push(
      supabase
        .from('facility_journal_record_guest_access')
        .insert(guestRows)
        .then(({ error }) => ({ error: error?.message ?? null }))
    );
  }

  if (afterRecordTasks.length > 0) {
    const outcomes = await Promise.all(afterRecordTasks);
    const fail = outcomes.find((o) => o.error);
    if (fail?.error) return { data: null, error: fail.error };
  }

  invalidateFacilityJournalListCache();
  return { data: record, error: null };
}

export async function listFacilityJournalAccess(recordId: string) {
  return await supabase
    .from('facility_journal_record_access')
    .select('id, record_id, staff_id, can_view, staff:staff!facility_journal_record_access_staff_id_fkey(full_name, department)')
    .eq('record_id', recordId);
}

export async function setFacilityJournalRecordAccess(
  recordId: string,
  grantedByStaffId: string,
  staffIds: string[]
) {
  await supabase.from('facility_journal_record_access').delete().eq('record_id', recordId);
  const unique = [...new Set(staffIds.filter(Boolean))];
  if (unique.length === 0) return { error: null };
  const rows = unique.map((staff_id) => ({
    record_id: recordId,
    staff_id,
    can_view: true,
    granted_by_staff_id: grantedByStaffId,
  }));
  const { error } = await supabase.from('facility_journal_record_access').insert(rows);
  return { error: error?.message ?? null };
}

export async function listStaffForFacilityJournalAccess(organizationId: string) {
  return await supabase
    .from('staff')
    .select('id, full_name, department, role')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('full_name', { ascending: true });
}

export async function listPresentGuestsForFacilityJournal(organizationId: string) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('guests')
    .select('id, full_name, photo_url, status, banned_until, rooms(room_number)')
    .eq('organization_id', organizationId)
    .in('status', ['checked_in', 'pending'])
    .is('deleted_at', null)
    .order('full_name', { ascending: true });

  if (error) return { data: null as PresentGuestForFacilityJournal[] | null, error };

  const rows = (data ?? []) as Array<{
    id: string;
    full_name: string | null;
    photo_url: string | null;
    status: string | null;
    banned_until?: string | null;
    rooms?: { room_number: string } | { room_number: string }[] | null;
  }>;

  const present: PresentGuestForFacilityJournal[] = rows
    .filter((g) => !g.banned_until || g.banned_until < nowIso)
    .map((g) => {
      const rooms = g.rooms;
      const room_number = Array.isArray(rooms)
        ? rooms[0]?.room_number ?? null
        : rooms?.room_number ?? null;
      return {
        id: g.id,
        full_name: g.full_name,
        photo_url: g.photo_url,
        status: g.status,
        room_number,
      };
    });

  return { data: present, error: null };
}

export async function listFacilityJournalGuestAccess(recordId: string) {
  return await supabase
    .from('facility_journal_record_guest_access')
    .select('id, record_id, guest_id, can_view, guest:guests(full_name, status, rooms(room_number))')
    .eq('record_id', recordId);
}

export async function setFacilityJournalRecordGuestAccess(
  recordId: string,
  grantedByStaffId: string,
  guestIds: string[]
) {
  await supabase.from('facility_journal_record_guest_access').delete().eq('record_id', recordId);
  const unique = [...new Set(guestIds.filter(Boolean))];
  if (unique.length === 0) return { error: null };
  const rows = unique.map((guest_id) => ({
    record_id: recordId,
    guest_id,
    can_view: true,
    granted_by_staff_id: grantedByStaffId,
  }));
  const { error } = await supabase.from('facility_journal_record_guest_access').insert(rows);
  return { error: error?.message ?? null };
}

/** Personel + misafir görünürlük listelerini birlikte günceller. */
export async function setFacilityJournalRecordViewers(
  recordId: string,
  grantedByStaffId: string,
  staffIds: string[],
  guestIds: string[]
) {
  const [staffRes, guestRes] = await Promise.all([
    setFacilityJournalRecordAccess(recordId, grantedByStaffId, staffIds),
    setFacilityJournalRecordGuestAccess(recordId, grantedByStaffId, guestIds),
  ]);
  if (staffRes.error) return staffRes;
  return guestRes;
}

/** Misafir uygulaması: kendisine açılan kayıtlar (RLS). */
export async function listFacilityJournalRecordsForGuest() {
  return await listFacilityJournalRecords();
}

export async function archiveFacilityJournalRecord(id: string) {
  const res = await supabase.from('facility_journal_records').update({ status: 'archived' }).eq('id', id);
  if (!res.error) invalidateFacilityJournalListCache();
  return res;
}

/** Kayıt + medya satırları (storage dosyaları ayrı silinir). */
export async function deleteFacilityJournalRecord(id: string): Promise<{ error: string | null }> {
  const { data: mediaRows, error: mediaListErr } = await supabase
    .from('facility_journal_media')
    .select('storage_path')
    .eq('record_id', id);
  if (mediaListErr) return { error: mediaListErr.message };

  const { error } = await supabase.from('facility_journal_records').delete().eq('id', id);
  if (error) return { error: error.message };

  const paths = (mediaRows ?? [])
    .map((r) => (r as { storage_path: string }).storage_path)
    .filter((p) => typeof p === 'string' && p.length > 0);
  if (paths.length > 0) {
    await supabase.storage.from('facility-journal').remove(paths);
  }
  invalidateFacilityJournalListCache();
  return { error: null };
}
