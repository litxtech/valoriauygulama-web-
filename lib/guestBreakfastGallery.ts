import { supabase } from '@/lib/supabase';

export type GuestBreakfastGalleryItem = {
  id: string;
  record_date: string;
  guest_count: number;
  note: string | null;
  photo_urls: string[];
  submitted_at: string;
  staff_name: string | null;
};

function parseRow(raw: unknown): GuestBreakfastGalleryItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const photos = Array.isArray(r.photo_urls) ? r.photo_urls.filter((u): u is string => typeof u === 'string' && !!u.trim()) : [];
  return {
    id: String(r.id ?? ''),
    record_date: String(r.record_date ?? ''),
    guest_count: Number(r.guest_count) || 0,
    note: typeof r.note === 'string' ? r.note : null,
    photo_urls: photos,
    submitted_at: String(r.submitted_at ?? ''),
    staff_name: typeof r.staff_name === 'string' ? r.staff_name : null,
  };
}

export async function loadGuestBreakfastGallery(orgId: string | null, limit = 30): Promise<GuestBreakfastGalleryItem[]> {
  const { data, error } = await supabase.rpc('get_guest_breakfast_gallery', {
    p_organization_id: orgId,
    p_limit: limit,
  });
  if (error || !data) return [];
  if (!Array.isArray(data)) return [];
  return data.map(parseRow).filter((r): r is GuestBreakfastGalleryItem => !!r?.id);
}
