import * as FileSystem from 'expo-file-system';
import { log } from '@/lib/logger';

const CACHE_DIR = `${FileSystem.documentDirectory ?? ''}notification-sounds/`;

export type CachedAndroidSound = {
  localUri: string;
  fileName: string;
};

function extensionFromUrl(url: string, fallback = 'wav'): string {
  const path = url.split('?')[0] ?? '';
  const m = path.match(/\.([a-z0-9]+)$/i);
  return m?.[1]?.toLowerCase() ?? fallback;
}

function hashUrl(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) h = ((h << 5) - h + url.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

function cachePathFor(organizationId: string, featureKey: string, soundUrl: string): string {
  const ext = extensionFromUrl(soundUrl);
  return `${CACHE_DIR}${organizationId}_${featureKey}_${hashUrl(soundUrl)}.${ext}`;
}

async function ensureCacheDir(): Promise<void> {
  if (!FileSystem.documentDirectory) return;
  const info = await FileSystem.getInfoAsync(CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  }
}

/** Admin panelden yüklenen sesi Android kanalı / arka plan için cihaza indirir. */
export async function cacheNotificationSoundForAndroid(
  organizationId: string,
  featureKey: string,
  soundUrl: string
): Promise<CachedAndroidSound | null> {
  const url = soundUrl?.trim();
  if (!url || !organizationId || !featureKey || !FileSystem.documentDirectory) return null;
  try {
    await ensureCacheDir();
    const dest = cachePathFor(organizationId, featureKey, url);
    const existing = await FileSystem.getInfoAsync(dest);
    if (existing.exists && (existing.size ?? 0) > 0) {
      return { localUri: dest, fileName: dest.split('/').pop() ?? 'sound.wav' };
    }
    const dl = await FileSystem.downloadAsync(url, dest);
    if (dl.status !== 200) {
      log.warn('notificationSoundAndroidCache', 'download', { status: dl.status, featureKey });
      return null;
    }
    const info = await FileSystem.getInfoAsync(dl.uri);
    if (!info.exists || (info.size ?? 0) === 0) return null;
    return { localUri: dl.uri, fileName: dest.split('/').pop() ?? 'sound.wav' };
  } catch (e) {
    log.warn('notificationSoundAndroidCache', 'cache', featureKey, e);
    return null;
  }
}

export async function getCachedNotificationSoundUri(
  organizationId: string,
  featureKey: string,
  soundUrl: string
): Promise<string | null> {
  const cached = await cacheNotificationSoundForAndroid(organizationId, featureKey, soundUrl);
  return cached?.localUri ?? null;
}

/** Android NotificationChannel `sound` alanı — önce önbellek URI, yoksa bundle adı. */
export async function resolveAndroidChannelSoundArg(
  organizationId: string,
  featureKey: string,
  soundFileUrl: string | null | undefined,
  androidPushSound: string | null | undefined,
  defaultPushSound: string
): Promise<string | null> {
  const url = soundFileUrl?.trim();
  if (url && organizationId) {
    const local = await getCachedNotificationSoundUri(organizationId, featureKey, url);
    if (local) return local;
  }
  const bundled = (androidPushSound?.trim() || defaultPushSound || 'default').trim();
  if (!bundled || bundled === 'default') return 'default';
  return bundled;
}

export function pushPayloadHasCustomOrgSound(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  if (data.customOrgSound === true || data.customOrgSound === 'true') return true;
  const url = data.sound_file_url;
  return typeof url === 'string' && url.trim().length > 0;
}

/** Admin panel: varsayılan sistem/push sesi kapalı — yalnızca özel dosya çalsın. */
export function pushPayloadSuppressDefaultSound(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  const flag = data.suppressDefaultSound ?? data.suppress_default_sound;
  if (flag === true || flag === 'true' || flag === 1 || flag === '1') return true;
  return false;
}

/** Ön plan / push handler: sistem sesini kapat (özel org sesi veya admin «varsayılanı kapat»). */
export function shouldMuteSystemNotificationSound(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  if (pushPayloadSuppressDefaultSound(data)) return true;
  return pushPayloadHasCustomOrgSound(data);
}
