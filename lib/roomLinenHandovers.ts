import { supabase } from '@/lib/supabase';

export type LinenItemType = 'blanket' | 'pillow' | 'towel' | 'duvet' | 'other';
export type LinenHandoverStatus = 'pending' | 'picked_up' | 'cancelled';

export type RoomLinenHandoverRow = {
  id: string;
  organization_id: string;
  room_id: string | null;
  room_number: string;
  item_type: LinenItemType;
  quantity: number;
  note: string | null;
  status: LinenHandoverStatus;
  delivered_by_staff_id: string;
  picked_up_by_staff_id: string | null;
  picked_up_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RoomLinenHandoverView = RoomLinenHandoverRow & {
  delivered_by_name?: string | null;
  picked_up_by_name?: string | null;
};

export const LINEN_ITEM_TYPES: LinenItemType[] = ['blanket', 'pillow', 'towel', 'duvet', 'other'];

export function linenItemTypeLabel(type: LinenItemType, t: (k: string) => string): string {
  const map: Record<LinenItemType, string> = {
    blanket: t('roomLinenItemBlanket'),
    pillow: t('roomLinenItemPillow'),
    towel: t('roomLinenItemTowel'),
    duvet: t('roomLinenItemDuvet'),
    other: t('roomLinenItemOther'),
  };
  return map[type] ?? type;
}

async function attachStaffNames(rows: RoomLinenHandoverRow[]): Promise<RoomLinenHandoverView[]> {
  if (rows.length === 0) return [];
  const staffIds = [
    ...new Set(
      rows.flatMap((r) => [r.delivered_by_staff_id, r.picked_up_by_staff_id].filter(Boolean) as string[])
    ),
  ];
  const nameById: Record<string, string> = {};
  if (staffIds.length > 0) {
    const { data } = await supabase.from('staff').select('id, full_name').in('id', staffIds);
    for (const s of data ?? []) {
      if (s.id) nameById[s.id] = s.full_name?.trim() || '—';
    }
  }
  return rows.map((r) => ({
    ...r,
    delivered_by_name: nameById[r.delivered_by_staff_id] ?? null,
    picked_up_by_name: r.picked_up_by_staff_id ? nameById[r.picked_up_by_staff_id] ?? null : null,
  }));
}

export async function fetchRoomLinenHandovers(
  organizationId: string,
  opts?: { status?: LinenHandoverStatus | 'all'; limit?: number }
): Promise<RoomLinenHandoverView[]> {
  let query = supabase
    .from('room_linen_handovers')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 200);

  if (opts?.status && opts.status !== 'all') {
    query = query.eq('status', opts.status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return attachStaffNames((data ?? []) as RoomLinenHandoverRow[]);
}

export async function resolveRoomIdByNumber(roomNumber: string): Promise<string | null> {
  const trimmed = roomNumber.trim();
  if (!trimmed) return null;
  const { data } = await supabase.from('rooms').select('id').eq('room_number', trimmed).maybeSingle();
  return data?.id ?? null;
}

export async function createRoomLinenHandover(params: {
  organizationId: string;
  roomNumber: string;
  itemType: LinenItemType;
  quantity: number;
  note?: string | null;
  deliveredByStaffId: string;
}): Promise<RoomLinenHandoverRow> {
  const roomNumber = params.roomNumber.trim();
  if (!roomNumber) throw new Error('room_number_required');

  const roomId = await resolveRoomIdByNumber(roomNumber);

  const { data, error } = await supabase
    .from('room_linen_handovers')
    .insert({
      organization_id: params.organizationId,
      room_id: roomId,
      room_number: roomNumber,
      item_type: params.itemType,
      quantity: params.quantity,
      note: params.note?.trim() || null,
      delivered_by_staff_id: params.deliveredByStaffId,
      status: 'pending',
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as RoomLinenHandoverRow;
}

export async function markRoomLinenPickedUp(id: string): Promise<void> {
  const { error } = await supabase
    .from('room_linen_handovers')
    .update({ status: 'picked_up' })
    .eq('id', id)
    .eq('status', 'pending');
  if (error) throw error;
}

export async function cancelRoomLinenHandover(id: string): Promise<void> {
  const { error } = await supabase
    .from('room_linen_handovers')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('status', 'pending');
  if (error) throw error;
}

export function buildLinenHandoverPushCopy(
  row: Pick<RoomLinenHandoverRow, 'room_number' | 'item_type' | 'quantity'>,
  t: (k: string, opts?: Record<string, unknown>) => string
): { title: string; body: string } {
  const itemLabel = linenItemTypeLabel(row.item_type, t);
  return {
    title: t('roomLinenPushTitle', { room: row.room_number }),
    body: t('roomLinenPushBody', { qty: row.quantity, item: itemLabel, room: row.room_number }),
  };
}
