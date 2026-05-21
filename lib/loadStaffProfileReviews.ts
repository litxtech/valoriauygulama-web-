import type { HubReview } from '@/components/StaffEvaluationHub';
import { supabase } from '@/lib/supabase';

type ReviewRow = HubReview & { guest_id?: string };

/** Personel profil ekranı yorumları; misafir adı/oda zenginleştirmesi dahil. */
export async function loadStaffProfileReviews(staffId: string, limit = 80): Promise<HubReview[]> {
  const { data: r } = await supabase
    .from('staff_reviews')
    .select('id, rating, comment, created_at, guest_id, stay_room_label, stay_nights_label')
    .eq('staff_id', staffId)
    .order('created_at', { ascending: false })
    .limit(limit);

  const reviewRows = (r ?? []) as ReviewRow[];
  if (!reviewRows.some((x) => x.guest_id)) {
    return reviewRows.map((x) => ({
      id: x.id,
      rating: x.rating,
      comment: x.comment,
      created_at: x.created_at,
      stay_room_label: x.stay_room_label,
      stay_nights_label: x.stay_nights_label,
      guest: null,
    }));
  }

  const guestIds = [...new Set(reviewRows.map((x) => x.guest_id).filter(Boolean))] as string[];
  const { data: guests } = await supabase
    .from('guests')
    .select('id, full_name, room_id, photo_url')
    .in('id', guestIds);
  const guestList = (guests ?? []) as {
    id: string;
    full_name: string | null;
    room_id: string | null;
    photo_url: string | null;
  }[];
  const roomIds = [...new Set(guestList.map((g) => g.room_id).filter(Boolean))] as string[];
  let roomMap = new Map<string, string>();
  if (roomIds.length > 0) {
    const { data: rooms } = await supabase.from('rooms').select('id, room_number').in('id', roomIds);
    roomMap = new Map((rooms ?? []).map((ro: { id: string; room_number: string }) => [ro.id, ro.room_number]));
  }
  const guestMap = new Map(
    guestList.map((g) => [
      g.id,
      {
        full_name: g.full_name,
        room_number: g.room_id ? roomMap.get(g.room_id) ?? null : null,
        photo_url: g.photo_url,
      },
    ])
  );

  return reviewRows.map((x) => ({
    id: x.id,
    rating: x.rating,
    comment: x.comment,
    created_at: x.created_at,
    stay_room_label: x.stay_room_label,
    stay_nights_label: x.stay_nights_label,
    guest: x.guest_id ? guestMap.get(x.guest_id) ?? null : null,
  }));
}

export async function loadGuestMyReviewForStaff(
  staffId: string,
  viewerGuestId: string | null
): Promise<HubReview | null> {
  if (!viewerGuestId) return null;
  const { data: existing } = await supabase
    .from('staff_reviews')
    .select('id, rating, comment, created_at, stay_room_label, stay_nights_label')
    .eq('staff_id', staffId)
    .eq('guest_id', viewerGuestId)
    .limit(1)
    .maybeSingle();
  if (!existing) return null;
  return {
    id: existing.id,
    rating: existing.rating,
    comment: existing.comment,
    created_at: existing.created_at,
    stay_room_label: existing.stay_room_label,
    stay_nights_label: existing.stay_nights_label,
    guest: null,
  };
}
