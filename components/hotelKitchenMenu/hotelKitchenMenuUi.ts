import { theme } from '@/constants/theme';

/** Otel mutfağı — Valoria ana renkler (altın + lacivert), mavi yok */
export const menuUi = {
  navy: '#1a365d',
  navyMid: '#2c4a6e',
  navySoft: '#3d5a80',
  heroGradient: ['#1a365d', '#243b55', '#1a365d'] as const,
  heroGradientLight: ['#faf8f5', '#fffdf8', '#f8f6f2'] as const,
  accent: theme.colors.primary,
  accentLight: theme.colors.primaryLight,
  accentSoft: '#f5ead4',
  accentDeep: theme.colors.primaryDark,
  warmBg: '#f7f5f2',
  cardBg: '#ffffff',
  imagePlaceholder: '#ebe6df',
  price: theme.colors.primaryDark,
  priceBg: '#faf3e4',
  favorite: '#c2410c',
  textOnImage: '#ffffff',
  liveGreen: '#16a34a',
  liveGreenBg: '#ecfdf3',
  border: 'rgba(26, 54, 93, 0.08)',
  shadow: {
    shadowColor: '#1a365d',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 6,
  },
  shadowSm: {
    shadowColor: '#1a365d',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  shadowMd: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 8,
  },
  shadowLg: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.14,
    shadowRadius: 40,
    elevation: 12,
  },
  webHeroGradient: ['#0c1829', '#1a365d', '#243b55', '#1a365d'] as const,
  webHeroGlow: 'rgba(212, 168, 75, 0.18)',
  webGlass: 'rgba(255, 255, 255, 0.92)',
  webGlassBorder: 'rgba(255, 255, 255, 0.55)',
  webSurface: '#faf9f7',
  webMuted: '#64748b',
  webText: '#0f172a',
} as const;

/** Web kart hover — RN Web style object */
export const menuWebCardHover = {
  transition: 'transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.22s ease',
  cursor: 'pointer',
} as object;

/** Kategori vurgusu — mavi yerine marka tonları */
export function categoryAccentColor(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('kahvalt') || t.includes('breakfast')) return '#b45309';
  if (t.includes('içecek') || t.includes('icecek') || t.includes('drink') || t.includes('beverage')) return menuUi.navyMid;
  if (t.includes('tatlı') || t.includes('tatli') || t.includes('dessert')) return '#9d174d';
  if (t.includes('salata') || t.includes('salad')) return '#166534';
  if (t.includes('izgara') || t.includes('grill') || t.includes('kebap')) return menuUi.accentDeep;
  return menuUi.accent;
}
