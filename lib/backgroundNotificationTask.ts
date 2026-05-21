/**
 * Uzaktan bildirim geldiğinde (arka plan) rozet — expo-task-manager native modülü
 * dev client yenilenmeden yüklenirse crash olmaz (lazy require).
 */
import { Platform } from 'react-native';
import type { NotificationTaskPayload } from 'expo-notifications';
import { requireOptionalNativeModule } from 'expo-modules-core';
import ExpoNotifications from '@/lib/expoNotificationsModule';
import { applyBadgeFromExpoNotificationPayload, isExpoGo } from '@/lib/notificationsPush';
import { log } from '@/lib/logger';

export const BACKGROUND_NOTIFICATION_TASK = 'VALORIA_BACKGROUND_NOTIFICATION';

let loggedNativeMissing = false;
let taskDefined = false;

function isTaskManagerNativeAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  return Boolean(requireOptionalNativeModule('ExpoTaskManager'));
}

function badgeFromTaskPayload(data: NotificationTaskPayload): number | null {
  if (!data || typeof data !== 'object' || 'actionIdentifier' in data) return null;

  const aps = (data as { aps?: Record<string, unknown> }).aps;
  const apsBadge = aps?.badge;
  if (typeof apsBadge === 'number' && apsBadge >= 0) return Math.min(999, Math.floor(apsBadge));

  const dataString = (data as { data?: { dataString?: string } }).data?.dataString;
  if (typeof dataString === 'string' && dataString.length > 0) {
    try {
      const parsed = JSON.parse(dataString) as Record<string, unknown>;
      const ab = parsed.app_badge;
      if (typeof ab === 'number' && ab >= 0) return Math.min(999, Math.floor(ab));
      if (typeof ab === 'string' && /^\d+$/.test(ab)) return Math.min(999, parseInt(ab, 10));
    } catch {
      /* ignore */
    }
  }
  return null;
}

function ensureTaskDefined(): boolean {
  if (taskDefined) return true;
  if (!isTaskManagerNativeAvailable()) {
    if (!loggedNativeMissing) {
      loggedNativeMissing = true;
      log.info(
        'backgroundNotificationTask',
        'native module missing — rebuild dev client after expo-task-manager install'
      );
    }
    return false;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const TaskManager = require('expo-task-manager') as typeof import('expo-task-manager');
    TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
      if (error) {
        log.warn('backgroundNotificationTask', 'task error', error);
        return;
      }
      if (!data || typeof data !== 'object') return;
      try {
        const count = badgeFromTaskPayload(data as NotificationTaskPayload);
        if (count != null) {
          await ExpoNotifications.setBadgeCountAsync(count);
          return;
        }
        const aps = (data as { aps?: Record<string, unknown> }).aps;
        if (aps) {
          await applyBadgeFromExpoNotificationPayload({
            request: { content: { badge: aps.badge as number | undefined, data: aps } },
          });
        }
      } catch (e) {
        log.warn('backgroundNotificationTask', 'badge apply failed', e);
      }
    });
    taskDefined = true;
    return true;
  } catch (e) {
    log.warn('backgroundNotificationTask', 'defineTask failed', e);
    return false;
  }
}

let registerAttempted = false;

export async function registerBackgroundNotificationTask(): Promise<void> {
  if (Platform.OS === 'web' || isExpoGo || registerAttempted) return;
  registerAttempted = true;
  if (!ensureTaskDefined()) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const TaskManager = require('expo-task-manager') as typeof import('expo-task-manager');
    const already = await TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK);
    if (!already) {
      await ExpoNotifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
      log.info('backgroundNotificationTask', 'registered');
    }
  } catch (e) {
    log.warn('backgroundNotificationTask', 'register failed', e);
  }
}
