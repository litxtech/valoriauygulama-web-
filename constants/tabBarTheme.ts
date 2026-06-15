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
  /** Orta mesaj: tabBarIcon slotunda; yan ikonlardan hafif büyük daire. */
  centerMessage: {
    size: 36,
    icon: 20,
  },
} as const;

/** Karanlık mod tab bar — #666/#777 kullanılmaz */
export const appTabBarNight = {
  background: '#171923',
  border: 'rgba(255,255,255,0.08)',
  inactive: '#A7B0C0',
  fallbackActive: '#7C5CFF',
  centerMessage: appTabBar.centerMessage,
} as const;

export type AppTabBarColors = typeof appTabBar;

export function getAppTabBarColors(isNight: boolean): AppTabBarColors {
  return isNight ? appTabBarNight : appTabBar;
}

export function vibrantIconColor(
  which: 'customer' | 'staff',
  routeName: string,
  focused: boolean,
  isNight = false
): string {
  if (!focused) return getAppTabBarColors(isNight).inactive;
  const m =
    which === 'customer'
      ? (appTabBarCustomer as Record<string, string>)[routeName]
      : (appTabBarStaff as Record<string, string>)[routeName];
  return m ?? getAppTabBarColors(isNight).fallbackActive;
}

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

