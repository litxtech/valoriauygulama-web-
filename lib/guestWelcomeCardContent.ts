import i18n from '@/i18n';
import { resolveAppLang, type AppLang } from '@/lib/appLang';
import { supabase } from '@/lib/supabase';

export type GuestWelcomeCardLangContent = {
  title: string;
  subtitle: string;
  profileHint: string;
  purposeTitle: string;
  purposeBody: string;
  featureRequests: string;
  featureComplaints: string;
  featureThanks: string;
  sla: string;
};

export type GuestWelcomeCardStored = {
  v?: number;
  tr?: Partial<GuestWelcomeCardLangContent>;
  en?: Partial<GuestWelcomeCardLangContent>;
};

export type GuestWelcomeCardLang = AppLang;

const I18N_KEYS: Record<keyof GuestWelcomeCardLangContent, string> = {
  title: 'guestWelcomeTitle',
  subtitle: 'guestWelcomeSubtitle',
  profileHint: 'guestWelcomeProfileHint',
  purposeTitle: 'guestWelcomePurposeTitle',
  purposeBody: 'guestWelcomePurposeBody',
  featureRequests: 'guestWelcomeFeatureRequests',
  featureComplaints: 'guestWelcomeFeatureComplaints',
  featureThanks: 'guestWelcomeFeatureThanks',
  sla: 'guestWelcomeSla',
};

export function guestWelcomeCardLang(): GuestWelcomeCardLang {
  return resolveAppLang();
}

export function defaultGuestWelcomeContent(lang: GuestWelcomeCardLang = guestWelcomeCardLang()): GuestWelcomeCardLangContent {
  const t = i18n.getFixedT(lang);
  return {
    title: t(I18N_KEYS.title),
    subtitle: t(I18N_KEYS.subtitle),
    profileHint: t(I18N_KEYS.profileHint),
    purposeTitle: t(I18N_KEYS.purposeTitle),
    purposeBody: t(I18N_KEYS.purposeBody),
    featureRequests: t(I18N_KEYS.featureRequests),
    featureComplaints: t(I18N_KEYS.featureComplaints),
    featureThanks: t(I18N_KEYS.featureThanks),
    sla: t(I18N_KEYS.sla),
  };
}

export function resolveGuestWelcomeContent(
  stored: GuestWelcomeCardStored | null | undefined,
  lang: GuestWelcomeCardLang = guestWelcomeCardLang()
): GuestWelcomeCardLangContent {
  const defaults = defaultGuestWelcomeContent(lang);
  const overrides = stored?.[lang] ?? stored?.en ?? stored?.tr;
  if (!overrides) return defaults;
  const out = { ...defaults };
  for (const key of Object.keys(I18N_KEYS) as (keyof GuestWelcomeCardLangContent)[]) {
    const val = overrides[key]?.trim();
    if (val) out[key] = val;
  }
  return out;
}

export async function fetchGuestWelcomeCardForGuest(guestId: string): Promise<GuestWelcomeCardStored | null> {
  const { data: guest, error: guestErr } = await supabase
    .from('guests')
    .select('organization_id')
    .eq('id', guestId)
    .maybeSingle();
  if (guestErr || !guest?.organization_id) return null;

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('guest_welcome_card')
    .eq('id', guest.organization_id)
    .maybeSingle();
  if (orgErr) return null;
  const raw = org?.guest_welcome_card;
  if (!raw || typeof raw !== 'object') return null;
  return raw as GuestWelcomeCardStored;
}

export async function fetchGuestWelcomeCardForOrganization(orgId: string): Promise<GuestWelcomeCardStored | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('guest_welcome_card')
    .eq('id', orgId)
    .maybeSingle();
  if (error) return null;
  const raw = data?.guest_welcome_card;
  if (!raw || typeof raw !== 'object') return null;
  return raw as GuestWelcomeCardStored;
}

export async function saveGuestWelcomeCardForOrganization(
  orgId: string,
  content: GuestWelcomeCardStored | null
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('organizations')
    .update({ guest_welcome_card: content ? { v: 1, ...content } : null })
    .eq('id', orgId);
  return { error: error?.message ?? null };
}

export const GUEST_WELCOME_FIELD_LABELS: Record<keyof GuestWelcomeCardLangContent, string> = {
  title: 'Başlık',
  subtitle: 'Alt başlık',
  profileHint: 'Profil düzenleme notu',
  purposeTitle: 'Uygulama amacı başlığı',
  purposeBody: 'Uygulama amacı metni',
  featureRequests: 'Madde — istek / talep',
  featureComplaints: 'Madde — şikâyet',
  featureThanks: 'Madde — teşekkür',
  sla: '5 dakika / işlem süresi notu',
};
