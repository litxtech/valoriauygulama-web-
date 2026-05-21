import { supabase } from '@/lib/supabase';
import type {
  LostFoundCategory,
  LostFoundLocationType,
  LostFoundStatus,
  LostFoundValueTier,
} from '@/lib/lostFoundCatalog';

export type LostFoundPhotoRow = {
  id: string;
  storage_path: string;
  public_url: string;
  sort_order: number;
};

export type LostFoundItemRow = {
  id: string;
  organization_id: string;
  reference_code: string;
  title: string;
  description: string | null;
  category: LostFoundCategory;
  value_tier: LostFoundValueTier;
  found_location_type: LostFoundLocationType;
  found_location_detail: string | null;
  room_id: string | null;
  guest_id: string | null;
  found_at: string;
  storage_location: string | null;
  status: LostFoundStatus;
  registered_by_staff_id: string;
  returned_at: string | null;
  returned_by_staff_id: string | null;
  returned_to_name: string | null;
  returned_to_phone: string | null;
  return_note: string | null;
  disposed_at: string | null;
  disposed_by_staff_id: string | null;
  dispose_note: string | null;
  retention_until: string;
  created_at: string;
  updated_at: string;
  registrar?: { full_name: string | null } | null;
  room?: { room_number: string | null } | null;
  guest?: { full_name: string | null } | null;
  photos?: LostFoundPhotoRow[];
};

const LIST_SELECT = `
  id,
  reference_code,
  title,
  description,
  category,
  value_tier,
  found_location_type,
  found_location_detail,
  room_id,
  guest_id,
  found_at,
  storage_location,
  status,
  retention_until,
  created_at,
  returned_at,
  room:rooms(room_number),
  photos:lost_found_item_photos(id, public_url, sort_order)
`;

const DETAIL_SELECT = `
  id,
  organization_id,
  reference_code,
  title,
  description,
  category,
  value_tier,
  found_location_type,
  found_location_detail,
  room_id,
  guest_id,
  found_at,
  storage_location,
  status,
  registered_by_staff_id,
  returned_at,
  returned_by_staff_id,
  returned_to_name,
  returned_to_phone,
  return_note,
  disposed_at,
  disposed_by_staff_id,
  dispose_note,
  retention_until,
  created_at,
  updated_at,
  registrar:staff!lost_found_items_registered_by_staff_id_fkey(full_name),
  room:rooms(room_number),
  guest:guests(full_name),
  photos:lost_found_item_photos(id, storage_path, public_url, sort_order)
`;

export type CreateLostFoundInput = {
  title: string;
  description?: string | null;
  category: LostFoundCategory;
  valueTier: LostFoundValueTier;
  foundLocationType: LostFoundLocationType;
  foundLocationDetail?: string | null;
  roomId?: string | null;
  guestId?: string | null;
  foundAt?: string;
  storageLocation?: string | null;
  photos: { storagePath: string; publicUrl: string }[];
};

export async function listLostFoundItems(
  status: LostFoundStatus
): Promise<{ data: LostFoundItemRow[]; error?: string }> {
  const { data, error } = await supabase
    .from('lost_found_items')
    .select(LIST_SELECT)
    .eq('status', status)
    .order(status === 'stored' ? 'found_at' : 'updated_at', { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as LostFoundItemRow[] };
}

export async function getLostFoundCounts(): Promise<{
  data: Record<LostFoundStatus, number>;
  error?: string;
}> {
  const counts: Record<LostFoundStatus, number> = { stored: 0, returned: 0, disposed: 0 };
  for (const status of ['stored', 'returned', 'disposed'] as const) {
    const { count, error } = await supabase
      .from('lost_found_items')
      .select('id', { count: 'exact', head: true })
      .eq('status', status);
    if (error) return { data: counts, error: error.message };
    counts[status] = count ?? 0;
  }
  return { data: counts };
}

export async function getLostFoundItem(
  id: string
): Promise<{ data: LostFoundItemRow | null; error?: string }> {
  const { data, error } = await supabase.from('lost_found_items').select(DETAIL_SELECT).eq('id', id).maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null };
  const row = data as LostFoundItemRow;
  if (row.photos) {
    row.photos.sort((a, b) => a.sort_order - b.sort_order);
  }
  return { data: row };
}

export async function createLostFoundItem(
  organizationId: string,
  staffId: string,
  input: CreateLostFoundInput
): Promise<{ data: LostFoundItemRow | null; error?: string }> {
  const { data: inserted, error } = await supabase
    .from('lost_found_items')
    .insert({
      organization_id: organizationId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      category: input.category,
      value_tier: input.valueTier,
      found_location_type: input.foundLocationType,
      found_location_detail: input.foundLocationDetail?.trim() || null,
      room_id: input.roomId || null,
      guest_id: input.guestId || null,
      found_at: input.foundAt ?? new Date().toISOString(),
      storage_location: input.storageLocation?.trim() || null,
      registered_by_staff_id: staffId,
      status: 'stored',
    })
    .select('id')
    .single();

  if (error || !inserted?.id) {
    return { data: null, error: error?.message ?? 'Kayıt oluşturulamadı' };
  }

  if (input.photos.length > 0) {
    const photoRows = input.photos.map((p, i) => ({
      item_id: inserted.id,
      storage_path: p.storagePath,
      public_url: p.publicUrl,
      sort_order: i,
    }));
    const { error: photoErr } = await supabase.from('lost_found_item_photos').insert(photoRows);
    if (photoErr) {
      return { data: null, error: photoErr.message };
    }
  }

  return getLostFoundItem(inserted.id);
}

export async function updateLostFoundStorage(
  id: string,
  storageLocation: string | null
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('lost_found_items')
    .update({ storage_location: storageLocation?.trim() || null })
    .eq('id', id);
  return { error: error?.message };
}

export async function markLostFoundReturned(
  id: string,
  params: {
    returnedToName: string;
    returnedToPhone?: string | null;
    returnNote?: string | null;
  }
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('lost_found_items')
    .update({
      status: 'returned',
      returned_to_name: params.returnedToName.trim(),
      returned_to_phone: params.returnedToPhone?.trim() || null,
      return_note: params.returnNote?.trim() || null,
    })
    .eq('id', id);
  return { error: error?.message };
}

export async function markLostFoundDisposed(
  id: string,
  disposeNote?: string | null
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('lost_found_items')
    .update({
      status: 'disposed',
      dispose_note: disposeNote?.trim() || null,
    })
    .eq('id', id);
  return { error: error?.message };
}

export async function reopenLostFoundItem(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from('lost_found_items').update({ status: 'stored' }).eq('id', id);
  return { error: error?.message };
}

export type RoomOption = { id: string; room_number: string };

export async function listRoomsForLostFound(): Promise<{ data: RoomOption[]; error?: string }> {
  const { data, error } = await supabase
    .from('rooms')
    .select('id, room_number')
    .order('room_number', { ascending: true });
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as RoomOption[] };
}

export function daysUntilRetention(isoDate: string): number {
  const end = new Date(isoDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}
