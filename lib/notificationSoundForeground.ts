import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { log } from '@/lib/logger';
import { useAuthStore } from '@/stores/authStore';
import {
  fetchOrgNotificationSoundSettings,
  getSoundSettingForFeature,
  resolvePushSoundPayload,
} from '@/lib/notificationSoundSettings';
import { syncAndroidNotificationSoundChannels } from '@/lib/notificationSoundChannels';
import {
  playNotificationSoundPreset,
  playNotificationSoundUrl,
} from '@/lib/notificationSoundPlayer';
import {
  clampPlaybackDurationSec,
  getNotificationSoundFeatureDef,
  resolveNotificationFeatureKey,
} from '@/lib/notificationSoundCatalog';
import { pushPayloadSuppressDefaultSound } from '@/lib/notificationSoundAndroidCache';

const STAFF_SOUND_PREF_PREFIX = 'staff_notif_sound_enabled:';
const STAFF_SOUND_MASTER_KEY = 'staff_notif_sounds_master_enabled';

export async function syncNotificationSoundsForStaff(staffId: string, organizationId: string): Promise<void> {
  if (!staffId || !organizationId) return;
  try {
    const rows = await fetchOrgNotificationSoundSettings(organizationId);
    await syncAndroidNotificationSoundChannels(rows);
  } catch (e) {
    log.warn('notificationSoundForeground', 'sync', e);
  }
}

async function isSoundMutedForUser(featureKey: string): Promise<boolean> {
  const def = getNotificationSoundFeatureDef(featureKey);
  if (def && !def.userCanMuteSound) return false;
  const master = await AsyncStorage.getItem(STAFF_SOUND_MASTER_KEY);
  if (master === '0') return true;
  const stored = await AsyncStorage.getItem(`${STAFF_SOUND_PREF_PREFIX}${featureKey}`);
  return stored === '0';
}

/** Uygulama ön plandayken gelen push için org sesini çal */
export async function playForegroundNotificationSound(
  payload: Record<string, unknown> | undefined,
  organizationId?: string | null
): Promise<void> {
  if (!payload) return;
  const muteRaw = payload.muteSound;
  if (muteRaw === true || muteRaw === 'true' || muteRaw === 1 || muteRaw === '1') return;

  const notificationType =
    typeof payload.notificationType === 'string'
      ? payload.notificationType
      : typeof payload.notification_type === 'string'
        ? payload.notification_type
        : '';
  const featureKey =
    typeof payload.feature_key === 'string' && payload.feature_key.trim()
      ? payload.feature_key.trim()
      : resolveNotificationFeatureKey(notificationType);

  if (await isSoundMutedForUser(featureKey)) return;

  let suppressDefault = pushPayloadSuppressDefaultSound(payload);

  const def = getNotificationSoundFeatureDef(featureKey);
  let playbackSec =
    typeof payload.soundDurationSec === 'number' && Number.isFinite(payload.soundDurationSec)
      ? Math.round(payload.soundDurationSec)
      : typeof payload.sound_duration === 'number' && Number.isFinite(payload.sound_duration)
        ? Math.round(payload.sound_duration)
        : null;

  if (organizationId) {
    try {
      const rows = await fetchOrgNotificationSoundSettings(organizationId);
      const row = getSoundSettingForFeature(rows, featureKey);
      if (row?.suppress_default_sound && row.sound_file_url?.trim()) {
        suppressDefault = true;
      }
      if (Platform.OS === 'android') {
        await syncAndroidNotificationSoundChannels(rows);
      }
      const resolved = resolvePushSoundPayload(rows, notificationType);
      playbackSec = playbackSec ?? resolved.playbackDurationSec;
      suppressDefault = suppressDefault || resolved.suppressDefaultSound;
      if (resolved.soundFileUrl) {
        const r = await playNotificationSoundUrl(resolved.soundFileUrl, resolved.playbackDurationSec);
        if (r.ok) return;
        if (suppressDefault) return;
      } else if (suppressDefault) {
        return;
      }
    } catch (e) {
      log.warn('notificationSoundForeground', 'org sound', e);
      if (suppressDefault) return;
    }
  } else if (suppressDefault) {
    return;
  }

  const durationSec = clampPlaybackDurationSec(
    playbackSec ?? def?.maxDurationSec,
    featureKey
  );

  const preset =
    typeof payload.sound === 'string' && payload.sound.trim()
      ? payload.sound.trim()
      : def?.defaultIosPushSound ?? 'default';
  await playNotificationSoundPreset(preset, featureKey, durationSec);
}

export function scheduleStaffNotificationSoundSync(): void {
  const { staff } = useAuthStore.getState();
  if (!staff?.id || !staff.organization_id) return;
  void syncNotificationSoundsForStaff(staff.id, staff.organization_id);
}
