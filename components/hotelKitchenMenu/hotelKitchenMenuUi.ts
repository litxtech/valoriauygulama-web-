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
  webGlass: 'rgba(255, 255, 255, 0.94)',
  webGlassBorder: 'rgba(255, 255, 255, 0.65)',
  webSurface: '#f5f0e8',
  webSurfaceAlt: '#faf7f2',
  webMuted: '#64748b',
  webText: '#0f172a',
  webGoldLine: 'rgba(212, 168, 75, 0.55)',
} as const;

/** Web sayfa arka planı — sıcak degrade + hafif altın/lacivert lekeler */
export const menuWebPageBg = {
  backgroundImage:
    'radial-gradient(ellipse 80% 50% at 15% -5%, rgba(212,168,75,0.14) 0%, transparent 55%), radial-gradient(ellipse 60% 40% at 95% 5%, rgba(26,54,93,0.08) 0%, transparent 50%), linear-gradient(180deg, #f3ece0 0%, #faf7f2 35%, #f8f5ef 100%)',
  minHeight: '100%',
} as object;

/** Web kart hover — RN Web style object */
export const menuWebCardHover = {
  transition: 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.28s ease',
  cursor: 'pointer',
} as object;

export const menuWebCardHoverLift = {
  ...menuWebCardHover,
  ':hover': {
    transform: 'translateY(-4px)',
    boxShadow: '0 20px 40px rgba(26, 54, 93, 0.14), 0 0 0 1px rgba(212, 168, 75, 0.25)',
  },
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
