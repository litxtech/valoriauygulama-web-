import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { finalizeBookingWithAutoLogin } from '@/lib/finalizeBookingWithAutoLogin';
import {
  clearBookingPayFinalizeDraft,
  loadBookingPayFinalizeDraft,
} from '@/lib/onlineBookingPayment';
import {
  loadBookingWhatsAppShareDraft,
  sendBookingToHotelManagerWhatsApp,
  type BookingWhatsAppShareDraft,
} from '@/lib/onlineBookingWhatsApp';
import { VALORIA_GOOGLE_PLAY_URL, valoriaAppStoreUrl, appStorePromoCopy } from '@/constants/appStoreLinks';
import { detectWebStoreUrl, redirectWebToAppStore, openStoreUrl } from '@/lib/bookingStoreRedirect';

function paramOne(raw: string | string[] | undefined): string {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw[0] ?? '';
  return '';
}

export default function BookingSuccessScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    id?: string | string[];
    loggedIn?: string | string[];
    payment?: string | string[];
    negotiate?: string | string[];
  }>();

  const id = paramOne(params.id);
  const payment = paramOne(params.payment);
  const negotiate = paramOne(params.negotiate) === '1';
  const [autoIn, setAutoIn] = useState(paramOne(params.loggedIn) === '1');
  const [finalizing, setFinalizing] = useState(payment === 'success' && !!id);
  const [shareDraft, setShareDraft] = useState<BookingWhatsAppShareDraft | null>(null);
  const [waBusy, setWaBusy] = useState(false);
  const cancelled = payment === 'cancel';
  const pendingPay = payment === 'pending';
  const showWhatsApp = !cancelled && !pendingPay && !!id && !negotiate;
  const lang = (i18n.language || 'tr').split('-')[0];
  const storeCopy = appStorePromoCopy(lang);
  const webStore = detectWebStoreUrl(lang);

  useEffect(() => {
    if (!id) return;
    void loadBookingWhatsAppShareDraft(id).then((d) => {
      if (d) setShareDraft(d);
    });
  }, [id, autoIn, finalizing]);

  useEffect(() => {
    if (!negotiate || Platform.OS !== 'web') return;
    void redirectWebToAppStore(lang);
  }, [negotiate, lang]);

  useEffect(() => {
    if (payment !== 'success' || !id || autoIn) {
      setFinalizing(false);
      return;
    }
    let cancelledEffect = false;
    (async () => {
      const draft = await loadBookingPayFinalizeDraft(id);
      if (!draft || cancelledEffect) {
        setFinalizing(false);
        return;
      }
      const result = await finalizeBookingWithAutoLogin({
        bookingId: draft.bookingId,
        capacityLabel: draft.capacityLabel,
        displayTitle: draft.displayTitle,
        checkIn: draft.checkIn,
        checkOut: draft.checkOut,
        nights: draft.nights,
        adults: draft.adults,
        children: draft.children,
        guestFullName: draft.guestFullName,
        guestPhone: draft.guestPhone,
        guestEmail: draft.guestEmail,
        extras: draft.extras,
        quotedTotal: draft.quotedTotal,
        quotedPerNight: draft.quotedPerNight,
        router,
      });
      await clearBookingPayFinalizeDraft();
      const share = await loadBookingWhatsAppShareDraft(id);
      if (!cancelledEffect) {
        if (share) setShareDraft(share);
        setAutoIn(result.ok);
        setFinalizing(false);
      }
    })();
    return () => {
      cancelledEffect = true;
    };
  }, [payment, id, autoIn, router]);

  const sendWhatsApp = async () => {
    let draft = shareDraft ?? (await loadBookingWhatsAppShareDraft(id));
    if (!draft && id) {
      const payDraft = await loadBookingPayFinalizeDraft(id);
      if (payDraft) {
        draft = { ...payDraft, pdfUrl: null };
      }
    }
    if (!draft) {
      Alert.alert(t('bookingInvalid'), t('bookingWhatsAppMissing'));
      return;
    }
    setWaBusy(true);
    try {
      await sendBookingToHotelManagerWhatsApp(draft);
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message || t('bookingWhatsAppError'));
    } finally {
      setWaBusy(false);
    }
  };

  if (finalizing) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top + 48 }]}>
        <ActivityIndicator color="#0f766e" size="large" />
        <Text style={styles.body}>{t('bookingPayFinalizing')}</Text>
      </View>
    );
  }

  const title = negotiate
    ? 'Pazarlık teklifiniz alındı'
    : cancelled
      ? t('bookingPayCancelledTitle')
      : pendingPay
        ? t('bookingPayPendingTitle')
        : t('bookingSuccessTitle');
  const body = negotiate
    ? 'Hesabınız açıldı. Admin onaylarsa uygulamaya bildirim gelecek. Lütfen Valoria uygulamasını indirin.'
    : cancelled
      ? t('bookingPayCancelledBody')
      : pendingPay
        ? t('bookingPayPendingBody')
        : autoIn
          ? t('bookingSuccessLoggedInBody')
          : payment === 'success'
            ? t('bookingPaySuccessBody')
            : t('bookingSuccessBody');

  return (
    <View style={[styles.root, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
      <View style={[styles.iconWrap, cancelled && styles.iconWrapWarn, negotiate && styles.iconWrapOffer]}>
        <Ionicons
          name={cancelled ? 'close' : negotiate ? 'chatbubbles' : pendingPay ? 'time-outline' : 'checkmark'}
          size={36}
          color={cancelled ? '#b45309' : '#0f766e'}
        />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {id ? <Text style={styles.ref}>{t('bookingSuccessRef', { id: String(id).slice(0, 8).toUpperCase() })}</Text> : null}

      {negotiate && Platform.OS === 'web' ? (
        <View style={styles.storeBox}>
          <Text style={styles.storeBadge}>{storeCopy.badge}</Text>
          <Text style={styles.storeTitle}>{storeCopy.title}</Text>
          <Text style={styles.storeSub}>
            {webStore.platform === 'android'
              ? 'Android cihazınız algılandı — Google Play’e yönlendiriliyorsunuz.'
              : webStore.platform === 'ios'
                ? 'iPhone/iPad algılandı — App Store’a yönlendiriliyorsunuz.'
                : storeCopy.subtitle}
          </Text>
          {(webStore.platform === 'android' || webStore.platform === 'other') && (
            <TouchableOpacity
              style={styles.storeBtn}
              onPress={() => void openStoreUrl(VALORIA_GOOGLE_PLAY_URL)}
              activeOpacity={0.88}
            >
              <Ionicons name="logo-google-playstore" size={20} color="#fff" />
              <Text style={styles.btnText}>{storeCopy.playStore}</Text>
            </TouchableOpacity>
          )}
          {(webStore.platform === 'ios' || webStore.platform === 'other') && (
            <TouchableOpacity
              style={[styles.storeBtn, styles.storeBtnApple]}
              onPress={() => void openStoreUrl(valoriaAppStoreUrl(lang))}
              activeOpacity={0.88}
            >
              <Ionicons name="logo-apple" size={20} color="#fff" />
              <Text style={styles.btnText}>{storeCopy.appStore}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      {autoIn && !negotiate ? (
        <TouchableOpacity
          style={styles.btn}
          onPress={() => router.replace({ pathname: '/customer/bookings', params: { highlight: id } })}
          activeOpacity={0.88}
        >
          <Text style={styles.btnText}>{t('bookingMyBookings')}</Text>
        </TouchableOpacity>
      ) : null}

      {negotiate && Platform.OS !== 'web' ? (
        <TouchableOpacity
          style={styles.btn}
          onPress={() => router.replace({ pathname: '/customer/bookings', params: { highlight: id } })}
          activeOpacity={0.88}
        >
          <Text style={styles.btnText}>{t('bookingMyBookings')}</Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity
        style={[styles.btn, (autoIn || negotiate) && styles.btnSecondary]}
        onPress={() => router.replace(Platform.OS === 'web' ? '/' : '/customer/(tabs)')}
        activeOpacity={0.88}
      >
        <Text style={[styles.btnText, (autoIn || negotiate) && styles.btnSecondaryText]}>
          {autoIn || negotiate ? t('bookingContinueApp') : t('bookingBackLobby')}
        </Text>
      </TouchableOpacity>

      {showWhatsApp ? (
        <TouchableOpacity
          style={[styles.btn, styles.waBtn]}
          onPress={() => void sendWhatsApp()}
          disabled={waBusy}
          activeOpacity={0.88}
        >
          {waBusy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={styles.waRow}>
              <Ionicons name="logo-whatsapp" size={20} color="#fff" />
              <Text style={styles.btnText}>{t('bookingSendToManagerWhatsApp')}</Text>
            </View>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f7f6f3',
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  centered: { justifyContent: 'center', gap: 16 },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(15,118,110,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  iconWrapWarn: {
    backgroundColor: 'rgba(180,83,9,0.12)',
  },
  iconWrapOffer: {
    backgroundColor: 'rgba(15,118,110,0.16)',
  },
  storeBox: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#0f172a',
    borderRadius: 20,
    padding: 18,
    gap: 10,
    marginBottom: 16,
  },
  storeBadge: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#5eead4',
  },
  storeTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  storeSub: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.7)', lineHeight: 18, marginBottom: 4 },
  storeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0f766e',
    borderRadius: 14,
    paddingVertical: 14,
  },
  storeBtnApple: { backgroundColor: '#111827' },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 10,
  },
  body: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 360,
    marginBottom: 16,
  },
  ref: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f766e',
    letterSpacing: 1,
    marginBottom: 28,
  },
  btn: {
    backgroundColor: '#111827',
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 28,
    minWidth: 220,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  waBtn: {
    backgroundColor: '#25D366',
    marginTop: 4,
    maxWidth: 340,
    paddingHorizontal: 18,
  },
  waRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    flexShrink: 1,
  },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '800', textAlign: 'center', flexShrink: 1 },
  btnSecondaryText: { color: '#111827' },
});
