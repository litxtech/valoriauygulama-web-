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
import { supabase } from '@/lib/supabase';
import { completeSignIn, useAuthStore } from '@/stores/authStore';
import { usePartnerAuthStore } from '@/stores/partnerAuthStore';
import { partnerTheme } from '@/lib/breakfastPartnerTheme';
import { safeRouterReplace } from '@/lib/safeRouter';

export default function PartnerLoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const staff = useAuthStore((s) => s.staff);
  const partner = usePartnerAuthStore((s) => s.partner);
  const partnerCheckComplete = usePartnerAuthStore((s) => s.partnerCheckComplete);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (staff) {
      safeRouterReplace(router, '/staff');
      return;
    }
    if (user && partnerCheckComplete) {
      if (!partner) {
        safeRouterReplace(router, '/partner/register');
        return;
      }
      safeRouterReplace(router, partner.isPortalActive ? '/partner' : '/partner/pending');
    }
  }, [user, staff, partner, partnerCheckComplete, router]);

  const signIn = async () => {
    const e = email.trim().toLowerCase();
    if (!e || !password || password.length < 6) {
      Alert.alert('Hata', 'Geçerli e-posta ve en az 6 karakter şifre girin.');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: e, password });
      if (error) throw error;
      if (!data.user) throw new Error('Giriş başarısız');
      await completeSignIn(data.user);
      await usePartnerAuthStore.getState().resolvePartner(data.user);
      const p = usePartnerAuthStore.getState().partner;
      if (!p) {
        await useAuthStore.getState().signOut();
        throw new Error('Bu hesap partner otel girişine yetkili değil. Profil oluşturun.');
      }
      safeRouterReplace(router, p.isPortalActive ? '/partner' : '/partner/pending');
    } catch (err) {
      Alert.alert('Giriş hatası', (err as Error)?.message ?? 'Giriş yapılamadı');
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <LinearGradient colors={[...partnerTheme.heroGradient]} style={StyleSheet.absoluteFill} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/')} activeOpacity={0.85}>
          <Ionicons name="arrow-back" size={20} color={partnerTheme.text} />
          <Text style={styles.backText}>Ana sayfa</Text>
        </TouchableOpacity>

        <View style={styles.heroIconWrap}>
          <LinearGradient colors={[...partnerTheme.accentGradient]} style={styles.heroIcon}>
            <Ionicons name="cafe" size={28} color="#fff" />
          </LinearGradient>
        </View>
        <Text style={styles.title}>Partner Otel Girişi</Text>
        <Text style={styles.subtitle}>
          Kahvaltı misafir sayısı ve cari hesabınız. Misafir check-in girişi değil — partner hesabınızla buradan oturum açın.
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>E-posta</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="otel@example.com"
            placeholderTextColor={partnerTheme.muted}
          />
          <Text style={styles.label}>Şifre</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor={partnerTheme.muted}
          />
          <TouchableOpacity style={styles.btn} onPress={signIn} disabled={loading} activeOpacity={0.88}>
            {loading ? (
              <ActivityIndicator color="#0f172a" />
            ) : (
              <Text style={styles.btnText}>Giriş yap</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/partner/register')} style={styles.registerLink}>
            <Text style={styles.registerLinkText}>Partner otel profili oluştur</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: partnerTheme.bg },
  content: { paddingHorizontal: 24, flexGrow: 1 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 32 },
  backText: { color: partnerTheme.text, fontSize: 15 },
  heroIconWrap: { alignItems: 'center', marginBottom: 16 },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: partnerTheme.text, fontSize: 26, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: partnerTheme.muted, fontSize: 15, textAlign: 'center', marginTop: 8, marginBottom: 28 },
  card: {
    backgroundColor: partnerTheme.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
  },
  label: { color: partnerTheme.muted, fontSize: 13, marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: partnerTheme.text,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
  },
  btn: {
    marginTop: 20,
    backgroundColor: partnerTheme.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: { color: '#0f172a', fontWeight: '800', fontSize: 16 },
  registerLink: { marginTop: 16, alignItems: 'center' },
  registerLinkText: { color: partnerTheme.accent, fontWeight: '700', fontSize: 15 },
});
