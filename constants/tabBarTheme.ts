/**
 * Misafir / personel alt tab bar: ortak canlı renkler.
 * (Admin paneli Stack — alt tab yok; bu tema orada kullanılmaz.)
 */
export const appTabBar = {
  /** Tab ada + alt güvenli alan: opak (yarı saydamda alt grimsi belli oluyordu) */
  background: '#FFFFFF',
  border: '#EEEEEE',
  /** Pasif ikon + etiket */
  inactive: '#6B7280',
  /** Bir sekme rengi bulunamazsa (fallback) */
  fallbackActive: '#6366F1',
  /** Misafir orta mesaj: tab satırına sığacak; Android’de kırpma/boş kutu riskini azaltır. */
  centerMessage: {
    size: 48,
    icon: 22,
    lift: -4,
  },
} as const;

export const appTabBarCustomer = {
  index: '#D97706',
  map: '#059669',
  'transfer-tour': '#2563EB',
  messages: '#EC4899',
  'dining-venues': '#7C3AED',
  complaints: '#DC2626',
  personel: '#0D9488',
  profile: '#DB2777',
} as const;

export const appTabBarStaff = {
  index: '#2563EB',
  tasks: '#CA8A04',
  stock: '#7C3AED',
  messages: '#EC4899',
  kbs: '#0D9488',
  acceptances: '#EA580C',
  admin: '#B91C1C',
  profile: '#4F46E5',
} as const;

export function vibrantIconColor(
  which: 'customer' | 'staff',
  routeName: string,
  focused: boolean
): string {
  if (!focused) return appTabBar.inactive;
  const m =
    which === 'customer' ? (appTabBarCustomer as Record<string, string>)[routeName] : (appTabBarStaff as Record<string, string>)[routeName];
  return m ?? appTabBar.fallbackActive;
}
