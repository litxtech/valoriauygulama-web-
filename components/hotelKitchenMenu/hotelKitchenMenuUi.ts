import { theme } from '@/constants/theme';

/** Canlı web menü build etiketi — deploy doğrulama */
export const PUBLIC_MENU_WEB_BUILD = '2026.07-v8.0';

/** Otel mutfağı — gece lacivert + şampanya altın */
export const menuUi = {
  navy: '#0a0f1a',
  navyMid: '#141c2e',
  navySoft: '#1e2a42',
  heroGradient: ['#060a12', '#0d1524', '#141c2e'] as const,
  heroGradientLight: ['#faf9f7', '#fff', '#f6f4f0'] as const,
  accent: theme.colors.primary,
  accentLight: theme.colors.primaryLight,
  accentSoft: '#f3ead8',
  accentDeep: theme.colors.primaryDark,
  warmBg: '#f7f5f1',
  cardBg: '#ffffff',
  imagePlaceholder: '#ece8e0',
  price: '#8b6914',
  priceBg: '#faf6ee',
  favorite: '#c2410c',
  textOnImage: '#ffffff',
  liveGreen: '#22c55e',
  liveGreenBg: '#ecfdf3',
  border: 'rgba(10, 15, 26, 0.06)',
  shadow: {
    shadowColor: '#0a0f1a',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 28,
    elevation: 6,
  },
  shadowSm: {
    shadowColor: '#0a0f1a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  shadowMd: {
    shadowColor: '#0a0f1a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 32,
    elevation: 8,
  },
  shadowLg: {
    shadowColor: '#0a0f1a',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.14,
    shadowRadius: 52,
    elevation: 12,
  },
  webHeroGradient: ['#04060c', '#0a0f1a', '#121c30', '#0a0f1a'] as const,
  webHeroGlow: 'rgba(212, 168, 75, 0.2)',
  webGlass: 'rgba(255, 255, 255, 0.92)',
  webGlassBorder: 'rgba(10, 15, 26, 0.05)',
  webSurface: '#f8f7f4',
  webSurfaceAlt: '#f0ede6',
  webMuted: '#64748b',
  webText: '#0a0f1a',
  webGoldLine: 'rgba(212, 168, 75, 0.55)',
} as const;

export const menuWebPageBg = {
  backgroundColor: menuUi.webSurface,
  minHeight: '100%',
} as object;

export const menuWebCardHover = {
  transition: 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.28s ease',
  cursor: 'pointer',
} as object;

export const menuWebCardHoverLift = {
  ...menuWebCardHover,
  ':hover': {
    transform: 'translateY(-8px)',
    boxShadow: '0 28px 56px rgba(10, 15, 26, 0.11), 0 0 0 1px rgba(212, 168, 75, 0.18)',
  },
} as object;

export function categoryAccentColor(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('kahvalt') || t.includes('breakfast')) return '#b45309';
  if (t.includes('içecek') || t.includes('icecek') || t.includes('drink') || t.includes('beverage')) return '#1e4976';
  if (t.includes('tatlı') || t.includes('tatli') || t.includes('dessert')) return '#9d174d';
  if (t.includes('salata') || t.includes('salad')) return '#166534';
  if (t.includes('izgara') || t.includes('grill') || t.includes('kebap')) return '#92400e';
  return menuUi.accentDeep;
}
