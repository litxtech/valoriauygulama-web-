/** Premium restoran UI — light / dark token seti. */
export type RestaurantColorScheme = 'light' | 'dark';

export type RestaurantTokens = {
  scheme: RestaurantColorScheme;
  bg: string;
  bgElevated: string;
  bgGlass: string;
  border: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentSoft: string;
  navy: string;
  success: string;
  danger: string;
  shadow: string;
  gradientHero: readonly [string, string, string];
  cardRadius: number;
  pillRadius: number;
};

export function restaurantTokens(
  scheme: RestaurantColorScheme,
  accent: string,
  navy: string
): RestaurantTokens {
  const isDark = scheme === 'dark';
  return {
    scheme,
    bg: isDark ? '#0b0f17' : '#f8f7f4',
    bgElevated: isDark ? '#141b28' : '#ffffff',
    bgGlass: isDark ? 'rgba(20,27,40,0.88)' : 'rgba(255,255,255,0.92)',
    border: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(10,15,26,0.06)',
    text: isDark ? '#f8fafc' : '#0a0f1a',
    textSecondary: isDark ? '#cbd5e1' : '#334155',
    textMuted: isDark ? '#94a3b8' : '#64748b',
    accent,
    accentSoft: isDark ? `${accent}33` : `${accent}18`,
    navy,
    success: '#22c55e',
    danger: '#ef4444',
    shadow: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(10,15,26,0.12)',
    gradientHero: isDark
      ? ([navy, '#0f172a', '#1e293b'] as const)
      : (['#faf9f7', '#ffffff', '#f3f0ea'] as const),
    cardRadius: 20,
    pillRadius: 999,
  };
}
