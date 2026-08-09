import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import {
  addDaysIso,
  fetchOrgRooms,
  isPublicRoomId,
  todayIsoInIstanbul,
  type RoomMeta,
} from '@/lib/roomHousekeeping';
import { sendBulkToStaff, sendNotificationToStaffIds } from '@/lib/notificationService';
import { readVoiceRecordingBuffer, getMimeAndExt } from '@/lib/uploadMedia';
import { uploadBufferToPublicBucket } from '@/lib/storagePublicUpload';

export type RoomPaymentStatus = 'unpaid' | 'waiting' | 'collected';
export type RoomPaymentMethod = 'cash' | 'card' | 'transfer' | 'other';

export type RoomPaymentJobRow = {
  id: string;
  organization_id: string;
  room_id: string | null;
  location_label: string | null;
  target_date: string;
  status: RoomPaymentStatus;
  amount_due: number;
  amount_collected: number | null;
  currency: string;
  payment_method: RoomPaymentMethod | null;
  guest_label: string | null;
  note: string | null;
  voice_note_url: string | null;
  voice_note_duration_sec: number | null;
  is_priority: boolean;
  scheduled_by_staff_id: string | null;
  collected_at: string | null;
  collected_by_staff_id: string | null;
  updated_at: string;
  created_at: string;
};

export type RoomPaymentJobView = RoomPaymentJobRow & {
  room_number: string;
  floor: number | null;
  scheduled_by_name: string | null;
  collected_by_name: string | null;
  guest_names: string[];
  guest_ids: string[];
};

export type RoomPaymentBoardCounts = {
  unpaid: number;
  waiting: number;
  collected: number;
  needs: number;
  total: number;
  dueTotal: number;
  collectedTotal: number;
};

export const PAYMENT_STATUS_META: Record<
  RoomPaymentStatus,
  { bg: string; border: string; accent: string; text: string; label: string; soft: string }
> = {
  unpaid: {
    bg: '#FFF8F8',
    border: '#FECACA',
    accent: '#E11D48',
    text: '#9F1239',
    soft: 'rgba(225, 29, 72, 0.10)',
    label: 'Alınmadı',
  },
  waiting: {
    bg: '#FFFBF3',
    border: '#FDE68A',
    accent: '#D97706',
    text: '#92400E',
    soft: 'rgba(217, 119, 6, 0.12)',
    label: 'Bekliyor',
  },
  collected: {
    bg: '#F3FBF7',
    border: '#A7F3D0',
    accent: '#059669',
    text: '#065F46',
    soft: 'rgba(5, 150, 105, 0.12)',
    label: 'Alındı',
  },
};

export const PAYMENT_METHOD_LABELS: Record<RoomPaymentMethod, string> = {
  cash: 'Nakit',
  card: 'Kart',
  transfer: 'Havale/EFT',
  other: 'Diğer',
};

export { todayIsoInIstanbul, addDaysIso, fetchOrgRooms };
export type { RoomMeta };

const OPS_LABEL_PREFIX = 'ops-label:';

function jobRoomLabel(row: RoomPaymentJobRow, roomById: Map<string, RoomMeta>): string {
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

function sortJobs(a: RoomPaymentJobView, b: RoomPaymentJobView): number {
  if (a.is_priority !== b.is_priority) return a.is_priority ? -1 : 1;
  const rank = (s: RoomPaymentStatus) => (s === 'unpaid' ? 0 : s === 'waiting' ? 1 : 2);
  if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
  return a.room_number.localeCompare(b.room_number, 'tr', { numeric: true });
}

export function formatPaymentMoney(amount: number | null | undefined, currency = 'TRY'): string {
  const n = Number(amount ?? 0);
  try {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: currency || 'TRY',
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency || 'TRY'}`;
  }
}

export function parseMoneyInput(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, '').replace(/₺/g, '').replace(/\./g, '').replace(',', '.').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export async function fetchPaymentJobsForDate(
  organizationId: string,
  targetDate: string,
  client: SupabaseClient = supabase
): Promise<RoomPaymentJobView[]> {
  const [jobsRes, rooms] = await Promise.all([
    client
      .from('room_payment_jobs')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('target_date', targetDate)
      .order('created_at', { ascending: true }),
    fetchOrgRooms(organizationId).catch(() => [] as RoomMeta[]),
  ]);
  if (jobsRes.error) throw new Error(jobsRes.error.message);

  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const roomByNum = new Map(rooms.map((r) => [r.room_number.trim().toLowerCase(), r]));
  const rows = (jobsRes.data ?? []) as RoomPaymentJobRow[];

  const staffIds = [
    ...new Set(
      rows
        .flatMap((r) => [r.scheduled_by_staff_id, r.collected_by_staff_id])
        .filter(Boolean) as string[]
    ),
  ];
  const staffMap = new Map<string, string>();
  if (staffIds.length) {
    const { data: staffRows } = await client.from('staff').select('id, full_name').in('id', staffIds);
    for (const s of staffRows ?? []) staffMap.set(s.id, s.full_name ?? '');
  }

  const resolvedRoomIds = new Set<string>();
  for (const row of rows) {
    if (row.room_id) {
      resolvedRoomIds.add(row.room_id);
      continue;
    }
    const label = jobRoomLabel(row, roomById);
    const meta = roomByNum.get(label.toLowerCase());
    if (meta && !meta.labelOnly && isPublicRoomId(meta.id)) {
      resolvedRoomIds.add(meta.id);
    }
  }

  const guestsByRoomId = new Map<string, { id: string; full_name: string }[]>();
  if (resolvedRoomIds.size) {
    const { data: guests } = await client
      .from('guests')
      .select('id, full_name, room_id, status')
      .eq('organization_id', organizationId)
      .in('room_id', [...resolvedRoomIds])
      .eq('status', 'checked_in');
    for (const g of guests ?? []) {
      const rid = g.room_id as string;
      const list = guestsByRoomId.get(rid) ?? [];
      list.push({ id: g.id, full_name: String(g.full_name ?? '—') });
      guestsByRoomId.set(rid, list);
    }
  }

  const views: RoomPaymentJobView[] = rows.map((row) => {
    const label = jobRoomLabel(row, roomById);
    const meta = row.room_id ? roomById.get(row.room_id) : roomByNum.get(label.toLowerCase());
    const resolvedRoomId =
      row.room_id ?? (meta && !meta.labelOnly && isPublicRoomId(meta.id) ? meta.id : null);
    const guests = resolvedRoomId ? guestsByRoomId.get(resolvedRoomId) ?? [] : [];
    return {
      ...row,
      room_id: resolvedRoomId,
      amount_due: Number(row.amount_due ?? 0),
      amount_collected:
        row.amount_collected == null ? null : Number(row.amount_collected),
      is_priority: !!row.is_priority,
      room_number: label,
      floor: meta?.floor ?? null,
      scheduled_by_name: row.scheduled_by_staff_id
        ? staffMap.get(row.scheduled_by_staff_id) ?? null
        : null,
      collected_by_name: row.collected_by_staff_id
        ? staffMap.get(row.collected_by_staff_id) ?? null
        : null,
      guest_names: row.guest_label?.trim()
        ? [row.guest_label.trim()]
        : guests.map((g) => g.full_name),
      guest_ids: guests.map((g) => g.id),
    };
  });

  views.sort(sortJobs);
  return views;
}

export function countPaymentJobs(jobs: RoomPaymentJobView[]): RoomPaymentBoardCounts {
  let unpaid = 0;
  let waiting = 0;
  let collected = 0;
  let dueTotal = 0;
  let collectedTotal = 0;
  for (const j of jobs) {
    if (j.status === 'unpaid') unpaid += 1;
    else if (j.status === 'waiting') waiting += 1;
    else collected += 1;
    dueTotal += Number(j.amount_due ?? 0);
    if (j.status === 'collected') {
      collectedTotal += Number(j.amount_collected ?? j.amount_due ?? 0);
    }
  }
  return {
    unpaid,
    waiting,
    collected,
    needs: unpaid + waiting,
    total: jobs.length,
    dueTotal,
    collectedTotal,
  };
}

async function upsertRoomJob(params: {
  organizationId: string;
  roomId: string;
  targetDate: string;
  staffId: string;
  amountDue?: number;
  note?: string | null;
  guestLabel?: string | null;
  isPriority?: boolean;
  client?: SupabaseClient;
}): Promise<void> {
  const client = params.client ?? supabase;
  const payload = {
    organization_id: params.organizationId,
    room_id: params.roomId,
    location_label: null as string | null,
    target_date: params.targetDate,
    status: 'unpaid' as const,
    amount_due: params.amountDue ?? 0,
    amount_collected: null as number | null,
    guest_label: params.guestLabel?.trim() || null,
    note: params.note?.trim() || null,
    is_priority: params.isPriority === true,
    scheduled_by_staff_id: params.staffId,
    collected_at: null as string | null,
    collected_by_staff_id: null as string | null,
    payment_method: null as string | null,
  };

  const { data: existing } = await client
    .from('room_payment_jobs')
    .select('id')
    .eq('organization_id', params.organizationId)
    .eq('room_id', params.roomId)
    .eq('target_date', params.targetDate)
    .maybeSingle();

  if (existing?.id) {
    const { error: upErr } = await client
      .from('room_payment_jobs')
      .update({
        status: 'unpaid',
        amount_due: params.amountDue ?? 0,
        amount_collected: null,
        guest_label: params.guestLabel?.trim() || null,
        note: params.note?.trim() || null,
        is_priority: params.isPriority === true,
        scheduled_by_staff_id: params.staffId,
        collected_at: null,
        collected_by_staff_id: null,
        payment_method: null,
      })
      .eq('id', existing.id);
    if (upErr) throw new Error(upErr.message);
    return;
  }

  const { error: insErr } = await client.from('room_payment_jobs').insert(payload);
  if (insErr) throw new Error(insErr.message);
}

export async function scheduleRoomsForPayment(params: {
  organizationId: string;
  roomIds: string[];
  targetDate: string;
  staffId: string;
  amountDue?: number;
  note?: string | null;
  isPriority?: boolean;
}): Promise<{ count: number }> {
  let count = 0;
  for (const roomId of params.roomIds) {
    await upsertRoomJob({
      organizationId: params.organizationId,
      roomId,
      targetDate: params.targetDate,
      staffId: params.staffId,
      amountDue: params.amountDue,
      note: params.note,
      isPriority: params.isPriority,
    });
    count += 1;
  }
  return { count };
}

export async function schedulePaymentRoomByNumber(params: {
  organizationId: string;
  roomNumber: string;
  targetDate: string;
  staffId: string;
  amountDue?: number;
  note?: string | null;
  guestLabel?: string | null;
  isPriority?: boolean;
}): Promise<{ ok: true; roomNumber: string } | { ok: false; error: string }> {
  const rooms = await fetchOrgRooms(params.organizationId).catch(() => [] as RoomMeta[]);
  const match = rooms.find(
    (r) =>
      !r.labelOnly &&
      isPublicRoomId(r.id) &&
      r.room_number.trim().toLowerCase() === params.roomNumber.trim().toLowerCase()
  );

  if (match) {
    await upsertRoomJob({
      organizationId: params.organizationId,
      roomId: match.id,
      targetDate: params.targetDate,
      staffId: params.staffId,
      amountDue: params.amountDue,
      note: params.note,
      guestLabel: params.guestLabel,
      isPriority: params.isPriority,
    });
    return { ok: true, roomNumber: match.room_number };
  }

  const label = `${OPS_LABEL_PREFIX}${params.roomNumber.trim()}`;
  const client = supabase;
  const { data: existing } = await client
    .from('room_payment_jobs')
    .select('id')
    .eq('organization_id', params.organizationId)
    .eq('target_date', params.targetDate)
    .is('room_id', null)
    .ilike('location_label', label)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await client
      .from('room_payment_jobs')
      .update({
        status: 'unpaid',
        amount_due: params.amountDue ?? 0,
        amount_collected: null,
        guest_label: params.guestLabel?.trim() || null,
        note: params.note?.trim() || null,
        is_priority: params.isPriority === true,
        scheduled_by_staff_id: params.staffId,
        collected_at: null,
        collected_by_staff_id: null,
        payment_method: null,
      })
      .eq('id', existing.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await client.from('room_payment_jobs').insert({
      organization_id: params.organizationId,
      room_id: null,
      location_label: label,
      target_date: params.targetDate,
      status: 'unpaid',
      amount_due: params.amountDue ?? 0,
      guest_label: params.guestLabel?.trim() || null,
      note: params.note?.trim() || null,
      is_priority: params.isPriority === true,
      scheduled_by_staff_id: params.staffId,
    });
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true, roomNumber: params.roomNumber.trim() };
}

export async function updatePaymentJobStatus(params: {
  jobId: string;
  status: RoomPaymentStatus;
  staffId: string;
  amountCollected?: number | null;
  paymentMethod?: RoomPaymentMethod | null;
  note?: string | null;
  voiceNoteUrl?: string | null;
  voiceNoteDurationSec?: number | null;
}): Promise<void> {
  const patch: Record<string, unknown> = {
    status: params.status,
  };
  if (params.status === 'collected') {
    patch.collected_at = new Date().toISOString();
    patch.collected_by_staff_id = params.staffId;
    if (params.amountCollected != null) patch.amount_collected = params.amountCollected;
    if (params.paymentMethod) patch.payment_method = params.paymentMethod;
  } else {
    patch.collected_at = null;
    patch.collected_by_staff_id = null;
    if (params.status === 'unpaid') {
      patch.amount_collected = null;
      patch.payment_method = null;
    }
  }
  if (params.note !== undefined) patch.note = params.note?.trim() || null;
  if (params.voiceNoteUrl !== undefined) {
    patch.voice_note_url = params.voiceNoteUrl?.trim() || null;
    if (!params.voiceNoteUrl) patch.voice_note_duration_sec = null;
  }
  if (params.voiceNoteDurationSec !== undefined) {
    patch.voice_note_duration_sec = params.voiceNoteDurationSec;
  }
  const { error } = await supabase.from('room_payment_jobs').update(patch).eq('id', params.jobId);
  if (error) throw new Error(error.message);
}

export async function updatePaymentJobAmounts(params: {
  jobId: string;
  amountDue?: number;
  amountCollected?: number | null;
  paymentMethod?: RoomPaymentMethod | null;
  note?: string | null;
  guestLabel?: string | null;
  isPriority?: boolean;
  voiceNoteUrl?: string | null;
  voiceNoteDurationSec?: number | null;
}): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (params.amountDue != null) patch.amount_due = params.amountDue;
  if (params.amountCollected !== undefined) patch.amount_collected = params.amountCollected;
  if (params.paymentMethod !== undefined) patch.payment_method = params.paymentMethod;
  if (params.note !== undefined) patch.note = params.note?.trim() || null;
  if (params.guestLabel !== undefined) patch.guest_label = params.guestLabel?.trim() || null;
  if (params.isPriority !== undefined) patch.is_priority = params.isPriority;
  if (params.voiceNoteUrl !== undefined) {
    patch.voice_note_url = params.voiceNoteUrl?.trim() || null;
    if (!params.voiceNoteUrl) patch.voice_note_duration_sec = null;
  }
  if (params.voiceNoteDurationSec !== undefined) {
    patch.voice_note_duration_sec = params.voiceNoteDurationSec;
  }
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from('room_payment_jobs').update(patch).eq('id', params.jobId);
  if (error) throw new Error(error.message);
}

/** Oda ödeme ses notunu storage’a yükler */
export async function uploadRoomPaymentVoiceNote(
  organizationId: string,
  localUri: string
): Promise<{ url: string }> {
  const buffer = await readVoiceRecordingBuffer(localUri);
  const { mime, ext } = getMimeAndExt(localUri, 'audio');
  const { publicUrl } = await uploadBufferToPublicBucket({
    bucketId: 'message-media',
    buffer,
    contentType: mime,
    extension: ext,
    subfolder: `room-payment/${organizationId}`,
  });
  return { url: publicUrl };
}

export async function setPaymentJobPriority(jobId: string, isPriority: boolean): Promise<void> {
  const { error } = await supabase
    .from('room_payment_jobs')
    .update({ is_priority: isPriority })
    .eq('id', jobId);
  if (error) throw new Error(error.message);
}

export async function removePaymentJob(jobId: string): Promise<void> {
  const { error } = await supabase.from('room_payment_jobs').delete().eq('id', jobId);
  if (error) throw new Error(error.message);
}

export function subscribePaymentJobs(
  organizationId: string,
  _targetDate: string,
  onChange: () => void
): RealtimeChannel {
  const channel = supabase
    .channel(`payment-jobs-${organizationId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'room_payment_jobs',
        filter: `organization_id=eq.${organizationId}`,
      },
      () => onChange()
    )
    .subscribe();
  return channel;
}

/** Resepsiyon + aynı org admin’lere push + in-app */
export async function notifyRoomPaymentBoard(params: {
  organizationId: string;
  createdByStaffId: string;
  title: string;
  body: string;
  notificationType?: string;
  data?: Record<string, unknown>;
  excludeStaffIds?: string[];
}): Promise<void> {
  const exclude = params.excludeStaffIds ?? [];
  const notificationType = params.notificationType ?? 'staff_room_payment_status';
  const data = {
    url: '/staff/payment-board',
    screen: '/staff/payment-board',
    ...(params.data ?? {}),
  };

  await Promise.all([
    sendBulkToStaff({
      target: 'reception',
      organizationId: params.organizationId,
      title: params.title,
      body: params.body,
      createdByStaffId: params.createdByStaffId,
      notificationType,
      category: 'staff',
      data,
      excludeStaffIds: exclude,
    }),
    (async () => {
      const { data: admins } = await supabase
        .from('staff')
        .select('id')
        .eq('organization_id', params.organizationId)
        .eq('role', 'admin')
        .eq('is_active', true)
        .is('deleted_at', null);
      const ids = (admins ?? [])
        .map((s: { id: string }) => s.id)
        .filter((id: string) => !exclude.includes(id));
      if (!ids.length) return;
      await sendNotificationToStaffIds({
        staffIds: ids,
        title: params.title,
        body: params.body,
        createdByStaffId: params.createdByStaffId,
        notificationType,
        category: 'admin',
        data,
      });
    })(),
  ]);
}

export function paymentStatusNotifyCopy(
  status: RoomPaymentStatus,
  roomNumber: string,
  actorName: string,
  amount?: number | null,
  extras?: { note?: string | null; hasVoice?: boolean }
): { title: string; body: string } {
  const money = amount != null ? ` · ${formatPaymentMoney(amount)}` : '';
  const noteBit = extras?.note?.trim() ? ` — ${extras.note.trim().slice(0, 80)}` : '';
  const voiceBit = extras?.hasVoice ? ' · Sesli not var' : '';
  if (status === 'collected') {
    return {
      title: `Ödeme alındı · Oda ${roomNumber}`,
      body: `${actorName} oda ${roomNumber} ödemesini aldı${money}${noteBit}${voiceBit}`,
    };
  }
  if (status === 'waiting') {
    return {
      title: `Ödeme bekliyor · Oda ${roomNumber}`,
      body: `${actorName} oda ${roomNumber} ödemesini bekliyor olarak işaretledi${money}${noteBit}${voiceBit}`,
    };
  }
  return {
    title: `Oda ödemesi alınacak · ${roomNumber}`,
    body: `${actorName} oda ${roomNumber} için ödeme bekleniyor${money}${noteBit}${voiceBit}`,
  };
}
