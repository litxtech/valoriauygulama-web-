import { theme } from '@/constants/theme';

/** Canlı web menü build etiketi — deploy doğrulama */
export const PUBLIC_MENU_WEB_BUILD = '2026.06-v3';

/** Otel mutfağı — gece lacivert + şampanya altın */
export const menuUi = {
  navy: '#0c1424',
  navyMid: '#162033',
  navySoft: '#243047',
  heroGradient: ['#080d18', '#0f1a2e', '#162033'] as const,
  heroGradientLight: ['#faf9f7', '#fff', '#f6f4f0'] as const,
  accent: theme.colors.primary,
  accentLight: theme.colors.primaryLight,
  accentSoft: '#f3ead8',
  accentDeep: theme.colors.primaryDark,
  warmBg: '#f4f1eb',
  cardBg: '#ffffff',
  imagePlaceholder: '#e8e4dc',
  price: '#8b6914',
  priceBg: '#faf6ee',
  favorite: '#c2410c',
  textOnImage: '#ffffff',
  liveGreen: '#22c55e',
  liveGreenBg: '#ecfdf3',
  border: 'rgba(12, 20, 36, 0.07)',
  shadow: {
    shadowColor: '#0c1424',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 6,
  },
  shadowSm: {
    shadowColor: '#0c1424',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  shadowMd: {
    shadowColor: '#0c1424',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 28,
    elevation: 8,
  },
  shadowLg: {
    shadowColor: '#0c1424',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.16,
    shadowRadius: 48,
    elevation: 12,
  },
  webHeroGradient: ['#050810', '#0c1424', '#152238', '#0c1424'] as const,
  webHeroGlow: 'rgba(201, 162, 78, 0.22)',
  webGlass: 'rgba(255, 255, 255, 0.98)',
  webGlassBorder: 'rgba(12, 20, 36, 0.06)',
  webSurface: '#faf9f7',
  webSurfaceAlt: '#f3f0ea',
  webMuted: '#6b7280',
  webText: '#0c1424',
  webGoldLine: 'rgba(201, 162, 78, 0.65)',
} as const;

export const menuWebPageBg = {
  backgroundColor: menuUi.webSurface,
  backgroundImage:
    'radial-gradient(ellipse 70% 45% at 0% 0%, rgba(201,162,78,0.07) 0%, transparent 50%), radial-gradient(ellipse 50% 35% at 100% 0%, rgba(12,20,36,0.04) 0%, transparent 45%), linear-gradient(180deg, #faf9f7 0%, #f6f3ed 100%)',
  minHeight: '100%',
} as object;

export const menuWebCardHover = {
  transition: 'transform 0.32s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.32s ease',
  cursor: 'pointer',
} as object;

export const menuWebCardHoverLift = {
  ...menuWebCardHover,
  ':hover': {
    transform: 'translateY(-6px)',
    boxShadow: '0 24px 48px rgba(12, 20, 36, 0.12), 0 0 0 1px rgba(201, 162, 78, 0.2)',
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
