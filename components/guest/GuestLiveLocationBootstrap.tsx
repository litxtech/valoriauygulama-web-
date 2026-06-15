import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { useAuthStore } from '@/stores/authStore';
import { isExpoGo } from '@/lib/notificationsPush';
import { authUserIsStaff, getOrCreateGuestForCaller, getGuestFullNameFromUser } from '@/lib/getOrCreateGuestForCaller';
import {
  pauseGuestLiveLocationWatch,
  stopGuestLiveLocationSharing,
  syncGuestLiveLocationSharing,
} from '@/lib/map/guestLocationSharing';
import { isLiveMapScreenActive } from '@/lib/map/liveLocationConfig';
import { isGuestLiveLocationEnabled, shouldAutoEnableGuestLiveLocation } from '@/lib/map/guestLiveLocationStorage';

/**
 * Misafir canlı konum — yalnızca harita açıkken senkron; oturum genelinde GPS başlatmaz.
 */
export function GuestLiveLocationBootstrap() {
  const user = useAuthStore((s) => s.user);
  const staff = useAuthStore((s) => s.staff);
  const staffCheckComplete = useAuthStore((s) => s.staffCheckComplete);

  useEffect(() => {
    if (Platform.OS === 'web' || isExpoGo || !user || staff || !staffCheckComplete) return;

    const runSync = () => {
      void (async () => {
        if (await authUserIsStaff(user.id)) return;
        const row = await getOrCreateGuestForCaller(user);
        if (!row?.guest_id) return;
        const meta = {
          guestId: row.guest_id,
          displayName: getGuestFullNameFromUser(user) ?? null,
          avatarUrl: (user.user_metadata?.avatar_url as string | undefined) ?? null,
        };
        const shouldAuto = await shouldAutoEnableGuestLiveLocation();
        if (!shouldAuto) {
          const enabled = await isGuestLiveLocationEnabled();
          if (!enabled) await stopGuestLiveLocationSharing(true);
          return;
        }
        const enabled = await isGuestLiveLocationEnabled();
        if (!enabled) return;
        if (!isLiveMapScreenActive()) {
          pauseGuestLiveLocationWatch();
          return;
        }
        await syncGuestLiveLocationSharing(meta);
      })().catch(() => {});
    };

    runSync();
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') runSync();
      else pauseGuestLiveLocationWatch();
    });
    return () => appSub.remove();
  }, [user, staff, staffCheckComplete]);

  return null;
}
