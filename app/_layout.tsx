import '@/lib/cryptoPolyfill';
import '@/lib/weakRefPolyfill';
import i18n, { LANG_STORAGE_KEY, LANGUAGES } from '../i18n';
import { getDeviceLanguageCode } from '@/lib/deviceLocale';
import { Stack, useRouter, usePathname } from 'expo-router';
import { saveLastRoute } from '@/lib/lastRoutePersistence';
import { subscribeAppForegroundDebounced } from '@/lib/appForegroundDebounce';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, View, Animated, StyleSheet, Platform, LayoutAnimation, I18nManager, InteractionManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import { log } from '@/lib/logger';
import { parseCheckinUrl } from '@/lib/checkinDeepLink';
import { WebPublicRouteRedirect } from '@/components/WebPublicRouteRedirect';
import { parseTechnicalAssetIdFromScan } from '@/lib/technicalAssets';
import { useGuestFlowStore } from '@/stores/guestFlowStore';
import { supabase } from '@/lib/supabase';
import { initAuthListener } from '@/stores/authStore';
import { hasPolicyConsent, setPendingGuest } from '@/lib/policyConsent';
import { useAuthStore } from '@/stores/authStore';
import { useCustomerRoomStore } from '@/stores/customerRoomStore';
import { linkGuestToRoom } from '@/lib/linkGuestToRoom';
import {
  getLastNotificationResponseAsync,
  addNotificationResponseListener,
  addNotificationReceivedListener,
  savePushTokenForStaff,
  registerIOSPushTokenListener,
  initPushNotificationsPresentation,
  setOsAppIconBadgeCount,
  applyBadgeFromExpoNotificationPayload,
  isExpoGo,
} from '@/lib/notificationsPush';
import { useStaffNotificationStore } from '@/stores/staffNotificationStore';
import { useGuestNotificationStore } from '@/stores/guestNotificationStore';
import { useStaffUnreadMessagesStore } from '@/stores/staffUnreadMessagesStore';
import {
  bumpMessagingUnreadOnPush,
  isMessagePushPayload,
  scheduleGuestMessagingUnreadRefresh,
  scheduleStaffMessagingUnreadRefresh,
} from '@/lib/messagingUnreadSync';
import { useStaffBoardStore } from '@/stores/staffBoardStore';
import { useGuestMessagingStore } from '@/stores/guestMessagingStore';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { initChatVideoUploadSession } from '@/lib/chatVideoUploadSession';
import {
  isStaffMealMenuDailyNotification,
  staffMealMenuNotificationHref,
} from '@/lib/staffMealMenuNotification';
import { registerBackgroundNotificationTask } from '@/lib/backgroundNotificationTask';
import { safeRouterReplace } from '@/lib/safeRouter';

if (Platform.OS !== 'web') {
  SplashScreen.preventAutoHideAsync();
}
if (__DEV__) log.info('RootLayout', 'app başlatılıyor');

const WEB_BG = '#1a365d';

/** Push / deep link: mesaj bildiriminde doğru sohbet ekranı (Expo Router pathname + params). */
function parseConversationIdFromNotificationPayload(data: Record<string, unknown>): string | undefined {
  const raw = data.conversationId ?? data.conversation_id;
  if (typeof raw === 'string') {
    const t = raw.trim();
    return t.length > 0 ? t : undefined;
  }
  if (raw != null && String(raw).trim().length > 0) return String(raw).trim();
  return undefined;
}

function resolveMessagePushHref(
  url: string,
  conversationIdFromData?: string
):
  | { pathname: '/staff/chat/[id]'; params: { id: string } }
  | { pathname: '/customer/chat/[id]'; params: { id: string } }
  | { pathname: '/admin/messages/chat/[id]'; params: { id: string } }
  | null {
  const base = (url.split('?')[0] || '').replace(/\/+$/, '') || '';
  const staff = base.match(/^\/staff\/chat\/([^/]+)$/);
  if (staff?.[1]) return { pathname: '/staff/chat/[id]', params: { id: staff[1] } };
  const customer = base.match(/^\/customer\/chat\/([^/]+)$/);
  if (customer?.[1]) return { pathname: '/customer/chat/[id]', params: { id: customer[1] } };
  const admin = base.match(/^\/admin\/messages\/chat\/([^/]+)$/);
  if (admin?.[1]) return { pathname: '/admin/messages/chat/[id]', params: { id: admin[1] } };
  if (
    conversationIdFromData &&
    (base === '/staff/(tabs)/messages' || base.startsWith('/staff/(tabs)/messages/'))
  ) {
    return { pathname: '/staff/chat/[id]', params: { id: conversationIdFromData } };
  }
  return null;
}

const ROUTE_SAVE_DEBOUNCE_MS = 400;

async function refreshBadgeCountsFromStores(): Promise<void> {
  const staff = useAuthStore.getState().staff;
  if (staff) {
    await useStaffNotificationStore.getState().refresh();
    await useStaffUnreadMessagesStore.getState().refreshUnread(staff.id);
    const n = useStaffNotificationStore.getState().unreadCount;
    const m = useStaffUnreadMessagesStore.getState().unreadCount;
    void setOsAppIconBadgeCount(Math.min(999, n + m));
    return;
  }
  await useGuestNotificationStore.getState().refresh();
  await useGuestMessagingStore.getState().loadStoredToken();
  const token = useGuestMessagingStore.getState().appToken;
  if (token) {
    const { guestListConversations } = await import('@/lib/messagingApi');
    const list = await guestListConversations(token);
    const total = list.reduce((acc, c) => acc + (c.unread_count ?? 0), 0);
    useGuestMessagingStore.getState().setUnreadCount(total);
  }
  const n = useGuestNotificationStore.getState().unreadCount;
  const m = useGuestMessagingStore.getState().unreadCount;
  void setOsAppIconBadgeCount(Math.min(999, n + m));
}

/** Navigasyon — kök layout yeniden render etmesin. */
function LastRouteTracker() {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    pathnameRef.current = pathname;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void saveLastRoute(pathname);
    }, ROUTE_SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [pathname]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') void saveLastRoute(pathnameRef.current);
    });
    return () => sub.remove();
  }, []);

  return null;
}

/** Simge rozeti — unread store güncellemeleri Stack'i yeniden çizmesin. */
function AppIconBadgeSync() {
  const staff = useAuthStore((s) => s.staff);
  const staffUnread = useStaffNotificationStore((s) => s.unreadCount);
  const guestUnread = useGuestNotificationStore((s) => s.unreadCount);
  const staffMsgUnread = useStaffUnreadMessagesStore((s) => s.unreadCount);
  const guestMsgUnread = useGuestMessagingStore((s) => s.unreadCount);
  const storeSyncedRef = useRef(false);

  const pushBadgeFromStores = () => {
    const s = useAuthStore.getState().staff;
    const notif = s
      ? useStaffNotificationStore.getState().unreadCount
      : useGuestNotificationStore.getState().unreadCount;
    const msg = s
      ? useStaffUnreadMessagesStore.getState().unreadCount
      : useGuestMessagingStore.getState().unreadCount;
    void setOsAppIconBadgeCount(Math.min(999, notif + msg));
  };

  useEffect(() => {
    if (Platform.OS === 'web' || isExpoGo) return;
    storeSyncedRef.current = false;
    void refreshBadgeCountsFromStores().finally(() => {
      storeSyncedRef.current = true;
      pushBadgeFromStores();
    });
  }, [staff?.id]);

  useEffect(() => {
    if (Platform.OS === 'web' || isExpoGo) return;
    const notif = staff ? staffUnread : guestUnread;
    const msg = staff ? staffMsgUnread : guestMsgUnread;
    const total = Math.min(999, notif + msg);
    // Store henüz yüklenmeden 0 yazmak push/APNs rozetini siler (iOS açılış/ön plan).
    if (!storeSyncedRef.current && total === 0) return;
    void setOsAppIconBadgeCount(total);
  }, [staff?.id, staff, staffUnread, guestUnread, staffMsgUnread, guestMsgUnread]);

  useEffect(() => {
    if (Platform.OS === 'web' || isExpoGo) return;
    return subscribeAppForegroundDebounced(() => {
      void refreshBadgeCountsFromStores();
    });
  }, []);

  return null;
}

function RootLayoutInner() {
  const { t } = useTranslation();
  const [showSplashLogo, setShowSplashLogo] = useState(Platform.OS !== 'web');
  const openingOverlayOpacity = useRef(new Animated.Value(0)).current;
  const dotPhase = useRef(new Animated.Value(0)).current;
  const dotTopY = dotPhase.interpolate({ inputRange: [0, 1], outputRange: [-9, 9] });
  const dotBottomY = dotPhase.interpolate({ inputRange: [0, 1], outputRange: [9, -9] });
  const router = useRouter();
  const setQR = useGuestFlowStore((s) => s.setQR);
  const user = useAuthStore((s) => s.user);
  const staff = useAuthStore((s) => s.staff);
  const staffCheckComplete = useAuthStore((s) => s.staffCheckComplete);
  const staffCheckUnavailable = useAuthStore((s) => s.staffCheckUnavailable);
  const authBootPending = !!user && !staffCheckComplete && !staffCheckUnavailable;

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void initPushNotificationsPresentation();
    void registerBackgroundNotificationTask();
  }, []);

  // LayoutAnimation.configureNext native callback sızıntısını önle (yazarken donma / 501 pending callbacks)
  useEffect(() => {
    if (typeof LayoutAnimation?.configureNext === 'function') {
      const noop = () => {};
      LayoutAnimation.configureNext = noop;
    }
  }, []);

  // Web: body arka planı (beyaz ekran önleme) ve splash atla
  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof document !== 'undefined') document.body.style.backgroundColor = WEB_BG;
      setShowSplashLogo(false);
      return () => {
        if (typeof document !== 'undefined') document.body.style.backgroundColor = '';
      };
    }
  }, []);
  const loopAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const fadeOutOverlay = useRef(() => {
    if (Platform.OS === 'web') return;
    loopAnimRef.current?.stop();
    loopAnimRef.current = null;
    dotPhase.stopAnimation?.();
    const fadeOutMs = Platform.OS === 'android' ? 32 : 40;
    Animated.timing(openingOverlayOpacity, { toValue: 0, duration: fadeOutMs, useNativeDriver: true }).start(() =>
      setShowSplashLogo(false)
    );
  }).current;

  // Açılış: ortada 2 nokta — oturum/personel kontrolü bitene kadar (girişli kullanıcıda) açık kalır
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const isAndroid = Platform.OS === 'android';
    const dotHalfMs = 80;
    const fadeInMs = isAndroid ? 16 : 24;

    openingOverlayOpacity.setValue(0);
    dotPhase.setValue(0);
    setShowSplashLogo(true);
    Animated.timing(openingOverlayOpacity, { toValue: 1, duration: fadeInMs, useNativeDriver: true }).start();
    loopAnimRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(dotPhase, { toValue: 1, duration: dotHalfMs, useNativeDriver: true }),
        Animated.timing(dotPhase, { toValue: 0, duration: dotHalfMs, useNativeDriver: true }),
      ])
    );
    loopAnimRef.current.start();

    return () => {
      loopAnimRef.current?.stop();
    };
  }, [openingOverlayOpacity, dotPhase]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (authBootPending) {
      setShowSplashLogo(true);
      openingOverlayOpacity.setValue(1);
      loopAnimRef.current?.stop();
      const dotHalfMs = 80;
      loopAnimRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(dotPhase, { toValue: 1, duration: dotHalfMs, useNativeDriver: true }),
          Animated.timing(dotPhase, { toValue: 0, duration: dotHalfMs, useNativeDriver: true }),
        ])
      );
      loopAnimRef.current.start();
      return;
    }
    const quickMs = user ? 0 : 120;
    const t = setTimeout(() => fadeOutOverlay(), quickMs);
    return () => clearTimeout(t);
  }, [authBootPending, user, fadeOutOverlay, openingOverlayOpacity, dotPhase]);

  // Dil: Önce kaydedilmiş tercih, yoksa cihaz dili; böylece uygulama tam seçilen dilde açılır
  // Arapça için RTL: dil değişince yönü güncelle (uygulama yeniden başlatıldığında tam uygulanır)
  useEffect(() => {
    const supportedCodes = new Set(LANGUAGES.map((l) => l.code));
    AsyncStorage.getItem(LANG_STORAGE_KEY).then((saved) => {
      const lang =
        saved && supportedCodes.has(saved as (typeof LANGUAGES)[number]['code'])
          ? saved
          : getDeviceLanguageCode();
      if (i18n.language !== lang) i18n.changeLanguage(lang);
      if (!saved) AsyncStorage.setItem(LANG_STORAGE_KEY, lang);
      // Arapça RTL: Platform.web'de I18nManager yok
      if (Platform.OS !== 'web' && typeof I18nManager?.forceRTL === 'function') {
        const isRTL = lang === 'ar';
        if (I18nManager.isRTL !== isRTL) {
          I18nManager.forceRTL(isRTL);
        }
      }
    });
  }, []);
  // Splash'ı hemen gizle, anasayfa/redirect görünsün (web'de native splash yok)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    SplashScreen.hideAsync()
      .then(() => log.info('RootLayout', 'SplashScreen gizlendi'))
      .catch((e) => log.error('RootLayout', 'SplashScreen hatası', e));
  }, []);

  useEffect(() => {
    const sub = initAuthListener();
    return () => {
      sub?.data?.subscription?.unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    initChatVideoUploadSession();
  }, []);

  // iOS: push token listener at app start (SDK 53+ workaround)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const cleanup = registerIOSPushTokenListener();
    return cleanup;
  }, []);

  // Staff push token (beğeni/yorum bildirimi)
  useEffect(() => {
    if (!staff) return;
    const run = () => {
      // savePushTokenForStaff içinde: önce local token, yoksa izin iste + yeni token al.
      // iOS'ta token dinleyiciyle gecikmeli gelebileceği için burada token şartına bağlamıyoruz.
      savePushTokenForStaff(staff.id).catch((e) => log.warn('RootLayout', 'push token kayıt', e));
    };
    run();
    // iOS: token bazen gecikmeli gelir; uygulama ön plana gelince tekrar dene
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => sub.remove();
  }, [staff?.id]);

  // iOS: arka planda gelen push rozeti, uygulama açılınca store 0 ile ezilmesin diye son bildirimden tekrar uygula
  useEffect(() => {
    if (Platform.OS !== 'ios' || isExpoGo) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void getLastNotificationResponseAsync().then((response) => {
        const n = response?.notification as import('expo-notifications').Notification | undefined;
        if (n) void applyBadgeFromExpoNotificationPayload(n);
      });
    });
    return () => sub.remove();
  }, []);

  // Bildirime tıklandığında yönlendir (aynı mantık hem listener hem cold start için)
  const handleNotificationResponse = (data: Record<string, unknown> | undefined) => {
    if (!data) return;
    const safePush = (target: string) => {
      if (!target || typeof target !== 'string' || !target.startsWith('/')) return;
      try {
        router.push(target);
      } catch (e) {
        log.warn('RootLayout', 'notification route push failed', { target, error: (e as Error)?.message });
      }
    };
    const notificationType =
      typeof data.notificationType === 'string'
        ? data.notificationType
        : typeof data.notification_type === 'string'
          ? data.notification_type
          : '';
    const screenPath = typeof data.screen === 'string' ? data.screen.trim() : '';
    if (screenPath.startsWith('/')) {
      safePush(screenPath);
      return;
    }
    const rawUrl = data?.url && typeof data.url === 'string' ? data.url.trim() : '';
    const url = rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
      ? (() => {
          try {
            return new URL(rawUrl).pathname || '';
          } catch {
            return '';
          }
        })()
      : rawUrl.includes('://')
        ? rawUrl.slice(rawUrl.indexOf('://') + 3).replace(/^[^/]+/, '')
        : rawUrl;
    const isInternalPath = url.startsWith('/');

    // Temizlik planı push'ları için her durumda doğru ekranı aç.
    if (
      notificationType === 'staff_room_cleaning_status' ||
      notificationType === 'staff_room_cleaning_plan_note_saved' ||
      url === '/staff/cleaning-plan'
    ) {
      safePush('/staff/cleaning-plan');
      return;
    }

    if (isStaffMealMenuDailyNotification(data)) {
      try {
        router.push(staffMealMenuNotificationHref(data));
      } catch (e) {
        log.warn('RootLayout', 'notification meal menu route push failed', {
          error: (e as Error)?.message,
        });
      }
      return;
    }

    const pickWarningId = (d: Record<string, unknown>): string => {
      const w = d.warningId ?? d.warning_id;
      return typeof w === 'string' ? w.trim() : '';
    };
    const screenRaw = data.screen;
    const screenStr = typeof screenRaw === 'string' ? screenRaw.trim() : '';
    if (
      notificationType === 'staff_personnel_warning' ||
      screenStr === '/staff/warnings' ||
      screenStr.startsWith('/staff/warnings')
    ) {
      const wid = pickWarningId(data);
      try {
        if (wid) {
          router.push({ pathname: '/staff/warnings', params: { focus: wid } });
        } else {
          router.push('/staff/warnings');
        }
      } catch (e) {
        log.warn('RootLayout', 'notification personnel warning route push failed', {
          warningId: wid,
          error: (e as Error)?.message,
        });
      }
      return;
    }
    if (notificationType === 'staff_personnel_warning_ack') {
      const sidRaw = data.subjectStaffId ?? data.subject_staff_id;
      const sid = typeof sidRaw === 'string' ? sidRaw.trim() : '';
      if (sid) {
        try {
          router.push({ pathname: '/admin/staff/[id]', params: { id: sid } } as never);
        } catch (e) {
          log.warn('RootLayout', 'notification warning ack route push failed', {
            subjectStaffId: sid,
            error: (e as Error)?.message,
          });
        }
      }
      return;
    }

    if (isInternalPath) {
      const convFromPayload = parseConversationIdFromNotificationPayload(data);
      const messageHref = resolveMessagePushHref(url, convFromPayload);
      if (messageHref) {
        try {
          router.push(messageHref);
        } catch (e) {
          log.warn('RootLayout', 'notification message chat route push failed', {
            url,
            error: (e as Error)?.message,
          });
        }
        return;
      }
      const rawPid = data.postId ?? (data as { postid?: unknown }).postid;
      const postId =
        typeof rawPid === 'string'
          ? rawPid.trim()
          : rawPid != null && String(rawPid).length > 0
            ? String(rawPid).trim()
            : undefined;
      const assignmentId =
        typeof data.assignmentId === 'string'
          ? data.assignmentId
          : typeof data.openAssignmentId === 'string'
            ? data.openAssignmentId
            : undefined;
      if (postId) {
        if (url.includes('/customer/feed/[id]')) {
          try {
            router.push({ pathname: '/customer/feed/[id]', params: { id: postId } });
          } catch (e) {
            log.warn('RootLayout', 'notification feed route push failed', { postId, error: (e as Error)?.message });
          }
        } else {
          try {
            router.push({ pathname: url, params: { openPostId: postId } });
          } catch (e) {
            log.warn('RootLayout', 'notification route push with params failed', {
              url,
              postId,
              error: (e as Error)?.message,
            });
          }
        }
      } else if (assignmentId && url === '/staff/tasks') {
        try {
          router.push({ pathname: '/staff/tasks', params: { focusAssignment: assignmentId } });
        } catch (e) {
          log.warn('RootLayout', 'notification assignment route push failed', {
            assignmentId,
            error: (e as Error)?.message,
          });
        }
      } else {
        safePush(url);
      }
    } else if (data?.screen === 'admin') {
      safePush('/admin');
    } else if (data?.screen === 'notifications') {
      const goToNotifications = () => safePush('/go-to-notifications');
      requestAnimationFrame(() => setTimeout(goToNotifications, 100));
    }
  };

  // Uygulama bildirime tıklanarak açıldıysa (kapalıyken tıklandı) ilgili sayfaya git
  const coldStartHandled = useRef(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (coldStartHandled.current) return;
    coldStartHandled.current = true;
    const t = setTimeout(() => {
      getLastNotificationResponseAsync().then((response) => {
        if (response?.notification) {
          void applyBadgeFromExpoNotificationPayload(
            response.notification as import('expo-notifications').Notification
          );
        }
        if (response?.notification?.request?.content?.data) {
          handleNotificationResponse(response.notification.request.content.data as Record<string, unknown>);
        }
      });
    }, 600);
    return () => clearTimeout(t);
  }, [router]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const remove = addNotificationResponseListener((response) => {
      void applyBadgeFromExpoNotificationPayload(response.notification as import('expo-notifications').Notification);
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      handleNotificationResponse(data);
    });
    return remove;
  }, [router]);

  // Uygulama öndeyken bildirim gelince badge güncellensin (mesaj push'u yalnızca sohbet sayacını artırır).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const remove = addNotificationReceivedListener((notification) => {
      void applyBadgeFromExpoNotificationPayload(notification);
      const payload =
        notification.request.content.data && typeof notification.request.content.data === 'object'
          ? (notification.request.content.data as Record<string, unknown>)
          : undefined;
      if (isMessagePushPayload(payload)) {
        bumpMessagingUnreadOnPush(payload);
      }
      const { staff } = useAuthStore.getState();
      if (staff) {
        void (async () => {
          await useStaffNotificationStore.getState().refresh();
          if (isMessagePushPayload(payload)) {
            scheduleStaffMessagingUnreadRefresh(staff.id, 0);
          } else {
            await useStaffUnreadMessagesStore.getState().refreshUnread(staff.id);
          }
          const nt =
            typeof payload?.notificationType === 'string'
              ? payload.notificationType
              : typeof payload?.notification_type === 'string'
                ? payload.notification_type
                : '';
          if (nt === 'staff_board_announcement' || nt === 'admin_announcement') {
            await useStaffBoardStore.getState().loadList(staff.id);
          }
        })();
      } else {
        void (async () => {
          await useGuestNotificationStore.getState().refresh();
          await useGuestMessagingStore.getState().loadStoredToken();
          const token = useGuestMessagingStore.getState().appToken;
          if (!token) return;
          if (isMessagePushPayload(payload)) {
            scheduleGuestMessagingUnreadRefresh(token, 0);
          } else {
            const { guestListConversations } = await import('@/lib/messagingApi');
            const list = await guestListConversations(token);
            const total = list.reduce((acc, c) => acc + (c.unread_count ?? 0), 0);
            useGuestMessagingStore.getState().setUnreadCount(total);
          }
        })();
      }
    });
    return remove;
  }, [router]);

  // Deep link: auth/callback (magic link) veya guest (QR/NFC)
  useEffect(() => {
    const handleUrl = async (url: string) => {
      if (!url || typeof url !== 'string') return;
      if (url.includes('auth/callback') && url.includes('#')) {
        const hashStart = url.indexOf('#') + 1;
        const hash = url.slice(hashStart);
        const params: Record<string, string> = {};
        hash.split('&').forEach((part) => {
          const [k, v] = part.split('=');
          if (k && v) params[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
        });
        const access_token = params.access_token;
        const refresh_token = params.refresh_token;
        if (access_token && refresh_token) {
          try {
            await supabase.auth.setSession({ access_token, refresh_token });
            await useAuthStore.getState().loadSession();
            const { user, staff } = useAuthStore.getState();
            const { pendingRoom, clearPendingRoom } = useCustomerRoomStore.getState();
            if (pendingRoom && user?.email) {
              await linkGuestToRoom(user.email, pendingRoom.roomId, user.user_metadata?.full_name);
              clearPendingRoom();
            }
            safeRouterReplace(router, '/');
          } catch (e) {
            log.error('RootLayout', 'auth/callback setSession', e);
            safeRouterReplace(router, '/auth/callback');
          }
        } else {
          safeRouterReplace(router, '/auth/callback');
        }
        return;
      }

      const techAssetId =
        parseTechnicalAssetIdFromScan(url) || parseTechnicalAssetIdFromScan(decodeURIComponent(url));
      if (techAssetId) {
        const { staff: staffRow } = useAuthStore.getState();
        if (staffRow) {
          router.replace({
            pathname: '/staff/technical-assets/[id]',
            params: { id: techAssetId },
          } as never);
        } else {
          log.info('RootLayout', 'tech-asset deep link atlandi (personel oturumu yok)', { techAssetId });
        }
        return;
      }

      const parsed = parseCheckinUrl(url);
      if (!parsed) return;
      log.info('RootLayout', 'Deep link', parsed);

      // Tek sayfa sözleşme onayı: doğrudan /guest/sign-one (QR okutulunca sayfa hızlıca açılsın)
      if (parsed.type === 'sign-one') {
        if (Platform.OS === 'web') {
          safeRouterReplace(router, {
            pathname: '/guest/sign-one',
            params: { t: parsed.token ?? '', l: parsed.lang ?? 'tr' },
          });
          if (parsed.token) {
            supabase
              .from('room_qr_codes')
              .select('room_id, rooms(room_number)')
              .eq('token', parsed.token)
              .gt('expires_at', new Date().toISOString())
              .maybeSingle()
              .then(({ data }) => {
                const roomId = (data as { room_id?: string })?.room_id ?? '';
                const roomNumber = (data as { rooms?: { room_number?: string } })?.rooms?.room_number ?? '';
                setQR(parsed.token!, roomId, roomNumber);
              });
          }
          return;
        }
        if (parsed.token) {
          const { data } = await supabase
            .from('room_qr_codes')
            .select('room_id, rooms(room_number)')
            .eq('token', parsed.token)
            .gt('expires_at', new Date().toISOString())
            .maybeSingle();
          const roomId = (data as { room_id?: string })?.room_id ?? '';
          const roomNumber = (data as { rooms?: { room_number?: string } })?.rooms?.room_number ?? '';
          setQR(parsed.token, roomId, roomNumber);
        }
        const accepted = await hasPolicyConsent();
        if (accepted) {
          router.replace({ pathname: '/guest/sign-one', params: { token: parsed.token ?? '', lang: parsed.lang ?? '' } });
        } else {
          await setPendingGuest({
            token: parsed.token ?? '',
            roomId: useGuestFlowStore.getState().roomId ?? '',
            roomNumber: useGuestFlowStore.getState().roomNumber ?? '',
          });
          router.replace({ pathname: '/policies', params: { next: 'guest_sign_one' } });
        }
        return;
      }

      const goToGuestFlow = (token: string, roomId: string, roomNumber: string) => {
        setQR(token, roomId, roomNumber);
        router.replace('/guest/language');
      };
      if (parsed.type === 'contract') {
        useGuestFlowStore.getState().setStep('contract');
        if (parsed.token) {
          const { data } = await supabase
            .from('room_qr_codes')
            .select('room_id, rooms(room_number)')
            .eq('token', parsed.token)
            .gt('expires_at', new Date().toISOString())
            .maybeSingle();
          const roomId = (data as { room_id?: string })?.room_id ?? '';
          const roomNumber = (data as { rooms?: { room_number?: string } })?.rooms?.room_number ?? '';
          useGuestFlowStore.getState().setQR(parsed.token, roomId, roomNumber);
        }
        const accepted = await hasPolicyConsent();
        if (accepted) {
          router.replace('/guest/contract');
        } else {
          useGuestFlowStore.getState().setStep('contract');
          router.replace({ pathname: '/policies', params: { next: 'guest_contract' } });
        }
        return;
      }
      if (parsed.type === 'token' && parsed.token) {
        const { data } = await supabase
          .from('room_qr_codes')
          .select('room_id, rooms(room_number)')
          .eq('token', parsed.token)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();
        const roomId = (data as { room_id?: string })?.room_id ?? '';
        const roomNumber = (data as { rooms?: { room_number?: string } })?.rooms?.room_number ?? '';
        const accepted = await hasPolicyConsent();
        if (accepted) {
          goToGuestFlow(parsed.token!, roomId, roomNumber);
        } else {
          await setPendingGuest({ token: parsed.token!, roomId, roomNumber });
          router.replace({ pathname: '/policies', params: { next: 'guest' } });
        }
      } else if (parsed.type === 'room' && parsed.roomId) {
        const { data: qrData } = await supabase
          .from('room_qr_codes')
          .select('token, rooms(room_number)')
          .eq('room_id', parsed.roomId)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const token = (qrData as { token?: string })?.token ?? parsed.roomId;
        const roomNumber = (qrData as { rooms?: { room_number?: string } })?.rooms?.room_number ?? '';
        const accepted = await hasPolicyConsent();
        if (accepted) {
          goToGuestFlow(token, parsed.roomId!, roomNumber);
        } else {
          await setPendingGuest({ token, roomId: parsed.roomId!, roomNumber });
          router.replace({ pathname: '/policies', params: { next: 'guest' } });
        }
      }
    };

    // Web: /guest/sign-one derin link (menü/sözleşme/maliye → WebPublicRouteRedirect)
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const href = window.location.href;
      const path = window.location.pathname || '';
      if (
        (path.includes('/guest/sign-one') || href.includes('/guest/sign-one')) &&
        !path.includes('/guest/success')
      ) {
        handleUrl(href);
      }
    }

    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  return (
    <React.Fragment>
      <WebPublicRouteRedirect />
      <StatusBar style="auto" />
      <LastRouteTracker />
      <AppIconBadgeSync />
      <OfflineBanner />
      {showSplashLogo ? (
        <Animated.View
          style={[
            styles.splashIntroOverlay,
            Platform.OS === 'android' && styles.splashIntroOverlayAndroid,
            { opacity: openingOverlayOpacity },
          ]}
          pointerEvents="none"
        >
          <View style={[styles.splashDotsColumn, Platform.OS === 'android' && styles.splashDotsHalo]}>
            <Animated.View style={[styles.splashDot, { transform: [{ translateY: dotTopY }] }]} />
            <View style={styles.splashDotGap} />
            <Animated.View style={[styles.splashDot, { transform: [{ translateY: dotBottomY }] }]} />
          </View>
        </Animated.View>
      ) : null}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="[id]" options={{ headerShown: false }} />
        <Stack.Screen name="room-select" options={{ headerShown: false }} />
        <Stack.Screen name="policies" />
        <Stack.Screen name="legal/[type]" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="permissions" options={{ headerShown: true, title: t('permissions') }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="guest" options={{ headerShown: false }} />
        <Stack.Screen name="menu" options={{ headerShown: false }} />
        <Stack.Screen name="menü" options={{ headerShown: false }} />
        <Stack.Screen name="sozlesme" options={{ headerShown: false }} />
        <Stack.Screen name="sözleşme" options={{ headerShown: false }} />
        <Stack.Screen name="maliye" options={{ headerShown: false }} />
        <Stack.Screen name="customer" options={{ headerShown: false }} />
        <Stack.Screen
          name="admin"
          options={{
            headerShown: false,
            /** Kaydırarak tüm /admin yığınını kapatma — personel sekmesinde “Yönetim Paneli” placeholder’a düşmesin */
            gestureEnabled: false,
          }}
        />
        <Stack.Screen name="staff" options={{ headerShown: false }} />
        <Stack.Screen name="join" options={{ headerShown: true, title: t('staffApplication') }} />
        <Stack.Screen name="go-to-notifications" options={{ headerShown: false }} />
      </Stack>
    </React.Fragment>
  );
}

export default function RootLayout() {
  const queryClientRef = useRef<QueryClient | null>(null);
  if (!queryClientRef.current) {
    queryClientRef.current = new QueryClient({
      defaultOptions: {
        queries: { retry: 1, staleTime: 10_000 },
        mutations: { retry: 0 },
      },
    });
  }
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClientRef.current}>
          <RootLayoutInner />
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  splashIntroOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    backgroundColor: WEB_BG,
    justifyContent: 'center',
    alignItems: 'center',
  },
  /** Android: tam ekran mavi yok; rota hemen okunur, noktalar yarı saydam hale üstte */
  splashIntroOverlayAndroid: {
    backgroundColor: 'transparent',
  },
  splashDotsColumn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashDotsHalo: {
    paddingVertical: 18,
    paddingHorizontal: 22,
    borderRadius: 40,
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  splashDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  splashDotGap: {
    height: 16,
  },
});
