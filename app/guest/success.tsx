import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
  ActivityIndicator,
  Image,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { safeRouterReplace } from '@/lib/safeRouter';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGuestFlowStore } from '@/stores/guestFlowStore';
import { supabase } from '@/lib/supabase';

const COLORS = {
  bg: '#f5f6f8',
  card: '#ffffff',
  text: '#1f2937',
  textSecondary: '#6b7280',
  accent: '#0ea5e9',
  success: '#059669',
  cardBorder: '#e8eaed',
};

const DEFAULT_GOOGLE_PLAY = 'https://play.google.com/store/apps';
const DEFAULT_APP_STORE = 'https://apps.apple.com';

/** Sözleşme doldurulurken seçilen dile göre success + mağaza metinleri */
const SUCCESS_TEXTS: Record<string, { title: string; subtitle: string; signedButton: string; downloadApp: string; downloadAppSubtitle: string; buttonDone: string; googlePlay: string; appStore: string; android: string; iphoneIpad: string }> = {
  tr: {
    title: 'Kayıt Tamamlandı',
    subtitle: 'Seçilen sözleşmeniz onaylandı. Resepsiyona bekleyebilirsiniz.',
    signedButton: 'İmzalanmıştır',
    downloadApp: 'Uygulamayı indir',
    downloadAppSubtitle: 'Otele özel uygulama ile iletişim ve hizmetlere kolayca ulaşın.',
    buttonDone: 'Tamam',
    googlePlay: 'Google Play',
    appStore: 'App Store',
    android: 'Android',
    iphoneIpad: 'iPhone / iPad',
  },
  en: {
    title: 'Registration Complete',
    subtitle: 'Your selected agreement has been confirmed. You may proceed to reception.',
    signedButton: 'Signed',
    downloadApp: 'Download the app',
    downloadAppSubtitle: 'Easily reach communication and services with the hotel app.',
    buttonDone: 'OK',
    googlePlay: 'Google Play',
    appStore: 'App Store',
    android: 'Android',
    iphoneIpad: 'iPhone / iPad',
  },
  ar: {
    title: 'اكتمل التسجيل',
    subtitle: 'تم تأكيد الاتفاقية المختارة. يمكنك التوجه إلى الاستقبال.',
    signedButton: 'تم التوقيع',
    downloadApp: 'تحميل التطبيق',
    downloadAppSubtitle: 'تواصل مع الفندق وخدماته بسهولة عبر التطبيق.',
    buttonDone: 'موافق',
    googlePlay: 'Google Play',
    appStore: 'App Store',
    android: 'Android',
    iphoneIpad: 'iPhone / iPad',
  },
  de: {
    title: 'Registrierung abgeschlossen',
    subtitle: 'Ihre ausgewählte Vereinbarung wurde bestätigt. Sie können zur Rezeption gehen.',
    signedButton: 'Unterzeichnet',
    downloadApp: 'App herunterladen',
    downloadAppSubtitle: 'Kommunikation und Services einfach mit der Hotel-App nutzen.',
    buttonDone: 'OK',
    googlePlay: 'Google Play',
    appStore: 'App Store',
    android: 'Android',
    iphoneIpad: 'iPhone / iPad',
  },
  fr: {
    title: 'Inscription terminée',
    subtitle: 'Votre contrat sélectionné a été confirmé. Vous pouvez vous présenter à la réception.',
    signedButton: 'Signé',
    downloadApp: 'Télécharger l\'application',
    downloadAppSubtitle: 'Accédez facilement à la communication et aux services avec l\'app de l\'hôtel.',
    buttonDone: 'OK',
    googlePlay: 'Google Play',
    appStore: 'App Store',
    android: 'Android',
    iphoneIpad: 'iPhone / iPad',
  },
  ru: {
    title: 'Регистрация завершена',
    subtitle: 'Ваше выбранное соглашение подтверждено. Можете пройти на стойку регистрации.',
    signedButton: 'Подписано',
    downloadApp: 'Скачать приложение',
    downloadAppSubtitle: 'Связь и услуги отеля — легко через приложение.',
    buttonDone: 'OK',
    googlePlay: 'Google Play',
    appStore: 'App Store',
    android: 'Android',
    iphoneIpad: 'iPhone / iPad',
  },
  es: {
    title: 'Registro completado',
    subtitle: 'Tu acuerdo seleccionado ha sido confirmado. Puedes dirigirte a recepción.',
    signedButton: 'Firmado',
    downloadApp: 'Descargar la aplicación',
    downloadAppSubtitle: 'Comunicación y servicios del hotel de forma fácil con la app.',
    buttonDone: 'OK',
    googlePlay: 'Google Play',
    appStore: 'App Store',
    android: 'Android',
    iphoneIpad: 'iPhone / iPad',
  },
};

const appLogo = require('../../assets/icon.png');

export default function SuccessScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { reset, contractLang, signedFormLines } = useGuestFlowStore();
  const lang = (contractLang ?? 'tr').toLowerCase();
  const texts = SUCCESS_TEXTS[lang] ?? SUCCESS_TEXTS.tr;

  const [googlePlayUrl, setGooglePlayUrl] = useState<string>('');
  const [appStoreUrl, setAppStoreUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const path = window.location.pathname || '';
      if (!path.includes('/guest/success')) {
        window.history.replaceState(null, '', '/guest/success');
      }
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['google_play_url', 'app_store_url']);
      const map: Record<string, string> = {};
      (data ?? []).forEach((r: { key: string; value: unknown }) => {
        const v = r.value;
        map[r.key] = v != null && v !== '' ? String(v).trim() : '';
      });
      setGooglePlayUrl(map.google_play_url ?? '');
      setAppStoreUrl(map.app_store_url ?? '');
      setLoading(false);
    })();
  }, []);

  const openUrl = (url: string) => {
    const toOpen = url || (Platform.OS === 'android' ? DEFAULT_GOOGLE_PLAY : DEFAULT_APP_STORE);
    Linking.openURL(toOpen).catch(() => {});
  };

  const done = () => {
    reset();
    safeRouterReplace(router, '/');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.iconWrap}>
          <Text style={styles.icon}>✓</Text>
        </View>
        <Text style={styles.title}>{texts.title}</Text>
        <Text style={styles.subtitle}>{texts.subtitle}</Text>

        {signedFormLines && signedFormLines.length > 0 && (
          <View style={styles.signedCard}>
            {signedFormLines.map((line, i) => (
              <Text key={i} style={styles.signedLine}>
                {line}
              </Text>
            ))}
            <View style={styles.signedButtonWrap}>
              <Text style={styles.signedButtonText}>{texts.signedButton}</Text>
            </View>
          </View>
        )}

      {loading ? (
        <ActivityIndicator size="small" color={COLORS.accent} style={styles.loader} />
      ) : (
        <View style={styles.storeSection}>
          <View style={styles.logoCard}>
            <Image source={appLogo} style={styles.logoImage} resizeMode="contain" />
          </View>
          <Text style={styles.storeSectionTitle}>{texts.downloadApp}</Text>
          <Text style={styles.storeSectionSubtitle}>{texts.downloadAppSubtitle}</Text>
          <View style={styles.storeCards}>
            <TouchableOpacity
              style={styles.storeCard}
              onPress={() => openUrl(googlePlayUrl || DEFAULT_GOOGLE_PLAY)}
              activeOpacity={0.85}
            >
              <View style={styles.storeIconWrap}>
                <Text style={styles.storeIcon}>▶</Text>
              </View>
              <Text style={styles.storeTitle}>{texts.googlePlay}</Text>
              <Text style={styles.storeSubtitle}>{texts.android}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.storeCard}
              onPress={() => openUrl(appStoreUrl || DEFAULT_APP_STORE)}
              activeOpacity={0.85}
            >
              <View style={styles.storeIconWrap}>
                <Text style={styles.storeIcon}>◆</Text>
              </View>
              <Text style={styles.storeTitle}>{texts.appStore}</Text>
              <Text style={styles.storeSubtitle}>{texts.iphoneIpad}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <TouchableOpacity style={styles.button} onPress={done} activeOpacity={0.85}>
        <Text style={styles.buttonText}>{texts.buttonDone}</Text>
      </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 24,
  },
  scroll: { flex: 1 },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: 24,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.success + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  icon: { fontSize: 40, color: COLORS.success, fontWeight: '700' },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text, marginBottom: 8, textAlign: 'center' },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
    paddingHorizontal: 8,
  },
  loader: { marginBottom: 24 },
  logoCard: {
    width: '100%',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  logoImage: {
    width: 80,
    height: 80,
  },
  storeSection: {
    width: '100%',
    marginBottom: 32,
  },
  storeSectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 6,
    textAlign: 'center',
  },
  storeSectionSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  storeCards: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    flexWrap: 'wrap',
  },
  storeCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 24,
    minWidth: 140,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  storeIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  storeIcon: { fontSize: 22, color: COLORS.accent, fontWeight: '700' },
  storeTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 4 },
  storeSubtitle: { fontSize: 13, color: COLORS.textSecondary },
  storeHint: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 12,
  },
  signedCard: {
    width: '100%',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  signedLine: {
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 8,
    lineHeight: 20,
  },
  signedButtonWrap: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signedButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#ffffff',
  },
  button: {
    backgroundColor: COLORS.accent,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 14,
  },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
