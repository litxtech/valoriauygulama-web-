/**
 * Valoria Hotel - Expo Push Notifications
 * Token alma, backend'e kaydetme, bildirim tıklama yönlendirmesi.
 * Expo Go'da push desteklenmediği için (SDK 53+) bu modül Expo Go'da no-op çalışır.
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ExpoNotifications from '@/lib/expoNotificationsModule';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { isPostgrestSchemaCacheError, sleepMs } from '@/lib/supabaseTransientErrors';
import { emitPermissionLiveChange } from '@/lib/permissionLive';

const EXPO_PUSH_TOKEN_KEY = 'valoria_expo_push_token';
const STAFF_ROOM_CLEANING_SOUND_PREF_KEY = 'staff_notif_room_cleaning_mark_sound_enabled';
const STAFF_FEATURE_SOUND_PREF_KEY_PREFIX = 'staff_notif_sound_enabled:';

function normalizeRpcError(error: unknown): {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
  raw: string;
} {
  if (!error || typeof error !== 'object') {
    return {
      message: 'Unknown RPC error',
      raw: String(error),
    };
  }

  const e = error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
  const message = typeof e.message === 'string' && e.message.trim().length > 0
    ? e.message
    : 'RPC returned an empty message';

  return {
    message,
    code: typeof e.code === 'string' ? e.code : undefined,
    details: typeof e.details === 'string' ? e.details : undefined,
    hint: typeof e.hint === 'string' ? e.hint : undefined,
    raw: JSON.stringify(error),
  };
}

/** Expo Go içinde çalışıyoruz; push bildirimleri dev build'de çalışır */
export const isExpoGo = Constants.appOwnership === 'expo';

function getNotifications(): typeof ExpoNotifications | null {
  if (Platform.OS === 'web' || isExpoGo) return null;
  return ExpoNotifications;
}

/** Uygulama açıkken gelen bildirim: üst banner + liste + ses (Expo SDK 54+). Android'de ses kapalıysa heads-up da gelmez. */
const VALORIA_CHANNEL_ID = 'valoria_urgent';
// Android notification channels are immutable on many devices; version the silent channel ID
// so users with older sound-enabled channel config reliably get a truly silent channel.
const SILENT_CHANNEL_ID = 'valoria_silent_v2';
const EMERGENCY_CHANNEL_ID = 'valoria_emergency_alert';
const EMERGENCY_SOUND_NAME = 'emergency_alert.wav';

let pushPresentationInitialized = false;

function normalizeNotificationType(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase();
}

async function shouldMuteByStaffFeaturePreference(notificationType: string): Promise<boolean> {
  if (!notificationType || notificationType === 'message' || notificationType === 'admin_announcement') {
    return false;
  }
  const stored = await AsyncStorage.getItem(`${STAFF_FEATURE_SOUND_PREF_KEY_PREFIX}${notificationType}`);
  return stored === '0';
}

/** Root veya modül yükünde bir kez çağrılmalı; gecikmeli import ile handler bazen geç kalıyordu. */
export async function initPushNotificationsPresentation(): Promise<void> {
  if (Platform.OS === 'web' || isExpoGo || pushPresentationInitialized) return;
  try {
    const ExpoN = ExpoNotifications;
    const Notifications = ExpoN;

    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const data =
          notification?.request?.content?.data && typeof notification.request.content.data === 'object'
            ? (notification.request.content.data as Record<string, unknown>)
            : {};
        const muteSoundRaw = data.muteSound;
        const muteByPayload =
          muteSoundRaw === true ||
          muteSoundRaw === 'true' ||
          muteSoundRaw === 1 ||
          muteSoundRaw === '1';
        const notificationTypeRaw = data.notificationType ?? data.notification_type;
        const notificationType = normalizeNotificationType(notificationTypeRaw);
        const roomCleaningMarked = notificationType === 'staff_room_cleaning_status';
        const roomCleaningSoundPref = await AsyncStorage.getItem(STAFF_ROOM_CLEANING_SOUND_PREF_KEY);
        const roomCleaningSoundEnabled = roomCleaningSoundPref == null ? true : roomCleaningSoundPref === '1';
        const muteByLocalPref = roomCleaningMarked && !roomCleaningSoundEnabled;
        const muteByFeaturePref = await shouldMuteByStaffFeaturePreference(notificationType);
        const playSound = !(muteByPayload || muteByLocalPref || muteByFeaturePref);
        return {
          shouldPlaySound: playSound,
          shouldShowAlert: true,
          shouldShowBanner: true,
          shouldShowList: true,
          // Push payload'daki aps.badge / content.badge — iOS ön/arka planda simge sayacı için gerekli.
          shouldSetBadge: true,
          ...(Platform.OS === 'android'
            ? { priority: ExpoN.AndroidNotificationPriority.MAX }
            : {}),
        };
      },
    });
    pushPresentationInitialized = true;

    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync(VALORIA_CHANNEL_ID, {
          name: 'Valoria Bildirimleri',
          importance: ExpoN.AndroidImportance.MAX,
          enableVibrate: true,
          enableLights: true,
          lockscreenVisibility: ExpoN.AndroidNotificationVisibility.PUBLIC,
          sound: 'default',
          vibrationPattern: [0, 250, 250, 250],
          showBadge: true,
          description: 'Mesajlar, beğeniler ve duyurular',
        });

        await Notifications.setNotificationChannelAsync('valoria', {
          name: 'Valoria Bildirimleri',
          importance: ExpoN.AndroidImportance.MAX,
          enableVibrate: true,
          enableLights: true,
          lockscreenVisibility: ExpoN.AndroidNotificationVisibility.PUBLIC,
          sound: 'default',
          vibrationPattern: [0, 250, 250, 250],
          showBadge: true,
        });

        await Notifications.setNotificationChannelAsync('default', {
          name: 'Bildirimler',
          importance: ExpoN.AndroidImportance.MAX,
          enableVibrate: true,
          enableLights: true,
          lockscreenVisibility: ExpoN.AndroidNotificationVisibility.PUBLIC,
          sound: 'default',
          vibrationPattern: [0, 250, 250, 250],
          showBadge: true,
        });
        await Notifications.setNotificationChannelAsync(SILENT_CHANNEL_ID, {
          name: 'Sessiz Bildirimler',
          importance: ExpoN.AndroidImportance.MAX,
          enableVibrate: true,
          enableLights: true,
          lockscreenVisibility: ExpoN.AndroidNotificationVisibility.PUBLIC,
          sound: null,
          vibrationPattern: [0, 250, 250, 250],
          showBadge: true,
          description: 'Ses kapali ama gorunur bildirimler',
        });
        await Notifications.setNotificationChannelAsync(EMERGENCY_CHANNEL_ID, {
          name: 'Acil Durum Bildirimleri',
          importance: ExpoN.AndroidImportance.MAX,
          enableVibrate: true,
          enableLights: true,
          lockscreenVisibility: ExpoN.AndroidNotificationVisibility.PUBLIC,
          sound: EMERGENCY_SOUND_NAME,
          vibrationPattern: [0, 350, 200, 350, 200, 350],
          showBadge: true,
          description: 'Personel acil durum alarmlari',
        });
      } catch (e) {
        log.warn('notificationsPush', 'Android kanal ayarı', e);
      }
    }
  } catch (e) {
    log.warn('notificationsPush', 'initPushNotificationsPresentation', e);
  }
}

if (!isExpoGo) {
  void initPushNotificationsPresentation();
}

/** iOS: getExpoPushTokenAsync bazen asla resolve etmez (SDK 53+). Listener'ın uygulama başında kayıtlı olması gerekir. */
const IOS_TOKEN_TIMEOUT_MS = 14000;

/** iOS'ta push token'ın alınabilmesi için listener'ı uygulama başında kaydet. Root _layout'ta bir kez çağrılmalı. */
export function registerIOSPushTokenListener(): () => void {
  if (Platform.OS !== 'ios' || isExpoGo) return () => {};
  let removed = false;
  const addListener = (ExpoNotifications as {
    addPushTokenListener?: (cb: (token: unknown) => void) => { remove: () => void };
  }).addPushTokenListener;
  if (typeof addListener === 'function') {
    addListener((payload: unknown) => {
      if (removed) return;
      const data = payload && typeof payload === 'object' && 'data' in payload ? (payload as { data: string }).data : payload;
      const t = typeof data === 'string' ? data : null;
      if (t && t.startsWith('ExponentPushToken')) {
        AsyncStorage.setItem(EXPO_PUSH_TOKEN_KEY, t).catch(() => {});
        log.info('notificationsPush', 'iOS push token listener ile alındı');
      }
    });
  }
  return () => {
    removed = true;
  };
}

/** İzin iste, Expo push token al; yoksa null (web, Expo Go veya izin reddi). */
/** Android 13+: Kanal token isteğinden önce oluşturulmalı; sesli bildirim için default kanal. */
/** iOS: İzin için açık seçenekler + token için listener/timeout workaround kullanılır. */
export async function getExpoPushTokenAsync(): Promise<string | null> {
  if (Platform.OS === 'web' || isExpoGo) return null;
  try {
    const Notifications = getNotifications();
    if (!Notifications) return null;
    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync(VALORIA_CHANNEL_ID, {
          name: 'Valoria Bildirimleri',
          importance: Notifications.AndroidImportance.MAX,
          enableVibrate: true,
          enableLights: true,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          sound: 'default',
          vibrationPattern: [0, 250, 250, 250],
          showBadge: true,
          description: 'Mesajlar, beğeniler ve duyurular',
        });
        await Notifications.setNotificationChannelAsync('valoria', {
          name: 'Valoria Bildirimleri',
          importance: Notifications.AndroidImportance.MAX,
          enableVibrate: true,
          enableLights: true,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          sound: 'default',
          vibrationPattern: [0, 250, 250, 250],
          showBadge: true,
        });
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Bildirimler',
          importance: Notifications.AndroidImportance.MAX,
          enableVibrate: true,
          enableLights: true,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          sound: 'default',
          vibrationPattern: [0, 250, 250, 250],
          showBadge: true,
        });
        await Notifications.setNotificationChannelAsync(SILENT_CHANNEL_ID, {
          name: 'Sessiz Bildirimler',
          importance: Notifications.AndroidImportance.MAX,
          enableVibrate: true,
          enableLights: true,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          sound: null,
          vibrationPattern: [0, 250, 250, 250],
          showBadge: true,
          description: 'Ses kapali ama gorunur bildirimler',
        });
        await Notifications.setNotificationChannelAsync(EMERGENCY_CHANNEL_ID, {
          name: 'Acil Durum Bildirimleri',
          importance: Notifications.AndroidImportance.MAX,
          enableVibrate: true,
          enableLights: true,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          sound: EMERGENCY_SOUND_NAME,
          vibrationPattern: [0, 350, 200, 350, 200, 350],
          showBadge: true,
          description: 'Personel acil durum alarmlari',
        });
      } catch (e) {
        log.warn('notificationsPush', 'Android kanal (token öncesi)', e);
      }
    }
    const { status: existing } = await Notifications.getPermissionsAsync();
    let final = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync(
        Platform.OS === 'ios'
          ? { ios: { allowAlert: true, allowBadge: true, allowSound: true } }
          : undefined
      );
      final = status;
      emitPermissionLiveChange();
    }
    if (existing === 'granted') emitPermissionLiveChange();
    if (final !== 'granted') {
      log.warn('notificationsPush', 'Push izni verilmedi');
      return null;
    }
    if (Platform.OS === 'ios') {
      const ios = (await Notifications.getPermissionsAsync()).ios;
      if (ios && ios.allowsAlert === false) {
        log.warn(
          'notificationsPush',
          'iOS: uyarı/banner kapalı — Ayarlar > Valoria > Bildirimler > Bildirimlere İzin Ver'
        );
      }
      if (ios && ios.allowsBadge === false) {
        log.warn('notificationsPush', 'iOS: rozet izni kapalı');
      }
      try {
        const native = await Notifications.getDevicePushTokenAsync();
        if (!native?.data) {
          log.warn('notificationsPush', 'iOS APNs device token alınamadı — native dev client yeniden derleyin');
        }
      } catch (e) {
        log.warn('notificationsPush', 'getDevicePushTokenAsync', e);
      }
    }
    const projectId = (Constants.expoConfig as { extra?: { eas?: { projectId?: string } } } | null)?.extra?.eas?.projectId;

    if (Platform.OS === 'ios') {
      // iOS'ta getExpoPushTokenAsync bazen hiç dönmüyor (SDK 53+). Listener + timeout ile token al.
      let listenerResolve: (t: string | null) => void = () => {};
      const listenerPromise = new Promise<string | null>((resolve) => {
        listenerResolve = resolve;
      });
      let listenerRemover: (() => void) | undefined;
      try {
        const addListener = (Notifications as { addPushTokenListener?: (cb: (token: unknown) => void) => { remove: () => void } }).addPushTokenListener;
        if (typeof addListener === 'function') {
          const sub = addListener((payload: unknown) => {
            const data = payload && typeof payload === 'object' && 'data' in payload ? (payload as { data: string }).data : payload;
            const t = typeof data === 'string' ? data : null;
            if (t && t.startsWith('ExponentPushToken')) {
              AsyncStorage.setItem(EXPO_PUSH_TOKEN_KEY, t).catch(() => {});
              listenerResolve(t);
              listenerRemover?.();
            }
          });
          if (sub?.remove) listenerRemover = sub.remove;
        }
      } catch (e) {
        log.warn('notificationsPush', 'addPushTokenListener', e);
      }
      const tokenPromise = projectId
        ? Notifications.getExpoPushTokenAsync({ projectId }).then((d) => d?.data ?? null)
        : Notifications.getExpoPushTokenAsync().then((d) => d?.data ?? null);
      const timeoutPromise = new Promise<string | null>((resolve) =>
        setTimeout(() => resolve(null), IOS_TOKEN_TIMEOUT_MS)
      );
      const token = await Promise.race([tokenPromise, listenerPromise, timeoutPromise]);
      listenerRemover?.();
      if (token) await AsyncStorage.setItem(EXPO_PUSH_TOKEN_KEY, token);
      if (!token) log.warn('notificationsPush', 'iOS push token zaman aşımı veya henüz gelmedi');
      return token;
    }

    if (!projectId) {
      const tokenData = await Notifications.getExpoPushTokenAsync();
      const token = tokenData?.data ?? null;
      if (token) await AsyncStorage.setItem(EXPO_PUSH_TOKEN_KEY, token);
      return token;
    }
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData?.data ?? null;
    if (token) await AsyncStorage.setItem(EXPO_PUSH_TOKEN_KEY, token);
    return token;
  } catch (e) {
    log.error('notificationsPush', 'getExpoPushTokenAsync', e);
    return null;
  }
}

/** Cihazda kayıtlı Expo push token */
export async function getStoredExpoPushToken(): Promise<string | null> {
  return AsyncStorage.getItem(EXPO_PUSH_TOKEN_KEY);
}

/** Ana ekrandaki uygulama simgesi rozet sayısı (iOS’ta kesin; Android launcher desteğine bağlı). */
export async function setOsAppIconBadgeCount(count: number): Promise<void> {
  if (Platform.OS === 'web' || isExpoGo) return;
  try {
    const Notifications = getNotifications();
    if (!Notifications || typeof Notifications.setBadgeCountAsync !== 'function') return;
    const n = Math.max(0, Math.min(999, Math.floor(count)));
    await Notifications.setBadgeCountAsync(n);
  } catch (e) {
    log.warn('notificationsPush', 'setOsAppIconBadgeCount', e);
  }
}

/**
 * Gelen Expo/FCM/APNs bildirimindeki rozet (content.badge veya data.app_badge) — ön planda anında.
 * Arka planda yalnızca sistem (push payload) güncelleyebilir; bu fonksiyon o durumda çağrılmaz.
 */
export async function applyBadgeFromExpoNotificationPayload(
  n: { request?: { content?: import('expo-notifications').NotificationContent } } | null | undefined
): Promise<void> {
  if (Platform.OS === 'web' || isExpoGo) return;
  const c = n?.request?.content;
  if (!c) return;
  if (c.badge != null && c.badge !== undefined) {
    const raw = c.badge;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
      await setOsAppIconBadgeCount(Math.min(999, Math.floor(raw)));
      return;
    }
  }
  const d = c.data;
  if (d && typeof d === 'object' && d !== null) {
    const o = d as Record<string, unknown>;
    const ab = o.app_badge;
    if (typeof ab === 'number' && ab >= 0) {
      await setOsAppIconBadgeCount(Math.min(999, Math.floor(ab)));
      return;
    }
    if (typeof ab === 'string' && /^\d+$/.test(ab)) {
      await setOsAppIconBadgeCount(Math.min(999, parseInt(ab, 10)));
      return;
    }
  }
}

/** Personel giriş yaptığında: push token'ı backend'e kaydet. RLS yüzünden doğrudan upsert aynı cihazda hesap değişince başarısız olabiliyordu; RPC kullanılır. */
export async function savePushTokenForStaff(staffId: string): Promise<void> {
  if (isExpoGo) return;
  let token = await getStoredExpoPushToken();
  if (!token) token = await getExpoPushTokenAsync();
  if (!token) return;
  try {
    const maxAttempts = 4;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const { error } = await supabase.rpc('upsert_staff_push_token', {
        p_token: token,
        p_device_info: { platform: Platform.OS },
      });
      if (!error) {
        log.info('notificationsPush', 'Staff push token kaydedildi', { staffId: staffId.slice(0, 8) });
        return;
      }
      if (isPostgrestSchemaCacheError(error) && attempt < maxAttempts) {
        await sleepMs(350 * attempt);
        continue;
      }
      if (isPostgrestSchemaCacheError(error)) {
        const normalized = normalizeRpcError(error);
        log.warn('notificationsPush', 'savePushTokenForStaff RPC (geçici şema/PostgREST, sonra tekrar denenecek)', {
          message: normalized.message,
          code: normalized.code,
          details: normalized.details,
          hint: normalized.hint,
          raw: normalized.raw,
          staffIdPrefix: staffId.slice(0, 8),
        });
      } else {
        const normalized = normalizeRpcError(error);
        log.error('notificationsPush', 'savePushTokenForStaff RPC', {
          message: normalized.message,
          code: normalized.code,
          details: normalized.details,
          hint: normalized.hint,
          raw: normalized.raw,
          staffIdPrefix: staffId.slice(0, 8),
        });
      }
      return;
    }
  } catch (e) {
    log.error('notificationsPush', 'savePushTokenForStaff', e);
  }
}

/** Misafir app_token ile: push token'ı backend'e kaydet (RPC ile push_tokens.guest_id). Token yoksa önce izin isteyip alır. */
export async function savePushTokenForGuest(appToken: string): Promise<void> {
  if (isExpoGo) return;
  if (!appToken) return;
  let token = await getStoredExpoPushToken();
  if (!token) token = await getExpoPushTokenAsync();
  if (!token) return;
  try {
    const maxAttempts = 4;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const { error } = await supabase.rpc('upsert_guest_push_token', {
        p_app_token: appToken,
        p_token: token,
      });
      if (!error) {
        log.info('notificationsPush', 'Guest push token kaydedildi');
        return;
      }
      if (isPostgrestSchemaCacheError(error) && attempt < maxAttempts) {
        await sleepMs(350 * attempt);
        continue;
      }
      if (isPostgrestSchemaCacheError(error)) {
        log.warn('notificationsPush', 'savePushTokenForGuest RPC (geçici şema/PostgREST)', {
          message: error.message,
          code: (error as { code?: string }).code,
        });
      } else {
        log.error('notificationsPush', 'savePushTokenForGuest RPC', {
          message: error.message,
          code: (error as { code?: string }).code,
          details: (error as { details?: string }).details,
          hint: (error as { hint?: string }).hint,
        });
      }
      return;
    }
  } catch (e) {
    log.error('notificationsPush', 'savePushTokenForGuest', e);
  }
}

/** Uygulama bildirime tıklanarak açıldıysa (cold start) son yanıtı döndürür. Expo Go'da null. */
export async function getLastNotificationResponseAsync(): Promise<{
  notification: { request: { content: { data?: Record<string, unknown> } } };
} | null> {
  if (isExpoGo) return null;
  try {
    const Notifications = getNotifications();
    if (!Notifications) return null;
    const response = await Notifications.getLastNotificationResponseAsync();
    if (!response) return null;
    return response as unknown as { notification: { request: { content: { data?: Record<string, unknown> } } } };
  } catch (e) {
    log.warn('notificationsPush', 'getLastNotificationResponseAsync', e);
    return null;
  }
}

/** Bildirime tıklandığında çağrılacak (root layout'ta listener ile bağlanır). Expo Go'da no-op. */
export function addNotificationResponseListener(
  handler: (response: { notification: { request: { content: { data?: Record<string, unknown> } } } }) => void
): () => void {
  if (Platform.OS === 'web' || isExpoGo) return () => {};
  const noop = (): void => {};
  const cleanup = { remove: noop };
  const Notifications = getNotifications();
  if (!Notifications || typeof Notifications.addNotificationResponseReceivedListener !== 'function') {
    return () => {};
  }
  const sub = Notifications.addNotificationResponseReceivedListener(
    handler as (r: import('expo-notifications').NotificationResponse) => void
  );
  cleanup.remove = () => sub.remove();
  return () => cleanup.remove();
}

/** Uygulama öndeyken bildirim geldiğinde çağrılır (uyarı göstermek için). Expo Go'da no-op. */
export function addNotificationReceivedListener(
  handler: (notification: import('expo-notifications').Notification) => void
): () => void {
  if (Platform.OS === 'web' || isExpoGo) return () => {};
  const noop = (): void => {};
  const cleanup = { remove: noop };
  const Notifications = getNotifications();
  if (!Notifications || typeof Notifications.addNotificationReceivedListener !== 'function') {
    return () => {};
  }
  const sub = Notifications.addNotificationReceivedListener(
    handler as (n: import('expo-notifications').Notification) => void
  );
  cleanup.remove = () => sub.remove();
  return () => cleanup.remove();
}
