import { useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { hapticImpactLight } from '@/lib/hapticsSafe';
import { resolveShortcutPinIdForHref } from '@/lib/staffHamburgerShortcutChildren';
import {
  STAFF_HAMBURGER_MAX_PINS,
  useStaffHamburgerPinsStore,
} from '@/stores/staffHamburgerPinsStore';
import { useAuthStore } from '@/stores/authStore';

/**
 * Hub / özellik ekranından basılı tutarak hamburger “Sık kullanılanlar”a ekler/kaldırır.
 */
export function usePinFeatureToHamburger() {
  const { t } = useTranslation();
  const staffId = useAuthStore((s) => s.staff?.id ?? null);
  const pinnedIds = useStaffHamburgerPinsStore((s) => s.pinnedIds);
  const hydrate = useStaffHamburgerPinsStore((s) => s.hydrate);
  const togglePin = useStaffHamburgerPinsStore((s) => s.togglePin);

  useEffect(() => {
    if (!staffId) return;
    void hydrate(staffId);
  }, [staffId, hydrate]);

  const isHrefPinned = useCallback(
    (href: string) => {
      const id = resolveShortcutPinIdForHref(href);
      return id ? pinnedIds.includes(id) : false;
    },
    [pinnedIds]
  );

  const pinHref = useCallback(
    async (href: string, label?: string) => {
      if (!staffId) return;
      const itemId = resolveShortcutPinIdForHref(href);
      if (!itemId) return;

      await hydrate(staffId);
      const already = useStaffHamburgerPinsStore.getState().pinnedIds.includes(itemId);
      if (!already && useStaffHamburgerPinsStore.getState().pinnedIds.length >= STAFF_HAMBURGER_MAX_PINS) {
        Alert.alert(t('staffMenuPinsFull'));
        return;
      }

      hapticImpactLight();
      const pinned = await togglePin(staffId, itemId);
      const name = (label ?? '').trim() || href;
      Alert.alert(
        pinned ? t('staffMenuPinAddedTitle') : t('staffMenuPinRemovedTitle'),
        pinned
          ? t('staffMenuPinAddedBody', { label: name })
          : t('staffMenuPinRemovedBody', { label: name })
      );
    },
    [staffId, hydrate, togglePin, t]
  );

  return { pinHref, isHrefPinned, pinnedIds };
}
