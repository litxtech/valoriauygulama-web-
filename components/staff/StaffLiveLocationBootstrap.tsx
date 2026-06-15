import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { useAuthStore } from '@/stores/authStore';
import { isExpoGo } from '@/lib/notificationsPush';
import {
  pauseStaffLiveLocationWatch,
  stopStaffLiveLocationSharing,
  syncStaffLiveLocationSharing,
} from '@/lib/map/staffLocationSharing';
import { isLiveMapScreenActive } from '@/lib/map/liveLocationConfig';
import { isStaffLiveLocationEnabled, shouldAutoEnableStaffLiveLocation } from '@/lib/map/staffLiveLocationStorage';

/**
 * Personel canlı konum — yalnızca harita açıkken senkron; oturum genelinde GPS başlatmaz.
 */
export function StaffLiveLocationBootstrap() {
  const staff = useAuthStore((s) => s.staff);

  useEffect(() => {
    if (Platform.OS === 'web' || isExpoGo || !staff?.id) return;

    const meta = {
      staffId: staff.id,
      displayName: staff.full_name ?? null,
      avatarUrl: staff.profile_image ?? null,
    };

    const runSync = () => {
      void (async () => {
        const offline = staff.work_status === 'off' || staff.work_status === 'offline';
        if (offline) {
          const enabled = await isStaffLiveLocationEnabled();
          if (enabled) await stopStaffLiveLocationSharing(true);
          return;
        }
        const shouldAuto = await shouldAutoEnableStaffLiveLocation();
        if (!shouldAuto) {
          const enabled = await isStaffLiveLocationEnabled();
          if (!enabled) await stopStaffLiveLocationSharing(true);
          return;
        }
        const enabled = await isStaffLiveLocationEnabled();
        if (!enabled) return;
        if (!isLiveMapScreenActive()) {
          pauseStaffLiveLocationWatch();
          return;
        }
        await syncStaffLiveLocationSharing(meta);
      })().catch(() => {});
    };

    runSync();

    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') runSync();
      else pauseStaffLiveLocationWatch();
    });

    return () => {
      appSub.remove();
    };
  }, [staff?.id, staff?.full_name, staff?.profile_image, staff?.work_status]);

  return null;
}
