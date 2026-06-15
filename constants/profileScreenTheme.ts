/**
 * Profil (misafir + personel) — ortak renk, gölge ve ölçüler.
 */
export const profileScreenTheme = {
  gradient: { start: '#4F46E5', end: '#7C3AED' },
  gradientSoft: { start: 'rgba(79,70,229,0.12)', end: 'rgba(124,58,237,0.06)' },
  bg: '#FFFFFF',
  card: '#FFFFFF',
  cardMuted: '#F8FAFC',
  text: '#0F172A',
  subtext: '#64748B',
  border: 'rgba(15, 23, 42, 0.06)',
  borderStrong: 'rgba(15, 23, 42, 0.1)',
  /** Kart ikonları */
  accent: {
    blue: '#4F46E5',
    green: '#059669',
    orange: '#D97706',
    purple: '#7C3AED',
    red: '#DC2626',
  },
  hero: {
    height: 200,
    bottomRadius: 24,
  },
  avatar: {
    size: 100,
    border: 4,
  },
  identityCard: {
    marginTop: -56,
    paddingTop: 4,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderRadius: 22,
    borderTopWidth: 0,
  },
  iconBg: 'rgba(99, 102, 241, 0.09)',
  /** Ortak kart kabuğu */
  cardShell: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.07)',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
  },
  statShadow: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 18,
    elevation: 3,
  },
  avatarShadow: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 8,
  },
  coverFrame: {
    inset: 0,
    radiusBottom: 28,
    borderW: 1,
    border: 'rgba(15, 23, 42, 0.06)',
    marginTop: 0,
  },
  pill: {
    online: { bg: 'rgba(34,197,94,0.12)', text: '#15803d', dot: '#22c55e' },
    offline: { bg: 'rgba(100,116,139,0.12)', text: '#475569', dot: '#94a3b8' },
  },
  coverFrameShadow: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 8,
  },
} as const;
