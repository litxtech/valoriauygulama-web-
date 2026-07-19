import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { changeAppLanguage, LANG_STORAGE_KEY } from '@/i18n';

const STORAGE_KEY = 'valoria_public_menu_lang';

export type PublicMenuLang = 'tr' | 'en' | 'ar';

function isPublicMenuLang(v: string | null | undefined): v is PublicMenuLang {
  return v === 'tr' || v === 'en' || v === 'ar';
}

/** Web menü dilini oku — sessionStorage (sayfa oturumu) öncelikli */
export function readPublicMenuLang(): PublicMenuLang {
  if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (isPublicMenuLang(stored)) return stored;
  }
  return 'tr';
}

/** `/menu` yolu uygulama genel dilini ezmesin diye menü dilini sahiplen */
export function isPublicMenuWebPath(pathname?: string | null): boolean {
  if (Platform.OS !== 'web') return false;
  const path =
    pathname ??
    (typeof window !== 'undefined' ? window.location.pathname : '') ??
    '';
  return path === '/menu' || path.startsWith('/menu/');
}

export async function applyPublicMenuLang(lang: PublicMenuLang): Promise<void> {
  if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(STORAGE_KEY, lang);
  }
  // Root layout AsyncStorage ile geri yazmasın diye senkron tut
  try {
    await AsyncStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
  await changeAppLanguage(lang);
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }
}
