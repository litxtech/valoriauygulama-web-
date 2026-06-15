/**
 * Misafir canlı otel haritası konumu — opt-in; yalnızca uygulama ön plandayken güncellenir.
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
  clearGuestLiveLocationMeta,
  GUEST_LIVE_LOCATION_TASK,
  isGuestLiveLocationEnabled,
  readGuestLiveLocationMeta,
  setGuestLiveLocationEnabled,
  setGuestLiveLocationOptedOut,
  shouldAutoEnableGuestLiveLocation,
  storeGuestLiveLocationMeta,
  type GuestLiveLocationMeta,
} from '@/lib/map/guestLiveLocationStorage';

export type { GuestLiveLocationMeta } from '@/lib/map/guestLiveLocationStorage';

export type GuestLocationPermissionSnapshot = {
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
        void resumeGuestLiveLocationWatchIfReady();
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

async function resumeGuestLiveLocationWatchIfReady(): Promise<void> {
  if (!isLiveMapScreenActive()) return;
  const enabled = await isGuestLiveLocationEnabled();
  if (!enabled) return;
  const meta = await readGuestLiveLocationMeta();
  if (meta) await startForegroundWatch(meta);
}

/** Harita sekmesinden çıkınca GPS durdur (paylaşım tercihi saklanır). */
export function pauseGuestLiveLocationWatch(): void {
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
  const started = await Location.hasStartedLocationUpdatesAsync(GUEST_LIVE_LOCATION_TASK).catch(() => false);
  if (started) {
    await Location.stopLocationUpdatesAsync(GUEST_LIVE_LOCATION_TASK).catch(() => {});
  }
}

export async function getGuestLocationPermissionSnapshot(): Promise<GuestLocationPermissionSnapshot> {
  const enabled = await isGuestLiveLocationEnabled();
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
  const mapStatus = (s: string): GuestLocationPermissionSnapshot['foreground'] =>
    s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : 'undetermined';
  return {
    foreground: mapStatus(fg.status),
    background: 'unavailable',
    enabled,
    tracking: foregroundWatch !== null,
  };
}

export async function requestGuestLiveLocationPermissions(): Promise<{
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

/** Harita / izin merkezinde ön plan verildikten sonra canlı paylaşımı aç. */
export async function enableGuestLiveLocationAfterForegroundGranted(
  meta: GuestLiveLocationMeta
): Promise<boolean> {
  if (Platform.OS === 'web' || isExpoGo) return false;
  const Location = await getLocationModule();
  if (!Location) return false;
  const fg = await Location.getForegroundPermissionsAsync();
  if (fg.status !== 'granted') return false;
  await setGuestLiveLocationOptedOut(false);
  return startGuestLiveLocationSharing(meta);
}

function stopForegroundWatch(): void {
  foregroundWatch?.remove();
  foregroundWatch = null;
}

async function startForegroundWatch(meta: GuestLiveLocationMeta): Promise<void> {
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
      userType: 'guest',
      userId: meta.guestId,
      displayName: meta.displayName,
      avatarUrl: meta.avatarUrl,
    });
  };

  const cur = await Location.getCurrentPositionAsync({ accuracy: LIVE_MAP_LOCATION_WATCH.accuracy }).catch(() => null);
  if (cur) await push(cur.coords.latitude, cur.coords.longitude);

  foregroundWatch = await Location.watchPositionAsync(LIVE_MAP_LOCATION_WATCH, (loc) => {
    void push(loc.coords.latitude, loc.coords.longitude);
  });
  ensureAppStateListener();
}

export async function startGuestLiveLocationSharing(meta: GuestLiveLocationMeta): Promise<boolean> {
  if (Platform.OS === 'web' || isExpoGo) return false;

  await stopLegacyBackgroundLocationUpdates();
  const snap = await getGuestLocationPermissionSnapshot();
  if (snap.foreground !== 'granted') return false;

  await storeGuestLiveLocationMeta(meta);
  await setGuestLiveLocationEnabled(true);
  await startForegroundWatch(meta);
  return true;
}

export async function stopGuestLiveLocationSharing(removeFromMap = true): Promise<void> {
  await setGuestLiveLocationEnabled(false);
  stopForegroundWatch();
  const meta = await readGuestLiveLocationMeta();
  if (removeFromMap && meta?.guestId) {
    await removeMyLocation('guest', meta.guestId);
  }
  await clearGuestLiveLocationMeta();
}

export async function syncGuestLiveLocationSharing(meta: GuestLiveLocationMeta): Promise<void> {
  const enabled = await isGuestLiveLocationEnabled();
  if (!enabled) {
    await stopGuestLiveLocationSharing(false);
    return;
  }
  const snap = await getGuestLocationPermissionSnapshot();
  if (snap.foreground !== 'granted') {
    await stopGuestLiveLocationSharing(false);
    return;
  }
  await storeGuestLiveLocationMeta(meta);
  await startForegroundWatch(meta);
}

export function showGuestLiveLocationExplainer(onContinue: () => void): void {
  Alert.alert(
    'Otel haritasında canlı konum',
    'Konumunuz yalnızca siz açtığınızda ve uygulama açıkken Valoria otel haritasında avatarınızla görünür. Paylaşımı haritadaki düğmeden veya İzin Merkezi\'nden istediğiniz zaman kapatabilirsiniz.',
    [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Devam', onPress: onContinue },
    ]
  );
}

export async function enableGuestLiveLocationFromPermissions(
  meta: GuestLiveLocationMeta
): Promise<GuestLocationPermissionSnapshot> {
  return new Promise((resolve) => {
    showGuestLiveLocationExplainer(() => {
      void (async () => {
        const { foregroundGranted } = await requestGuestLiveLocationPermissions();
        if (!foregroundGranted) {
          resolve(await getGuestLocationPermissionSnapshot());
          return;
        }
        await setGuestLiveLocationOptedOut(false);
        await startGuestLiveLocationSharing(meta);
        resolve(await getGuestLocationPermissionSnapshot());
      })();
    });
  });
}

export async function disableGuestLiveLocationFromPermissions(): Promise<void> {
  await setGuestLiveLocationOptedOut(true);
  await stopGuestLiveLocationSharing(true);
}

/** Harita açılışında — varsayılan açık; açıklama penceresi göstermeden izin dener. */
export async function tryAutoEnableGuestLiveLocation(meta: GuestLiveLocationMeta): Promise<boolean> {
  if (!(await shouldAutoEnableGuestLiveLocation())) return false;
  const snap = await getGuestLocationPermissionSnapshot();
  if (snap.enabled && snap.foreground === 'granted') {
    await syncGuestLiveLocationSharing(meta);
    return true;
  }
  return enableGuestLiveLocationQuiet(meta);
}

export async function enableGuestLiveLocationQuiet(meta: GuestLiveLocationMeta): Promise<boolean> {
  if (Platform.OS === 'web' || isExpoGo) return false;
  const { foregroundGranted } = await requestGuestLiveLocationPermissions();
  if (!foregroundGranted) return false;
  await setGuestLiveLocationOptedOut(false);
  return startGuestLiveLocationSharing(meta);
}

export async function enableGuestLiveLocationInteractive(
  meta: GuestLiveLocationMeta
): Promise<GuestLocationPermissionSnapshot> {
  return enableGuestLiveLocationFromPermissions(meta);
}
