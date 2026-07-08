import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useCustomerRoomStore } from '@/stores/customerRoomStore';
import { log } from '@/lib/logger';
import { theme } from '@/constants/theme';

import { getAuthCallbackRedirectUrl } from '@/lib/authCallbackUrl';

export default function AuthEmailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pendingRoom = useCustomerRoomStore((s) => s.pendingRoom);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const sendCode = async () => {
    const e = email.trim().toLowerCase();
    if (!e) {
      Alert.alert(t('error'), t('errorEnterEmail'));
      return;
    }
    setLoading(true);
    setSent(false);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: e,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: getAuthCallbackRedirectUrl(),
        },
      });
      if (error) throw error;
      setSent(true);
      log.info('AuthEmail', 'OTP/Magic link gönderildi', { email: e.slice(0, 5) + '...' });
      router.push({ pathname: '/auth/code', params: { email: e } });
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? t('errorCodeNotSent');
      log.error('AuthEmail', 'signInWithOtp', err, msg);
      Alert.alert(t('error'), msg);
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.wrapper, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.logoMark}>
            <Text style={styles.logoText}>V</Text>
          </View>
          <Text style={styles.title}>{t('login')}</Text>
          {pendingRoom ? (
            <Text style={styles.roomHint}>{t('roomHintLogin', { room: pendingRoom.roomNumber })}</Text>
          ) : (
            <View style={styles.divider} />
          )}
          <Text style={styles.subtitle}>{t('loginSubtitle')}</Text>
        </View>

        <View style={styles.card}>
          <TextInput
            style={styles.input}
            placeholder={t('emailPlaceholder')}
            placeholderTextColor="#9ca3af"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
          />

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
            onPress={sendCode}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>
              {loading ? t('sending') : t('sendCodeBtn')}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.links}>
          <TouchableOpacity onPress={() => router.push('/auth/password')} style={styles.linkWrap}>
            <Text style={styles.linkText}>{t('loginWithPassword')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/auth/register')} style={styles.linkWrap}>
            <Text style={styles.linkText}>{t('signUp')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/auth/reset')} style={styles.linkWrap}>
            <Text style={styles.linkText}>{t('forgotPassword')}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Text style={styles.backBtnText}>← {t('backBtn')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 32,
    justifyContent: 'center',
    minHeight: '100%',
  },
  hero: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoMark: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  logoText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 10,
  },
  divider: {
    width: 36,
    height: 3,
    backgroundColor: theme.colors.primary,
    borderRadius: 2,
    marginBottom: 12,
  },
  roomHint: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '600',
    marginBottom: 12,
  },
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
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    color: theme.colors.text,
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  links: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 20,
    marginBottom: 24,
  },
  linkWrap: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  linkText: {
    color: theme.colors.primary,
    fontSize: 15,
    fontWeight: '500',
  },
  backBtn: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  backBtnText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontWeight: '500',
  },
});
