/** Premium Hotel OS — gece/gündüz ve aura renkleri */
export const premiumTheme = {
  light: {
    pageBg: '#F9FAFB',
    cardBg: '#FFFFFF',
    glass: 'rgba(255,255,255,0.88)',
    glassStrong: 'rgba(255,255,255,0.94)',
    glassBorder: 'rgba(255,255,255,0.65)',
    text: '#111827',
    subtext: '#6B7280',
    muted: '#6B7280',
    glow: 'rgba(99, 102, 241, 0.35)',
    secondaryBtn: '#F3F4F6',
    gradientPrimary: ['#667eea', '#f093fb'] as [string, string],
  },
  night: {
    /** Ana arka plan — tam siyah (#000) kullanılmaz */
    pageBg: '#0F1117',
    cardBg: '#171923',
    glass: 'rgba(23, 25, 35, 0.72)',
    glassStrong: 'rgba(23, 25, 35, 0.92)',
    glassBorder: 'rgba(124, 92, 255, 0.18)',
    /** Başlıklar */
    text: '#FFFFFF',
    /** Alt metin (9 online, Valoria Hotel) */
    subtext: '#A7B0C0',
    /** Pasif metin (14 gün önce, Owner, HR) */
    muted: '#7A8499',
    glow: 'rgba(124, 92, 255, 0.35)',
    accent: '#7C5CFF',
    neon: '#B86EFF',
    secondaryBtn: '#232734',
    gradientPrimary: ['#7C5CFF', '#B86EFF'] as [string, string],
    /** İstatistik kartları */
    stat: {
      active: { bg: 'rgba(34,197,94,0.15)', text: '#22C55E' },
      task: { bg: 'rgba(250,204,21,0.15)', text: '#FACC15' },
      urgent: { bg: 'rgba(239,68,68,0.15)', text: '#EF4444' },
      weather: { bg: 'rgba(59,130,246,0.15)', text: '#3B82F6' },
    },
    /** Story halkası — görüldü */
    storySeen: '#555555',
    /** Story halkası — görülmedi (mor → turuncu) */
    gradientStoryRing: ['#7C5CFF', '#FF8A00'] as [string, string],
  },
  aura: {
    admin: '#8B5CF6',
    reception: '#3B82F6',
    kitchen: '#F59E0B',
    security: '#EF4444',
    cleaning: '#22C55E',
    default: '#6366F1',
  },
  status: {
    available: '#22C55E',
    busy: '#F59E0B',
    urgent: '#EF4444',
    break: '#9CA3AF',
  },
  motion: {
    pressMs: 120,
    tabMs: 280,
    springDamping: 18,
  },
} as const;

export type PremiumColorScheme = 'light' | 'night';
