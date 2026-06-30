export const lobbyTheme = {
  bg: '#050a14',
  heroGradient: ['#050a14', '#0a1628', '#0c1f3d', '#0f2847'] as const,
  accent: '#2dd4bf',
  accentSoft: 'rgba(45, 212, 191, 0.18)',
  violet: '#a78bfa',
  amber: '#fbbf24',
  sky: '#38bdf8',
  text: '#f8fafc',
  textMuted: 'rgba(248, 250, 252, 0.72)',
  cardBorder: 'rgba(255, 255, 255, 0.14)',
  glass: 'rgba(255, 255, 255, 0.08)',
};

export const lobbyPortalCards = [
  {
    id: 'guest',
    pill: 'MİSAFİR',
    icon: 'bed-outline' as const,
    colors: ['#6366f1', '#4f46e5', '#312e81'] as const,
    glow: 'rgba(99, 102, 241, 0.45)',
  },
  {
    id: 'staff',
    pill: 'PERSONEL',
    icon: 'briefcase-outline' as const,
    colors: ['#10b981', '#059669', '#064e3b'] as const,
    glow: 'rgba(16, 185, 129, 0.4)',
  },
  {
    id: 'partner',
    pill: 'PARTNER',
    icon: 'restaurant-outline' as const,
    colors: ['#f59e0b', '#d97706', '#78350f'] as const,
    glow: 'rgba(245, 158, 11, 0.42)',
  },
  {
    id: 'trade',
    pill: 'TİCARET',
    icon: 'storefront-outline' as const,
    colors: ['#ec4899', '#db2777', '#831843'] as const,
    glow: 'rgba(236, 72, 153, 0.4)',
  },
] as const;
