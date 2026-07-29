import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { checkoutGuest } from '@/lib/occupancyCheckout';
import {
  addDaysIso,
  fetchOrgRooms,
  isPublicRoomId,
  todayIsoInIstanbul,
  type RoomMeta,
} from '@/lib/roomHousekeeping';

export type CheckoutJobStatus = 'pending' | 'done';

export type RoomCheckoutJobRow = {
  id: string;
  organization_id: string;
  room_id: string | null;
  location_label: string | null;
  target_date: string;
  status: CheckoutJobStatus;
  note: string | null;
  is_priority: boolean;
  scheduled_by_staff_id: string | null;
  completed_at: string | null;
  completed_by_staff_id: string | null;
  updated_at: string;
  created_at: string;
};

export type RoomCheckoutJobView = RoomCheckoutJobRow & {
  room_number: string;
  floor: number | null;
  scheduled_by_name: string | null;
  completed_by_name: string | null;
  guest_names: string[];
  guest_ids: string[];
};

export type CheckoutBoardCounts = {
  pending: number;
  done: number;
  needs: number;
  total: number;
};

export const CHECKOUT_STATUS_COLORS: Record<
  CheckoutJobStatus,
  { bg: string; border: string; accent: string; text: string; label: string }
> = {
  pending: {
    bg: '#fff7ed',
    border: '#fed7aa',
    accent: '#ea580c',
    text: '#9a3412',
    label: 'Çıkacak',
  },
  done: {
    bg: '#ecfdf5',
    border: '#a7f3d0',
    accent: '#059669',
    text: '#065f46',
    label: 'Çıktı',
  },
};

export { todayIsoInIstanbul, addDaysIso, fetchOrgRooms };
export type { RoomMeta };

const OPS_LABEL_PREFIX = 'ops-label:';

function jobRoomLabel(row: RoomCheckoutJobRow, roomById: Map<string, RoomMeta>): string {
  if (row.room_id) {
    const r = roomById.get(row.room_id);
    if (r?.room_number) return r.room_number;
  }
  const label = (row.location_label ?? '').trim();
  if (label.toLowerCase().startsWith(OPS_LABEL_PREFIX)) {
    return label.slice(OPS_LABEL_PREFIX.length).trim() || label;
  }
  return label || '—';
}

function sortJobs(a: RoomCheckoutJobView, b: RoomCheckoutJobView): number {
  if (a.is_priority !== b.is_priority) return a.is_priority ? -1 : 1;
  if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
  return a.room_number.localeCompare(b.room_number, 'tr', { numeric: true });
}

export async function fetchCheckoutJobsForDate(
  organizationId: string,
  targetDate: string,
  client: SupabaseClient = supabase
): Promise<RoomCheckoutJobView[]> {
  const [jobsRes, rooms] = await Promise.all([
    client
      .from('room_checkout_jobs')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('target_date', targetDate)
      .order('created_at', { ascending: true }),
    fetchOrgRooms(organizationId).catch(() => [] as RoomMeta[]),
  ]);
  if (jobsRes.error) throw new Error(jobsRes.error.message);

  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const roomByNum = new Map(rooms.map((r) => [r.room_number.trim().toLowerCase(), r]));

  const rows = (jobsRes.data ?? []) as RoomCheckoutJobRow[];
  const staffIds = [
    ...new Set(
      rows
        .flatMap((r) => [r.scheduled_by_staff_id, r.completed_by_staff_id])
        .filter(Boolean) as string[]
    ),
  ];
  const staffMap = new Map<string, string>();
  if (staffIds.length) {
    const { data: staffRows } = await client.from('staff').select('id, full_name').in('id', staffIds);
    for (const s of staffRows ?? []) staffMap.set(s.id, s.full_name ?? '');
  }

  // Misafirleri planlanan odalara bağla (room_id veya oda numarası eşleşmesi)
  const resolvedRoomIdsForJobs = new Set<string>();
  for (const row of rows) {
    if (row.room_id) {
      resolvedRoomIdsForJobs.add(row.room_id);
      continue;
    }
    const label = jobRoomLabel(row, roomById);
    const meta = roomByNum.get(label.toLowerCase());
    if (meta && !meta.labelOnly && isPublicRoomId(meta.id)) {
      resolvedRoomIdsForJobs.add(meta.id);
    }
  }
  const publicRoomIds = [...resolvedRoomIdsForJobs];
  const guestsByRoomId = new Map<string, { id: string; full_name: string }[]>();
  if (publicRoomIds.length) {
    const { data: guests } = await client
      .from('guests')
      .select('id, full_name, room_id, status')
      .eq('organization_id', organizationId)
      .in('room_id', publicRoomIds)
      .eq('status', 'checked_in');
    for (const g of guests ?? []) {
      const rid = g.room_id as string;
      const list = guestsByRoomId.get(rid) ?? [];
      list.push({ id: g.id, full_name: String(g.full_name ?? '—') });
      guestsByRoomId.set(rid, list);
    }
  }

  const views: RoomCheckoutJobView[] = rows.map((row) => {
    const label = jobRoomLabel(row, roomById);
    const meta = row.room_id
      ? roomById.get(row.room_id)
      : roomByNum.get(label.toLowerCase());
    const resolvedRoomId =
      row.room_id ??
      (meta && !meta.labelOnly && isPublicRoomId(meta.id) ? meta.id : null);
    const guests = resolvedRoomId ? guestsByRoomId.get(resolvedRoomId) ?? [] : [];
    return {
      ...row,
      // Görüntüleme / çıkış için çözülmüş room_id (DB satırını değiştirmez)
      room_id: resolvedRoomId,
      is_priority: !!row.is_priority,
      room_number: label,
      floor: meta?.floor ?? null,
      scheduled_by_name: row.scheduled_by_staff_id
        ? staffMap.get(row.scheduled_by_staff_id) ?? null
        : null,
      completed_by_name: row.completed_by_staff_id
        ? staffMap.get(row.completed_by_staff_id) ?? null
        : null,
      guest_names: guests.map((g) => g.full_name),
      guest_ids: guests.map((g) => g.id),
    };
  });

  views.sort(sortJobs);
  return views;
}

export function countCheckoutJobs(jobs: RoomCheckoutJobView[]): CheckoutBoardCounts {
  let pending = 0;
  let done = 0;
  for (const j of jobs) {
    if (j.status === 'pending') pending += 1;
    else done += 1;
  }
  return { pending, done, needs: pending, total: jobs.length };
}

async function upsertRoomJob(params: {
  organizationId: string;
  roomId: string;
  targetDate: string;
  staffId: string;
  note?: string | null;
  isPriority?: boolean;
  client?: SupabaseClient;
}): Promise<void> {
  const client = params.client ?? supabase;
  const { error } = await client.from('room_checkout_jobs').upsert(
    {
      organization_id: params.organizationId,
      room_id: params.roomId,
      location_label: null,
      target_date: params.targetDate,
      status: 'pending',
      note: params.note?.trim() || null,
      is_priority: params.isPriority === true,
      scheduled_by_staff_id: params.staffId,
      completed_at: null,
      completed_by_staff_id: null,
    },
    { onConflict: 'organization_id,room_id,target_date' }
  );
  // Partial unique index — PostgREST may need manual upsert
  if (error) {
    const { data: existing } = await client
      .from('room_checkout_jobs')
      .select('id')
      .eq('organization_id', params.organizationId)
      .eq('room_id', params.roomId)
      .eq('target_date', params.targetDate)
      .maybeSingle();
    if (existing?.id) {
      const { error: upErr } = await client
        .from('room_checkout_jobs')
        .update({
          status: 'pending',
          note: params.note?.trim() || null,
          is_priority: params.isPriority === true,
          scheduled_by_staff_id: params.staffId,
          completed_at: null,
          completed_by_staff_id: null,
        })
        .eq('id', existing.id);
      if (upErr) throw new Error(upErr.message);
    } else {
      const { error: insErr } = await client.from('room_checkout_jobs').insert({
        organization_id: params.organizationId,
        room_id: params.roomId,
        location_label: null,
        target_date: params.targetDate,
        status: 'pending',
        note: params.note?.trim() || null,
        is_priority: params.isPriority === true,
        scheduled_by_staff_id: params.staffId,
      });
      if (insErr) throw new Error(insErr.message);
    }
  }
}

async function upsertLabelJob(params: {
  organizationId: string;
  label: string;
  targetDate: string;
  staffId: string;
  note?: string | null;
  isPriority?: boolean;
  client?: SupabaseClient;
}): Promise<void> {
  const client = params.client ?? supabase;
  const label = params.label.trim();
  const { data: existing } = await client
    .from('room_checkout_jobs')
    .select('id')
    .eq('organization_id', params.organizationId)
    .eq('target_date', params.targetDate)
    .is('room_id', null)
    .ilike('location_label', label)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await client
      .from('room_checkout_jobs')
      .update({
        status: 'pending',
        note: params.note?.trim() || null,
        is_priority: params.isPriority === true,
        scheduled_by_staff_id: params.staffId,
        completed_at: null,
        completed_by_staff_id: null,
        location_label: label,
      })
      .eq('id', existing.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await client.from('room_checkout_jobs').insert({
    organization_id: params.organizationId,
    room_id: null,
    location_label: label,
    target_date: params.targetDate,
    status: 'pending',
    note: params.note?.trim() || null,
    is_priority: params.isPriority === true,
    scheduled_by_staff_id: params.staffId,
  });
  if (error) throw new Error(error.message);
}

/** Temizlik Planla gibi: seçilen odaları hedef güne ekle. */
export async function scheduleRoomsForCheckout(params: {
  organizationId: string;
  rooms: Pick<RoomMeta, 'id' | 'room_number' | 'labelOnly'>[];
  targetDate: string;
  staffId: string;
  note?: string | null;
  isPriority?: boolean;
}): Promise<{ count: number }> {
  let count = 0;
  for (const r of params.rooms) {
    if (!r.labelOnly && isPublicRoomId(r.id)) {
      await upsertRoomJob({
        organizationId: params.organizationId,
        roomId: r.id,
        targetDate: params.targetDate,
        staffId: params.staffId,
        note: params.note,
        isPriority: params.isPriority,
      });
      count += 1;
    } else {
      const label = r.room_number.trim() || r.id.replace(OPS_LABEL_PREFIX, '').trim();
      if (!label) continue;
      await upsertLabelJob({
        organizationId: params.organizationId,
        label,
        targetDate: params.targetDate,
        staffId: params.staffId,
        note: params.note,
        isPriority: params.isPriority,
      });
      count += 1;
    }
  }
  return { count };
}

export async function scheduleCheckoutRoomByNumber(params: {
  organizationId: string;
  roomNumber: string;
  targetDate: string;
  staffId: string;
  note?: string | null;
  isPriority?: boolean;
}): Promise<{ roomNumber: string }> {
  const trimmed = params.roomNumber.trim();
  if (!trimmed) throw new Error('Oda numarası gerekli');

  const rooms = await fetchOrgRooms(params.organizationId);
  const room = rooms.find((r) => r.room_number.trim().toLowerCase() === trimmed.toLowerCase());

  if (room && !room.labelOnly && isPublicRoomId(room.id)) {
    await upsertRoomJob({
      organizationId: params.organizationId,
      roomId: room.id,
      targetDate: params.targetDate,
      staffId: params.staffId,
      note: params.note,
      isPriority: params.isPriority,
    });
    return { roomNumber: room.room_number };
  }

  await upsertLabelJob({
    organizationId: params.organizationId,
    label: room?.room_number ?? trimmed,
    targetDate: params.targetDate,
    staffId: params.staffId,
    note: params.note,
    isPriority: params.isPriority,
  });
  return { roomNumber: room?.room_number ?? trimmed };
}

export async function removeCheckoutJob(jobId: string, client: SupabaseClient = supabase): Promise<void> {
  const { error } = await client.from('room_checkout_jobs').delete().eq('id', jobId);
  if (error) throw new Error(error.message);
}

export async function updateCheckoutJobNote(
  jobId: string,
  note: string | null,
  client: SupabaseClient = supabase
): Promise<void> {
  const { error } = await client
    .from('room_checkout_jobs')
    .update({ note: note?.trim() || null })
    .eq('id', jobId);
  if (error) throw new Error(error.message);
}

export async function setCheckoutJobPriority(
  jobId: string,
  isPriority: boolean,
  client: SupabaseClient = supabase
): Promise<void> {
  const { error } = await client
    .from('room_checkout_jobs')
    .update({ is_priority: isPriority })
    .eq('id', jobId);
  if (error) throw new Error(error.message);
}

/**
 * Oda değiştir — çıkış DEĞİL.
 * Odadaki checked-in misafirleri yeni odaya taşır; çıkış işini yeni odaya günceller.
 */
export async function changeCheckoutJobRoom(params: {
  job: RoomCheckoutJobView;
  newRoom: Pick<RoomMeta, 'id' | 'room_number' | 'labelOnly'>;
  staffId: string;
  note?: string | null;
  client?: SupabaseClient;
}): Promise<{ moved: number; fromRoom: string; toRoom: string }> {
  const client = params.client ?? supabase;
  const { moveGuestToRoom } = await import('@/lib/guestStayRoomOps');

  if (params.newRoom.labelOnly || !isPublicRoomId(params.newRoom.id)) {
    throw new Error('Hedef oda geçersiz');
  }

  let fromRoomId = params.job.room_id;
  if (!fromRoomId && params.job.room_number) {
    const rooms = await fetchOrgRooms(params.job.organization_id).catch(() => [] as RoomMeta[]);
    const match = rooms.find(
      (r) =>
        !r.labelOnly &&
        isPublicRoomId(r.id) &&
        r.room_number.trim().toLowerCase() === params.job.room_number.trim().toLowerCase()
    );
    fromRoomId = match?.id ?? null;
  }

  if (!fromRoomId) {
    throw new Error('Mevcut oda bulunamadı — oda değişimi yapılamaz');
  }
  if (fromRoomId === params.newRoom.id) {
    throw new Error('Aynı oda seçildi');
  }

  const { data: guests, error } = await client
    .from('guests')
    .select('id, full_name, room_id, organization_id')
    .eq('room_id', fromRoomId)
    .eq('status', 'checked_in');
  if (error) throw new Error(error.message);

  let moved = 0;
  for (const g of guests ?? []) {
    const res = await moveGuestToRoom(client, {
      guestId: g.id,
      oldRoomId: fromRoomId,
      newRoomId: params.newRoom.id,
    });
    if (res.error) throw res.error;

    const { error: evErr } = await client.from('occupancy_stay_events').insert({
      organization_id: g.organization_id ?? params.job.organization_id,
      guest_id: g.id,
      kind: 'room_change',
      note:
        params.note?.trim() ||
        `Oda değişimi: ${params.job.room_number} → ${params.newRoom.room_number}`,
      from_room_id: fromRoomId,
      to_room_id: params.newRoom.id,
      created_by_staff_id: params.staffId,
    });
    if (evErr) {
      // olay günlüğü opsiyonel — taşımayı engelleme
      console.warn('[checkoutBoard] occupancy_stay_events', evErr.message);
    }
    moved += 1;
  }

  const { error: jobErr } = await client
    .from('room_checkout_jobs')
    .update({
      room_id: params.newRoom.id,
      location_label: null,
      note:
        params.note?.trim() ||
        params.job.note ||
        `Oda değişti: ${params.job.room_number} → ${params.newRoom.room_number}`,
    })
    .eq('id', params.job.id);
  if (jobErr) throw new Error(jobErr.message);

  return {
    moved,
    fromRoom: params.job.room_number,
    toRoom: params.newRoom.room_number,
  };
}

/**
 * Oda değiştir için hedef odalar (mevcut oda hariç).
 */
export async function fetchRoomsForCheckoutMove(
  organizationId: string,
  excludeRoomId?: string | null
): Promise<RoomMeta[]> {
  const rooms = await fetchOrgRooms(organizationId);
  return rooms.filter(
    (r) => !r.labelOnly && isPublicRoomId(r.id) && r.id !== excludeRoomId
  );
}

/**
 * Odadaki misafirleri çıkar + işi tamamla.
 * room_id yoksa yalnızca job'ı done yapar.
 */
export async function completeCheckoutJob(params: {
  job: RoomCheckoutJobView;
  staffId: string;
  note?: string | null;
  client?: SupabaseClient;
}): Promise<{ checkedOut: number }> {
  const client = params.client ?? supabase;
  let checkedOut = 0;

  let roomId = params.job.room_id;
  if (!roomId && params.job.room_number) {
    const rooms = await fetchOrgRooms(params.job.organization_id).catch(() => [] as RoomMeta[]);
    const match = rooms.find(
      (r) =>
        !r.labelOnly &&
        isPublicRoomId(r.id) &&
        r.room_number.trim().toLowerCase() === params.job.room_number.trim().toLowerCase()
    );
    roomId = match?.id ?? null;
  }

  if (roomId) {
    const { data: guests, error } = await client
      .from('guests')
      .select('id, full_name, room_id, contract_lang')
      .eq('room_id', roomId)
      .eq('status', 'checked_in');
    if (error) throw new Error(error.message);

    for (const g of guests ?? []) {
      const res = await checkoutGuest(
        client,
        {
          id: g.id,
          full_name: g.full_name ?? '—',
          room_id: g.room_id,
          contract_lang: (g as { contract_lang?: string | null }).contract_lang ?? null,
        },
        params.staffId
      );
      if (res.error) throw res.error;
      checkedOut += 1;
    }
  }

  const note =
    params.note?.trim() ||
    params.job.note ||
    null;

  const { error: upErr } = await client
    .from('room_checkout_jobs')
    .update({
      status: 'done',
      completed_at: new Date().toISOString(),
      completed_by_staff_id: params.staffId,
      note,
    })
    .eq('id', params.job.id);
  if (upErr) throw new Error(upErr.message);

  return { checkedOut };
}

export function subscribeCheckoutJobs(
  organizationId: string,
  targetDate: string,
  onChange: () => void
): RealtimeChannel {
  const channel = supabase
    .channel(`checkout-jobs-${organizationId}-${targetDate}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'room_checkout_jobs',
        filter: `organization_id=eq.${organizationId}`,
      },
      () => onChange()
    )
    .subscribe();
  return channel;
}

export function formatCheckoutDateTime(iso: string | null | undefined, locale = 'tr-TR'): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(locale, {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** @deprecated Use formatCheckoutDateTime — kept for Fast Refresh / eski import uyumu */
export const formatCheckoutDate = formatCheckoutDateTime;
