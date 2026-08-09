import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
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

  useEffect(() => {
    if (!user || !staffCheckComplete) return;
    if (staff && canAccessMuhasebeWeb(staff)) {
      safeRouterReplace(router, '/muhasebe/payments');
    }
  }, [user, staff, staffCheckComplete, router]);

  const signIn = async () => {
    const e = email.trim().toLowerCase();
    if (!e || !password || password.length < 6) {
      Alert.alert(t('muhasebeWebLoginErrorTitle'), t('muhasebeWebLoginInvalid'));
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: e, password });
      if (error) throw error;
      if (!data.user) throw new Error(t('muhasebeWebLoginFailed'));
      await completeSignIn(data.user);
      const s = useAuthStore.getState().staff;
      if (!s || !canAccessMuhasebeWeb(s)) {
        await useAuthStore.getState().signOut();
        throw new Error(t('muhasebeWebLoginNoPermission'));
      }
      safeRouterReplace(router, '/muhasebe/payments');
    } catch (err) {
      Alert.alert(t('muhasebeWebLoginErrorTitle'), (err as Error)?.message ?? t('muhasebeWebLoginFailed'));
    }
    setLoading(false);
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
          <Text style={styles.label}>{t('muhasebeWebEmail')}</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            placeholder="muhasebe@valoria.com"
            placeholderTextColor="#94a3b8"
          />
          <Text style={styles.label}>{t('muhasebeWebPassword')}</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            placeholder="••••••••"
            placeholderTextColor="#94a3b8"
            onSubmitEditing={() => void signIn()}
          />
          <TouchableOpacity style={styles.btn} onPress={() => void signIn()} disabled={loading} activeOpacity={0.88}>
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
  label: { color: '#94a3b8', fontSize: 13, marginBottom: 6, marginTop: 8, fontWeight: '600' },
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
  btnText: { color: '#0f172a', fontWeight: '800', fontSize: 16 },
});
