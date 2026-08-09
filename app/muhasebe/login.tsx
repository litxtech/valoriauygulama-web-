import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { completeSignIn, useAuthStore } from '@/stores/authStore';
import { canAccessMuhasebeWeb } from '@/lib/muhasebeAccess';
import { safeRouterReplace } from '@/lib/safeRouter';
import { adminTheme } from '@/constants/adminTheme';

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function MuhasebeLoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const staff = useAuthStore((s) => s.staff);
  const staffCheckComplete = useAuthStore((s) => s.staffCheckComplete);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !staffCheckComplete) return;
    if (staff && canAccessMuhasebeWeb(staff)) {
      safeRouterReplace(router, '/muhasebe/payments');
    }
  }, [user, staff, staffCheckComplete, router]);

  const signIn = async () => {
    const e = email.trim().toLowerCase();
    setError(null);
    if (!e || !isValidEmail(e)) {
      setError(t('muhasebeWebLoginNeedEmail'));
      return;
    }
    if (!password || password.length < 6) {
      setError(t('muhasebeWebLoginInvalid'));
      return;
    }
    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email: e, password });
      if (authError) throw authError;
      if (!data.user) throw new Error(t('muhasebeWebLoginFailed'));
      const signInResult = await completeSignIn(data.user);
      if (signInResult.denied === 'account_locked') {
        throw new Error(t('accountLockedMessage'));
      }
      const s = useAuthStore.getState().staff;
      if (!s || !canAccessMuhasebeWeb(s)) {
        await useAuthStore.getState().signOut();
        throw new Error(t('muhasebeWebLoginNoPermission'));
      }
      safeRouterReplace(router, '/muhasebe/payments');
    } catch (err) {
      const msg = (err as Error)?.message ?? t('muhasebeWebLoginFailed');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <LinearGradient colors={['#0f172a', '#1e3a5f', '#0f172a']} style={StyleSheet.absoluteFill} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/')} activeOpacity={0.85}>
          <Ionicons name="arrow-back" size={20} color="#e2e8f0" />
          <Text style={styles.backText}>{t('muhasebeWebBackHome')}</Text>
        </TouchableOpacity>

        <View style={styles.heroIconWrap}>
          <LinearGradient colors={['#d97706', '#b45309']} style={styles.heroIcon}>
            <Ionicons name="calculator" size={28} color="#fff" />
          </LinearGradient>
        </View>
        <Text style={styles.title}>{t('muhasebeWebLoginTitle')}</Text>
        <Text style={styles.subtitle}>{t('muhasebeWebLoginSubtitle')}</Text>

        <View style={styles.card}>
          {error ? (
            <View style={styles.errorBox} accessibilityLiveRegion="polite">
              <Ionicons name="alert-circle" size={18} color="#fecaca" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Text style={styles.label}>{t('muhasebeWebEmail')}</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              if (error) setError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            placeholder="ornek@valoria.tr"
            placeholderTextColor="#94a3b8"
          />
          <Text style={styles.hint}>{t('muhasebeWebLoginEmailHint')}</Text>
          <Text style={styles.label}>{t('muhasebeWebPassword')}</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              if (error) setError(null);
            }}
            secureTextEntry
            autoComplete="password"
            textContentType="password"
            placeholder="••••••••"
            placeholderTextColor="#94a3b8"
            onSubmitEditing={() => void signIn()}
          />
          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={() => void signIn()}
            disabled={loading}
            activeOpacity={0.88}
          >
            {loading ? (
              <ActivityIndicator color="#0f172a" />
            ) : (
              <Text style={styles.btnText}>{t('muhasebeWebLoginCta')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: adminTheme.colors.primary },
  content: {
    paddingHorizontal: 24,
    flexGrow: 1,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 32 },
  backText: { color: '#e2e8f0', fontSize: 15 },
  heroIconWrap: { alignItems: 'center', marginBottom: 16 },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: '#f8fafc', fontSize: 26, fontWeight: '800', textAlign: 'center' },
  subtitle: {
    color: '#94a3b8',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 28,
    lineHeight: 22,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(185,28,28,0.35)',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  errorText: { flex: 1, color: '#fecaca', fontSize: 14, fontWeight: '600', lineHeight: 20 },
  label: { color: '#94a3b8', fontSize: 13, marginBottom: 6, marginTop: 8, fontWeight: '600' },
  hint: { color: '#64748b', fontSize: 12, marginTop: 4, marginBottom: 4 },
  input: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#f8fafc',
    borderWidth: 1,
    borderColor: '#334155',
    fontSize: 16,
  },
  btn: {
    marginTop: 20,
    backgroundColor: '#f59e0b',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: '#0f172a', fontWeight: '800', fontSize: 16 },
});
