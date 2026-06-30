export const tradePartnerTheme = {
  bg: '#070b12',
  bgSoft: '#0b1220',
  card: '#111827',
  cardElevated: '#1a2332',
  cardBorder: 'rgba(148, 163, 184, 0.14)',
  cardBorderFocus: 'rgba(56, 189, 248, 0.45)',
  text: '#f8fafc',
  muted: '#94a3b8',
  mutedSoft: '#64748b',
  accent: '#38bdf8',
  accentDark: '#0284c7',
  accentSoft: 'rgba(56, 189, 248, 0.16)',
  success: '#34d399',
  successSoft: 'rgba(52, 211, 153, 0.14)',
  danger: '#f87171',
  dangerSoft: 'rgba(248, 113, 113, 0.14)',
  warning: '#fbbf24',
  warningSoft: 'rgba(251, 191, 36, 0.14)',
  heroGradient: ['#1e3a5f', '#0f172a', '#070b12'] as const,
  accentGradient: ['#7dd3fc', '#38bdf8', '#0284c7'] as const,
  surfaceInput: '#0a1018',
};

export const tradePartnerRadii = {
  sm: 12,
  md: 16,
  lg: 22,
  pill: 999,
};

export const TRADE_TX_STATUS_LABELS: Record<string, string> = {
  pending_approval: 'Onay bekliyor',
  approved: 'Onaylandı',
  disputed: 'İtiraz edildi',
  cancelled: 'İptal',
};

export const TRADE_MOVEMENT_LABELS: Record<string, string> = {
  borc: 'Borç',
  alacak: 'Alacak',
};
