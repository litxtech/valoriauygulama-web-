/**
 * Personel canlı operasyon konumu — opt-in; yalnızca uygulama ön plandayken güncellenir.
 */
import { Platform, Alert, AppState, type AppStateStatus } from 'react-native';
import type { LocationSubscription } from 'expo-location';
import {
  LIVE_MAP_LOCATION_WATCH,
  broadcastLiveMapLocation,
  isLiveMapScreenActive,
} from '@/lib/map/liveLocationConfig';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { log } from '@/lib/logger';
import { isExpoGo } from '@/lib/notificationsPush';
import { upsertMyLocation, removeMyLocation } from '@/lib/map/userLocations';
import {
  clearStaffLiveLocationMeta,
  isStaffLiveLocationEnabled,
  readStaffLiveLocationMeta,
  setStaffLiveLocationEnabled,
  setStaffLiveLocationOptedOut,
  shouldAutoEnableStaffLiveLocation,
  STAFF_LIVE_LOCATION_TASK,
  storeStaffLiveLocationMeta,
  type StaffLiveLocationMeta,
} from '@/lib/map/staffLiveLocationStorage';

export type { StaffLiveLocationMeta } from '@/lib/map/staffLiveLocationStorage';

export type StaffLocationPermissionSnapshot = {
  foreground: 'granted' | 'denied' | 'undetermined' | 'unavailable';
  background: 'unavailable';
  enabled: boolean;
  tracking: boolean;
};

let foregroundWatch: LocationSubscription | null = null;
let appStateSub: { remove: () => void } | null = null;
let watchPausedForBackground = false;

function ensureAppStateListener(): void {
  if (appStateSub) return;
  appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') {
      if (watchPausedForBackground) {
        watchPausedForBackground = false;
        void resumeStaffLiveLocationWatchIfReady();
      }
      return;
    }
    if (state === 'background' || state === 'inactive') {
      if (foregroundWatch) {
        watchPausedForBackground = true;
        stopForegroundWatch();
      }
    }
  });
}

async function resumeStaffLiveLocationWatchIfReady(): Promise<void> {
  if (!isLiveMapScreenActive()) return;
  const enabled = await isStaffLiveLocationEnabled();
  if (!enabled) return;
  const meta = await readStaffLiveLocationMeta();
  if (meta) await startForegroundWatch(meta);
}

/** Harita sekmesinden çıkınca GPS durdur (paylaşım tercihi saklanır). */
export function pauseStaffLiveLocationWatch(): void {
  stopForegroundWatch();
}

function isLocationNativeAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  return Boolean(requireOptionalNativeModule('ExpoLocation'));
}

async function getLocationModule(): Promise<typeof import('expo-location') | null> {
  if (!isLocationNativeAvailable()) return null;
  return import('expo-location');
}

/** Eski sürümlerde başlatılmış arka plan görevini durdur (Play: arka plan konum yok). */
async function stopLegacyBackgroundLocationUpdates(): Promise<void> {
  const Location = await getLocationModule();
  if (!Location) return;
  const started = await Location.hasStartedLocationUpdatesAsync(STAFF_LIVE_LOCATION_TASK).catch(() => false);
  if (started) {
    await Location.stopLocationUpdatesAsync(STAFF_LIVE_LOCATION_TASK).catch(() => {});
  }
}

export async function getStaffLocationPermissionSnapshot(): Promise<StaffLocationPermissionSnapshot> {
  const enabled = await isStaffLiveLocationEnabled();
  if (Platform.OS === 'web' || isExpoGo) {
    return {
      foreground: 'unavailable',
      background: 'unavailable',
      enabled,
      tracking: false,
    };
  }
  const Location = await getLocationModule();
  if (!Location) {
    return {
      foreground: 'unavailable',
      background: 'unavailable',
      enabled,
      tracking: false,
    };
  }
  const fg = await Location.getForegroundPermissionsAsync();
  const mapStatus = (s: string): StaffLocationPermissionSnapshot['foreground'] =>
    s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : 'undetermined';
  return {
    foreground: mapStatus(fg.status),
    background: 'unavailable',
    enabled,
    tracking: foregroundWatch !== null,
  };
}

export async function requestStaffLiveLocationPermissions(): Promise<{
  foregroundGranted: boolean;
}> {
  if (Platform.OS === 'web' || isExpoGo) {
    return { foregroundGranted: false };
  }
  const Location = await getLocationModule();
  if (!Location) return { foregroundGranted: false };

  const fg = await Location.requestForegroundPermissionsAsync();
  return { foregroundGranted: fg.status === 'granted' };
}

function stopForegroundWatch(): void {
  foregroundWatch?.remove();
  foregroundWatch = null;
}

async function startForegroundWatch(meta: StaffLiveLocationMeta): Promise<void> {
  const Location = await getLocationModule();
  if (!Location) return;
  stopForegroundWatch();
  const fg = await Location.getForegroundPermissionsAsync();
  if (fg.status !== 'granted') return;

  if (!isLiveMapScreenActive()) return;

  const push = async (lat: number, lng: number) => {
    broadcastLiveMapLocation(lat, lng);
    await upsertMyLocation({
      lat,
      lng,
      userType: 'staff',
      userId: meta.staffId,
      displayName: meta.displayName,
      avatarUrl: meta.avatarUrl,
    });
  };

  const cur = await Location.getCurrentPositionAsync({ accuracy: LIVE_MAP_LOCATION_WATCH.accuracy }).catch(
    () => null
  );
  if (cur) await push(cur.coords.latitude, cur.coords.longitude);

  foregroundWatch = await Location.watchPositionAsync(LIVE_MAP_LOCATION_WATCH, (loc) => {
    void push(loc.coords.latitude, loc.coords.longitude);
  });
  ensureAppStateListener();
}

export async function startStaffLiveLocationSharing(meta: StaffLiveLocationMeta): Promise<boolean> {
  if (Platform.OS === 'web' || isExpoGo) return false;

  await stopLegacyBackgroundLocationUpdates();
  const snap = await getStaffLocationPermissionSnapshot();
  if (snap.foreground !== 'granted') return false;

  await storeStaffLiveLocationMeta(meta);
  await setStaffLiveLocationEnabled(true);
  await startForegroundWatch(meta);
  return true;
}

export async function stopStaffLiveLocationSharing(removeFromMap = true): Promise<void> {
  await setStaffLiveLocationEnabled(false);
  stopForegroundWatch();
  const meta = await readStaffLiveLocationMeta();
  if (removeFromMap && meta?.staffId) {
    await removeMyLocation('staff', meta.staffId);
  }
  await clearStaffLiveLocationMeta();
}

export async function syncStaffLiveLocationSharing(meta: StaffLiveLocationMeta): Promise<void> {
  const enabled = await isStaffLiveLocationEnabled();
  if (!enabled) {
    await stopStaffLiveLocationSharing(false);
    return;
  }
  const snap = await getStaffLocationPermissionSnapshot();
  if (snap.foreground !== 'granted') {
    await stopStaffLiveLocationSharing(false);
    return;
  }
  await storeStaffLiveLocationMeta(meta);
  await startForegroundWatch(meta);
}

export function showStaffLiveLocationExplainer(onContinue: () => void): void {
  Alert.alert(
    'Canlı operasyon konumu',
    'Vardiya sırasında konumunuz yalnızca uygulama açıkken yetkili ekip operasyon haritasında avatarınızla görünür. Paylaşımı İzin Merkezi veya haritadan kapatabilirsiniz.',
    [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Devam', onPress: onContinue },
    ]
  );
}

export async function enableStaffLiveLocationFromPermissions(
  meta: StaffLiveLocationMeta
): Promise<StaffLocationPermissionSnapshot> {
  return new Promise((resolve) => {
    showStaffLiveLocationExplainer(() => {
      void (async () => {
        const { foregroundGranted } = await requestStaffLiveLocationPermissions();
        if (!foregroundGranted) {
          resolve(await getStaffLocationPermissionSnapshot());
          return;
        }
        await setStaffLiveLocationOptedOut(false);
        await startStaffLiveLocationSharing(meta);
        resolve(await getStaffLocationPermissionSnapshot());
      })();
    });
  });
}

export async function disableStaffLiveLocationFromPermissions(): Promise<void> {
  await setStaffLiveLocationOptedOut(true);
  await stopStaffLiveLocationSharing(true);
}

export async function tryAutoEnableStaffLiveLocation(meta: StaffLiveLocationMeta): Promise<boolean> {
  if (!(await shouldAutoEnableStaffLiveLocation())) return false;
  const snap = await getStaffLocationPermissionSnapshot();
  if (snap.enabled && snap.foreground === 'granted') {
    await syncStaffLiveLocationSharing(meta);
    return true;
  }
  return enableStaffLiveLocationQuiet(meta);
}

export async function enableStaffLiveLocationQuiet(meta: StaffLiveLocationMeta): Promise<boolean> {
  if (Platform.OS === 'web' || isExpoGo) return false;
  const { foregroundGranted } = await requestStaffLiveLocationPermissions();
  if (!foregroundGranted) return false;
  await setStaffLiveLocationOptedOut(false);
  return startStaffLiveLocationSharing(meta);
}
