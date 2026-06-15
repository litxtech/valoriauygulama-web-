import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getDeviceLanguageCode } from '@/lib/deviceLocale';
import { applyLocaleGaps, patchSparseLocales } from './applyLocaleGaps';
import trTranslation from './locales/tr';
import enTranslation from './locales/en';
import { LANGUAGES, LANG_STORAGE_KEY, LAZY_LANG_CODES, type LangCode } from './languages';

try {
  console.log('[Valoria] [INFO] i18n yükleniyor');
} catch (_) {}

export { LANGUAGES, LANG_STORAGE_KEY, type LangCode };

const inFlight = new Map<LangCode, Promise<void>>();

/** Metro: değişken yol ile import() desteklenmez — her lazy dil için sabit yükleyici */
const lazyLocaleLoaders: Partial<
  Record<LangCode, () => Promise<{ default: Record<string, string> }>>
> = {
  ar: () => import('./locales/ar'),
  de: () => import('./locales/de'),
  fr: () => import('./locales/fr'),
  ru: () => import('./locales/ru'),
  es: () => import('./locales/es'),
};

const resources = {
  tr: { translation: { ...trTranslation } },
  en: { translation: { ...enTranslation } },
};

/** ar/de/fr/ru/es — ilk seçimde veya kayıtlı tercihte lazy import */
export async function ensureI18nLanguage(code: LangCode): Promise<void> {
  if (!LAZY_LANG_CODES.has(code)) return;
  if (i18n.hasResourceBundle(code, 'translation')) return;
  const pending = inFlight.get(code);
  if (pending) return pending;

  const loader = lazyLocaleLoaders[code];
  if (!loader) return;

  const job = (async () => {
    const mod = await loader();
    const bundle = { translation: { ...(mod.default as Record<string, string>) } };
    const merged = {
      tr: resources.tr,
      en: resources.en,
      [code]: bundle,
    };
    patchSparseLocales(merged, LANGUAGES);
    applyLocaleGaps(merged, LANGUAGES);
    i18n.addResourceBundle(code, 'translation', bundle.translation, true, true);
  })();

  inFlight.set(code, job);
  try {
    await job;
  } finally {
    inFlight.delete(code);
  }
}

export async function changeAppLanguage(code: LangCode): Promise<void> {
  await ensureI18nLanguage(code);
  await i18n.changeLanguage(code);
}

patchSparseLocales(resources, LANGUAGES);
applyLocaleGaps(resources, LANGUAGES);

const deviceLang = getDeviceLanguageCode() as LangCode;
const bootLng: LangCode =
  deviceLang === 'tr' || deviceLang === 'en' ? deviceLang : LAZY_LANG_CODES.has(deviceLang) ? 'en' : 'en';

i18n.use(initReactI18next).init({
  resources,
  lng: bootLng,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

console.log('[Valoria] [INFO] i18n init tamamlandı (tr+en; lazy:', [...LAZY_LANG_CODES].join(','), ')');

export default i18n;
