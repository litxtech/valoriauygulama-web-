import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type TabBarScrollCtx = {
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
  onFeedScroll: (offsetY: number) => void;
};

const TabBarScrollContext = createContext<TabBarScrollCtx | null>(null);

export function TabBarScrollProvider({ children }: { children: ReactNode }) {
  const [hidden, setHiddenState] = useState(false);

  const setHidden = useCallback((h: boolean) => {
    setHiddenState((prev) => (prev === h ? prev : h));
  }, []);

  /** Tab bar kaydırmada gizlenmez — sabit kalır. */
  const onFeedScroll = useCallback((_offsetY: number) => {
    // no-op
  }, []);

  const value = useMemo(() => ({ hidden, setHidden, onFeedScroll }), [hidden, setHidden, onFeedScroll]);

  return <TabBarScrollContext.Provider value={value}>{children}</TabBarScrollContext.Provider>;
}

export function useTabBarScroll(): TabBarScrollCtx {
  const ctx = useContext(TabBarScrollContext);
  if (!ctx) {
    return {
      hidden: false,
      setHidden: () => {},
      onFeedScroll: () => {},
    };
  }
  return ctx;
}
