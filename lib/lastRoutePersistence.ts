import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@valoria/last_route';

/** Ana uygulama rotaları: sadece bunları saklıyoruz (lobi/auth/guest değil). */
const MAIN_PREFIXES = ['/customer', '/staff', '/admin'] as const;

function isMainRoute(path: string): boolean {
  return MAIN_PREFIXES.some((p) => path === p || path.startsWith(p + '/'));
}

/**
 * Geçerli path'i sakla. Sadece /customer, /staff, /admin ve alt yolları kaydeder.
 */
export async function saveLastRoute(path: string): Promise<void> {
  if (!path || !isMainRoute(path)) return;
  try {
    await AsyncStorage.setItem(KEY, path);
  } catch {
    // ignore
  }
}

/**
 * Kayıtlı son rotayı oku.
 */
export async function getLastRoute(): Promise<string | null> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    return v && isMainRoute(v) ? v : null;
  } catch {
    return null;
  }
}

export async function clearLastRoute(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

type UserType = { staff: { role: string } | null; user: unknown } | null;

/**
 * Kullanıcı tipine göre bu path kullanılabilir mi?
 * - Admin: /admin veya /staff
 * - Personel: /staff
 * - Müşteri: /customer
 */
export function isRouteAllowedForUser(path: string, auth: UserType): boolean {
  if (!auth?.user && !auth?.staff) return false;
  if (path.startsWith('/customer')) return !!auth?.user;
  if (path.startsWith('/staff')) return !!auth?.staff;
  if (path.startsWith('/admin')) return !!auth?.staff && auth.staff.role === 'admin';
  return false;
}
