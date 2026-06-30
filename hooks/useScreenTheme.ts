import { useMemo } from 'react';
import { chatTheme } from '@/constants/chatTheme';
import { getPersonelDesign } from '@/constants/personelDesignSystem';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';

/** Sohbet listesi / ekran arka planları — gece modu */
export const chatThemeNight = {
  background: '#0E1621',
  surface: '#17212B',
  searchBg: '#242F3D',
  rowPressed: '#1C2733',
  text: '#FFFFFF',
  textSecondary: '#8C9AA9',
  textMuted: '#6D7F8F',
  border: 'rgba(255,255,255,0.08)',
  accent: '#2AABEE',
  accentPurple: '#7C5CFF',
  bubbleOutgoing: '#2B5278',
  bubbleOutgoingAlt: '#2B5278',
  bubbleIncoming: '#182533',
  selected: 'rgba(42,171,238,0.15)',
  danger: '#EF4444',
  success: '#3CCB4A',
  unreadBadge: '#2AABEE',
  readCheck: '#2AABEE',
  deliveredCheck: '#6D7F8F',
} as const;

export type ChatThemePalette = typeof chatTheme;

export function getChatTheme(isNight: boolean): ChatThemePalette {
  return (isNight ? chatThemeNight : chatTheme) as ChatThemePalette;
}

export function useChatTheme(): ChatThemePalette {
  const { isNight } = usePremiumTheme();
  return useMemo(() => getChatTheme(isNight), [isNight]);
}

/** Ekran kök arka planı — tab içi sayfalar */
export function useScreenBackground() {
  const { isNight } = usePremiumTheme();
  return useMemo(() => getPersonelDesign(isNight).pageBg, [isNight]);
}
