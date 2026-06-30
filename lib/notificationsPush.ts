/**
 * Valoria Hotel - Expo Push Notifications
 * Token alma, backend'e kaydetme, bildirim tıklama yönlendirmesi.
 * Expo Go'da push desteklenmediği için (SDK 53+) bu modül Expo Go'da no-op çalışır.
 */
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ExpoNotifications from '@/lib/expoNotificationsModule';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { isPostgrestSchemaCacheError, isSupabaseUnavailableError, sleepMs, sanitizeSupabaseErrorMessage } from '@/lib/supabaseTransientErrors';
import { resolveNotificationFeatureKey } from '@/lib/notificationSoundCatalog';
import { emitPermissionLiveChange } from '@/lib/permissionLive';
import { shouldMuteSystemNotificationSound } from '@/lib/notificationSoundAndroidCache';

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
    ? sanitizeSupabaseErrorMessage(e.message)
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
const VALORIA_MESSAGES_CHANNEL_ID = 'valoria_messages_v1';
// Android notification channels are immutable on many devices; version the silent channel ID
// so users with older sound-enabled channel config reliably get a truly silent channel.
const SILENT_CHANNEL_ID = 'valoria_silent_v2';
const EMERGENCY_CHANNEL_ID = 'valoria_emergency_alert';
const EMERGENCY_SOUND_NAME = 'emergency_alert.wav';

/**
 * Özellik bazlı varsayılan ses kanalları (herkeste oluşur — personel + misafir).
 * Gömülü ses dosyaları: app.config.js → expo-notifications.sounds.
 * Org özel ses yüklenirse RPC bunun yerine valoria_ns_<feature>_v<n> kanalını döndürür.
 * Kanallar değişmez (immutable); ses değişince id versiyonu artırılmalı.
 */
const FEATURE_SOUND_CHANNELS: { id: string; name: string; sound: string; description: string }[] = [
  { id: 'valoria_task_v1', name: 'Görevler', sound: 'task_ping.wav', description: 'Atanan ve acil görev bildirimleri' },
  { id: 'valoria_meal_v1', name: 'Yemek listesi', sound: 'meal_chime.wav', description: 'Günlük yemek menüsü ve mutfak talepleri' },
  { id: 'valoria_salary_v1', name: 'Maaş', sound: 'salary_cash.wav', description: 'Maaş ve ödeme bildirimleri' },
  { id: 'valoria_warning_v1', name: 'Resmi uyarılar', sound: 'warning_alert.wav', description: 'Personel resmi uyarı ve çağrı bildirimleri' },
  { id: 'valoria_kbs_v1', name: 'Kimlik / pasaport (KBS)', sound: 'kbs_scan.wav', description: 'KBS belge ve kimlik bildirimleri' },
  { id: 'valoria_messages_v2', name: 'Valoria Mesajlar', sound: 'message_pop.wav', description: 'Sohbet mesajları — gönderen ve içerik' },
];

function isChatMessageNotificationType(notificationType: string): boolean {
  return (
    notificationType === 'message' ||
    notificationType === 'chat_message' ||
    notificationType === 'chat_mention'
  );
}

function isAppForeground(): boolean {
  return AppState.currentState === 'active';
}

let pushPresentationInitialized = false;

async function ensureAndroidNotificationChannels(
  Notifications: typeof ExpoNotifications,
  AndroidImportance: (typeof ExpoNotifications)['AndroidImportance'],
  AndroidNotificationVisibility: (typeof ExpoNotifications)['AndroidNotificationVisibility']
): Promise<void> {
  await Notifications.setNotificationChannelAsync(VALORIA_MESSAGES_CHANNEL_ID, {
    name: 'Valoria Mesajlar',
    importance: AndroidImportance.MAX,
    enableVibrate: true,
    enableLights: true,
    lightColor: '#0ea5e9',
    lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
    sound: 'default',
    vibrationPattern: [0, 120, 80, 120],
    showBadge: true,
    description: 'Sohbet mesajları — gönderen ve içerik',
  });
  await Notifications.setNotificationChannelAsync(VALORIA_CHANNEL_ID, {
    name: 'Valoria Bildirimleri',
    importance: AndroidImportance.MAX,
    enableVibrate: true,
    enableLights: true,
    lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    showBadge: true,
    description: 'Mesajlar, beğeniler ve duyurular',
  });
  await Notifications.setNotificationChannelAsync('valoria', {
    name: 'Valoria Bildirimleri',
    importance: AndroidImportance.MAX,
    enableVibrate: true,
    enableLights: true,
    lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    showBadge: true,
  });
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Bildirimler',
    importance: AndroidImportance.MAX,
    enableVibrate: true,
    enableLights: true,
    lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    showBadge: true,
  });
  await Notifications.setNotificationChannelAsync(SILENT_CHANNEL_ID, {
    name: 'Sessiz Bildirimler',
    importance: AndroidImportance.MAX,
    enableVibrate: true,
    enableLights: true,
    lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
    sound: null,
    vibrationPattern: [0, 250, 250, 250],
    showBadge: true,
    description: 'Ses kapali ama gorunur bildirimler',
  });
  await Notifications.setNotificationChannelAsync(EMERGENCY_CHANNEL_ID, {
    name: 'Acil Durum Bildirimleri',
    importance: AndroidImportance.MAX,
    enableVibrate: true,
    enableLights: true,
    lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
    sound: EMERGENCY_SOUND_NAME,
    vibrationPattern: [0, 350, 200, 350, 200, 350],
    showBadge: true,
    description: 'Personel acil durum alarmlari',
  });
  for (const ch of FEATURE_SOUND_CHANNELS) {
    await Notifications.setNotificationChannelAsync(ch.id, {
      name: ch.name,
      importance: AndroidImportance.HIGH,
      enableVibrate: true,
      enableLights: true,
      lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
      sound: ch.sound,
      vibrationPattern: [0, 200, 120, 200],
      showBadge: true,
      description: ch.description,
    });
  }
}

function normalizeNotificationType(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase();
}

async function shouldMuteByStaffFeaturePreference(
  notificationType: string,
  featureKey?: string
): Promise<boolean> {
  const master = await AsyncStorage.getItem('staff_notif_sounds_master_enabled');
  if (master === '0') return true;

  const resolvedFeatureKey =
    featureKey?.trim() ||
    (notificationType ? resolveNotificationFeatureKey(notificationType) : '');

  if (resolvedFeatureKey) {
    const def = await import('@/lib/notificationSoundCatalog').then((m) =>
      m.getNotificationSoundFeatureDef(resolvedFeatureKey)
    );
    if (def && !def.userCanMuteSound) return false;
    const byFeature = await AsyncStorage.getItem(
      `${STAFF_FEATURE_SOUND_PREF_KEY_PREFIX}${resolvedFeatureKey}`
    );
    if (byFeature === '0') return true;
  }

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
        const featureKeyRaw = typeof data.feature_key === 'string' ? data.feature_key.trim() : '';
        const roomCleaningMarked = notificationType === 'staff_room_cleaning_status';
        const roomCleaningSoundPref = await AsyncStorage.getItem(STAFF_ROOM_CLEANING_SOUND_PREF_KEY);
        const roomCleaningSoundEnabled = roomCleaningSoundPref == null ? true : roomCleaningSoundPref === '1';
        const muteByLocalPref = roomCleaningMarked && !roomCleaningSoundEnabled;
        const muteByFeaturePref = await shouldMuteByStaffFeaturePreference(
          notificationType,
          featureKeyRaw || undefined
        );
        const playSound = !(muteByPayload || muteByLocalPref || muteByFeaturePref);
        const muteSystemSound = playSound && shouldMuteSystemNotificationSound(data);
        const isChatMessage = isChatMessageNotificationType(notificationType);
        const foregroundChat = isChatMessage && isAppForeground();
        return {
          shouldPlaySound: playSound && !muteSystemSound,
          shouldShowAlert: !foregroundChat,
          shouldShowBanner: !foregroundChat,
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
        await ensureAndroidNotificationChannels(
          Notifications,
          ExpoN.AndroidImportance,
          ExpoN.AndroidNotificationVisibility
        );
      } catch (e) {
        log.warn('notificationsPush', 'Android kanal ayarı', e);
      }
    }
  } catch (e) {
    log.warn('notificationsPush', 'initPushNotificationsPresentation', e);
  }
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
        await ensureAndroidNotificationChannels(
          Notifications,
          Notifications.AndroidImportance,
          Notifications.AndroidNotificationVisibility
        );
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
      const normalized = normalizeRpcError(error);
      if (isPostgrestSchemaCacheError(error)) {
        log.warn('notificationsPush', 'savePushTokenForStaff RPC (geçici şema/PostgREST, sonra tekrar denenecek)', {
          message: normalized.message,
          code: normalized.code,
          staffIdPrefix: staffId.slice(0, 8),
        });
      } else if (isSupabaseUnavailableError(normalized.message)) {
        log.warn('notificationsPush', 'savePushTokenForStaff RPC (sunucu geçici kapalı)', {
          message: normalized.message,
          staffIdPrefix: staffId.slice(0, 8),
        });
      } else {
        log.warn('notificationsPush', 'savePushTokenForStaff RPC', {
          message: normalized.message,
          code: normalized.code,
          staffIdPrefix: staffId.slice(0, 8),
        });
      }
      return;
    }
  } catch (e) {
    const msg = sanitizeSupabaseErrorMessage((e as Error)?.message);
    log.warn('notificationsPush', 'savePushTokenForStaff', msg);
  }
}

/** Partner otel portalı girişinde push token kaydı. */
export async function savePushTokenForPartner(partnerUserId: string): Promise<void> {
  if (isExpoGo) return;
  let token = await getStoredExpoPushToken();
  if (!token) token = await getExpoPushTokenAsync();
  if (!token) return;
  try {
    const { error } = await supabase.rpc('upsert_partner_push_token', {
      p_token: token,
      p_device_info: { platform: Platform.OS },
    });
    if (!error) {
      log.info('notificationsPush', 'Partner push token kaydedildi', { partnerUserId: partnerUserId.slice(0, 8) });
      return;
    }
    log.warn('notificationsPush', 'savePushTokenForPartner RPC', normalizeRpcError(error));
  } catch (e) {
    log.warn('notificationsPush', 'savePushTokenForPartner', sanitizeSupabaseErrorMessage((e as Error)?.message));
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

export type NotificationResponsePayload = {
  notification: {
    request: {
      identifier?: string;
      content: { data?: Record<string, unknown> };
    };
  };
};

const LAST_HANDLED_NOTIF_RESPONSE_ID_KEY = 'valoria_last_handled_notif_response_id';
const NOTIF_COLD_START_DEDUP_MIGRATION_KEY = 'valoria_notif_cold_start_dedup_v1';

const notificationResponseSessionIds = new Set<string>();

let coldStartDedupMigrationPromise: Promise<void> | null = null;

function notificationResponseId(response: NotificationResponsePayload | null | undefined): string {
  const id = response?.notification?.request?.identifier;
  return typeof id === 'string' ? id.trim() : '';
}

/** Expo'da biriken son bildirim yanıtını temizler; normal açılışta stale yönlendirmeyi önler. */
export async function clearLastNotificationResponseAsync(): Promise<void> {
  if (isExpoGo || Platform.OS === 'web') return;
  try {
    const Notifications = getNotifications();
    if (!Notifications?.clearLastNotificationResponseAsync) return;
    await Notifications.clearLastNotificationResponseAsync();
  } catch (e) {
    log.warn('notificationsPush', 'clearLastNotificationResponseAsync', e);
  }
}

/** Güncelleme öncesi birikmiş eski yanıtı bir kez tüketir (yanlış cold-start navigasyonunu keser). */
export async function ensureNotificationColdStartDedupMigration(): Promise<void> {
  if (isExpoGo || Platform.OS === 'web') return;
  if (coldStartDedupMigrationPromise) return coldStartDedupMigrationPromise;
  coldStartDedupMigrationPromise = (async () => {
    try {
      const done = await AsyncStorage.getItem(NOTIF_COLD_START_DEDUP_MIGRATION_KEY);
      if (done === '1') return;
      const response = await getLastNotificationResponseAsync();
      const id = notificationResponseId(response);
      if (id) {
        await AsyncStorage.setItem(LAST_HANDLED_NOTIF_RESPONSE_ID_KEY, id);
      }
      await clearLastNotificationResponseAsync();
      await AsyncStorage.setItem(NOTIF_COLD_START_DEDUP_MIGRATION_KEY, '1');
    } catch (e) {
      log.warn('notificationsPush', 'ensureNotificationColdStartDedupMigration', e);
    }
  })();
  return coldStartDedupMigrationPromise;
}

/** Cold start: yalnızca daha önce işlenmemiş bildirim yanıtında navigasyon yap. */
export async function shouldNavigateFromColdStartNotification(
  response: NotificationResponsePayload | null | undefined
): Promise<boolean> {
  if (isExpoGo || Platform.OS === 'web') return false;
  if (!response?.notification) return false;

  await ensureNotificationColdStartDedupMigration();

  const id = notificationResponseId(response);
  if (!id) {
    if (Platform.OS === 'android') {
      await clearLastNotificationResponseAsync();
    }
    return false;
  }

  if (notificationResponseSessionIdAlreadyClaimed(id)) return false;

  try {
    const lastHandled = await AsyncStorage.getItem(LAST_HANDLED_NOTIF_RESPONSE_ID_KEY);
    if (lastHandled === id) {
      await clearLastNotificationResponseAsync();
      return false;
    }
  } catch {
    /* ignore */
  }

  return true;
}

function notificationResponseIdAlreadyClaimed(id: string): boolean {
  return notificationResponseSessionIds.has(id);
}

export function notificationResponseAlreadyHandledThisSession(
  response: NotificationResponsePayload | null | undefined
): boolean {
  const id = notificationResponseId(response);
  return id ? notificationResponseIdAlreadyClaimed(id) : false;
}

/** Aynı yanıtın cold start + listener ile çift işlenmesini önler. */
export function claimNotificationResponseForHandling(
  response: NotificationResponsePayload | null | undefined
): boolean {
  const id = notificationResponseId(response);
  if (!id) return true;
  if (notificationResponseSessionIds.has(id)) return false;
  notificationResponseSessionIds.add(id);
  return true;
}

export async function markNotificationResponseHandled(
  response: NotificationResponsePayload | null | undefined
): Promise<void> {
  if (isExpoGo || Platform.OS === 'web') return;
  const id = notificationResponseId(response);
  if (id) {
    notificationResponseSessionIds.add(id);
    try {
      await AsyncStorage.setItem(LAST_HANDLED_NOTIF_RESPONSE_ID_KEY, id);
    } catch {
      /* ignore */
    }
  }
  await clearLastNotificationResponseAsync();
}

/** Uygulama bildirime tıklanarak açıldıysa (cold start) son yanıtı döndürür. Expo Go'da null. */
export async function getLastNotificationResponseAsync(): Promise<NotificationResponsePayload | null> {
  if (isExpoGo) return null;
  try {
    const Notifications = getNotifications();
    if (!Notifications) return null;
    const response = await Notifications.getLastNotificationResponseAsync();
    if (!response) return null;
    return response as unknown as NotificationResponsePayload;
  } catch (e) {
    log.warn('notificationsPush', 'getLastNotificationResponseAsync', e);
    return null;
  }
}

/** Bildirime tıklandığında çağrılacak (root layout'ta listener ile bağlanır). Expo Go'da no-op. */
export function addNotificationResponseListener(
  handler: (response: NotificationResponsePayload) => void
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
