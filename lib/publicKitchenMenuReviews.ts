import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase';

export type KitchenMenuReviewMedia = {
  url: string;
  type: 'image' | 'video';
  mime?: string;
  name?: string;
};

export type KitchenMenuReview = {
  id: string;
  rating: number;
  comment: string | null;
  display_name: string | null;
  media_urls: KitchenMenuReviewMedia[];
  created_at: string;
};

function reviewsBase(): string {
  const base = (supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  return `${base}/functions/v1/public-kitchen-menu-reviews`;
}

function anonKey(): string {
  return supabaseAnonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
}

function authHeaders(json = true): Record<string, string> {
  const key = anonKey();
  const h: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    apikey: key,
  };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

function normalizeMedia(raw: unknown): KitchenMenuReviewMedia[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const url = String(row.url ?? '').trim();
      if (!url.startsWith('http')) return null;
      const mime = String(row.mime ?? '').toLowerCase();
      const type = row.type === 'video' || mime.startsWith('video/') ? 'video' : 'image';
      return {
        url,
        type: type as 'image' | 'video',
        mime: mime || undefined,
        name: typeof row.name === 'string' ? row.name : undefined,
      };
    })
    .filter(Boolean) as KitchenMenuReviewMedia[];
}

function mapReview(raw: Record<string, unknown>): KitchenMenuReview {
  return {
    id: String(raw.id),
    rating: Number(raw.rating) || 0,
    comment: (raw.comment as string | null) ?? null,
    display_name: (raw.display_name as string | null) ?? null,
    media_urls: normalizeMedia(raw.media_urls),
    created_at: String(raw.created_at ?? ''),
  };
}

export async function listKitchenMenuItemReviews(params: {
  orgSlug: string;
  itemId: string;
}): Promise<KitchenMenuReview[]> {
  const url = `${reviewsBase()}?slug=${encodeURIComponent(params.orgSlug)}&item_id=${encodeURIComponent(params.itemId)}`;
  const res = await fetch(url, { headers: authHeaders(false) });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    reviews?: Record<string, unknown>[];
    error?: string;
  };
  if (!res.ok || !data.ok) throw new Error(data.error || 'Yorumlar yüklenemedi');
  return (data.reviews ?? []).map(mapReview);
}

export async function requestKitchenMenuReviewSignedUpload(mime: string): Promise<{
  path: string;
  token: string;
  signedUrl: string | null;
  publicUrl: string;
  type: 'image' | 'video';
  mime: string;
}> {
  const res = await fetch(reviewsBase(), {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({ action: 'signed-upload', mime }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || !data.ok) throw new Error(String(data.error || 'Yükleme linki alınamadı'));
  return {
    path: String(data.path),
    token: String(data.token),
    signedUrl: typeof data.signedUrl === 'string' ? data.signedUrl : null,
    publicUrl: String(data.publicUrl),
    type: data.type === 'video' ? 'video' : 'image',
    mime: String(data.mime || mime),
  };
}

export async function uploadKitchenMenuReviewFile(file: {
  uri: string;
  mime: string;
  name?: string;
}): Promise<KitchenMenuReviewMedia> {
  const signed = await requestKitchenMenuReviewSignedUpload(file.mime || 'image/jpeg');
  const fileRes = await fetch(file.uri);
  const blob = await fileRes.blob();

  let ok = false;
  if (signed.signedUrl) {
    const put = await fetch(signed.signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.mime || 'application/octet-stream' },
      body: blob,
    });
    ok = put.ok;
  }
  if (!ok) {
    const base = (supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
    const alt = await fetch(`${base}/storage/v1/object/kitchen-menu-reviews/${signed.path}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${signed.token}`,
        apikey: anonKey(),
        'Content-Type': file.mime || 'application/octet-stream',
        'x-upsert': 'false',
      },
      body: blob,
    });
    if (!alt.ok) throw new Error('Medya yüklenemedi');
  }

  return {
    url: signed.publicUrl,
    type: signed.type,
    mime: signed.mime,
    name: file.name,
  };
}

export async function submitKitchenMenuItemReview(params: {
  orgSlug: string;
  itemId: string;
  rating: number;
  displayName: string;
  comment?: string;
  media?: KitchenMenuReviewMedia[];
}): Promise<{
  review: KitchenMenuReview;
  review_count: number;
  rating_avg: number;
}> {
  const res = await fetch(reviewsBase(), {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({
      action: 'submit',
      slug: params.orgSlug,
      item_id: params.itemId,
      rating: params.rating,
      display_name: params.displayName,
      comment: params.comment ?? '',
      media_urls: params.media ?? [],
    }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || !data.ok) throw new Error(String(data.error || 'Yorum gönderilemedi'));
  return {
    review: mapReview((data.review as Record<string, unknown>) ?? {}),
    review_count: Number(data.review_count ?? 0),
    rating_avg: Number(data.rating_avg ?? 0),
  };
}
