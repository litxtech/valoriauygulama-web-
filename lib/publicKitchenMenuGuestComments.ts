import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase';

export type KitchenMenuGuestComment = {
  id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  initials: string;
  comment: string;
  rating: number;
  created_at: string;
};

function commentsBase(): string {
  const base = (supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  return `${base}/functions/v1/public-kitchen-menu-guest-comments`;
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

function mapComment(raw: Record<string, unknown>): KitchenMenuGuestComment {
  const first = String(raw.first_name ?? '').trim();
  const last = String(raw.last_name ?? '').trim();
  const initials =
    String(raw.initials ?? '').trim() ||
    `${first.charAt(0)}${last.charAt(0)}`.toLocaleUpperCase('tr-TR') ||
    '?';
  return {
    id: String(raw.id),
    first_name: first,
    last_name: last,
    display_name: String(raw.display_name ?? `${first} ${last}`.trim()),
    initials,
    comment: String(raw.comment ?? '').trim(),
    rating: Number(raw.rating) || 0,
    created_at: String(raw.created_at ?? ''),
  };
}

export async function listKitchenMenuGuestComments(params: {
  orgSlug: string;
}): Promise<{ comments: KitchenMenuGuestComment[]; count: number; rating_avg: number }> {
  const url = `${commentsBase()}?slug=${encodeURIComponent(params.orgSlug)}`;
  const res = await fetch(url, { headers: authHeaders(false) });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    comments?: Record<string, unknown>[];
    count?: number;
    rating_avg?: number;
    error?: string;
  };
  if (!res.ok || !data.ok) throw new Error(data.error || 'Yorumlar yüklenemedi');
  const comments = (data.comments ?? []).map(mapComment);
  return {
    comments,
    count: typeof data.count === 'number' ? data.count : comments.length,
    rating_avg: typeof data.rating_avg === 'number' ? data.rating_avg : 0,
  };
}

export async function submitKitchenMenuGuestComment(params: {
  orgSlug: string;
  firstName: string;
  lastName: string;
  comment: string;
  rating: number;
}): Promise<KitchenMenuGuestComment> {
  const res = await fetch(commentsBase(), {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({
      slug: params.orgSlug,
      first_name: params.firstName,
      last_name: params.lastName,
      comment: params.comment,
      rating: params.rating,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    comment?: Record<string, unknown>;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.comment) {
    throw new Error(data.error || 'Yorum gönderilemedi');
  }
  return mapComment(data.comment);
}

export function guestCommentInitials(firstName: string, lastName: string): string {
  const a = firstName.trim().charAt(0);
  const b = lastName.trim().charAt(0);
  return `${a}${b}`.toLocaleUpperCase('tr-TR') || '?';
}
