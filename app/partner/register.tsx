import { useState } from 'react';
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
import { completeSignIn } from '@/stores/authStore';
import { usePartnerAuthStore } from '@/stores/partnerAuthStore';
import { registerBreakfastPartnerSelf } from '@/lib/breakfastPartner';
import { notifyAdmins } from '@/lib/notificationService';
import { partnerTheme } from '@/lib/breakfastPartnerTheme';
import { safeRouterReplace } from '@/lib/safeRouter';

export default function PartnerRegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<1 | 2>(1);
  const [hotelName, setHotelName] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [taxId, setTaxId] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [terms, setTerms] = useState(false);
  const [loading, setLoading] = useState(false);

  const nextStep = () => {
    if (!hotelName.trim() || !contactName.trim()) {
      Alert.alert('Hata', 'Otel adı ve yetkili adı zorunludur.');
      return;
    }
    setStep(2);
  };

  const submit = async () => {
    const e = email.trim().toLowerCase();
    if (!e || !password || password.length < 6) {
      Alert.alert('Hata', 'Geçerli e-posta ve en az 6 karakter şifre girin.');
      return;
    }
    if (password !== password2) {
      Alert.alert('Hata', 'Şifreler eşleşmiyor.');
      return;
    }
    if (!terms) {
      Alert.alert('Hata', 'Kullanım koşullarını kabul etmelisiniz.');
      return;
    }

    setLoading(true);
    try {
      const result = await registerBreakfastPartnerSelf({
        email: e,
        password,
        name: hotelName.trim(),
        contactName: contactName.trim(),
        phone: phone.trim() || undefined,
        city: city.trim() || undefined,
        address: address.trim() || undefined,
        taxId: taxId.trim() || undefined,
      });

      if ('error' in result) throw new Error(result.error);

      const { error: sessionErr } = await supabase.auth.setSession({
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
      });
      if (sessionErr) throw sessionErr;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Oturum açılamadı');

      await completeSignIn(user);
      await usePartnerAuthStore.getState().resolvePartner(user);

      notifyAdmins({
        title: 'Yeni kahvaltı partner başvurusu',
        body: `${hotelName.trim()} — onay bekliyor.`,
        data: { url: '/admin/breakfast-partners' },
      }).catch(() => {});

      Alert.alert(
        'Profil oluşturuldu',
        'Başvurunuz alındı. Yönetici onayından sonra kahvaltı kaydı girebilirsiniz.',
        [{ text: 'Tamam', onPress: () => safeRouterReplace(router, '/partner/pending') }]
      );
    } catch (err) {
      Alert.alert('Kayıt hatası', (err as Error)?.message ?? 'Kayıt tamamlanamadı');
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient colors={[...partnerTheme.heroGradient]} style={StyleSheet.absoluteFill} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => (step === 2 ? setStep(1) : router.back())}>
          <Ionicons name="arrow-back" size={20} color={partnerTheme.text} />
          <Text style={styles.backText}>{step === 2 ? 'Geri' : 'Giriş'}</Text>
        </TouchableOpacity>

        <View style={styles.heroIconWrap}>
          <LinearGradient colors={[...partnerTheme.accentGradient]} style={styles.heroIcon}>
            <Ionicons name="business" size={28} color="#fff" />
          </LinearGradient>
        </View>
        <Text style={styles.title}>Partner otel profili</Text>
        <Text style={styles.subtitle}>
          {step === 1 ? '1/2 — Otel bilgileri' : '2/2 — Giriş hesabı'}
        </Text>

        <View style={styles.steps}>
          <View style={[styles.stepDot, step >= 1 && styles.stepDotActive]} />
          <View style={[styles.stepLine, step >= 2 && styles.stepLineActive]} />
          <View style={[styles.stepDot, step >= 2 && styles.stepDotActive]} />
        </View>

        <View style={styles.card}>
          {step === 1 ? (
            <>
              <Field label="Otel adı *" value={hotelName} onChangeText={setHotelName} placeholder="Örn. Göl Otel" />
              <Field label="Yetkili ad soyad *" value={contactName} onChangeText={setContactName} placeholder="Ad Soyad" />
              <Field label="Şehir" value={city} onChangeText={setCity} placeholder="Uzungöl" />
              <Field label="Adres" value={address} onChangeText={setAddress} placeholder="Mahalle, cadde..." multiline />
              <Field label="Telefon" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+90 5xx" />
              <Field label="Vergi no (isteğe bağlı)" value={taxId} onChangeText={setTaxId} />
              <TouchableOpacity style={styles.btn} onPress={nextStep} activeOpacity={0.88}>
                <Text style={styles.btnText}>Devam</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Field
                label="Giriş e-postası *"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="otel@example.com"
              />
              <Field label="Şifre *" value={password} onChangeText={setPassword} secureTextEntry placeholder="En az 6 karakter" />
              <Field label="Şifre tekrar *" value={password2} onChangeText={setPassword2} secureTextEntry />
              <TouchableOpacity style={styles.termsRow} onPress={() => setTerms((v) => !v)} activeOpacity={0.85}>
                <Ionicons name={terms ? 'checkbox' : 'square-outline'} size={22} color={partnerTheme.accent} />
                <Text style={styles.termsText}>Kullanım koşullarını ve gizlilik politikasını kabul ediyorum.</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btn} onPress={submit} disabled={loading} activeOpacity={0.88}>
                {loading ? <ActivityIndicator color="#0f172a" /> : <Text style={styles.btnText}>Profili oluştur</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>

        <TouchableOpacity onPress={() => router.replace('/partner/login')} style={styles.loginLink}>
          <Text style={styles.loginLinkText}>Zaten hesabınız var mı? Giriş yapın</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
  autoCapitalize,
  secureTextEntry,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences';
  secureTextEntry?: boolean;
}) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMulti]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={partnerTheme.muted}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secureTextEntry}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: partnerTheme.bg },
  content: { paddingHorizontal: 20 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 },
  backText: { color: partnerTheme.text, fontSize: 15 },
  heroIconWrap: { alignItems: 'center', marginBottom: 12 },
  heroIcon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { color: partnerTheme.text, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: partnerTheme.muted, textAlign: 'center', marginBottom: 16 },
  steps: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 16, gap: 0 },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#334155' },
  stepDotActive: { backgroundColor: partnerTheme.accent },
  stepLine: { width: 48, height: 2, backgroundColor: '#334155' },
  stepLineActive: { backgroundColor: partnerTheme.accent },
  card: {
    backgroundColor: partnerTheme.card,
    borderRadius: 20,
    padding: 18,
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
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
  termsRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 14 },
  termsText: { flex: 1, color: partnerTheme.muted, fontSize: 13, lineHeight: 20 },
  btn: {
    marginTop: 18,
    backgroundColor: partnerTheme.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: { color: '#0f172a', fontWeight: '800', fontSize: 16 },
  loginLink: { marginTop: 20, alignItems: 'center' },
  loginLinkText: { color: partnerTheme.accent, fontWeight: '600' },
});
