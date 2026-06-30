/**
 * Telegram-style staff chat palette (light, professional).
 */
export const chatTheme = {
  background: '#FFFFFF',
  surface: '#FFFFFF',
  searchBg: '#F0F2F5',
  rowPressed: '#F4F4F5',
  text: '#000000',
  textSecondary: '#707579',
  textMuted: '#8E8E93',
  border: '#E7E7E7',
  accent: '#2AABEE',
  accentPurple: '#7C5CFF',
  bubbleOutgoing: '#EFFDDE',
  bubbleOutgoingAlt: '#DCF8C6',
  bubbleIncoming: '#FFFFFF',
  selected: '#E8F4FC',
  danger: '#EF4444',
  success: '#3CCB4A',
  unreadBadge: '#2AABEE',
  readCheck: '#2AABEE',
  deliveredCheck: '#8E8E93',
} as const;

export const chatTypography = {
  headerTitle: { fontSize: 21, fontWeight: '700' as const },
  listName: { fontSize: 16, fontWeight: '700' as const },
  listPreview: { fontSize: 14, fontWeight: '400' as const },
  listPreviewUnread: { fontSize: 14, fontWeight: '600' as const },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  time: { fontSize: 11 },
  meta: { fontSize: 12 },
} as const;

export const chatLayout = {
  listRowHeight: 76,
  avatarSize: 54,
  listCardRadius: 0,
  listCardMarginH: 0,
  listCardMarginV: 0,
  bubbleMaxWidthRatio: 0.75,
  inputRadius: 22,
  composeFabSize: 56,
} as const;
