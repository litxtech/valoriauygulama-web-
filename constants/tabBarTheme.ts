/**
 * Misafir / personel alt tab bar: ortak canlı renkler.
 * (Admin paneli Stack — alt tab yok; bu tema orada kullanılmaz.)
 */
export const appTabBar = {
  /** Dış tab bar kabuğu — içerik alttan görünsün (iOS yüzen ada) */
  shellBackground: 'transparent',
  /** Eski opak fallback (artık tab shell’de kullanılmıyor) */
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
  /** Orta kimlik çekim kamera butonu (mesaj butonu ile aynı ölçü — etiket taşmasın). */
  centerIdCapture: {
    size: 36,
    icon: 20,
  },
} as const;

/** Instagram tarzı buzlu cam — yoğun blur + çok ince yarı saydam dolgu + parlak üst kenar */
export const appTabBarGlass = {
  light: {
    blurIntensity: 100,
    fill: 'rgba(255,255,255,0.40)',
    border: 'rgba(15,23,42,0.08)',
    /** Cam üst kenarındaki ışık çizgisi (buz parıltısı) */
    highlight: 'rgba(255,255,255,0.65)',
  },
  dark: {
    blurIntensity: 100,
    fill: 'rgba(20,22,30,0.42)',
    border: 'rgba(255,255,255,0.12)',
    highlight: 'rgba(255,255,255,0.18)',
  },
} as const;

/** Partner portal tab bar cam katmanı — koyu zeminde belirgin iOS cam halkası */
export const appTabBarPartnerGlass = {
  blurIntensity: 96,
  fill: 'rgba(255, 255, 255, 0.07)',
  border: 'rgba(255, 255, 255, 0.16)',
} as const;

/** Karanlık mod tab bar — #666/#777 kullanılmaz */
export const appTabBarNight = {
  shellBackground: 'transparent',
  background: '#171923',
  border: 'rgba(255,255,255,0.08)',
  inactive: '#A7B0C0',
  fallbackActive: '#7C5CFF',
  centerMessage: appTabBar.centerMessage,
  centerIdCapture: appTabBar.centerIdCapture,
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
  'id-capture': '#2563EB',
  kbs: '#0D9488',
  acceptances: '#EA580C',
  admin: '#B91C1C',
  profile: '#4F46E5',
} as const;

export const appTabBarPartner = {
  index: '#a78bfa',
  teyit: '#f59e0b',
  history: '#60a5fa',
  notifications: '#f472b6',
  account: '#34d399',
  profile: '#c084fc',
} as const;

export function vibrantPartnerIconColor(routeName: string, focused: boolean): string {
  if (!focused) return '#64748b';
  return (appTabBarPartner as Record<string, string>)[routeName] ?? '#f59e0b';
}

