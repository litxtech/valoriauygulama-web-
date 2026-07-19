import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase';

export type PublicComplaintResponsible = {
  name: string;
  title: string;
  brands: string;
  note: string;
  photoUrl: string | null;
  staffId: string | null;
};

const FALLBACK: PublicComplaintResponsible = {
  name: 'Soner',
  title: 'Valoria Hotel & Bavulsuite Sorumlusu',
  brands: 'Valoria Hotel · Bavulsuite',
  note: 'Anlık şikayet değerlendirilir. Mesajınız doğrudan sorumlu yöneticiye iletilir — giriş yapmanız gerekmez.',
  photoUrl: null,
  staffId: null,
};

function edgeBase(): string {
  return (supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
}

function anonKey(): string {
  return supabaseAnonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
}

/** Public menü / şikayet kartı — edge GET (anon) */
export async function fetchPublicComplaintResponsible(): Promise<PublicComplaintResponsible> {
  const base = edgeBase();
  const key = anonKey();
  if (!base || !key) return FALLBACK;

  try {
    const res = await fetch(`${base}/functions/v1/public-complaint`, {
      method: 'GET',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });
    if (!res.ok) return FALLBACK;
    const data = (await res.json()) as { responsible?: Partial<PublicComplaintResponsible> };
    const r = data.responsible;
    if (!r) return FALLBACK;
    return {
      name: (r.name || '').trim() || FALLBACK.name,
      title: (r.title || '').trim() || FALLBACK.title,
      brands: (r.brands || '').trim() || FALLBACK.brands,
      note: (r.note || '').trim() || FALLBACK.note,
      photoUrl: r.photoUrl?.trim() || null,
      staffId: r.staffId?.trim() || null,
    };
  } catch {
    return FALLBACK;
  }
}
