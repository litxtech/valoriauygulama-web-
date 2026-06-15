/**
 * Telegram-style staff chat palette (light, professional).
 */
export const chatTheme = {
  background: '#F6F7FB',
  surface: '#FFFFFF',
  text: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  border: '#E5E7EB',
  accent: '#B88900',
  accentPurple: '#8B5CF6',
  bubbleOutgoing: '#CFA64A',
  bubbleOutgoingAlt: '#C89B2E',
  bubbleIncoming: '#FFFFFF',
  selected: '#EEF2FF',
  danger: '#EF4444',
  success: '#22C55E',
  unreadBadge: '#B88900',
  readCheck: '#B88900',
  deliveredCheck: '#9CA3AF',
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
  avatarSize: 48,
  bubbleMaxWidthRatio: 0.75,
  inputRadius: 22,
  composeFabSize: 56,
} as const;
