import { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
  Image,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { safeRouterReplace } from '@/lib/safeRouter';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGuestFlowStore } from '@/stores/guestFlowStore';
import { GUEST_CONTRACT_WEB_BG } from '@/components/guest/GuestSignOneWebShell';
import {
  VALORIA_GOOGLE_PLAY_URL,
  appStorePromoCopy,
  valoriaAppStoreUrl,
} from '@/constants/appStoreLinks';

const COLORS = {
  bg: Platform.OS === 'web' ? GUEST_CONTRACT_WEB_BG : '#0c1222',
  card: '#ffffff',
  text: '#0f172a',
  textSecondary: '#64748b',
  gold: '#c9a227',
  success: '#059669',
};

const SUCCESS_TEXTS: Record<
  string,
  { title: string; subtitle: string; signedButton: string; buttonDone: string }
> = {
  tr: {
    title: 'Kayıt Tamamlandı',
    subtitle: 'Seçilen sözleşmeniz onaylandı. Resepsiyona bekleyebilirsiniz.',
    signedButton: 'İmzalanmıştır',
    buttonDone: 'Tamam',
  },
  en: {
    title: 'Registration Complete',
    subtitle: 'Your agreement has been confirmed. You may proceed to reception.',
    signedButton: 'Signed',
    buttonDone: 'Done',
  },
  ar: {
    title: 'اكتمل التسجيل',
    subtitle: 'تم تأكيد الاتفاقية. يمكنك التوجه إلى الاستقبال.',
    signedButton: 'تم التوقيع',
    buttonDone: 'تم',
  },
  de: {
    title: 'Registrierung abgeschlossen',
    subtitle: 'Ihre Vereinbarung wurde bestätigt. Sie können zur Rezeption gehen.',
    signedButton: 'Unterzeichnet',
    buttonDone: 'Fertig',
  },
  fr: {
    title: 'Inscription terminée',
    subtitle: 'Votre contrat a été confirmé. Vous pouvez vous présenter à la réception.',
    signedButton: 'Signé',
    buttonDone: 'OK',
  },
  ru: {
    title: 'Регистрация завершена',
    subtitle: 'Соглашение подтверждено. Можете пройти на стойку регистрации.',
    signedButton: 'Подписано',
    buttonDone: 'Готово',
  },
  es: {
    title: 'Registro completado',
    subtitle: 'Tu acuerdo ha sido confirmado. Puedes dirigirte a recepción.',
    signedButton: 'Firmado',
    buttonDone: 'Listo',
  },
};

const appLogo = require('../../assets/icon.png');

export default function SuccessScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { reset, contractLang, signedFormLines } = useGuestFlowStore();
  const lang = (contractLang ?? 'tr').toLowerCase().slice(0, 2);
  const texts = SUCCESS_TEXTS[lang] ?? SUCCESS_TEXTS.tr;
  const promo = useMemo(() => appStorePromoCopy(lang), [lang]);
  const playUrl = VALORIA_GOOGLE_PLAY_URL;
  const appleUrl = valoriaAppStoreUrl(lang);
  const isRtl = lang === 'ar';

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const path = window.location.pathname || '';
      if (!path.includes('/guest/success')) {
        window.history.replaceState(null, '', '/guest/success');
      }
    }
  }, []);

  const openUrl = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  const done = () => {
    reset();
    safeRouterReplace(router, '/');
  };

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20, direction: isRtl ? 'rtl' : 'ltr' },
      ]}
    >
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

        {signedFormLines && signedFormLines.length > 0 ? (
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
        ) : null}

        <LinearGradient
          colors={['#1a1408', '#0f172a', '#14532d']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.promoCard}
        >
          <View style={styles.promoGlow} />
          <View style={styles.promoBadge}>
            <Text style={styles.promoBadgeText}>{promo.badge}</Text>
          </View>
          <Image source={appLogo} style={styles.logoImage} resizeMode="contain" />
          <Text style={styles.promoTitle}>{promo.title}</Text>
          <Text style={styles.promoSubtitle}>{promo.subtitle}</Text>

          <TouchableOpacity
            style={styles.storeBtnApple}
            onPress={() => openUrl(appleUrl)}
            activeOpacity={0.9}
          >
            <Ionicons name="logo-apple" size={28} color="#fff" />
            <View style={styles.storeBtnTextCol}>
              <Text style={styles.storeBtnEyebrow}>{promo.getOn}</Text>
              <Text style={styles.storeBtnTitle}>{promo.appStore}</Text>
              <Text style={styles.storeBtnSub}>{promo.appStoreSub}</Text>
            </View>
            <Ionicons name="arrow-forward" size={20} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.storeBtnPlay}
            onPress={() => openUrl(playUrl)}
            activeOpacity={0.9}
          >
            <Ionicons name="logo-google-playstore" size={26} color="#fff" />
            <View style={styles.storeBtnTextCol}>
              <Text style={styles.storeBtnEyebrow}>{promo.getOn}</Text>
              <Text style={styles.storeBtnTitle}>{promo.playStore}</Text>
              <Text style={styles.storeBtnSub}>{promo.playStoreSub}</Text>
            </View>
            <Ionicons name="arrow-forward" size={20} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </LinearGradient>

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
    paddingHorizontal: 20,
  },
  scroll: { flex: 1 },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: 28,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(5,150,105,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  icon: { fontSize: 36, color: COLORS.success, fontWeight: '700' },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: Platform.OS === 'web' ? COLORS.text : '#f8fafc',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: Platform.OS === 'web' ? COLORS.textSecondary : 'rgba(248,250,252,0.72)',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  signedCard: {
    width: '100%',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  signedLine: { fontSize: 14, color: COLORS.text, marginBottom: 8, lineHeight: 20 },
  signedButtonWrap: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: COLORS.success,
    alignItems: 'center',
  },
  signedButtonText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  promoCard: {
    width: '100%',
    borderRadius: 24,
    padding: 22,
    marginBottom: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.35)',
  },
  promoGlow: {
    position: 'absolute',
    top: -40,
    right: -20,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(201,162,39,0.18)',
  },
  promoBadge: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(201,162,39,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.45)',
    marginBottom: 14,
  },
  promoBadgeText: {
    color: '#e8d5a3',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  logoImage: { width: 72, height: 72, marginBottom: 14, alignSelf: 'center' },
  promoTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#f8fafc',
    textAlign: 'center',
    marginBottom: 8,
  },
  promoSubtitle: {
    fontSize: 14,
    color: 'rgba(248,250,252,0.72)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  storeBtnApple: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#000',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  storeBtnPlay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#15803d',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  storeBtnTextCol: { flex: 1 },
  storeBtnEyebrow: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
    marginBottom: 2,
  },
  storeBtnTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  storeBtnSub: { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  button: {
    backgroundColor: COLORS.gold,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 14,
    minWidth: 160,
    alignItems: 'center',
  },
  buttonText: { color: '#1a1408', fontSize: 17, fontWeight: '800' },
});
