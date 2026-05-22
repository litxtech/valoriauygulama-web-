/**
 * Web: push bildirimleri yok — kök layout ve izin ekranları çökmemeli.
 * Eksik API çağrıları no-op döner.
 */
import { Platform } from 'react-native';

const noopRemove = { remove: () => {} };

const noopPermissions = async () => ({
  status: 'denied' as const,
  granted: false,
  canAskAgain: false,
  ios: undefined,
  android: undefined,
});

const webNotifications = {
  getPermissionsAsync: noopPermissions,
  requestPermissionsAsync: noopPermissions,
  getLastNotificationResponseAsync: async () => null,
  addNotificationResponseReceivedListener: () => noopRemove,
  addNotificationReceivedListener: () => noopRemove,
  addPushTokenListener: () => noopRemove,
  setNotificationHandler: () => {},
  setBadgeCountAsync: async () => {},
  setNotificationChannelAsync: async () => 'default',
  getExpoPushTokenAsync: async () => ({ data: null }),
  getDevicePushTokenAsync: async () => ({ data: null }),
  registerTaskAsync: async () => {},
  AndroidImportance: { MAX: 5 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
};

export default webNotifications;

/** Platform.OS kontrolü — web bundle'da native modül import edilmesin */
export const isWebNotificationsStub = Platform.OS === 'web';
