import { useEffect, useRef, useState } from 'react';
import type { ScrollView as ScrollViewType } from 'react-native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  useWindowDimensions,
  Platform,
  ScrollView,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Animated,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { startGeofenceWatch, stopGeofenceWatch, type HotelGeofenceConfig } from '@/lib/geofencing';
import * as Location from 'expo-location';
import { useCustomerRoomStore } from '@/stores/customerRoomStore';
import { linkGuestToRoom } from '@/lib/linkGuestToRoom';
import { getOrCreateGuestForCaller } from '@/lib/getOrCreateGuestForCaller';
import { hasPolicyConsent } from '@/lib/policyConsent';
import { isPublicWebPath } from '@/lib/publicWebRoute';
import ExpoNotifications from '@/lib/expoNotificationsModule';

const GEOFENCE_CHECKIN_PROMPT_KEY = '@valoria/geofence_checkin_prompt_shown';
const GEOFENCE_LOCATION_PERMISSION_PROMPT_KEY = '@valoria/geofence_location_permission_prompt_shown';
const CHECKIN_PROMPT_CARD_DISMISSED_KEY = '@valoria/checkin_prompt_card_dismissed';
/** app/_layout splash ile aynı — açılışta boş ekran hissi (özellikle Android) olmasın */
const BOOT_SCREEN_BG = '#1a365d';
/** Geçici: Android’de Google ile giriş — tekrar açmak için true yapın */
const GOOGLE_SIGN_IN_ANDROID_ENABLED = false;

function AnimatedLobbyBackground() {
  const { width, height } = useWindowDimensions();
  const drift1 = useRef(new Animated.Value(0)).current;
  const drift2 = useRef(new Animated.Value(0)).current;
  const drift3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = (val: Animated.Value, duration: number, delta: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, { toValue: 1, duration, useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration, useNativeDriver: true }),
        ])
      );
    const a1 = loop(drift1, 22000, 40);
    const a2 = loop(drift2, 32000, 50);
    const a3 = loop(drift3, 28000, 35);
    a1.start();
    a2.start();
    a3.start();
    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [drift1, drift2, drift3]);

  const orbSize = Math.max(width, height) * 0.6;
  const y1 = drift1.interpolate({ inputRange: [0, 1], outputRange: [0, 30] });
  const x2 = drift2.interpolate({ inputRange: [0, 1], outputRange: [0, -25] });
  const y3 = drift3.interpolate({ inputRange: [0, 1], outputRange: [0, -20] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View
        style={[
          styles.bgOrb,
          {
            width: orbSize,
            height: orbSize,
            borderRadius: orbSize / 2,
            left: -orbSize * 0.35,
            top: -orbSize * 0.2,
            backgroundColor: 'rgba(13, 148, 136, 0.18)',
            transform: [{ translateY: y1 }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.bgOrb,
          {
            width: orbSize * 0.85,
            height: orbSize * 0.85,
            borderRadius: (orbSize * 0.85) / 2,
            right: -orbSize * 0.4,
            top: height * 0.25,
            backgroundColor: 'rgba(30, 58, 95, 0.2)',
            transform: [{ translateX: x2 }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.bgOrb,
          {
            width: orbSize * 0.7,
            height: orbSize * 0.7,
            borderRadius: (orbSize * 0.7) / 2,
            left: width * 0.1,
            bottom: -orbSize * 0.15,
            backgroundColor: 'rgba(59, 130, 246, 0.12)',
            transform: [{ translateY: y3 }],
          },
        ]}
      />
    </View>
  );
}

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

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ t?: string; l?: string }>();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { user, staff, loading, staffCheckComplete, staffCheckUnavailable, retryStaffCheck, signOut } =
    useAuthStore();
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

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(CHECKIN_PROMPT_CARD_DISMISSED_KEY).then((val) => {
      if (!cancelled) setShowCheckinPromptCard(val !== '1');
    });
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
    loadNotificationStatus();
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
    run();
    return () => {
      cancelled = true;
      stopGeofenceWatch();
    };
  }, [staff]);

  // Giriş yapmış kullanıcıyı ilgili panele yönlendir. İlk girişte gizlilik onayı yoksa önce /policies.
  // QR ile sözleşme sayfası açıldıysa yönlendirme yapma – misafir sözleşme ekranında kalsın.
  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (!staffCheckComplete) return;
    if (staffCheckUnavailable && !staff) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const pathname = window.location.pathname || '';
      if (isPublicWebPath(pathname)) return;
      if (pathname.includes('/guest/sign-one')) return;
    }
    const path = staff ? '/staff' : '/customer';
    const nextParam = staff ? 'staff' : 'customer';
    let cancelled = false;
    hasPolicyConsent(user?.id ?? null).then((accepted) => {
      if (cancelled) return;
      if (accepted) {
        router.replace(path);
      } else {
        router.replace({ pathname: '/policies', params: { next: nextParam } });
      }
    }).catch(() => {
      if (cancelled) return;
      router.replace(path);
    });
    return () => {
      cancelled = true;
    };
  }, [loading, user, staff, staffCheckComplete, staffCheckUnavailable]);

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
        await useAuthStore.getState().loadSession();
        await useAuthStore.getState().waitForStaffCheck();
        const { user, staff } = useAuthStore.getState();
        const { pendingRoom, clearPendingRoom } = useCustomerRoomStore.getState();
        if (pendingRoom && user?.email) {
          await linkGuestToRoom(user.email, pendingRoom.roomId, user.user_metadata?.full_name);
          clearPendingRoom();
        }
        const accepted = await hasPolicyConsent(user?.id ?? null);
        const path = staff ? '/staff' : '/customer';
        const nextParam = staff ? 'staff' : 'customer';
        if (accepted) {
          router.replace(path);
        } else {
          router.replace({ pathname: '/policies', params: { next: nextParam } });
        }
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
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token,
      });
      if (error) throw error;
      await useAuthStore.getState().loadSession();
      const { user, staff } = useAuthStore.getState();
      const accepted = await hasPolicyConsent(user?.id ?? null);
      const path = staff ? '/staff' : '/customer';
      const nextParam = staff ? 'staff' : 'customer';
      if (accepted) {
        router.replace(path);
      } else {
        router.replace({ pathname: '/policies', params: { next: nextParam } });
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
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });
      if (error) throw error;
      await useAuthStore.getState().loadSession();
      const { user, staff } = useAuthStore.getState();
      const { pendingRoom, clearPendingRoom } = useCustomerRoomStore.getState();
      if (pendingRoom && user?.email) {
        await linkGuestToRoom(user.email, pendingRoom.roomId, user.user_metadata?.full_name);
        clearPendingRoom();
      }
      const accepted = await hasPolicyConsent(user?.id ?? null);
      const path = staff ? '/staff' : '/customer';
      const nextParam = staff ? 'staff' : 'customer';
      if (accepted) {
        router.replace(path);
      } else {
        router.replace({ pathname: '/policies', params: { next: nextParam } });
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
      await useAuthStore.getState().loadSession();
      const guestResult = await getOrCreateGuestForCaller(anonUser);
      if (guestResult?.is_new && guestResult.guest_id) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) {
            await supabase.functions.invoke('notify-new-guest-account', {
              body: { guest_id: guestResult.guest_id },
              headers: { Authorization: `Bearer ${session.access_token}` },
            });
          }
        } catch (e) {
          log.warn('HomeScreen', 'notify-new-guest-account', (e as Error)?.message);
        }
      }
      const accepted = await hasPolicyConsent(anonUser.id);
      if (accepted) {
        router.replace('/customer');
      } else {
        router.replace({ pathname: '/policies', params: { next: 'customer' } });
      }
    } catch (err: unknown) {
      log.error('HomeScreen', 'signInAsGuest', err);
      const msg = (err as Error)?.message ?? '';
      const isAnonymousDisabled = /anonymous sign-ins are disabled/i.test(msg);
      const isCaptchaFailed = /captcha verification process failed/i.test(msg);
      Alert.alert(
        t('error'),
        isAnonymousDisabled
          ? (t('guestLoginDisabled') ?? 'Misafir girişi bu otelde şu an kapalı. Lütfen e-posta ile giriş yapın veya kayıt olun.')
          : isCaptchaFailed
            ? ((t('guestLoginCaptchaBlocked') as string | undefined) ??
              'Misafir girişi şu an CAPTCHA tarafından engellendi. Supabase Dashboard → Authentication → Settings → CAPTCHA ayarını kapatın (veya mobilde CAPTCHA token entegrasyonu ekleyin).')
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

  if (loading) {
    return null;
  }

  if (isOffline) {
    return <OfflineWelcome onRetry={() => NetInfo.fetch().then((s) => setIsOffline(!s.isConnected))} />;
  }

  if (user && staffCheckUnavailable && !staffCheckComplete) {
    return (
      <View style={styles.wrapper}>
        <AnimatedLobbyBackground />
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
    return null;
  }

  return (
    <View style={styles.wrapper}>
      <AnimatedLobbyBackground />
      <ScrollView
        ref={scrollRef}
        onScroll={(e) => setShowScrollTop(e.nativeEvent.contentOffset.y > 200)}
        scrollEventThrottle={100}
        style={[styles.scrollView, { paddingTop: insets.top }]}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 48 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Full-bleed dark hero */}
        <View style={[styles.lobbyHeroDark, { paddingTop: 32 + insets.top * 0.5, paddingBottom: 48 }]}>
          <Text style={styles.lobbyBrandWhite}>{t('valoria')}</Text>
          <Text style={styles.lobbyTaglineWhite}>{t('tagline')}</Text>
        </View>

        {/* Check-in prompt kartı — bir kere sorulur, sonra gösterilmez */}
        {showCheckinPromptCard === true && (
          <View style={[styles.checkinPromptCard, { marginHorizontal: paddingH, width: cardWidth }]}>
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
                <Text style={styles.checkinPromptBtnYesText}>{t('yes')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <KeyboardAvoidingView
          style={[styles.cardsContainer, { width: cardWidth, marginHorizontal: paddingH }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <View style={styles.lobbyCard}>
            <View style={styles.lobbyCardInner}>
              <View style={styles.lobbySection}>
                <Text style={styles.lobbySectionTitle}>{t('signIn')}</Text>
                {Platform.OS !== 'web' && notifStatus === 'undetermined' && (
                  <View style={styles.permissionCard}>
                    <Text style={styles.permissionCardTitle}>Bildirim izni</Text>
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
                <TextInput
                  style={styles.input}
                  placeholder={t('passwordPlaceholder')}
                  placeholderTextColor="#94a3b8"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  editable={!signInLoading}
                />
                <TouchableOpacity
                  style={[styles.cardBtn, styles.cardBtnPrimary, signInLoading && styles.cardBtnDisabled]}
                  onPress={signInWithPassword}
                  disabled={signInLoading}
                  activeOpacity={0.82}
                >
                  {signInLoading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.cardBtnTextPrimary}>{t('signInButton')}</Text>
                  )}
                </TouchableOpacity>
                <View style={styles.authLinksRow}>
                  <TouchableOpacity onPress={() => router.push('/auth/register')} style={styles.authLinkWrap}>
                    <Text style={styles.cardLinkText}>{t('signUp')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => router.push('/auth/reset')} style={styles.authLinkWrap}>
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
                      <Text style={styles.cardBtnTextOutlined}>{t('appleSignIn')}</Text>
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
                      <Text style={styles.guestLoginBtnText}>{t('guestAccountLogin')}</Text>
                      <Text style={styles.guestLoginBtnHint}>{t('guestAccountLoginHint')}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.lobbyDivider} />

              <Text style={styles.lobbySectionLabel}>{t('moreOptions') || 'Diğer seçenekler'}</Text>
              <View style={styles.lobbyActionGrid}>
                <TouchableOpacity style={styles.lobbyActionTile} onPress={() => router.push('/guest')} activeOpacity={0.85}>
                  <View style={styles.lobbyActionTileTop}>
                    <View style={[styles.lobbyActionPill, styles.lobbyActionPillGuest]}>
                      <Text style={styles.lobbyActionPillText}>MİSAFİR</Text>
                    </View>
                    <View style={styles.lobbyActionChevronWrap}>
                      <Text style={styles.lobbyActionChevron}>→</Text>
                    </View>
                  </View>
                  <View style={[styles.lobbyActionTileIcon, styles.lobbyActionTileGuest]}>
                    <Text style={styles.lobbyActionTileEmoji}>M</Text>
                  </View>
                  <Text style={styles.lobbyActionTileTitle}>{t('guestCheckIn') || 'Misafir check-in'}</Text>
                  <Text style={styles.lobbyActionTileHint} numberOfLines={2}>{t('guestCheckInHint') || 'QR veya link ile sözleşme onayı'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.lobbyActionTile} onPress={() => router.push('/join')} activeOpacity={0.85}>
                  <View style={styles.lobbyActionTileTop}>
                    <View style={[styles.lobbyActionPill, styles.lobbyActionPillStaff]}>
                      <Text style={styles.lobbyActionPillText}>PERSONEL</Text>
                    </View>
                    <View style={styles.lobbyActionChevronWrap}>
                      <Text style={styles.lobbyActionChevron}>→</Text>
                    </View>
                  </View>
                  <View style={[styles.lobbyActionTileIcon, styles.lobbyActionTileStaff]}>
                    <Text style={styles.lobbyActionTileEmoji}>P</Text>
                  </View>
                  <Text style={styles.lobbyActionTileTitle}>{t('staffApplication')}</Text>
                  <Text style={styles.lobbyActionTileHint} numberOfLines={2}>{t('staffApplicationHint')}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.lobbyDivider} />

              <View style={styles.lobbyFooter}>
                <Text style={styles.lobbyFooterLocation}>📍 Uzungöl, Türkiye</Text>
                <View style={styles.lobbyFooterButtons}>
                  <TouchableOpacity
                    style={styles.lobbyFooterBtn}
                    onPress={() => router.push({ pathname: '/legal/[type]', params: { type: 'privacy' } })}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.lobbyFooterBtnText}>{t('privacy')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.lobbyFooterBtn}
                    onPress={() => router.push({ pathname: '/legal/[type]', params: { type: 'terms' } })}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.lobbyFooterBtnText}>{t('terms')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.lobbyFooterBtn}
                    onPress={() => router.push('/guest/language')}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.lobbyFooterBtnText}>{t('language')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </ScrollView>
      {showScrollTop && (
        <View style={[styles.scrollTopWrap, { bottom: insets.bottom + 24 }]} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.scrollTopBtn}
            onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
            activeOpacity={0.85}
          >
            <Text style={styles.scrollTopBtnText}>{t('scrollTop')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#0c1222',
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
    marginTop: -32,
    marginBottom: 24,
  },
  lobbyHeroDark: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: 28,
  },
  lobbyBrandWhite: {
    fontSize: 34,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: Platform.OS === 'android' ? 0.5 : -0.8,
    paddingHorizontal: 8,
  },
  lobbyTaglineWhite: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.72)',
    marginTop: 10,
    fontWeight: '500',
    textAlign: 'center',
  },
  checkinPromptCard: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 20,
    padding: 20,
    marginTop: -24,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
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
    backgroundColor: '#0d9488',
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
    backgroundColor: '#ffffff',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
    elevation: 8,
  },
  lobbyCardInner: {
    padding: 28,
  },
  lobbySection: {
    alignItems: 'stretch',
  },
  permissionCard: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
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
  lobbySectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.4,
    marginBottom: 20,
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
  lobbyActionGrid: {
    flexDirection: 'row',
    gap: 14,
  },
  lobbyActionTile: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    minHeight: 140,
  },
  lobbyActionTileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  lobbyActionPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  lobbyActionPillGuest: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderColor: 'rgba(59, 130, 246, 0.24)',
  },
  lobbyActionPillStaff: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderColor: 'rgba(34, 197, 94, 0.24)',
  },
  lobbyActionPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#334155',
    letterSpacing: 0.9,
  },
  lobbyActionChevronWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lobbyActionChevron: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '800',
    marginTop: -1,
  },
  lobbyActionTileIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  lobbyActionTileGuest: {
    backgroundColor: 'rgba(59, 130, 246, 0.14)',
  },
  lobbyActionTileStaff: {
    backgroundColor: 'rgba(34, 197, 94, 0.14)',
  },
  lobbyActionTileEmoji: {
    fontSize: 24,
    color: '#0f172a',
    fontWeight: '800',
  },
  lobbyActionTileTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },
  lobbyActionTileHint: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 16,
    marginBottom: 12,
  },
  lobbyFooter: {
    marginTop: 2,
  },
  lobbyFooterLocation: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 16,
    textAlign: 'center',
    fontWeight: '500',
  },
  lobbyFooterButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
  },
  lobbyFooterBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: 'transparent',
  },
  lobbyFooterBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  input: {
    width: '100%',
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    color: '#0f172a',
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
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
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
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
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  scrollTopBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
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
