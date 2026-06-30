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
import { useTradePartnerAuthStore } from '@/stores/tradePartnerAuthStore';
import { tradePartnerTheme as theme } from '@/lib/tradePartnerTheme';
import { safeRouterReplace } from '@/lib/safeRouter';

export default function TradePartnerLoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const staff = useAuthStore((s) => s.staff);
  const partner = useTradePartnerAuthStore((s) => s.partner);
  const partnerCheckComplete = useTradePartnerAuthStore((s) => s.partnerCheckComplete);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (staff) {
      safeRouterReplace(router, '/staff');
      return;
    }
    if (user && partnerCheckComplete) {
      if (partner?.isActive) safeRouterReplace(router, '/trade-partner');
      else if (partner) safeRouterReplace(router, '/trade-partner');
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
      await useTradePartnerAuthStore.getState().resolvePartner(data.user);
      const p = useTradePartnerAuthStore.getState().partner;
      if (!p) {
        await useAuthStore.getState().signOut();
        throw new Error('Bu hesap Partner Ticaret girişine yetkili değil.');
      }
      safeRouterReplace(router, '/trade-partner');
    } catch (err) {
      Alert.alert('Giriş hatası', (err as Error)?.message ?? 'Giriş yapılamadı');
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient colors={[...theme.heroGradient]} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, paddingHorizontal: 20 }}>
        <View style={styles.badge}>
          <Ionicons name="storefront-outline" size={28} color={theme.accent} />
        </View>
        <Text style={styles.title}>Partner Ticaret</Text>
        <Text style={styles.sub}>İşlem onayı ve cari hesabınız</Text>

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="E-posta"
          placeholderTextColor={theme.mutedSoft}
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Şifre"
          placeholderTextColor={theme.mutedSoft}
          secureTextEntry
          style={[styles.input, { marginTop: 10 }]}
        />

        <TouchableOpacity style={[styles.btn, loading && { opacity: 0.6 }]} onPress={signIn} disabled={loading}>
          {loading ? <ActivityIndicator color="#0f172a" /> : <Text style={styles.btnText}>Giriş yap</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => safeRouterReplace(router, '/')} style={{ marginTop: 20, alignItems: 'center' }}>
          <Text style={styles.link}>Ana sayfaya dön</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: theme.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: { color: theme.text, fontSize: 28, fontWeight: '800' },
  sub: { color: theme.muted, marginTop: 6, marginBottom: 24 },
  input: {
    backgroundColor: theme.surfaceInput,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: theme.text,
    fontSize: 16,
  },
  btn: { marginTop: 16, backgroundColor: theme.accent, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  btnText: { color: '#0f172a', fontWeight: '800', fontSize: 16 },
  link: { color: theme.accent, fontWeight: '700' },
});
