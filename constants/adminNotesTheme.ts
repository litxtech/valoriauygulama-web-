/** Not Al — ortak görsel dil */
export const notesTheme = {
  bg: '#F5F5F4',
  card: '#FFFFFF',
  cardMuted: '#FAFAF9',
  border: '#E7E5E4',
  borderFocus: '#99F6E4',
  accent: '#0D9488',
  accentDark: '#0F766E',
  accentSoft: '#CCFBF1',
  accentGhost: '#F0FDFA',
  text: '#1C1917',
  textSecondary: '#57534E',
  textMuted: '#78716C',
  textSoft: '#A8A29E',
  danger: '#DC2626',
  dangerSoft: '#FEF2F2',
  dangerBorder: '#FECACA',
  shadow: '#1C1917',
  pinned: '#D97706',
  pinnedSoft: '#FFFBEB',
} as const;

export const NOTE_TAG_STRIP: Record<string, string> = {
  general: '#78716C',
  room: '#0891B2',
  staff: '#059669',
  guest: '#EA580C',
  guest_legacy: '#EA580C',
  urgent: '#DC2626',
};
