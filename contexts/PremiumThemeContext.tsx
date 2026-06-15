import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { premiumTheme, type PremiumColorScheme } from '@/constants/premiumTheme';
import { loadPremiumColorScheme, savePremiumColorScheme } from '@/lib/premiumThemeStorage';

type PremiumThemeCtx = {
  scheme: PremiumColorScheme;
  isNight: boolean;
  colors: typeof premiumTheme.light & Partial<typeof premiumTheme.night>;
  toggleNight: () => void;
  setScheme: (next: PremiumColorScheme) => void;
  hydrated: boolean;
};

const PremiumThemeContext = createContext<PremiumThemeCtx | null>(null);

export function PremiumThemeProvider({ children }: { children: ReactNode }) {
  const [scheme, setSchemeState] = useState<PremiumColorScheme>('light');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadPremiumColorScheme().then((saved) => {
      if (cancelled) return;
      if (saved) setSchemeState(saved);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setScheme = useCallback((next: PremiumColorScheme) => {
    setSchemeState(next);
    void savePremiumColorScheme(next);
  }, []);

  const toggleNight = useCallback(() => {
    setSchemeState((prev) => {
      const next: PremiumColorScheme = prev === 'light' ? 'night' : 'light';
      void savePremiumColorScheme(next);
      return next;
    });
  }, []);

  const value = useMemo<PremiumThemeCtx>(
    () => ({
      scheme,
      isNight: scheme === 'night',
      colors: scheme === 'night' ? { ...premiumTheme.light, ...premiumTheme.night } : premiumTheme.light,
      toggleNight,
      setScheme,
      hydrated,
    }),
    [scheme, toggleNight, setScheme, hydrated]
  );

  return <PremiumThemeContext.Provider value={value}>{children}</PremiumThemeContext.Provider>;
}

export function usePremiumTheme(): PremiumThemeCtx {
  const ctx = useContext(PremiumThemeContext);
  if (!ctx) {
    return {
      scheme: 'light',
      isNight: false,
      colors: premiumTheme.light,
      toggleNight: () => {},
      setScheme: () => {},
      hydrated: true,
    };
  }
  return ctx;
}
