export const LANGUAGES = [
  { code: 'tr', label: 'Türkçe' },
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'ru', label: 'Русский' },
  { code: 'es', label: 'Español' },
] as const;

export type LangCode = (typeof LANGUAGES)[number]['code'];

export const LANG_STORAGE_KEY = '@valoria/lang';

export const LAZY_LANG_CODES = new Set<LangCode>(['ar', 'de', 'fr', 'ru', 'es']);
