import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { safeRouterReplace } from '@/lib/safeRouter';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { log } from '@/lib/logger';
import { theme } from '@/constants/theme';

/** Geçici: Android’de Google ile kayıt — `app/index` ile aynı anahtar mantığı; tekrar açmak için true */
const GOOGLE_SIGN_UP_ANDROID_ENABLED = false;

export default function AuthRegisterScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [appleLoading, setAppleLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const signUpWithApple = async () => {
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
        Alert.alert(t('appleSignUp'), t('appleCredentialUnavailable'));
        setAppleLoading(false);
        return;
      }
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token,
      });
      if (error) throw error;
      await useAuthStore.getState().loadSession();
      safeRouterReplace(router, '/');
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e?.code === 'ERR_REQUEST_CANCELED') return;
      log.warn('AuthRegister', 'Apple sign-up', e?.message ?? e);
      const msg =
        e?.code === 'ERR_REQUEST_FAILED' ||
        (typeof e?.message === 'string' && e.message.includes('missing'))
          ? t('appleCredentialUnavailable')
          : (e?.message ?? t('signUpFailed'));
      Alert.alert(t('appleSignUp'), msg);
    } finally {
      setAppleLoading(false);
    }
  };

  const signUpWithGoogle = async () => {
    if (Platform.OS !== 'android') return;
    const { GoogleSignin, isGoogleSigninAvailable, getGoogleSigninLoadError } = require('@/lib/googleSignin');
    if (!isGoogleSigninAvailable() || !GoogleSignin) {
      const err = getGoogleSigninLoadError?.();
      const msg =
        err && typeof (err as Error)?.message === 'string' && (err as Error).message.includes('RNGoogleSignin')
          ? 'Google Sign-In native modülü bu derlemede yok. Lütfen projeyi yeniden derleyin: npx expo prebuild --clean ardından npx expo run:android'
          : 'Google ile kayıt bu ortamda kullanılamıyor. Development build kullanıyorsanız: npx expo prebuild --clean ve npx expo run:android ile yeniden derleyin.';
      Alert.alert(t('googleSignUp'), msg);
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
        setGoogleLoading(false);
        return;
      }
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });
      if (error) throw error;
      await useAuthStore.getState().loadSession();
      safeRouterReplace(router, '/');
    } catch (err: unknown) {
      log.warn('AuthRegister', 'Google sign-up', err);
      Alert.alert(t('googleSignUp'), (err as Error)?.message ?? t('signUpFailed'));
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <ScrollView
      style={[styles.wrapper, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <View style={styles.logoMark}>
          <Text style={styles.logoText}>V</Text>
        </View>
        <Text style={styles.title}>{t('registerTitle')}</Text>
        <Text style={styles.subtitle}>{t('registerSubtitle')}</Text>
      </View>

      <View style={styles.card}>
        {Platform.OS === 'ios' && (
          <TouchableOpacity
            style={[styles.appleBtn, appleLoading && styles.appleBtnDisabled]}
            onPress={signUpWithApple}
            disabled={appleLoading}
            activeOpacity={0.85}
          >
            {appleLoading ? (
              <ActivityIndicator size="small" color="#0f1419" />
            ) : (
              <Text style={styles.appleBtnText}>{t('appleSignUp')}</Text>
            )}
          </TouchableOpacity>
        )}
        {Platform.OS === 'android' && GOOGLE_SIGN_UP_ANDROID_ENABLED && (
          <TouchableOpacity
            style={[styles.googleBtn, googleLoading && styles.googleBtnDisabled]}
            onPress={signUpWithGoogle}
            disabled={googleLoading}
            activeOpacity={0.85}
          >
            {googleLoading ? (
              <ActivityIndicator size="small" color="#0f1419" />
            ) : (
              <Text style={styles.googleBtnText}>{t('googleSignUp')}</Text>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.emailLink}
          onPress={() => router.push({ pathname: '/auth/password', params: { signUp: '1' } })}
          activeOpacity={0.8}
        >
          <Text style={styles.emailLinkText}>{t('signUpWithEmail')}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.backToLogin} onPress={() => router.replace('/auth')} activeOpacity={0.8}>
        <Text style={styles.backToLoginText}>{t('alreadyHaveAccountSignIn')}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
        <Text style={styles.backBtnText}>← {t('backBtn')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#ffffff' },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 32,
    justifyContent: 'center',
    minHeight: '100%',
  },
  hero: { alignItems: 'center', marginBottom: 32 },
  logoMark: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  logoText: { fontSize: 28, fontWeight: '700', color: '#ffffff', letterSpacing: -0.5 },
  title: { fontSize: 24, fontWeight: '700', color: theme.colors.text, textAlign: 'center', marginBottom: 10 },
  subtitle: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },
  card: {
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 24,
    marginBottom: 24,
  },
  appleBtn: {
    backgroundColor: '#000',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  appleBtnDisabled: { opacity: 0.7 },
  appleBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  googleBtn: {
    backgroundColor: '#1a365d',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  googleBtnDisabled: { opacity: 0.7 },
  googleBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  emailLink: { paddingVertical: 14, alignItems: 'center' },
  emailLinkText: { color: theme.colors.primary, fontSize: 16, fontWeight: '600' },
  backToLogin: { alignSelf: 'center', marginBottom: 16 },
  backToLoginText: { color: theme.colors.textSecondary, fontSize: 15 },
  backBtn: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16 },
  backBtnText: { color: theme.colors.textSecondary, fontSize: 16, fontWeight: '500' },
});
