/** Puan sistemi — altın / amber premium palet */
export const pointsTheme = {
  gradientHero: ['#FBBF24', '#F59E0B', '#D97706'] as [string, string, string],
  gradientHeroSoft: ['rgba(251,191,36,0.18)', 'rgba(217,119,6,0.06)'] as [string, string],
  gradientCta: ['#F59E0B', '#EA580C'] as [string, string],
  gradientRank: ['#6366F1', '#8B5CF6'] as [string, string],
  gold: '#F59E0B',
  goldDark: '#B45309',
  silver: '#94A3B8',
  bronze: '#CD7F32',
  podium: {
    first: { bg: '#FEF3C7', border: '#F59E0B', text: '#B45309', icon: 'trophy' as const },
    second: { bg: '#F1F5F9', border: '#94A3B8', text: '#475569', icon: 'medal' as const },
    third: { bg: '#FFEDD5', border: '#FB923C', text: '#C2410C', icon: 'ribbon' as const },
  },
  cardShadow: {
    shadowColor: '#B45309',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  shell: {
    borderRadius: 20,
    borderColor: 'rgba(245, 158, 11, 0.12)',
  },
} as const;

export function podiumStyle(rank: number) {
  if (rank === 1) return pointsTheme.podium.first;
  if (rank === 2) return pointsTheme.podium.second;
  if (rank === 3) return pointsTheme.podium.third;
  return null;
}
