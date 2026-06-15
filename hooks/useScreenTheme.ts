import { useMemo } from 'react';
import { chatTheme } from '@/constants/chatTheme';
import { getPersonelDesign } from '@/constants/personelDesignSystem';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';

/** Sohbet listesi / ekran arka planları — gece modu */
export const chatThemeNight = {
  background: '#0F1117',
  surface: '#171923',
  text: '#FFFFFF',
  textSecondary: '#A7B0C0',
  textMuted: '#7A8499',
  border: 'rgba(255,255,255,0.08)',
  accent: '#B88900',
  accentPurple: '#7C5CFF',
  bubbleOutgoing: '#CFA64A',
  bubbleOutgoingAlt: '#C89B2E',
  bubbleIncoming: '#232734',
  selected: 'rgba(124,92,255,0.18)',
  danger: '#EF4444',
  success: '#22C55E',
  unreadBadge: '#B88900',
  readCheck: '#B88900',
  deliveredCheck: '#7A8499',
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
