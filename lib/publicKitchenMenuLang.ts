import { Platform } from 'react-native';
import i18n from '@/i18n';

const STORAGE_KEY = 'valoria_public_menu_lang';

export type PublicMenuLang = 'en' | 'ar';

export function readPublicMenuLang(): PublicMenuLang {
  if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored === 'ar' || stored === 'en') return stored;
  }
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    const nav = navigator.language?.toLowerCase() ?? '';
    if (nav.startsWith('ar')) return 'ar';
  }
  return 'en';
}

export function applyPublicMenuLang(lang: PublicMenuLang) {
  if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(STORAGE_KEY, lang);
  }
  void i18n.changeLanguage(lang);
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }
}
