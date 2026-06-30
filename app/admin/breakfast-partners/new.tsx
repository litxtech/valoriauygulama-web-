import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { BreakfastPartnerAdminGate } from '@/components/breakfastPartner/BreakfastPartnerAdminGate';
import { useBreakfastPartnerProviderOrgId } from '@/hooks/useBreakfastPartnerProviderOrgId';
import { fetchBreakfastPartnerProviderOrgId, createBreakfastPartnerAccount, randomPartnerPassword } from '@/lib/breakfastPartner';
import { partnerTheme } from '@/lib/breakfastPartnerTheme';

export default function AdminBreakfastPartnerNewScreen() {
  return (
    <BreakfastPartnerAdminGate>
      <AdminBreakfastPartnerNewForm />
    </BreakfastPartnerAdminGate>
  );
}

function AdminBreakfastPartnerNewForm() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { orgId, loading: orgLoading } = useBreakfastPartnerProviderOrgId();

  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(randomPartnerPassword());
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [taxId, setTaxId] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    let organizationId = orgId;
    if (!organizationId) {
      try {
        organizationId = await fetchBreakfastPartnerProviderOrgId();
      } catch (e) {
        Alert.alert('Hata', (e as Error)?.message ?? 'İşletme yapılandırması bulunamadı.');
        return;
      }
    }
    if (!name.trim() || !email.trim() || !password || password.length < 6) {
      Alert.alert('Hata', 'Otel adı, e-posta ve en az 6 karakter şifre zorunlu.');
      return;
    }
    setLoading(true);
    try {
      await supabase.auth.refreshSession();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Oturum bulunamadı');

      const price = unitPrice.trim() ? parseFloat(unitPrice.replace(',', '.')) : undefined;
      const result = await createBreakfastPartnerAccount({
        organizationId,
        email: email.trim(),
        password,
        name: name.trim(),
        contactName: contactName.trim() || undefined,
        phone: phone.trim() || undefined,
        city: city.trim() || undefined,
        address: address.trim() || undefined,
        taxId: taxId.trim() || undefined,
        unitPrice: price && price > 0 ? price : undefined,
        notes: notes.trim() || undefined,
        accessToken: session.access_token,
      });

      if ('error' in result) throw new Error(result.error);

      Alert.alert(
        'Partner otel oluşturuldu',
        `Giriş: ${result.email}\nŞifre: ${password}\n\nBu bilgileri partner otelle paylaşın.`,
        [{ text: 'Tamam', onPress: () => router.replace(`/admin/breakfast-partners/${result.hotelId}`) }]
      );
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Oluşturulamadı');
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24, paddingHorizontal: 16 }}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Ionicons name="arrow-back" size={22} color={partnerTheme.text} />
          <Text style={styles.backText}>Geri</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Yeni partner otel</Text>
        <Text style={styles.subtitle}>Hesap, cari kaydı ve giriş birlikte oluşturulur.</Text>

        <Field label="Otel adı *" value={name} onChangeText={setName} />
        <Field label="Yetkili adı" value={contactName} onChangeText={setContactName} />
        <Field label="Giriş e-postası *" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <View style={styles.row}>
          <Text style={styles.label}>Şifre *</Text>
          <TouchableOpacity onPress={() => setPassword(randomPartnerPassword())}>
            <Text style={styles.link}>Yenile</Text>
          </TouchableOpacity>
        </View>
        <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry />
        <Field label="Telefon" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Field label="Şehir" value={city} onChangeText={setCity} />
        <Field label="Adres" value={address} onChangeText={setAddress} />
        <Field label="Vergi no" value={taxId} onChangeText={setTaxId} />
        <Field label="Kişi başı fiyat (₺) — boş bırakılırsa varsayılan" value={unitPrice} onChangeText={setUnitPrice} keyboardType="decimal-pad" />
        <Field label="Notlar" value={notes} onChangeText={setNotes} multiline />

        <TouchableOpacity style={styles.btn} onPress={submit} disabled={loading || orgLoading}>
          {loading ? <ActivityIndicator color="#0f172a" /> : <Text style={styles.btnText}>Oluştur</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  multiline,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'decimal-pad';
  autoCapitalize?: 'none' | 'sentences';
}) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMulti]}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        placeholderTextColor={partnerTheme.muted}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: partnerTheme.bg },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  backText: { color: partnerTheme.text },
  title: { color: partnerTheme.text, fontSize: 22, fontWeight: '800' },
  subtitle: { color: partnerTheme.muted, marginBottom: 16, marginTop: 4 },
  label: { color: partnerTheme.muted, fontSize: 13, marginBottom: 6, marginTop: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  link: { color: partnerTheme.accent, fontWeight: '700' },
  input: {
    backgroundColor: partnerTheme.card,
    borderRadius: 12,
    padding: 12,
    color: partnerTheme.text,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
  },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  btn: {
    marginTop: 20,
    backgroundColor: partnerTheme.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: { color: '#0f172a', fontWeight: '800', fontSize: 16 },
});
