import { supabase } from '@/lib/supabase';
import { PTT_DEFAULT_ROOM_SLUG } from '@/lib/ptt/channels';

export type PttStaffPreview = {
  id: string;
  full_name: string | null;
  profile_image: string | null;
};

export type StaffPttRoom = {
  id: string;
  slug: string;
  name: string;
  created_by: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at?: string;
  /** İstemci doldurur */
  isMember?: boolean;
  memberCount?: number;
  members?: PttStaffPreview[];
};

let cachedDefaultRoomId: string | null = null;
let ensureMembershipInflight: Promise<string | null> | null = null;
let listInflight: Promise<StaffPttRoom[]> | null = null;
let listInflightStaffId: string | null = null;
let listCache: { staffId: string; at: number; data: StaffPttRoom[] } | null = null;
const LIST_CACHE_MS = 10_000;

export function clearPttRoomsCache(): void {
  cachedDefaultRoomId = null;
  listCache = null;
}

export async function ensureDefaultPttMembership(): Promise<string | null> {
  if (ensureMembershipInflight) return ensureMembershipInflight;
  ensureMembershipInflight = (async () => {
    try {
      const { data, error } = await supabase.rpc('ensure_default_ptt_membership');
      if (error) {
        const room = await getDefaultPttRoom();
        return room?.id ?? null;
      }
      const id = typeof data === 'string' ? data : null;
      if (id) cachedDefaultRoomId = id;
      return id;
    } finally {
      ensureMembershipInflight = null;
    }
  })();
  return ensureMembershipInflight;
}

export async function getDefaultPttRoom(): Promise<StaffPttRoom | null> {
  if (cachedDefaultRoomId) {
    const { data } = await supabase
      .from('staff_ptt_rooms')
      .select('id, slug, name, created_by, is_default, is_active, created_at')
      .eq('id', cachedDefaultRoomId)
      .maybeSingle();
    if (data) return data as StaffPttRoom;
  }
  const { data } = await supabase
    .from('staff_ptt_rooms')
    .select('id, slug, name, created_by, is_default, is_active, created_at')
    .eq('is_default', true)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (data?.id) cachedDefaultRoomId = data.id;
  return (data as StaffPttRoom) ?? null;
}

export async function listStaffPttRooms(staffId: string | null | undefined): Promise<StaffPttRoom[]> {
  const sid = staffId ?? '';
  const now = Date.now();
  if (listCache && listCache.staffId === sid && now - listCache.at < LIST_CACHE_MS) {
    return listCache.data;
  }
  if (listInflight && listInflightStaffId === sid) return listInflight;

  listInflightStaffId = sid;
  listInflight = fetchStaffPttRoomsList(staffId)
    .then((data) => {
      listCache = { staffId: sid, at: Date.now(), data };
      return data;
    })
    .finally(() => {
      listInflight = null;
      listInflightStaffId = null;
    });
  return listInflight;
}

async function fetchStaffPttRoomsList(staffId: string | null | undefined): Promise<StaffPttRoom[]> {
  const { data: rooms, error } = await supabase
    .from('staff_ptt_rooms')
    .select('id, slug, name, created_by, is_default, is_active, created_at')
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(80);
  if (error || !rooms) return [];

  const ids = rooms.map((r) => r.id);
  const memberSet = new Set<string>();
  const membersByRoom = new Map<string, PttStaffPreview[]>();

  if (ids.length > 0) {
    const { data: members } = await supabase
      .from('staff_ptt_room_members')
      .select('room_id, staff_id')
      .in('room_id', ids);

    const staffIds = [...new Set((members ?? []).map((m) => m.staff_id as string).filter(Boolean))];
    const profileMap = new Map<string, PttStaffPreview>();
    if (staffIds.length > 0) {
      const { data: profiles } = await supabase
        .from('staff')
        .select('id, full_name, profile_image')
        .in('id', staffIds)
        .eq('is_active', true)
        .is('deleted_at', null);
      for (const p of profiles ?? []) {
        profileMap.set(p.id, {
          id: p.id,
          full_name: p.full_name ?? null,
          profile_image: p.profile_image ?? null,
        });
      }
    }

    for (const m of members ?? []) {
      const rid = m.room_id as string;
      const sid = m.staff_id as string;
      if (staffId && sid === staffId) memberSet.add(rid);
      const profile = profileMap.get(sid);
      if (!profile) continue;
      const arr = membersByRoom.get(rid) ?? [];
      arr.push(profile);
      membersByRoom.set(rid, arr);
    }

    for (const arr of membersByRoom.values()) {
      arr.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'tr'));
    }
  }

  return (rooms as StaffPttRoom[]).map((r) => {
    const members = membersByRoom.get(r.id) ?? [];
    return {
      ...r,
      isMember: memberSet.has(r.id),
      memberCount: members.length,
      members,
      name: r.is_default && r.slug === PTT_DEFAULT_ROOM_SLUG ? r.name : r.name,
    };
  });
}

export async function createStaffPttRoom(name: string): Promise<string> {
  listCache = null;
  const { data, error } = await supabase.rpc('create_staff_ptt_room', { p_name: name.trim() });
  if (error || typeof data !== 'string') {
    throw new Error(error?.message || 'Oda oluşturulamadı.');
  }
  return data;
}

export async function joinStaffPttRoom(roomId: string): Promise<void> {
  listCache = null;
  const { data, error } = await supabase.rpc('join_staff_ptt_room', { p_room_id: roomId });
  if (error || data === false) {
    throw new Error(error?.message || 'Odaya katılınamadı.');
  }
}

export async function leaveStaffPttRoom(roomId: string): Promise<void> {
  listCache = null;
  const { data, error } = await supabase.rpc('leave_staff_ptt_room', { p_room_id: roomId });
  if (error || data === false) {
    throw new Error(error?.message || 'Odadan çıkılamadı.');
  }
}

export async function addStaffPttRoomMembers(roomId: string, staffIds: string[]): Promise<number> {
  const ids = [...new Set(staffIds.filter(Boolean))];
  if (ids.length === 0) return 0;
  listCache = null;
  const { data, error } = await supabase.rpc('add_staff_ptt_room_members', {
    p_room_id: roomId,
    p_staff_ids: ids,
  });
  if (error) {
    throw new Error(error.message || 'Üye eklenemedi.');
  }
  return typeof data === 'number' ? data : ids.length;
}

export async function removeStaffPttRoomMember(roomId: string, staffId: string): Promise<void> {
  listCache = null;
  const { data, error } = await supabase.rpc('remove_staff_ptt_room_member', {
    p_room_id: roomId,
    p_staff_id: staffId,
  });
  if (error || data === false) {
    throw new Error(error?.message || 'Üye çıkarılamadı.');
  }
}

/** Feed/FAB: üye olunan aktif oda (default tercih). */
export async function resolveActivePttRoomId(staffId: string | null | undefined): Promise<string | null> {
  await ensureDefaultPttMembership();
  const rooms = await listStaffPttRooms(staffId);
  const member = rooms.filter((r) => r.isMember);
  const def = member.find((r) => r.is_default) || member[0] || null;
  return def?.id ?? null;
}
