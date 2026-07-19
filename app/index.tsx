import { useEffect, useRef, useState } from 'react';
import type { ScrollView as ScrollViewType } from 'react-native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Alert,
  useWindowDimensions,
  Platform,
  ScrollView,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Animated,
} from 'react-native';
import { useRouter, useLocalSearchParams, useRootNavigationState } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore, completeSignIn } from '@/stores/authStore';
import { usePartnerAuthStore } from '@/stores/partnerAuthStore';
import {
  resolvePartnerEntryPath,
  usePartnerAppSurfaceStore,
} from '@/stores/partnerAppSurfaceStore';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { startGeofenceWatch, stopGeofenceWatch, type HotelGeofenceConfig } from '@/lib/geofencing';
import * as Location from 'expo-location';
import { useCustomerRoomStore } from '@/stores/customerRoomStore';
import { linkGuestToRoom } from '@/lib/linkGuestToRoom';
import { getOrCreateGuestForCaller } from '@/lib/getOrCreateGuestForCaller';
import { isSupabaseUnavailableError } from '@/lib/supabaseTransientErrors';
import { invokeNotifyNewGuestAccount } from '@/lib/notifyNewGuestAccount';
import { hasPolicyConsent } from '@/lib/policyConsent';
import { isPublicWebPath } from '@/lib/publicWebRoute';
import { publicContractHref, publicMenuHref, publicPaymentNewHref } from '@/lib/publicPortalNav';
import { openPublicMaliyePortal } from '@/lib/openMaliyePortal';
import { safeRouterPush, safeRouterReplace } from '@/lib/safeRouter';
import { enterAppAfterSignIn } from '@/lib/enterAppAfterSignIn';
import { hasPendingNotificationData } from '@/lib/notificationNavigation';
import { runAfterUiReady } from '@/lib/runAfterUiReady';
import ExpoNotifications from '@/lib/expoNotificationsModule';
import { LobbyAnimatedBackground } from '@/components/lobby/LobbyAnimatedBackground';
import { LobbyHero } from '@/components/lobby/LobbyHero';
import { LobbyGlassCard } from '@/components/lobby/LobbyGlassCard';
import { LobbyPortalGrid } from '@/components/lobby/LobbyPortalGrid';

const GEOFENCE_CHECKIN_PROMPT_KEY = '@valoria/geofence_checkin_prompt_shown';
const GEOFENCE_LOCATION_PERMISSION_PROMPT_KEY = '@valoria/geofence_location_permission_prompt_shown';
const CHECKIN_PROMPT_CARD_DISMISSED_KEY = '@valoria/checkin_prompt_card_dismissed';
/** app/_layout splash ile aynı — açılışta boş ekran hissi (özellikle Android) olmasın */
const BOOT_SCREEN_BG = '#1a365d';
/** Geçici: Android’de Google ile giriş — tekrar açmak için true yapın */
const GOOGLE_SIGN_IN_ANDROID_ENABLED = false;

const HOTEL_COORDS: HotelGeofenceConfig | null =
  typeof process.env.EXPO_PUBLIC_HOTEL_LAT !== 'undefined' &&
  typeof process.env.EXPO_PUBLIC_HOTEL_LON !== 'undefined'
    ? {
        latitude: Number(process.env.EXPO_PUBLIC_HOTEL_LAT),
        longitude: Number(process.env.EXPO_PUBLIC_HOTEL_LON),
        radius: 500,
      }
    : null;

function OfflineWelcome({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrapper, styles.offlineWrapper, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.hero}>
        <Text style={styles.offlineEmoji}>📴</Text>
        <Text style={styles.offlineTitle}>{t('valoria')}</Text>
        <Text style={styles.offlineSub}>{t('offline')}</Text>
      </View>
      <TouchableOpacity style={styles.retryButton} onPress={onRetry} activeOpacity={0.85}>
        <Text style={styles.retryButtonText}>{t('retry')}</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Oturum yüklenirken — yalnızca arka plan; yükleme göstergesi _layout nokta animasyonunda. */
function BootScreen() {
  return <View style={styles.bootLoaderRoot} />;
}

/**
 * Açılış (oturum kontrolü) sırasında lobi arka planını gösterir; düz koyu ekranda
 * "çok bekletme" hissi olmadan, splash animasyonundan lobiye akıcı geçiş sağlar.
 */
function LobbyBootScreen() {
  return (
    <View style={styles.wrapper}>
      <LobbyAnimatedBackground />
    </View>
  );
}

/** Giriş sonrası panele yönlendir — personel ise partner bekleme. */
export { enterAppAfterSignIn } from '@/lib/enterAppAfterSignIn';

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const rootNavigation = useRootNavigationState();
  const navigationReady = rootNavigation?.key != null;
  const params = useLocalSearchParams<{ t?: string; l?: string }>();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { user, staff, loading, staffCheckComplete, staffCheckUnavailable, retryStaffCheck, signOut } =
    useAuthStore();
  const partner = usePartnerAuthStore((s) => s.partner);
  const partnerCheckComplete = usePartnerAuthStore((s) => s.partnerCheckComplete);
  const partnerSurface = usePartnerAppSurfaceStore((s) => s.surface);
  const partnerSurfaceHydrated = usePartnerAppSurfaceStore((s) => s.hydrated);
  const [isOffline, setIsOffline] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signInLoading, setSignInLoading] = useState(false);
  const [guestLoginLoading, setGuestLoginLoading] = useState(false);
  const [notifStatus, setNotifStatus] = useState<'granted' | 'denied' | 'undetermined' | 'unavailable'>('undetermined');
  const [notifLoading, setNotifLoading] = useState(false);
  const [showCheckinPromptCard, setShowCheckinPromptCard] = useState<boolean | null>(null);
  const notifiedNearby = useRef(false);
  const scrollRef = useRef<ScrollViewType>(null);
  // Kart açılışta anında görünsün — yavaş spring "fade" yerine direkt yerinde.
  const cardEntrance = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let cancelled = false;
    const loadDismissed = () => {
      AsyncStorage.getItem(CHECKIN_PROMPT_CARD_DISMISSED_KEY).then((val) => {
        if (!cancelled) setShowCheckinPromptCard(val !== '1');
      });
    };
    if (Platform.OS === 'android') {
      const task = runAfterUiReady(loadDismissed, { delayMs: 1500 });
      return () => {
        cancelled = true;
        task.cancel();
      };
    }
    loadDismissed();
    return () => { cancelled = true; };
  }, []);

  const dismissCheckinPromptCard = (goToGuest: boolean) => {
    AsyncStorage.setItem(CHECKIN_PROMPT_CARD_DISMISSED_KEY, '1').catch(() => {});
    setShowCheckinPromptCard(false);
    if (goToGuest) router.push('/guest');
  };

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    const loadNotificationStatus = async () => {
      try {
        const { status } = await ExpoNotifications.getPermissionsAsync();
        if (cancelled) return;
        if (status === 'granted' || status === 'denied' || status === 'undetermined') {
          setNotifStatus(status);
        } else {
          setNotifStatus('unavailable');
        }
      } catch {
        if (!cancelled) setNotifStatus('unavailable');
      }
    };
    if (Platform.OS === 'android') {
      const task = runAfterUiReady(() => void loadNotificationStatus(), { delayMs: 1800 });
      return () => {
        cancelled = true;
        task.cancel();
      };
    }
    void loadNotificationStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const sub = NetInfo.addEventListener((state) => setIsOffline(!state.isConnected));
    NetInfo.fetch().then((state) => setIsOffline(!state.isConnected));
    return () => sub();
  }, []);

  useEffect(() => {
    if (!HOTEL_COORDS || staff) return;
    let cancelled = false;
    let promptedThisSession = false;
    const run = async () => {
      try {
        const shown = await AsyncStorage.getItem(GEOFENCE_CHECKIN_PROMPT_KEY);
        if (shown === '1') return;

        const { status } = await Location.getForegroundPermissionsAsync();
        if (cancelled) return;

        const startWatch = async () => {
          await startGeofenceWatch(
            HOTEL_COORDS!,
            async () => {
              if (cancelled || notifiedNearby.current) return;
              notifiedNearby.current = true;
              await AsyncStorage.setItem(GEOFENCE_CHECKIN_PROMPT_KEY, '1');
              Alert.alert(
                t('nearbyCheckinTitle'),
                t('nearbyCheckinMessage'),
                [
                  { text: t('no'), style: 'cancel' },
                  { text: t('yes'), onPress: () => router.push('/guest') },
                ]
              );
            },
            (e) => log.warn('HomeScreen', 'Geofence', (e as Error)?.message)
          );
        };

        if (status === 'granted') {
          await startWatch();
          return;
        }

        const alreadyPrompted = await AsyncStorage.getItem(GEOFENCE_LOCATION_PERMISSION_PROMPT_KEY);
        if (alreadyPrompted === '1') return;
        if (promptedThisSession) return;
        promptedThisSession = true;

        Alert.alert(
          t('nearbyCheckinTitle'),
          'Otele yakın olduğunuzda check-in önerisi gösterebilmek için konum izni kullanırız. Bu izleme yalnızca uygulama açıkken çalışır. İzin verir misiniz?',
          [{
            text: 'Continue',
            onPress: () => {
              // Aynı oturumda tekrar alert göstermemek için key'i set ediyoruz;
              // Kullanıcı yine OS izin ekranından "Reddederse", konum iznini daha sonra `İzinler` ekranından açabilir.
              AsyncStorage.setItem(GEOFENCE_LOCATION_PERMISSION_PROMPT_KEY, '1').catch(() => {});
              void startWatch();
            },
          }]
        );
      } catch (e) {
        log.warn('HomeScreen', 'Geofence', (e as Error)?.message);
      }
    };
    if (Platform.OS === 'android') {
      const task = runAfterUiReady(() => void run(), { delayMs: 2500 });
      return () => {
        cancelled = true;
        task.cancel();
        stopGeofenceWatch();
      };
    }
    void run();
    return () => {
      cancelled = true;
      stopGeofenceWatch();
    };
  }, [staff]);

  // Giriş yapmış kullanıcıyı ilgili panele yönlendir. İlk girişte gizlilik onayı yoksa önce /policies.
  // QR ile sözleşme sayfası açıldıysa yönlendirme yapma – misafir sözleşme ekranında kalsın.
  useEffect(() => {
    if (!navigationReady) return;
    if (loading) return;
    if (!user) return;
    if (!staffCheckComplete) return;
    // Personel ise partner kontrolünü (ağ sorgusu) bekleme — /staff'a anında yönlendir.
    // Yalnızca personel değilse partner/yüzey kontrolü gerekir (customer vs partner ayrımı).
    if (!staff) {
      if (!partnerCheckComplete) return;
      if (!partnerSurfaceHydrated) return;
    }
    if (hasPendingNotificationData()) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const pathname = window.location.pathname || '';
      if (isPublicWebPath(pathname, window.location.search || '')) return;
      if (
        pathname.includes('/guest/sign-one') ||
        pathname.includes('/guest/success') ||
        pathname === '/maliye' ||
        pathname.startsWith('/maliye/') ||
        pathname === '/breakfast-pass' ||
        pathname.startsWith('/breakfast-pass/') ||
        pathname === '/sikayet' ||
        pathname.startsWith('/sikayet/') ||
        pathname === '/profil' ||
        pathname.startsWith('/profil/') ||
        pathname === '/payment' ||
        pathname === '/payment/qr' ||
        pathname === '/payment/new' ||
        pathname.startsWith('/payment/new') ||
        pathname === '/odeme' ||
        pathname === '/odeme/qr' ||
        pathname.startsWith('/staff/payments') ||
        pathname.startsWith('/admin/payments')
      ) {
        return;
      }
    }
    const path = staff
      ? '/staff'
      : partner
        ? resolvePartnerEntryPath(partner, partnerSurface)
        : '/customer';
    const nextParam = staff ? 'staff' : partner ? 'partner' : 'customer';
    let cancelled = false;
    hasPolicyConsent(user?.id ?? null).then((accepted) => {
      if (cancelled) return;
      if (accepted) {
        safeRouterReplace(router, path);
      } else {
        safeRouterReplace(router, { pathname: '/policies', params: { next: nextParam } });
      }
    }).catch(() => {
      if (cancelled) return;
      safeRouterReplace(router, path);
    });
    return () => {
      cancelled = true;
    };
  }, [navigationReady, loading, user, staff, partner, partnerCheckComplete, partnerSurface, partnerSurfaceHydrated, staffCheckComplete, staffCheckUnavailable, router]);

  const signInWithPassword = async () => {
    const e = email.trim().toLowerCase();
    if (!e) {
      Alert.alert(t('error'), t('errorEnterEmail'));
      return;
    }
    if (!password || password.length < 6) {
      Alert.alert(t('error'), t('passwordMinLength'));
      return;
    }
    setSignInLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: e, password });
      if (error) throw error;
      if (data.user) {
        await completeSignIn(data.user);
        const { user } = useAuthStore.getState();
        const { pendingRoom, clearPendingRoom } = useCustomerRoomStore.getState();
        if (pendingRoom && user?.email) {
          await linkGuestToRoom(user.email, pendingRoom.roomId, user.user_metadata?.full_name);
          clearPendingRoom();
        }
        await enterAppAfterSignIn(router, data.user.id);
      }
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? t('signInFailed');
      log.error('HomeScreen', 'signIn', err, msg);
      Alert.alert(t('error'), msg);
    }
    setSignInLoading(false);
  };

  const signInWithApple = async () => {
    if (Platform.OS !== 'ios') return;
    setAppleLoading(true);
    try {
      const AppleAuthentication = await import('expo-apple-authentication');
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const token = credential?.identityToken;
      if (!token) {
        Alert.alert(t('appleSignIn'), t('appleCredentialUnavailable'));
        setAppleLoading(false);
        return;
      }
      const { data: appleData, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token,
      });
      if (error) throw error;
      if (appleData.user) {
        await completeSignIn(appleData.user);
        await enterAppAfterSignIn(router, appleData.user.id);
      }
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e?.code === 'ERR_REQUEST_CANCELED') return;
      log.warn('HomeScreen', 'Apple sign-in', e?.message ?? e);
      const msg =
        e?.code === 'ERR_REQUEST_FAILED' ||
        (typeof e?.message === 'string' && e.message.includes('missing'))
          ? t('appleCredentialUnavailable')
          : (e?.message ?? t('signInFailed'));
      Alert.alert(t('appleSignIn'), msg);
    } finally {
      setAppleLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    if (Platform.OS !== 'android') return;
    const { GoogleSignin, isGoogleSigninAvailable, getGoogleSigninLoadError } = require('@/lib/googleSignin');
    if (!isGoogleSigninAvailable() || !GoogleSignin) {
      const err = getGoogleSigninLoadError?.();
      const msg =
        err && typeof (err as Error)?.message === 'string' && (err as Error).message.includes('RNGoogleSignin')
          ? 'Google Sign-In native modülü bu derlemede yok. Lütfen projeyi yeniden derleyin: npx expo prebuild --clean ardından npx expo run:android'
          : 'Google ile giriş bu ortamda kullanılamıyor. Development build kullanıyorsanız: npx expo prebuild --clean ve npx expo run:android ile yeniden derleyin.';
      Alert.alert(t('googleSignIn'), msg);
      return;
    }
    setGoogleLoading(true);
    try {
      GoogleSignin.configure({
        webClientId: '47373050426-8men09t0m35sufet2n6nl21r4oq07gfo.apps.googleusercontent.com',
        offlineAccess: true,
      });
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      const { idToken } = await GoogleSignin.getTokens();
      if (!idToken) {
        const cancelled = userInfo?.user?.id == null;
        if (!cancelled) Alert.alert(t('googleSignIn'), t('signInFailed'));
        setGoogleLoading(false);
        return;
      }
      const { data: googleData, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });
      if (error) throw error;
      if (googleData.user) {
        await completeSignIn(googleData.user);
        const { user } = useAuthStore.getState();
        const { pendingRoom, clearPendingRoom } = useCustomerRoomStore.getState();
        if (pendingRoom && user?.email) {
          await linkGuestToRoom(user.email, pendingRoom.roomId, user.user_metadata?.full_name);
          clearPendingRoom();
        }
        await enterAppAfterSignIn(router, googleData.user.id);
      }
    } catch (err: unknown) {
      log.error('HomeScreen', 'Google sign-in', err);
      Alert.alert(t('googleSignIn'), (err as Error)?.message ?? t('signInFailed'));
    } finally {
      setGoogleLoading(false);
    }
  };

  // Misafir olarak giriş: Anonymous auth + get_or_create_guest. Her cihaz bir misafir hesabı; çıkış yapıp tekrar girişte aynı hesap.
  // Supabase Dashboard: Authentication → Providers → Anonymous Sign-Ins açık olmalı.
  const signInAsGuest = async () => {
    setGuestLoginLoading(true);
    try {
      const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
      if (anonError) throw anonError;
      const anonUser = anonData?.user;
      if (!anonUser) {
        setGuestLoginLoading(false);
        return;
      }
      await completeSignIn(anonUser);
      const guestResult = await getOrCreateGuestForCaller(anonUser);
      if (guestResult?.is_new && guestResult.guest_id) {
        void invokeNotifyNewGuestAccount(guestResult.guest_id);
      }
      await enterAppAfterSignIn(router, anonUser.id);
    } catch (err: unknown) {
      log.error('HomeScreen', 'signInAsGuest', err);
      const msg = (err as Error)?.message ?? '';
      const isAnonymousDisabled = /anonymous sign-ins are disabled/i.test(msg);
      const isCaptchaFailed = /captcha verification process failed/i.test(msg);
      const isServerDown = isSupabaseUnavailableError(msg);
      Alert.alert(
        t('error'),
        isAnonymousDisabled
          ? (t('guestLoginDisabled') ?? 'Misafir girişi bu otelde şu an kapalı. Lütfen e-posta ile giriş yapın veya kayıt olun.')
          : isCaptchaFailed
            ? ((t('guestLoginCaptchaBlocked') as string | undefined) ??
              'Misafir girişi şu an CAPTCHA tarafından engellendi. Supabase Dashboard → Authentication → Settings → CAPTCHA ayarını kapatın (veya mobilde CAPTCHA token entegrasyonu ekleyin).')
            : isServerDown
              ? 'Sunucuya şu an ulaşılamıyor. Birkaç dakika sonra tekrar deneyin.'
              : (msg || t('signInFailed'))
      );
    } finally {
      setGuestLoginLoading(false);
    }
  };

  const requestNotificationPermission = async () => {
    if (Platform.OS === 'web' || notifLoading) return;
    setNotifLoading(true);
    try {
      const { status } = await ExpoNotifications.requestPermissionsAsync();
      if (status === 'granted' || status === 'denied' || status === 'undetermined') {
        setNotifStatus(status);
      }
    } catch {
      setNotifStatus('unavailable');
    } finally {
      setNotifLoading(false);
    }
  };

  const cardWidth = width - 24;
  const paddingH = 12;

  if (loading && !user) {
    return <LobbyBootScreen />;
  }

  if (isOffline) {
    return <OfflineWelcome onRetry={() => NetInfo.fetch().then((s) => setIsOffline(!s.isConnected))} />;
  }

  if (user && staffCheckUnavailable && !staffCheckComplete) {
    return (
      <View style={styles.wrapper}>
        <LobbyAnimatedBackground />
        <View style={[styles.bootLoaderRoot, { paddingTop: insets.top + 48 }]}>
          <Text style={styles.lobbyBrandWhite}>{t('valoria')}</Text>
          <Text style={[styles.lobbyTaglineWhite, { marginTop: 16, textAlign: 'center', paddingHorizontal: 24 }]}>
            Sunucuya şu an ulaşılamıyor. Birkaç dakika sonra tekrar deneyin.
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, { marginTop: 28 }]}
            onPress={() => void retryStaffCheck()}
            activeOpacity={0.85}
          >
            <Text style={styles.retryButtonText}>{t('retry')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ marginTop: 16 }} onPress={() => void signOut()} activeOpacity={0.85}>
            <Text style={styles.lobbyTaglineWhite}>{t('signOut') ?? 'Çıkış yap'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (user || staff) {
    return Platform.OS === 'web' ? <LobbyBootScreen /> : <BootScreen />;
  }

  return (
    <View style={styles.wrapper}>
      <LobbyAnimatedBackground />
      <ScrollView
        ref={scrollRef}
        onScroll={(e) => setShowScrollTop(e.nativeEvent.contentOffset.y > 200)}
        scrollEventThrottle={100}
        style={[styles.scrollView, { paddingTop: insets.top }]}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 48 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <LobbyHero
          brand={t('valoria')}
          tagline={t('tagline')}
          location="Uzungöl, Türkiye"
          paddingTop={insets.top * 0.35}
        />

        {/* Web (valoria.tr): yalnızca halka açık menü / sözleşme / maliye — Play incelemesi native uygulamada */}
        {Platform.OS === 'web' && (
          <View style={[styles.portalPanel, { marginHorizontal: paddingH, width: cardWidth }]}>
            <Text style={styles.portalPanelLabel}>{t('homePortalServices')}</Text>
            <View style={styles.portalRow}>
              <TouchableOpacity
                style={styles.portalTile}
                onPress={() => safeRouterPush(router, publicMenuHref())}
                activeOpacity={0.82}
              >
                <LinearGradient
                  colors={['#fef9c3', '#fde68a', '#fbbf24']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.portalTileGradient}
                >
                  <View style={styles.portalIconCircle}>
                    <Ionicons name="restaurant" size={26} color="#b45309" />
                  </View>
                  <Text style={[styles.portalTileTitle, { color: '#78350f' }]}>{t('homePortalMenu')}</Text>
                  <Text style={[styles.portalTileHint, { color: '#92400e' }]}>{t('homePortalMenuHint')}</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.portalTile}
                onPress={() => safeRouterPush(router, publicContractHref())}
                activeOpacity={0.82}
              >
                <LinearGradient
                  colors={['#dbeafe', '#bfdbfe', '#93c5fd']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.portalTileGradient}
                >
                  <View style={styles.portalIconCircle}>
                    <Ionicons name="document-text" size={26} color="#1e40af" />
                  </View>
                  <Text style={[styles.portalTileTitle, { color: '#1e3a5f' }]}>{t('homePortalContract')}</Text>
                  <Text style={[styles.portalTileHint, { color: '#1e40af' }]}>{t('homePortalContractHint')}</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.portalTile}
                onPress={() => openPublicMaliyePortal()}
                activeOpacity={0.82}
              >
                <LinearGradient
                  colors={['#ccfbf1', '#99f6e4', '#5eead4']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.portalTileGradient}
                >
                  <View style={styles.portalIconCircle}>
                    <Ionicons name="shield-checkmark" size={26} color="#0f766e" />
                  </View>
                  <Text style={[styles.portalTileTitle, { color: '#134e4a' }]}>{t('homePortalMaliye')}</Text>
                  <Text style={[styles.portalTileHint, { color: '#0f766e' }]}>{t('homePortalMaliyeHint')}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            <Text style={[styles.portalPanelLabel, styles.portalPanelLabelSpaced]}>{t('homePortalPayments')}</Text>
            <View style={styles.portalRow}>
              <Pressable
                style={({ pressed }) => [styles.portalTile, pressed && styles.portalTilePressed, styles.portalTileWeb]}
                onPress={() =>
                  safeRouterPush(
                    router,
                    publicPaymentNewHref('standing', { admin: staff?.role === 'admin' })
                  )
                }
              >
                <LinearGradient
                  colors={['#ede9fe', '#ddd6fe', '#c4b5fd']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.portalTileGradient}
                  pointerEvents="none"
                >
                  <View style={styles.portalIconCircle}>
                    <Ionicons name="qr-code" size={26} color="#635bff" />
                  </View>
                  <Text style={[styles.portalTileTitle, { color: '#4c1d95' }]}>{t('homePortalPaymentFixed')}</Text>
                  <Text style={[styles.portalTileHint, { color: '#5b21b6' }]}>{t('homePortalPaymentFixedHint')}</Text>
                </LinearGradient>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.portalTile, pressed && styles.portalTilePressed, styles.portalTileWeb]}
                onPress={() =>
                  safeRouterPush(
                    router,
                    publicPaymentNewHref('standing_variable', { admin: staff?.role === 'admin' })
                  )
                }
              >
                <LinearGradient
                  colors={['#eef2ff', '#e0e7ff', '#c7d2fe']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.portalTileGradient}
                  pointerEvents="none"
                >
                  <View style={styles.portalIconCircle}>
                    <Ionicons name="create-outline" size={26} color="#4f46e5" />
                  </View>
                  <Text style={[styles.portalTileTitle, { color: '#312e81' }]}>{t('homePortalPaymentVariable')}</Text>
                  <Text style={[styles.portalTileHint, { color: '#4338ca' }]}>{t('homePortalPaymentVariableHint')}</Text>
                </LinearGradient>
              </Pressable>
            </View>

            <Text style={[styles.portalPanelLabel, styles.portalPanelLabelSpaced]}>{t('signIn')}</Text>
            <TouchableOpacity
              style={styles.webSignInBtn}
              onPress={() => safeRouterPush(router, '/auth')}
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={['#0d9488', '#0891b2', '#0ea5e9']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.webSignInBtnGradient}
              >
                <Ionicons name="log-in-outline" size={22} color="#fff" />
                <View style={styles.webSignInBtnTextWrap}>
                  <Text style={styles.webSignInBtnTitle}>{t('signIn')}</Text>
                  <Text style={styles.webSignInBtnHint}>{t('loginSubtitle')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.85)" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {Platform.OS !== 'web' && (
          <>
        {/* Check-in prompt kartı — bir kere sorulur, sonra gösterilmez */}
        {showCheckinPromptCard === true && (
          <View style={[styles.checkinPromptCard, { marginHorizontal: paddingH, width: cardWidth }]}>
            <LinearGradient
              colors={['#0d9488', '#0891b2']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.checkinPromptAccent}
            />
            <View style={styles.checkinPromptInner}>
              <View style={styles.checkinPromptIconWrap}>
                <Ionicons name="navigate-circle" size={28} color="#0d9488" />
              </View>
              <Text style={styles.checkinPromptTitle}>{t('nearbyCheckinTitle')}</Text>
              <Text style={styles.checkinPromptMessage}>{t('checkinPromptCardMessage') || t('nearbyCheckinMessage')}</Text>
              <View style={styles.checkinPromptActions}>
                <TouchableOpacity
                  style={[styles.checkinPromptBtn, styles.checkinPromptBtnNo]}
                  onPress={() => dismissCheckinPromptCard(false)}
                  activeOpacity={0.82}
                >
                  <Text style={styles.checkinPromptBtnNoText}>{t('no')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.checkinPromptBtn, styles.checkinPromptBtnYes]}
                  onPress={() => dismissCheckinPromptCard(true)}
                  activeOpacity={0.82}
                >
                  <LinearGradient
                    colors={['#14b8a6', '#0d9488']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.checkinPromptBtnGradient}
                  >
                    <Text style={styles.checkinPromptBtnYesText}>{t('yes')}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        <KeyboardAvoidingView
          style={[styles.cardsContainer, { width: cardWidth, marginHorizontal: paddingH }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <Animated.View
            style={{
              opacity: cardEntrance,
              transform: [
                {
                  translateY: cardEntrance.interpolate({
                    inputRange: [0, 1],
                    outputRange: [28, 0],
                  }),
                },
              ],
            }}
          >
          <LobbyGlassCard>
            <View style={styles.lobbyCardInner}>
              <View style={styles.lobbySection}>
                <View style={styles.lobbySectionHeader}>
                  <LinearGradient
                    colors={['#14b8a6', '#0ea5e9']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={styles.lobbySectionHeaderBar}
                  />
                  <Text style={styles.lobbySectionTitle}>{t('signIn')}</Text>
                </View>
                {Platform.OS !== 'web' && notifStatus === 'undetermined' && (
                  <View style={styles.permissionCard}>
                    <View style={styles.permissionCardHeader}>
                      <Ionicons name="notifications" size={18} color="#0d9488" />
                      <Text style={styles.permissionCardTitle}>Bildirim izni</Text>
                    </View>
                    <Text style={styles.permissionCardText}>
                      Yeni mesajlar ve duyurular icin bildirim izni onerilir.
                    </Text>
                    <View style={styles.permissionCardActions}>
                      <TouchableOpacity
                        style={[styles.permissionBtn, notifLoading && styles.cardBtnDisabled]}
                        onPress={requestNotificationPermission}
                        disabled={notifLoading}
                        activeOpacity={0.82}
                      >
                        {notifLoading ? (
                          <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                          <Text style={styles.permissionBtnText}>Bildirim iznini goster</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.permissionLinkBtn}
                        onPress={() => router.push('/permissions')}
                        activeOpacity={0.82}
                      >
                        <Text style={styles.permissionLinkBtnText}>Tum izinler</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
                <View style={styles.inputWrap}>
                  <Ionicons name="mail-outline" size={20} color="#64748b" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder={t('emailPlaceholder')}
                    placeholderTextColor="#94a3b8"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!signInLoading}
                  />
                </View>
                <View style={styles.inputWrap}>
                  <Ionicons name="lock-closed-outline" size={20} color="#64748b" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder={t('passwordPlaceholder')}
                    placeholderTextColor="#94a3b8"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    editable={!signInLoading}
                  />
                </View>
                <TouchableOpacity
                  style={[styles.cardBtnWrap, signInLoading && styles.cardBtnDisabled]}
                  onPress={signInWithPassword}
                  disabled={signInLoading}
                  activeOpacity={0.88}
                >
                  <LinearGradient
                    colors={['#14b8a6', '#0d9488', '#0891b2']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.cardBtnGradient}
                  >
                    {signInLoading ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <Ionicons name="log-in-outline" size={20} color="#ffffff" />
                        <Text style={styles.cardBtnTextPrimary}>{t('signInButton')}</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
                <View style={styles.authLinksRow}>
                  <TouchableOpacity onPress={() => router.push('/auth/register')} style={styles.authLinkWrap}>
                    <Ionicons name="person-add-outline" size={15} color="#0d9488" />
                    <Text style={styles.cardLinkText}>{t('signUp')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => router.push('/auth/reset')} style={styles.authLinkWrap}>
                    <Ionicons name="key-outline" size={15} color="#0d9488" />
                    <Text style={styles.cardLinkText}>{t('forgotPassword')}</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.lobbyOrRow}>
                  <View style={styles.lobbyOrLine} />
                  <Text style={styles.lobbyOrText}>veya</Text>
                  <View style={styles.lobbyOrLine} />
                </View>

                {Platform.OS === 'android' && GOOGLE_SIGN_IN_ANDROID_ENABLED && (
                  <TouchableOpacity
                    style={[styles.cardBtn, styles.cardBtnOutlined, googleLoading && styles.cardBtnDisabled]}
                    onPress={signInWithGoogle}
                    disabled={googleLoading}
                    activeOpacity={0.82}
                  >
                    {googleLoading ? (
                      <ActivityIndicator size="small" color="#0f172a" />
                    ) : (
                      <Text style={styles.cardBtnTextOutlined}>{t('googleSignIn')}</Text>
                    )}
                  </TouchableOpacity>
                )}
                {Platform.OS === 'ios' && (
                  <TouchableOpacity
                    style={[styles.cardBtn, styles.cardBtnOutlined, appleLoading && styles.cardBtnDisabled]}
                    onPress={signInWithApple}
                    disabled={appleLoading}
                    activeOpacity={0.82}
                  >
                    {appleLoading ? (
                      <ActivityIndicator size="small" color="#0f172a" />
                    ) : (
                      <View style={styles.cardBtnOutlinedRow}>
                        <Ionicons name="logo-apple" size={20} color="#0f172a" />
                        <Text style={styles.cardBtnTextOutlined}>{t('appleSignIn')}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.guestLoginBtn, guestLoginLoading && styles.cardBtnDisabled]}
                  onPress={signInAsGuest}
                  disabled={guestLoginLoading || signInLoading}
                  activeOpacity={0.82}
                >
                  {guestLoginLoading ? (
                    <ActivityIndicator size="small" color="#0d9488" />
                  ) : (
                    <>
                      <View style={styles.guestLoginBtnRow}>
                        <Ionicons name="sparkles-outline" size={18} color="#0d9488" />
                        <Text style={styles.guestLoginBtnText}>{t('guestAccountLogin')}</Text>
                      </View>
                      <Text style={styles.guestLoginBtnHint}>{t('guestAccountLoginHint')}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.lobbyDivider} />

              <Text style={styles.lobbySectionLabel}>{t('moreOptions') || 'Diğer seçenekler'}</Text>
              <LobbyPortalGrid
                items={[
                  {
                    id: 'guest',
                    title: t('guestCheckIn') || 'Misafir check-in',
                    hint: t('guestCheckInHint') || 'QR veya link ile sözleşme onayı',
                    onPress: () => router.push('/guest'),
                  },
                  {
                    id: 'staff',
                    title: t('staffApplication'),
                    hint: t('staffApplicationHint'),
                    onPress: () => router.push('/join'),
                  },
                  {
                    id: 'partner',
                    title: 'Partner otel girişi',
                    hint: 'Profil oluştur · kahvaltı kaydı · cari',
                    onPress: () => router.push('/partner/login'),
                  },
                  {
                    id: 'trade',
                    title: 'Partner Ticaret girişi',
                    hint: 'İşlem onayı · cari hesap · itiraz',
                    onPress: () => router.push('/trade-partner/login'),
                  },
                ]}
              />

              <View style={styles.lobbyDivider} />

              <View style={styles.lobbyFooter}>
                <View style={styles.lobbyFooterButtons}>
                  <TouchableOpacity
                    style={styles.lobbyFooterBtn}
                    onPress={() => router.push({ pathname: '/legal/[type]', params: { type: 'privacy' } })}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="shield-outline" size={14} color="#64748b" />
                    <Text style={styles.lobbyFooterBtnText}>{t('privacy')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.lobbyFooterBtn}
                    onPress={() => router.push({ pathname: '/legal/[type]', params: { type: 'terms' } })}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="document-text-outline" size={14} color="#64748b" />
                    <Text style={styles.lobbyFooterBtnText}>{t('terms')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.lobbyFooterBtn}
                    onPress={() => router.push('/guest/language')}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="language-outline" size={14} color="#64748b" />
                    <Text style={styles.lobbyFooterBtnText}>{t('language')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </LobbyGlassCard>
          </Animated.View>
        </KeyboardAvoidingView>
          </>
        )}
      </ScrollView>
      {showScrollTop && (
        <View style={[styles.scrollTopWrap, { bottom: insets.bottom + 24 }]} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.scrollTopBtn}
            onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#14b8a6', '#0d9488']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.scrollTopBtnGradient}
            >
              <Ionicons name="arrow-up" size={16} color="#ffffff" />
              <Text style={styles.scrollTopBtnText}>{t('scrollTop')}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#050a14',
  },
  /** Oturum + sözleşme yönlendirmesi beklerken; layout splash (#1a365d) ile hizalı */
  bootLoaderRoot: {
    flex: 1,
    backgroundColor: BOOT_SCREEN_BG,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
  },
  hero: {
    alignItems: 'center',
    paddingVertical: 36,
    minHeight: 100,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f1419',
    letterSpacing: 0.5,
  },
  loadingSub: {
    fontSize: 14,
    color: 'rgba(15,20,25,0.6)',
    marginTop: 8,
  },
  cardsContainer: {
    marginTop: -48,
    marginBottom: 24,
  },
  bgSparkleField: {
    ...StyleSheet.absoluteFillObject,
  },
  bgSparkle: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  lobbyHeroDark: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: 28,
  },
  lobbyBrandRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  lobbyBrandBadge: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(6, 13, 26, 0.55)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lobbyBrandBadgeLetter: {
    fontSize: 36,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -1,
  },
  lobbyBrandWhite: {
    fontSize: 38,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: Platform.OS === 'android' ? 0.5 : -1.2,
    paddingHorizontal: 8,
    textShadowColor: 'rgba(20, 184, 166, 0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  lobbyTaglineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    paddingHorizontal: 8,
  },
  lobbyTaglineAccent: {
    width: 28,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(20, 184, 166, 0.65)',
  },
  lobbyTaglineWhite: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.82)',
    fontWeight: '600',
    textAlign: 'center',
    flexShrink: 1,
  },
  lobbyLocationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(94, 234, 212, 0.28)',
  },
  lobbyLocationChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.78)',
    letterSpacing: 0.3,
  },
  portalPanel: {
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 24,
    padding: 18,
    marginTop: -20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 22,
    elevation: 8,
    ...(Platform.OS === 'web' ? { position: 'relative' as const, zIndex: 4 } : null),
  },
  portalPanelLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 14,
    textAlign: 'center',
  },
  portalPanelLabelSpaced: { marginTop: 18 },
  portalRow: { flexDirection: 'row', gap: 10 },
  portalTile: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  portalTileWeb: Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {},
  portalTilePressed: { opacity: 0.82 },
  portalTileGradient: {
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 8,
    borderRadius: 18,
  },
  portalIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  portalTileTitle: { fontSize: 13, fontWeight: '800', textAlign: 'center', marginBottom: 3 },
  portalTileHint: { fontSize: 10, fontWeight: '600', textAlign: 'center', opacity: 0.8 },
  webSignInBtn: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#0d9488',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 5,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {}),
  },
  webSignInBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  webSignInBtnTextWrap: { flex: 1 },
  webSignInBtnTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  webSignInBtnHint: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.88)', marginTop: 2 },
  checkinPromptCard: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 22,
    marginTop: 0,
    marginBottom: 12,
    shadowColor: '#0d9488',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 8,
    overflow: 'hidden',
  },
  checkinPromptAccent: {
    height: 4,
    width: '100%',
  },
  checkinPromptInner: {
    padding: 20,
  },
  checkinPromptIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(13, 148, 136, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  checkinPromptTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 8,
  },
  checkinPromptMessage: {
    fontSize: 15,
    color: '#475569',
    lineHeight: 22,
    marginBottom: 16,
  },
  checkinPromptActions: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  checkinPromptBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  checkinPromptBtnNo: {
    backgroundColor: '#f1f5f9',
  },
  checkinPromptBtnYes: {
    overflow: 'hidden',
    paddingVertical: 0,
    backgroundColor: 'transparent',
  },
  checkinPromptBtnGradient: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
  },
  checkinPromptBtnNoText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#64748b',
  },
  checkinPromptBtnYesText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  bgOrb: {
    position: 'absolute',
  },
  lobbyCard: {
    borderRadius: 26,
    overflow: 'hidden',
    shadowColor: '#14b8a6',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 32,
    elevation: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  lobbyCardAndroid: {
    backgroundColor: 'rgba(255,255,255,0.97)',
  },
  lobbyCardAccent: {
    height: 4,
    width: '100%',
  },
  lobbyCardBlur: {
    overflow: 'hidden',
  },
  lobbyCardSheen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  lobbyCardInner: {
    padding: 0,
  },
  lobbySection: {
    alignItems: 'stretch',
  },
  permissionCard: {
    backgroundColor: 'rgba(13, 148, 136, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(13, 148, 136, 0.18)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  permissionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  permissionCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },
  permissionCardText: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 17,
  },
  permissionCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  permissionBtn: {
    backgroundColor: '#0d9488',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  permissionBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  permissionLinkBtn: {
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  permissionLinkBtnText: {
    color: '#0d9488',
    fontSize: 12,
    fontWeight: '700',
  },
  lobbySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  lobbySectionHeaderBar: {
    width: 4,
    height: 28,
    borderRadius: 2,
  },
  lobbySectionTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -0.6,
    marginBottom: 0,
  },
  lobbyDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 26,
  },
  lobbySectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    marginBottom: 14,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  lobbyOrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
    gap: 14,
  },
  lobbyOrLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e2e8f0',
  },
  lobbyOrText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
  },
  lobbyActionList: {
    gap: 12,
  },
  lobbyActionCard: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 5,
  },
  lobbyActionCardGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 14,
    minHeight: 88,
  },
  lobbyActionCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lobbyActionCardBody: {
    flex: 1,
  },
  lobbyActionCardPill: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 1,
    marginBottom: 4,
  },
  lobbyActionCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 2,
  },
  lobbyActionCardHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.82)',
    lineHeight: 16,
  },
  lobbyActionCardArrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lobbyFooter: {
    marginTop: 2,
  },
  lobbyFooterButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  lobbyFooterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.04)',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  lobbyFooterBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  inputWrap: {
    position: 'relative',
    marginBottom: 14,
  },
  inputIcon: {
    position: 'absolute',
    left: 16,
    top: 18,
    zIndex: 1,
  },
  input: {
    width: '100%',
    backgroundColor: '#f1f5f9',
    borderRadius: 16,
    paddingVertical: 17,
    paddingLeft: 48,
    paddingRight: 20,
    color: '#0f172a',
    fontSize: 16,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    marginBottom: 0,
  },
  authLinksRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 18,
    marginBottom: (Platform.OS === 'ios' || Platform.OS === 'android') ? 14 : 0,
  },
  authLinkWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(13, 148, 136, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(13, 148, 136, 0.2)',
  },
  cardEmoji: {
    fontSize: 32,
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f1419',
    marginBottom: 6,
  },
  cardHint: {
    fontSize: 13,
    color: 'rgba(15,20,25,0.7)',
    textAlign: 'center',
    marginBottom: 18,
    lineHeight: 20,
  },
  cardBtnWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 4,
  },
  cardBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 17,
    paddingHorizontal: 28,
    minWidth: 180,
  },
  cardBtnOutlinedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  guestLoginBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardBtn: {
    paddingVertical: 17,
    paddingHorizontal: 28,
    borderRadius: 14,
    minWidth: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBtnPrimary: {
    backgroundColor: '#0d9488',
    borderWidth: 0,
  },
  cardBtnSecondary: {
    backgroundColor: '#0d9488',
    borderWidth: 0,
  },
  cardBtnOutlined: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    marginTop: 0,
  },
  cardBtnTextPrimary: {
    fontSize: 17,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  cardBtnTextSecondary: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
  },
  cardBtnTextOutlined: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  guestLoginBtn: {
    marginTop: 20,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#0d9488',
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  guestLoginBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0d9488',
  },
  guestLoginBtnHint: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  cardBtnApple: {
    marginTop: 0,
    backgroundColor: '#0d9488',
  },
  cardBtnGoogle: {
    marginTop: 0,
    backgroundColor: '#0d9488',
  },
  cardBtnDisabled: {
    opacity: 0.65,
  },
  cardBtnTextApple: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  cardBtnTextGoogle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  cardLink: {
    marginTop: 12,
    paddingVertical: 4,
  },
  cardLinkText: {
    fontSize: 14,
    color: '#0d9488',
    fontWeight: '700',
  },
  scrollTopWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  scrollTopBtn: {
    borderRadius: 999,
    overflow: 'hidden',
    shadowColor: '#0d9488',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
  scrollTopBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 22,
  },
  scrollTopBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
  },
  offlineWrapper: {
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  offlineTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  offlineEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  offlineSub: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 8,
  },
  retryButton: {
    backgroundColor: '#ffffff',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    alignItems: 'center',
  },
  retryButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
});
