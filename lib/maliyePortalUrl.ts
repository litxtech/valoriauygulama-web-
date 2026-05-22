import { supabaseUrl } from '@/lib/supabase';
import { FIXED_MALIYE_QR_TOKEN } from '@/constants/maliyeQr';

/** Canlı Supabase Edge portalı (PIN + evraklar + müşteri formları — public-maliye) */
export function buildPublicMaliyePortalUrl(token?: string): string {
  const base = (supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  if (!base) return '';
  const t = (token?.trim() || FIXED_MALIYE_QR_TOKEN).trim();
  return `${base}/functions/v1/public-maliye?token=${encodeURIComponent(t)}`;
}

export function isMaliyePortalUrl(href: string): boolean {
  return href.includes('/functions/v1/public-maliye');
}
