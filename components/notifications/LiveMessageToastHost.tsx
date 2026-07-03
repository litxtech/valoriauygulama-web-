import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { usePathname } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { getOrCreateGuestForCurrentSession } from '@/lib/getOrCreateGuestForCaller';
import { isExpoGo } from '@/lib/notificationsPush';
import { runAfterUiReady } from '@/lib/runAfterUiReady';
import { subscribeLiveMessagePushToasts } from '@/lib/messagingUnreadSync';

/** Canlı mesaj toast — pathname değişimleri kök layout'u yeniden çizmesin. */
export function LiveMessageToastHost() {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const staff = useAuthStore((s) => s.staff);
  const staffCheckComplete = useAuthStore((s) => s.staffCheckComplete);

  useEffect(() => {
    if (Platform.OS === 'web' || isExpoGo) return;
    const getPathname = () => pathnameRef.current;
    let unsub: (() => void) | null = null;
    let cancelled = false;

    const startStaff = (staffId: string) => {
      if (cancelled) return;
      unsub = subscribeLiveMessagePushToasts(
        {
          kind: 'staff',
          staffId,
          buildChatUrl: (id) => `/staff/chat/${id}`,
        },
        { getPathname }
      );
    };

    const startGuest = async () => {
      const row = await getOrCreateGuestForCurrentSession();
      if (cancelled || !row?.guest_id) return;
      unsub = subscribeLiveMessagePushToasts(
        {
          kind: 'guest',
          guestId: row.guest_id,
          buildChatUrl: (id) => `/customer/chat/${id}`,
        },
        { getPathname }
      );
    };

    const run = () => {
      const { staff: s } = useAuthStore.getState();
      if (s?.id) {
        startStaff(s.id);
        return;
      }
      void startGuest();
    };

    if (Platform.OS === 'android') {
      const task = runAfterUiReady(run, { delayMs: 900 });
      return () => {
        cancelled = true;
        task.cancel();
        unsub?.();
      };
    }
    run();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [staff?.id, staffCheckComplete]);

  return null;
}
