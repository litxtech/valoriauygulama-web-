import { useCallback, useMemo, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useStaffBottomNavStore } from '@/stores/staffBottomNavStore';

const HIDE_THRESHOLD = 8;

type Options = {
  /** Ignore tiny jitters near top */
  topRevealOffset?: number;
};

/**
 * Instagram-like: scroll down → hide tab bar; scroll up → show.
 * Attach `onScroll` + `scrollEventThrottle={16}` to lists.
 */
export function useBottomNavigation(opts?: Options) {
  const topRevealOffset = opts?.topRevealOffset ?? 24;
  const lastY = useRef(0);
  const onScrollDirection = useStaffBottomNavStore((s) => s.onScrollDirection);
  const setVisible = useStaffBottomNavStore((s) => s.setVisible);
  const visible = useStaffBottomNavStore((s) => s.visible);
  const createOpen = useStaffBottomNavStore((s) => s.createOpen);
  const setCreateOpen = useStaffBottomNavStore((s) => s.setCreateOpen);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const dy = y - lastY.current;
      lastY.current = y;

      if (y <= topRevealOffset) {
        setVisible(true);
        return;
      }
      if (Math.abs(dy) < HIDE_THRESHOLD) return;
      onScrollDirection(dy > 0 ? 'down' : 'up');
    },
    [onScrollDirection, setVisible, topRevealOffset]
  );

  const openCreate = useCallback(() => setCreateOpen(true), [setCreateOpen]);
  const closeCreate = useCallback(() => setCreateOpen(false), [setCreateOpen]);

  return useMemo(
    () => ({
      visible,
      createOpen,
      openCreate,
      closeCreate,
      setCreateOpen,
      setVisible,
      onScroll,
      scrollEventThrottle: 16 as const,
    }),
    [visible, createOpen, openCreate, closeCreate, setCreateOpen, setVisible, onScroll]
  );
}
