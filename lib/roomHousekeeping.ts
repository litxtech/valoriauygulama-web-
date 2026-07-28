import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export type HousekeepingStatus = 'dirty' | 'cleaning' | 'clean';

export type RoomHousekeepingJobRow = {
  id: string;
  organization_id: string;
  room_id: string | null;
  location_label: string | null;
  target_date: string;
  status: HousekeepingStatus;
  note: string | null;
  photo_urls: string[] | null;
  cover_image_url: string | null;
  is_priority: boolean;
  scheduled_by_staff_id: string | null;
  started_at: string | null;
  started_by_staff_id: string | null;
  completed_at: string | null;
  completed_by_staff_id: string | null;
  updated_at: string;
  created_at: string;
};

export type RoomMeta = {
  id: string;
  room_number: string;
  floor: number | null;
  room_occupancy_status: string;
  organization_id: string;
  cover_image_url: string | null;
  /** true: yalnızca KBS/ops listesinde; public.rooms satırı yok → location_label ile planlanır */
  labelOnly?: boolean;
};

const OPS_LABEL_PREFIX = 'ops-label:';

export function isPublicRoomId(id: string | null | undefined): boolean {
  if (!id || id.startsWith(OPS_LABEL_PREFIX)) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export function opsLabelRoomId(roomNumber: string): string {
  return `${OPS_LABEL_PREFIX}${roomNumber.trim()}`;
}

function parseFloorLoose(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const n = parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

export type RoomHousekeepingJobView = RoomHousekeepingJobRow & {
  room_number: string;
  floor: number | null;
  room_occupancy_status: string;
  cover_image_url: string | null;
  started_by_name: string | null;
  completed_by_name: string | null;
  scheduled_by_name: string | null;
  photo_urls: string[];
};

/** RN Image/ExpoImage blob: URI'lerinde "Unable to resolve data for blob" verir. */
export function isSafeHkImageUrl(url: string | null | undefined): boolean {
  const u = (url ?? '').trim();
  if (!u) return false;
  if (u.startsWith('blob:') || u.startsWith('ph://') || u.startsWith('content://')) return false;
  return u.startsWith('http://') || u.startsWith('https://') || u.startsWith('file://');
}

export function sanitizeHkPhotoUrls(urls: unknown): string[] {
  if (!Array.isArray(urls)) return [];
  return urls.filter((u): u is string => typeof u === 'string' && isSafeHkImageUrl(u));
}

const STATUS_ORDER: Record<HousekeepingStatus, number> = {
  dirty: 0,
  cleaning: 1,
  clean: 2,
};

export function todayIsoInIstanbul(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function formatHkDateTime(iso: string | null | undefined, locale = 'tr'): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function friendlyHkError(error: { message?: string; code?: string } | null | undefined): Error {
  const msg = (error?.message || '').toLowerCase();
  if (
    msg.includes('room_housekeeping_jobs') &&
    (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('could not find'))
  ) {
    return new Error(
      'Temizlik tablosu henüz kurulmamış. Supabase migration 551/552 uygulanmalı.'
    );
  }
  return new Error(error?.message || 'Temizlik işlemi başarısız');
}

function sortJobs(rows: RoomHousekeepingJobView[]): RoomHousekeepingJobView[] {
  return [...rows].sort((a, b) => {
    // Öncelik önce (temiz olmayanlar)
    const ap = a.is_priority && a.status !== 'clean' ? 0 : 1;
    const bp = b.is_priority && b.status !== 'clean' ? 0 : 1;
    if (ap !== bp) return ap - bp;
    const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (so !== 0) return so;
    const fa = a.floor ?? 9999;
    const fb = b.floor ?? 9999;
    if (fa !== fb) return fa - fb;
    return a.room_number.localeCompare(b.room_number, undefined, { numeric: true });
  });
}

async function attachStaffNames(rows: RoomHousekeepingJobView[]): Promise<RoomHousekeepingJobView[]> {
  const ids = [
    ...new Set(
      rows.flatMap((r) =>
        [r.started_by_staff_id, r.completed_by_staff_id, r.scheduled_by_staff_id].filter(
          Boolean
        ) as string[]
      )
    ),
  ];
  if (ids.length === 0) return rows;
  const { data } = await supabase.from('staff').select('id, full_name').in('id', ids);
  const nameById: Record<string, string> = {};
  for (const s of data ?? []) {
    if (s.id) nameById[s.id] = s.full_name?.trim() || '—';
  }
  return rows.map((r) => ({
    ...r,
    started_by_name: r.started_by_staff_id ? nameById[r.started_by_staff_id] ?? null : null,
    completed_by_name: r.completed_by_staff_id ? nameById[r.completed_by_staff_id] ?? null : null,
    scheduled_by_name: r.scheduled_by_staff_id ? nameById[r.scheduled_by_staff_id] ?? null : null,
  }));
}

function normalizeJob(row: RoomHousekeepingJobRow, room: RoomMeta | null): RoomHousekeepingJobView {
  const label =
    room?.room_number?.trim() ||
    row.location_label?.trim() ||
    '—';
  const jobCover = isSafeHkImageUrl(row.cover_image_url) ? row.cover_image_url : null;
  const roomCover = isSafeHkImageUrl(room?.cover_image_url) ? room!.cover_image_url : null;
  return {
    ...row,
    room_id: row.room_id,
    location_label: row.location_label,
    is_priority: Boolean(row.is_priority),
    photo_urls: sanitizeHkPhotoUrls(row.photo_urls),
    room_number: label,
    floor: room?.floor ?? null,
    room_occupancy_status: room?.room_occupancy_status ?? 'available',
    cover_image_url: jobCover || roomCover,
    started_by_name: null,
    completed_by_name: null,
    scheduled_by_name: null,
  };
}

/** public.rooms — iş satırlarında room_id eşlemesi / kapak için. */
async function fetchPublicRoomsMeta(organizationId: string): Promise<RoomMeta[]> {
  const { data, error } = await supabase
    .from('rooms')
    .select('id, room_number, floor, status, organization_id')
    .eq('organization_id', organizationId)
    .order('floor', { ascending: true, nullsFirst: false })
    .order('room_number');
  if (error) throw friendlyHkError(error);

  const publicRows = data ?? [];
  const ids = publicRows.map((r) => r.id);
  const coverByRoom = new Map<string, string | null>();
  if (ids.length > 0) {
    const { data: covers } = await supabase
      .from('room_housekeeping_status')
      .select('room_id, cover_image_url')
      .eq('organization_id', organizationId)
      .in('room_id', ids);
    for (const c of covers ?? []) {
      coverByRoom.set(
        c.room_id,
        isSafeHkImageUrl(c.cover_image_url) ? (c.cover_image_url as string) : null
      );
    }
  }

  return publicRows.map((r) => ({
    id: r.id,
    room_number: String(r.room_number ?? '').trim(),
    floor: r.floor,
    room_occupancy_status: r.status,
    organization_id: r.organization_id ?? organizationId,
    cover_image_url: coverByRoom.get(r.id) ?? null,
    labelOnly: false,
  }));
}

/**
 * Temizlik Planla listesi = yalnızca bu otelin KBS odaları (gateway / ops.rooms).
 * Valoria (slug) için sabit envanter birebir kullanılır.
 * Admin → Odalar (public.rooms) karışmaz.
 */
export async function fetchOrgRooms(organizationId: string): Promise<RoomMeta[]> {
  const { fetchKbsOpsRooms } = await import('@/lib/kbsStaffOpsEdge');
  const {
    VALORIA_FIXED_ROOM_NUMBERS,
    floorForValoriaRoom,
    isValoriaOrgSlug,
  } = await import('@/lib/valoriaFixedRooms');

  let orgSlug: string | null = null;
  try {
    const { data: org } = await supabase
      .from('organizations')
      .select('slug')
      .eq('id', organizationId)
      .maybeSingle();
    orgSlug = (org?.slug as string | null) ?? null;
  } catch {
    orgSlug = null;
  }

  const opsRes = await fetchKbsOpsRooms();
  const opsByNumber = new Map<string, { id: string; room_number: string; floor?: string | null }>();
  if (opsRes.ok) {
    for (const op of opsRes.data ?? []) {
      const num = String(op.room_number ?? '').trim();
      if (!num) continue;
      opsByNumber.set(num.toLowerCase(), op);
    }
  } else if (!isValoriaOrgSlug(orgSlug)) {
    throw new Error(opsRes.error.message || 'KBS oda listesi alınamadı');
  }

  let publicByNumber = new Map<string, RoomMeta>();
  try {
    const publicRooms = await fetchPublicRoomsMeta(organizationId);
    publicByNumber = new Map(
      publicRooms
        .filter((r) => r.room_number)
        .map((r) => [r.room_number.trim().toLowerCase(), r])
    );
  } catch {
    /* ignore */
  }

  const sourceNumbers: string[] = isValoriaOrgSlug(orgSlug)
    ? [...VALORIA_FIXED_ROOM_NUMBERS]
    : [...opsByNumber.values()]
        .map((o) => o.room_number.trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'tr', { numeric: true }));

  if (sourceNumbers.length === 0) {
    if (!opsRes.ok) throw new Error(opsRes.error.message || 'KBS oda listesi alınamadı');
    return [];
  }

  const rooms: RoomMeta[] = [];
  for (const num of sourceNumbers) {
    const key = num.toLowerCase();
    const op = opsByNumber.get(key);
    const pub = publicByNumber.get(key);
    const floor =
      parseFloorLoose(op?.floor) ??
      (isValoriaOrgSlug(orgSlug) ? floorForValoriaRoom(num) : null) ??
      pub?.floor ??
      null;

    if (pub && isPublicRoomId(pub.id)) {
      rooms.push({
        id: pub.id,
        room_number: num,
        floor,
        room_occupancy_status: pub.room_occupancy_status,
        organization_id: organizationId,
        cover_image_url: pub.cover_image_url,
        labelOnly: false,
      });
    } else {
      rooms.push({
        id: opsLabelRoomId(num),
        room_number: num,
        floor,
        room_occupancy_status: 'available',
        organization_id: organizationId,
        cover_image_url: null,
        labelOnly: true,
      });
    }
  }

  // Serbest / KBS-only odalar: önceki işlerden kapak taşı
  const labelOnly = rooms.filter((r) => r.labelOnly);
  if (labelOnly.length > 0) {
    const { data: labelCovers } = await supabase
      .from('room_housekeeping_jobs')
      .select('location_label, cover_image_url')
      .eq('organization_id', organizationId)
      .is('room_id', null)
      .not('cover_image_url', 'is', null)
      .order('target_date', { ascending: false })
      .limit(300);
    const coverByLabel = new Map<string, string>();
    for (const row of labelCovers ?? []) {
      const key = String(row.location_label ?? '')
        .trim()
        .toLowerCase();
      if (!key || coverByLabel.has(key)) continue;
      if (isSafeHkImageUrl(row.cover_image_url)) {
        coverByLabel.set(key, row.cover_image_url as string);
      }
    }
    for (const r of rooms) {
      if (!r.labelOnly || r.cover_image_url) continue;
      const found = coverByLabel.get(r.room_number.trim().toLowerCase());
      if (found) r.cover_image_url = found;
    }
  }

  return rooms;
}

function resolveJobRoom(
  job: RoomHousekeepingJobRow,
  publicById: Map<string, RoomMeta>,
  selectableByNumber: Map<string, RoomMeta>
): RoomMeta | null {
  if (job.room_id) {
    const byId = publicById.get(job.room_id);
    if (byId) return byId;
  }
  const label = (job.location_label || '').trim().toLowerCase();
  if (label) return selectableByNumber.get(label) ?? null;
  if (job.room_id) {
    // public silinmiş olabilir; yine de gösterme
    return null;
  }
  return null;
}

export async function fetchHousekeepingJobsForDate(
  organizationId: string,
  targetDate: string
): Promise<RoomHousekeepingJobView[]> {
  const [publicRooms, selectable] = await Promise.all([
    fetchPublicRoomsMeta(organizationId).catch(() => [] as RoomMeta[]),
    fetchOrgRooms(organizationId).catch(() => [] as RoomMeta[]),
  ]);
  const publicById = new Map(publicRooms.map((r) => [r.id, r]));
  const selectableByNumber = new Map(
    selectable.map((r) => [r.room_number.trim().toLowerCase(), r])
  );

  const { data, error } = await supabase
    .from('room_housekeeping_jobs')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('target_date', targetDate);
  if (error) throw friendlyHkError(error);

  const views: RoomHousekeepingJobView[] = ((data ?? []) as RoomHousekeepingJobRow[])
    .map((job) => {
      const room = resolveJobRoom(job, publicById, selectableByNumber);
      if (job.room_id && !room && !job.location_label) {
        // Eski public-only iş: numarayı bilmiyoruz ama kaydı düşürme
        const orphan = publicById.get(job.room_id);
        if (!orphan) {
          return normalizeJob(job, {
            id: job.room_id,
            room_number: '—',
            floor: null,
            room_occupancy_status: 'available',
            organization_id: organizationId,
            cover_image_url: null,
          });
        }
      }
      return normalizeJob(job, room);
    })
    .filter(Boolean) as RoomHousekeepingJobView[];

  return sortJobs(await attachStaffNames(views));
}

export async function markRoomHousekeepingDirty(params: {
  organizationId: string;
  roomId: string;
  targetDate?: string;
  scheduledByStaffId?: string | null;
  note?: string | null;
  isPriority?: boolean;
  client?: SupabaseClient;
}): Promise<void> {
  const client = params.client ?? supabase;
  const targetDate = params.targetDate ?? todayIsoInIstanbul();

  const { error } = await client.from('room_housekeeping_jobs').upsert(
    {
      organization_id: params.organizationId,
      room_id: params.roomId,
      target_date: targetDate,
      status: 'dirty',
      note: params.note?.trim() || null,
      is_priority: Boolean(params.isPriority),
      scheduled_by_staff_id: params.scheduledByStaffId ?? null,
      started_at: null,
      started_by_staff_id: null,
      completed_at: null,
      completed_by_staff_id: null,
    },
    { onConflict: 'organization_id,room_id,target_date' }
  );
  if (error) throw friendlyHkError(error);
}

export async function scheduleRoomsForCleaning(params: {
  organizationId: string;
  roomIds: string[];
  targetDate: string;
  staffId: string;
  note?: string | null;
  isPriority?: boolean;
}): Promise<{ count: number }> {
  const publicIds = params.roomIds.filter(isPublicRoomId);
  if (publicIds.length === 0) return { count: 0 };
  const note = params.note?.trim() || null;
  const isPriority = Boolean(params.isPriority);

  const rows = publicIds.map((roomId) => ({
    organization_id: params.organizationId,
    room_id: roomId,
    target_date: params.targetDate,
    status: 'dirty' as const,
    note,
    is_priority: isPriority,
    scheduled_by_staff_id: params.staffId,
    started_at: null,
    started_by_staff_id: null,
    completed_at: null,
    completed_by_staff_id: null,
  }));

  const { error } = await supabase
    .from('room_housekeeping_jobs')
    .upsert(rows, { onConflict: 'organization_id,room_id,target_date' });
  if (error) throw friendlyHkError(error);
  return { count: rows.length };
}

async function upsertLabelOnlyJob(params: {
  organizationId: string;
  label: string;
  targetDate: string;
  staffId: string;
  note?: string | null;
  isPriority?: boolean;
}): Promise<void> {
  const trimmed = params.label.trim();
  const { data: existing, error: findErr } = await supabase
    .from('room_housekeeping_jobs')
    .select('id')
    .eq('organization_id', params.organizationId)
    .is('room_id', null)
    .ilike('location_label', trimmed)
    .eq('target_date', params.targetDate)
    .maybeSingle();
  if (findErr) throw friendlyHkError(findErr);

  if (existing?.id) {
    const { error: upErr } = await supabase
      .from('room_housekeeping_jobs')
      .update({
        status: 'dirty',
        note: params.note?.trim() || null,
        is_priority: Boolean(params.isPriority),
        scheduled_by_staff_id: params.staffId,
        started_at: null,
        started_by_staff_id: null,
        completed_at: null,
        completed_by_staff_id: null,
        location_label: trimmed,
      })
      .eq('id', existing.id);
    if (upErr) throw friendlyHkError(upErr);
    return;
  }

  // Önceki günlerden aynı yerin kapağını taşı
  const { data: prevCover } = await supabase
    .from('room_housekeeping_jobs')
    .select('cover_image_url')
    .eq('organization_id', params.organizationId)
    .is('room_id', null)
    .ilike('location_label', trimmed)
    .not('cover_image_url', 'is', null)
    .order('target_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  const cover =
    prevCover?.cover_image_url && isSafeHkImageUrl(prevCover.cover_image_url)
      ? prevCover.cover_image_url
      : null;

  const { error: insErr } = await supabase.from('room_housekeeping_jobs').insert({
    organization_id: params.organizationId,
    room_id: null,
    location_label: trimmed,
    target_date: params.targetDate,
    status: 'dirty',
    note: params.note?.trim() || null,
    is_priority: Boolean(params.isPriority),
    scheduled_by_staff_id: params.staffId,
    cover_image_url: cover,
  });
  if (insErr) throw friendlyHkError(insErr);
}

/** Planla: public oda id + KBS-only (B-…) karışık seçim. */
export async function scheduleSelectableRoomsForCleaning(params: {
  organizationId: string;
  rooms: Pick<RoomMeta, 'id' | 'room_number' | 'labelOnly'>[];
  targetDate: string;
  staffId: string;
  note?: string | null;
  isPriority?: boolean;
}): Promise<{ count: number }> {
  if (params.rooms.length === 0) return { count: 0 };

  const publicIds: string[] = [];
  const labels: string[] = [];
  for (const r of params.rooms) {
    if (!r.labelOnly && isPublicRoomId(r.id)) {
      publicIds.push(r.id);
    } else {
      const label = r.room_number.trim() || r.id.replace(OPS_LABEL_PREFIX, '').trim();
      if (label) labels.push(label);
    }
  }

  let count = 0;
  if (publicIds.length > 0) {
    const res = await scheduleRoomsForCleaning({
      organizationId: params.organizationId,
      roomIds: publicIds,
      targetDate: params.targetDate,
      staffId: params.staffId,
      note: params.note,
      isPriority: params.isPriority,
    });
    count += res.count;
  }
  for (const label of labels) {
    await upsertLabelOnlyJob({
      organizationId: params.organizationId,
      label,
      targetDate: params.targetDate,
      staffId: params.staffId,
      note: params.note,
      isPriority: params.isPriority,
    });
    count += 1;
  }
  return { count };
}

/** Oda no veya serbest yer adı ile ekle — sistemde oda yoksa yine de eklenir. */
export async function scheduleRoomByNumber(params: {
  organizationId: string;
  roomNumber: string;
  targetDate: string;
  staffId: string;
  note?: string | null;
  isPriority?: boolean;
  /** true: public/ops eşleşmesini atla, doğrudan location_label yaz */
  skipOrgRoomLookup?: boolean;
}): Promise<{ roomNumber: string }> {
  const trimmed = params.roomNumber.trim();
  if (!trimmed) throw new Error('Oda / yer adı gerekli');

  if (!params.skipOrgRoomLookup) {
    const rooms = await fetchOrgRooms(params.organizationId);
    const room = rooms.find(
      (r) => r.room_number.trim().toLowerCase() === trimmed.toLowerCase()
    );

    if (room && !room.labelOnly && isPublicRoomId(room.id)) {
      await scheduleRoomsForCleaning({
        organizationId: params.organizationId,
        roomIds: [room.id],
        targetDate: params.targetDate,
        staffId: params.staffId,
        note: params.note,
        isPriority: params.isPriority,
      });
      return { roomNumber: room.room_number };
    }
  }

  await upsertLabelOnlyJob({
    organizationId: params.organizationId,
    label: trimmed,
    targetDate: params.targetDate,
    staffId: params.staffId,
    note: params.note,
    isPriority: params.isPriority,
  });

  return { roomNumber: trimmed };
}

export async function updateHousekeepingJobNote(params: {
  jobId: string;
  note: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from('room_housekeeping_jobs')
    .update({ note: params.note?.trim() || null })
    .eq('id', params.jobId);
  if (error) throw friendlyHkError(error);
}

export async function setHousekeepingJobPriority(params: {
  jobId: string;
  isPriority: boolean;
}): Promise<void> {
  const { error } = await supabase
    .from('room_housekeeping_jobs')
    .update({ is_priority: params.isPriority })
    .eq('id', params.jobId);
  if (error) throw friendlyHkError(error);
}

export async function setRoomHousekeepingCover(params: {
  organizationId: string;
  roomId: string;
  coverImageUrl: string;
}): Promise<void> {
  if (!isSafeHkImageUrl(params.coverImageUrl)) {
    throw new Error('Geçersiz kapak görseli URL');
  }
  const { data: existing } = await supabase
    .from('room_housekeeping_status')
    .select('id')
    .eq('room_id', params.roomId)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from('room_housekeeping_status')
      .update({ cover_image_url: params.coverImageUrl })
      .eq('id', existing.id);
    if (error) throw friendlyHkError(error);
    return;
  }

  const { error } = await supabase.from('room_housekeeping_status').insert({
    organization_id: params.organizationId,
    room_id: params.roomId,
    status: 'clean',
    cover_image_url: params.coverImageUrl,
  });
  if (error) throw friendlyHkError(error);
}

/** Serbest yer veya oda iş satırına kapak (room_id yoksa zorunlu yol). */
export async function setHousekeepingJobCover(params: {
  jobId: string;
  coverImageUrl: string;
}): Promise<void> {
  if (!isSafeHkImageUrl(params.coverImageUrl)) {
    throw new Error('Geçersiz kapak görseli URL');
  }
  const { error } = await supabase
    .from('room_housekeeping_jobs')
    .update({ cover_image_url: params.coverImageUrl })
    .eq('id', params.jobId);
  if (error) throw friendlyHkError(error);
}

/** Planla ekranından oda/yer kapağı — kayıtlı oda veya label-only. */
export async function setSelectableRoomCover(params: {
  organizationId: string;
  room: Pick<RoomMeta, 'id' | 'room_number' | 'labelOnly'>;
  coverImageUrl: string;
  targetDate: string;
  staffId: string;
}): Promise<void> {
  if (!isSafeHkImageUrl(params.coverImageUrl)) {
    throw new Error('Geçersiz kapak görseli URL');
  }

  if (!params.room.labelOnly && isPublicRoomId(params.room.id)) {
    await setRoomHousekeepingCover({
      organizationId: params.organizationId,
      roomId: params.room.id,
      coverImageUrl: params.coverImageUrl,
    });
    await supabase
      .from('room_housekeeping_jobs')
      .update({ cover_image_url: params.coverImageUrl })
      .eq('organization_id', params.organizationId)
      .eq('room_id', params.room.id)
      .eq('target_date', params.targetDate);
    return;
  }

  const label = params.room.room_number.trim();
  const { data: existing } = await supabase
    .from('room_housekeeping_jobs')
    .select('id')
    .eq('organization_id', params.organizationId)
    .is('room_id', null)
    .ilike('location_label', label)
    .eq('target_date', params.targetDate)
    .maybeSingle();

  if (existing?.id) {
    await setHousekeepingJobCover({ jobId: existing.id, coverImageUrl: params.coverImageUrl });
    return;
  }

  // Listeyi kirletmemek için clean kapak kaydı; Planla seçilince dirty'ye döner
  const { error: insErr } = await supabase.from('room_housekeeping_jobs').insert({
    organization_id: params.organizationId,
    room_id: null,
    location_label: label,
    target_date: params.targetDate,
    status: 'clean',
    scheduled_by_staff_id: params.staffId,
    cover_image_url: params.coverImageUrl,
    completed_at: new Date().toISOString(),
    completed_by_staff_id: params.staffId,
  });
  if (insErr) throw friendlyHkError(insErr);

  // Aynı etiketin diğer gün kayıtlarına da kapak yaz
  await supabase
    .from('room_housekeeping_jobs')
    .update({ cover_image_url: params.coverImageUrl })
    .eq('organization_id', params.organizationId)
    .is('room_id', null)
    .ilike('location_label', label);
}

/** Oda temizlik geçmişi (tüm tarihler). */
export async function fetchHousekeepingHistoryForRoom(params: {
  organizationId: string;
  roomId: string;
  limit?: number;
}): Promise<RoomHousekeepingJobView[]> {
  if (!isPublicRoomId(params.roomId)) return [];
  const publicRooms = await fetchPublicRoomsMeta(params.organizationId);
  const room = publicRooms.find((r) => r.id === params.roomId);
  if (!room) return [];

  const { data, error } = await supabase
    .from('room_housekeeping_jobs')
    .select('*')
    .eq('organization_id', params.organizationId)
    .eq('room_id', params.roomId)
    .order('target_date', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(params.limit ?? 60);
  if (error) throw friendlyHkError(error);

  const views = ((data ?? []) as RoomHousekeepingJobRow[]).map((job) => normalizeJob(job, room));
  return attachStaffNames(views);
}

/** Ay aralığı işleri (PDF). */
export async function fetchHousekeepingJobsForMonth(
  organizationId: string,
  yearMonth: string
): Promise<RoomHousekeepingJobView[]> {
  const start = `${yearMonth}-01`;
  const [y, m] = yearMonth.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

  const [publicRooms, selectable] = await Promise.all([
    fetchPublicRoomsMeta(organizationId).catch(() => [] as RoomMeta[]),
    fetchOrgRooms(organizationId).catch(() => [] as RoomMeta[]),
  ]);
  const publicById = new Map(publicRooms.map((r) => [r.id, r]));
  const selectableByNumber = new Map(
    selectable.map((r) => [r.room_number.trim().toLowerCase(), r])
  );

  const { data, error } = await supabase
    .from('room_housekeeping_jobs')
    .select('*')
    .eq('organization_id', organizationId)
    .gte('target_date', start)
    .lte('target_date', end)
    .order('target_date', { ascending: true })
    .order('status', { ascending: true });
  if (error) throw friendlyHkError(error);

  const views = ((data ?? []) as RoomHousekeepingJobRow[])
    .map((job) => {
      const room = resolveJobRoom(job, publicById, selectableByNumber);
      if (job.room_id && !room && !job.location_label) {
        return normalizeJob(job, {
          id: job.room_id,
          room_number: '—',
          floor: null,
          room_occupancy_status: 'available',
          organization_id: organizationId,
          cover_image_url: null,
        });
      }
      return normalizeJob(job, room);
    })
    .filter(Boolean) as RoomHousekeepingJobView[];

  return attachStaffNames(views);
}

export async function startRoomHousekeepingJob(params: {
  jobId: string;
  staffId: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('room_housekeeping_jobs')
    .update({
      status: 'cleaning',
      started_at: now,
      started_by_staff_id: params.staffId,
      completed_at: null,
      completed_by_staff_id: null,
    })
    .eq('id', params.jobId);
  if (error) throw friendlyHkError(error);
}

export async function markRoomHousekeepingJobDone(params: {
  jobId: string;
  staffId: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const { data: existing, error: selErr } = await supabase
    .from('room_housekeeping_jobs')
    .select('started_at, started_by_staff_id')
    .eq('id', params.jobId)
    .maybeSingle();
  if (selErr) throw friendlyHkError(selErr);

  const { error } = await supabase
    .from('room_housekeeping_jobs')
    .update({
      status: 'clean',
      started_at: existing?.started_at ?? now,
      started_by_staff_id: existing?.started_by_staff_id ?? params.staffId,
      completed_at: now,
      completed_by_staff_id: params.staffId,
    })
    .eq('id', params.jobId);
  if (error) throw friendlyHkError(error);
}

export async function appendHousekeepingJobPhoto(params: {
  jobId: string;
  photoUrl: string;
}): Promise<string[]> {
  const { data, error } = await supabase
    .from('room_housekeeping_jobs')
    .select('photo_urls')
    .eq('id', params.jobId)
    .maybeSingle();
  if (error) throw friendlyHkError(error);

  const current = sanitizeHkPhotoUrls(data?.photo_urls);
  const next = [...current, params.photoUrl].filter(isSafeHkImageUrl).slice(0, 8);

  const { error: upErr } = await supabase
    .from('room_housekeeping_jobs')
    .update({ photo_urls: next })
    .eq('id', params.jobId);
  if (upErr) throw friendlyHkError(upErr);
  return next;
}

export async function removeHousekeepingJob(jobId: string): Promise<void> {
  const { error } = await supabase.from('room_housekeeping_jobs').delete().eq('id', jobId);
  if (error) throw friendlyHkError(error);
}

export function subscribeHousekeepingJobs(
  organizationId: string,
  targetDate: string,
  onChange: () => void
): () => void {
  const channel: RealtimeChannel = supabase
    .channel(`room_hk_jobs_${organizationId}_${targetDate}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'room_housekeeping_jobs',
        filter: `organization_id=eq.${organizationId}`,
      },
      (payload) => {
        const row = (payload.new ?? payload.old) as { target_date?: string } | null;
        if (!row?.target_date || row.target_date === targetDate) onChange();
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function housekeepingStatusLabel(
  status: HousekeepingStatus,
  t: (k: string) => string
): string {
  switch (status) {
    case 'dirty':
      return t('hkStatusDirty');
    case 'cleaning':
      return t('hkStatusCleaning');
    case 'clean':
      return t('hkStatusClean');
    default:
      return status;
  }
}

/** Kirli = kırmızı uyarı, temiz = yeşil */
export const HOUSEKEEPING_STATUS_COLORS: Record<
  HousekeepingStatus,
  { border: string; bg: string; text: string; accent: string }
> = {
  dirty: { border: '#b91c1c', bg: '#fef2f2', text: '#7f1d1d', accent: '#dc2626' },
  cleaning: { border: '#c2410c', bg: '#fff7ed', text: '#9a3412', accent: '#ea580c' },
  clean: { border: '#15803d', bg: '#f0fdf4', text: '#14532d', accent: '#16a34a' },
};

export async function fetchRoomHousekeepingBoard(organizationId: string) {
  return fetchHousekeepingJobsForDate(organizationId, todayIsoInIstanbul());
}

export function subscribeRoomHousekeeping(organizationId: string, onChange: () => void) {
  return subscribeHousekeepingJobs(organizationId, todayIsoInIstanbul(), onChange);
}
