import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import {
  NOTIFICATION_SOUND_FEATURES,
  NOTIFICATION_SOUND_STORAGE_BUCKET,
  clampPlaybackDurationSec,
  resolveNotificationFeatureKey,
  type NotificationSoundFeatureDef,
} from '@/lib/notificationSoundCatalog';
import { log } from '@/lib/logger';
import { isSupabaseUnavailableError, sanitizeSupabaseErrorMessage } from '@/lib/supabaseTransientErrors';

const CACHE_KEY_PREFIX = 'valoria_notif_sound_settings_v1:';
const CACHE_TTL_MS = 5 * 60 * 1000;

export type NotificationSoundSettingRow = {
  id: string;
  organization_id: string;
  feature_key: string;
  notification_type: string | null;
  title: string;
  description: string | null;
  sound_file_url: string | null;
  sound_file_name: string | null;
  sound_duration: number | null;
  ios_push_sound: string;
  android_push_sound: string;
  android_channel_id: string | null;
  android_channel_version: number;
  platform_ios_enabled: boolean;
  platform_android_enabled: boolean;
  is_active: boolean;
  /** true: yalnızca yüklenen özel ses; sistem/push varsayılanı kapalı */
  suppress_default_sound?: boolean;
  updated_at: string;
};

type CacheEntry = { at: number; rows: NotificationSoundSettingRow[] };

let memoryCache: { orgId: string; rows: NotificationSoundSettingRow[] } | null = null;

export async function ensureOrgNotificationSoundSettings(organizationId: string): Promise<void> {
  if (!organizationId) return;
  try {
    const { error } = await supabase.rpc('ensure_notification_sound_settings', {
      p_organization_id: organizationId,
    });
    if (error) {
      const msg = sanitizeSupabaseErrorMessage(error.message);
      if (!isSupabaseUnavailableError(error.message)) {
        log.warn('notificationSoundSettings', 'ensure', msg);
      }
    }
  } catch (e) {
    const msg = sanitizeSupabaseErrorMessage((e as Error)?.message);
    if (!isSupabaseUnavailableError((e as Error)?.message)) {
      log.warn('notificationSoundSettings', 'ensure', msg);
    }
  }
}

export async function fetchOrgNotificationSoundSettings(
  organizationId: string,
  opts?: { force?: boolean; seedDefaults?: boolean }
): Promise<NotificationSoundSettingRow[]> {
  if (!organizationId) return [];
  const now = Date.now();
  if (!opts?.force && memoryCache?.orgId === organizationId) {
    return memoryCache.rows;
  }
  try {
    const raw = await AsyncStorage.getItem(`${CACHE_KEY_PREFIX}${organizationId}`);
    if (!opts?.force && raw) {
      const parsed = JSON.parse(raw) as CacheEntry;
      if (parsed?.rows?.length && now - parsed.at < CACHE_TTL_MS) {
        memoryCache = { orgId: organizationId, rows: parsed.rows };
        return parsed.rows;
      }
    }
  } catch {
    // ignore
  }

  if (opts?.seedDefaults) {
    await ensureOrgNotificationSoundSettings(organizationId);
  }
  let data: NotificationSoundSettingRow[] | null = null;
  let error: { message?: string } | null = null;
  try {
    const res = await supabase
      .from('notification_sound_settings')
      .select('*')
      .eq('organization_id', organizationId)
      .order('title', { ascending: true });
    data = (res.data ?? null) as NotificationSoundSettingRow[] | null;
    error = res.error;
  } catch (e) {
    error = { message: (e as Error)?.message };
  }

  if (error) {
    if (!isSupabaseUnavailableError(error.message)) {
      log.warn('notificationSoundSettings', 'fetch', sanitizeSupabaseErrorMessage(error.message));
    }
    return memoryCache?.orgId === organizationId ? memoryCache.rows : [];
  }

  const rows = (data ?? []) as NotificationSoundSettingRow[];
  memoryCache = { orgId: organizationId, rows };
  try {
    await AsyncStorage.setItem(
      `${CACHE_KEY_PREFIX}${organizationId}`,
      JSON.stringify({ at: now, rows } satisfies CacheEntry)
    );
  } catch {
    // ignore
  }
  return rows;
}

export function invalidateNotificationSoundSettingsCache(organizationId?: string): void {
  memoryCache = null;
  if (organizationId) {
    void AsyncStorage.removeItem(`${CACHE_KEY_PREFIX}${organizationId}`);
  }
}

export function getSoundSettingForFeature(
  rows: NotificationSoundSettingRow[],
  featureKey: string
): NotificationSoundSettingRow | undefined {
  return rows.find((r) => r.feature_key === featureKey && r.is_active);
}

export function resolvePushSoundPayload(
  rows: NotificationSoundSettingRow[],
  notificationType?: string | null,
  category?: string | null
): {
  featureKey: string;
  iosPushSound: string;
  androidPushSound: string;
  androidChannelId: string;
  soundFileUrl: string | null;
  suppressDefaultSound: boolean;
  playbackDurationSec: number;
  priority: 'high' | 'normal';
} {
  const featureKey = resolveNotificationFeatureKey(notificationType, category);
  const def = NOTIFICATION_SOUND_FEATURES.find((f) => f.featureKey === featureKey);
  const row = getSoundSettingForFeature(rows, featureKey);

  const iosPushSound =
    row?.ios_push_sound?.trim() ||
    def?.defaultIosPushSound ||
    (featureKey === 'emergency_alert' ? 'emergency_alert.wav' : 'default');
  const androidPushSound =
    row?.android_push_sound?.trim() ||
    def?.defaultAndroidPushSound ||
    (featureKey === 'emergency_alert' ? 'emergency_alert.wav' : 'default');
  const version = row?.android_channel_version ?? 1;
  const androidChannelId =
    row?.android_channel_id?.trim() ||
    def?.defaultAndroidChannelId ||
    `valoria_ns_${featureKey}_v${version}`;

  return {
    featureKey,
    iosPushSound,
    androidPushSound,
    androidChannelId,
    soundFileUrl: row?.sound_file_url ?? null,
    suppressDefaultSound:
      row?.suppress_default_sound === true ||
      !!row?.sound_file_url?.trim(),
    playbackDurationSec: clampPlaybackDurationSec(row?.sound_duration, featureKey),
    priority: def?.priority === 'emergency' || featureKey === 'emergency_alert' ? 'high' : 'normal',
  };
}

export function storagePathForSound(
  organizationId: string,
  featureKey: string,
  fileName: string
): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${organizationId}/${featureKey}/${safe}`;
}

export function publicUrlForSoundPath(path: string): string {
  const { data } = supabase.storage.from(NOTIFICATION_SOUND_STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export function mergeCatalogWithRows(
  rows: NotificationSoundSettingRow[]
): Array<NotificationSoundSettingRow & { catalog?: NotificationSoundFeatureDef }> {
  const byKey = new Map(rows.map((r) => [r.feature_key, r]));
  return NOTIFICATION_SOUND_FEATURES.map((catalog) => {
    const existing = byKey.get(catalog.featureKey);
    if (existing) return { ...existing, catalog };
    return {
      id: '',
      organization_id: '',
      feature_key: catalog.featureKey,
      notification_type: null,
      title: catalog.titleTr,
      description: catalog.descriptionTr,
      sound_file_url: null,
      sound_file_name: null,
      sound_duration: null,
      ios_push_sound: catalog.defaultIosPushSound,
      android_push_sound: catalog.defaultAndroidPushSound,
      android_channel_id: catalog.defaultAndroidChannelId,
      android_channel_version: 1,
      platform_ios_enabled: true,
      platform_android_enabled: true,
      is_active: true,
      suppress_default_sound: false,
      updated_at: '',
      catalog,
    };
  });
}
