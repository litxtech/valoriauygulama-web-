import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { restaurantTokens, type RestaurantColorScheme } from '@/features/restaurant/tokens/restaurantTokens';

function readSystemScheme(): RestaurantColorScheme {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

type AppearanceOptions = {
  /** Public guest menus should stay light by default so navy dish names stay readable. */
  followSystem?: boolean;
  defaultScheme?: RestaurantColorScheme;
};

export function useRestaurantAppearance(
  accent: string,
  navy: string,
  options?: AppearanceOptions
) {
  const followSystem = options?.followSystem ?? true;
  const defaultScheme = options?.defaultScheme ?? (followSystem ? readSystemScheme() : 'light');
  const [scheme, setScheme] = useState<RestaurantColorScheme>(defaultScheme);

  useEffect(() => {
    if (!followSystem) return;
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setScheme(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [followSystem]);

  const tokens = useMemo(() => restaurantTokens(scheme, accent, navy), [scheme, accent, navy]);

  return { scheme, tokens, toggleScheme: () => setScheme((s) => (s === 'dark' ? 'light' : 'dark')) };
}
