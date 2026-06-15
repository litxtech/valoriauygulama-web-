import i18n from '@/i18n';

/** Uygulama desteklediği diller (misafir / personel UI). */
export type AppLang = 'tr' | 'en' | 'ar' | 'de' | 'fr' | 'ru' | 'es';

const SUPPORTED: AppLang[] = ['tr', 'en', 'ar', 'de', 'fr', 'ru', 'es'];

/** `contract_lang`, AsyncStorage veya i18n.language → desteklenen dil kodu. */
export function resolveAppLang(raw?: string | null): AppLang {
  const code = (raw ?? i18n.language ?? 'tr').toLowerCase().split('-')[0] ?? 'tr';
  if (code.startsWith('en')) return 'en';
  if (code.startsWith('ar')) return 'ar';
  if (code.startsWith('de')) return 'de';
  if (code.startsWith('fr')) return 'fr';
  if (code.startsWith('ru')) return 'ru';
  if (code.startsWith('es')) return 'es';
  if (SUPPORTED.includes(code as AppLang)) return code as AppLang;
  return 'tr';
}
