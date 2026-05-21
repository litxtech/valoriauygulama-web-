/**
 * Profil (misafir + personel) — ortak renk, gölge ve ölçüler.
 * Yumuşak kontrast, göz yormayan yüzeyler.
 */
export const profileScreenTheme = {
  /** Ana gradient (marka) — düşük doygunluk */
  gradient: { start: '#6366F1', end: '#8B5CF6' },
  bg: '#F1F5F9',
  card: '#FFFFFF',
  cardMuted: '#F8FAFC',
  text: '#1E293B',
  subtext: '#64748B',
  border: 'rgba(15, 23, 42, 0.07)',
  borderStrong: 'rgba(15, 23, 42, 0.11)',
  /** Kart ikonları */
  accent: {
    blue: '#4F46E5',
    green: '#059669',
    orange: '#D97706',
    purple: '#7C3AED',
    red: '#DC2626',
  },
  hero: {
    height: 180,
    bottomRadius: 24,
  },
  avatar: {
    size: 88,
    border: 4,
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
    radiusBottom: 20,
    borderW: 1,
    border: 'rgba(15, 23, 42, 0.08)',
    marginTop: 0,
  },
  coverFrameShadow: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 8,
  },
} as const;
