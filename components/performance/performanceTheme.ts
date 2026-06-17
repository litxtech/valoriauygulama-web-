/** Birleşik performans — indigo / mor / altın canlı palet */
export const performanceTheme = {
  gradientHero: ['#4F46E5', '#7C3AED', '#9333EA'] as [string, string, string],
  gradientHeroSoft: ['rgba(79,70,229,0.14)', 'rgba(147,51,234,0.05)'] as [string, string],
  gradientGold: ['#FBBF24', '#F59E0B'] as [string, string],
  gradientOk: ['#34D399', '#059669'] as [string, string],
  gradientWarn: ['#FBBF24', '#D97706'] as [string, string],
  gradientDanger: ['#FCA5A5', '#DC2626'] as [string, string],
  accent: '#6366F1',
  accentDark: '#4F46E5',
  gold: '#F59E0B',
  pageBg: '#F8FAFC',
  cardShadow: {
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 22,
    elevation: 5,
  },
  shell: {
    borderRadius: 20,
    borderColor: 'rgba(99, 102, 241, 0.12)',
  },
} as const;

export function scoreGradient(score: number | null): [string, string] {
  if (score == null) return ['#94A3B8', '#64748B'];
  if (score >= 85) return performanceTheme.gradientOk;
  if (score >= 70) return performanceTheme.gradientWarn;
  return performanceTheme.gradientDanger;
}
