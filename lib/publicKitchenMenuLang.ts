import { Platform } from 'react-native';
import { changeAppLanguage } from '@/i18n';

const STORAGE_KEY = 'valoria_public_menu_lang';

export type PublicMenuLang = 'tr' | 'en' | 'ar';

export function readPublicMenuLang(): PublicMenuLang {
  if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored === 'tr' || stored === 'en' || stored === 'ar') return stored;
  }
  return 'tr';
}

export async function applyPublicMenuLang(lang: PublicMenuLang): Promise<void> {
  if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(STORAGE_KEY, lang);
  }
  await changeAppLanguage(lang);
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }
}
