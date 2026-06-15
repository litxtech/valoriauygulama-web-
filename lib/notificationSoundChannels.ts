import { Platform } from 'react-native';
import ExpoNotifications from '@/lib/expoNotificationsModule';
import { isExpoGo } from '@/lib/notificationsPush';
import { log } from '@/lib/logger';
import type { NotificationSoundSettingRow } from '@/lib/notificationSoundSettings';
import { NOTIFICATION_SOUND_FEATURES } from '@/lib/notificationSoundCatalog';
import { resolveAndroidChannelSoundArg } from '@/lib/notificationSoundAndroidCache';

/** Android: org ses ayarlarına göre kanalları günceller (ses değişince version artırılmış channel id). */
export async function syncAndroidNotificationSoundChannels(
  rows: NotificationSoundSettingRow[]
): Promise<void> {
  if (Platform.OS !== 'android' || isExpoGo) return;
  const Notifications = ExpoNotifications;
  if (!Notifications?.setNotificationChannelAsync) return;

  const organizationId = rows.find((r) => r.organization_id)?.organization_id?.trim();
  const activeRows = rows.filter((r) => r.is_active && r.platform_android_enabled);
  const toSync = activeRows.length > 0 ? activeRows : [];

  const defs = NOTIFICATION_SOUND_FEATURES;
  for (const def of defs) {
    const row = toSync.find((r) => r.feature_key === def.featureKey);
    const version = row?.android_channel_version ?? 1;
    const channelId =
      row?.android_channel_id?.trim() ||
      `${def.defaultAndroidChannelId}_v${version}`;
    const isEmergency = def.priority === 'emergency';

    let soundArg: string | null = 'default';
    if (organizationId) {
      soundArg = await resolveAndroidChannelSoundArg(
        organizationId,
        def.featureKey,
        row?.sound_file_url,
        row?.android_push_sound,
        def.defaultAndroidPushSound
      );
    } else {
      const fallback = row?.android_push_sound?.trim() || def.defaultAndroidPushSound;
      soundArg = !fallback || fallback === 'default' ? 'default' : fallback;
    }

    try {
      await Notifications.setNotificationChannelAsync(channelId, {
        name: def.titleTr,
        importance: Notifications.AndroidImportance.MAX,
        enableVibrate: true,
        enableLights: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        sound: soundArg === 'default' ? 'default' : soundArg,
        vibrationPattern: isEmergency ? [0, 350, 200, 350, 200, 350] : [0, 250, 250, 250],
        showBadge: true,
        description: def.descriptionTr,
      });
      log.info('notificationSoundChannels', 'synced', { channelId, hasCustomUrl: !!row?.sound_file_url });
    } catch (e) {
      log.warn('notificationSoundChannels', `channel ${channelId}`, e);
    }
  }
}
