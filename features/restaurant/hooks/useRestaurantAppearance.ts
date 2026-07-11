import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { restaurantTokens, type RestaurantColorScheme } from '@/features/restaurant/tokens/restaurantTokens';

function readSystemScheme(): RestaurantColorScheme {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

export function useRestaurantAppearance(accent: string, navy: string) {
  const [scheme, setScheme] = useState<RestaurantColorScheme>(readSystemScheme);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setScheme(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const tokens = useMemo(() => restaurantTokens(scheme, accent, navy), [scheme, accent, navy]);

  return { scheme, tokens, toggleScheme: () => setScheme((s) => (s === 'dark' ? 'light' : 'dark')) };
}
