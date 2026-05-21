import { theme } from '@/constants/theme';

/** Otel mutfağı menüsü — sıcak, iştah açıcı palet */
export const menuUi = {
  heroGradient: ['#3d2817', '#6b4423', '#2d4a3e'] as const,
  heroGradientLight: ['#faf6f0', '#fff8ee', '#f4f9f6'] as const,
  accent: theme.colors.primary,
  accentSoft: '#f5e6c8',
  accentDeep: theme.colors.primaryDark,
  warmBg: '#faf8f5',
  cardBg: '#ffffff',
  imagePlaceholder: '#ebe4dc',
  price: '#8b6914',
  priceBg: '#fff9eb',
  favorite: '#e11d48',
  textOnImage: '#ffffff',
  shadow: {
    shadowColor: '#3d2817',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 5,
  },
  shadowSm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
} as const;

export function categoryAccentColor(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('kahvalt') || t.includes('breakfast')) return '#c2410c';
  if (t.includes('içecek') || t.includes('drink') || t.includes('beverage')) return '#0369a1';
  if (t.includes('tatlı') || t.includes('dessert')) return '#9d174d';
  if (t.includes('salata') || t.includes('salad')) return '#15803d';
  if (t.includes('izgara') || t.includes('grill') || t.includes('kebap')) return '#b45309';
  return menuUi.accent;
}
