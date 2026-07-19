import { supabase } from '@/lib/supabase';

export type PublicMenuBreakfastItem = {
  id: string;
  record_date: string;
  guest_count: number;
  note: string | null;
  photo_urls: string[];
  submitted_at: string;
};

function parseRow(raw: unknown): PublicMenuBreakfastItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const photos = Array.isArray(r.photo_urls)
    ? r.photo_urls.filter((u): u is string => typeof u === 'string' && !!u.trim())
    : [];
  const id = typeof r.id === 'string' ? r.id : '';
  if (!id) return null;
  return {
    id,
    record_date: String(r.record_date ?? '').slice(0, 10),
    guest_count: Number(r.guest_count) || 0,
    note: typeof r.note === 'string' ? r.note : null,
    photo_urls: photos,
    submitted_at: String(r.submitted_at ?? ''),
  };
}

/** Public menü — onaylı kahvaltı teyitleri (anon RPC) */
export async function loadPublicMenuBreakfastGallery(
  organizationId: string,
  limit = 16
): Promise<PublicMenuBreakfastItem[]> {
  const org = organizationId.trim();
  if (!org) return [];

  const { data, error } = await supabase.rpc('get_public_menu_breakfast_gallery', {
    p_organization_id: org,
    p_limit: limit,
  });
  if (error || !data) return [];
  if (!Array.isArray(data)) return [];
  return data.map(parseRow).filter((r): r is PublicMenuBreakfastItem => !!r?.id);
}

export function formatBreakfastMenuDate(iso: string, lang?: string): string {
  const raw = (iso || '').slice(0, 10);
  const [y, m, d] = raw.split('-');
  if (!y || !m || !d) return iso;
  const code = (lang || 'tr').slice(0, 2).toLowerCase();
  if (code === 'en') return `${m}/${d}/${y}`;
  if (code === 'ar') return `${d}/${m}/${y}`;
  return `${d}.${m}.${y}`;
}
