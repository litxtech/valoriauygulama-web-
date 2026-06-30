import { useEffect, useState } from 'react';
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
import { TradePartnerAdminGate } from '@/components/tradePartner/TradePartnerAdminGate';
import { useTradePartnerProviderOrgId } from '@/hooks/useTradePartnerProviderOrgId';
import {
  createTradePartnerAccount,
  ensureTradePartnerCategories,
  fetchTradePartnerProviderOrgId,
  randomTradePartnerPassword,
  type TradePartnerCategory,
} from '@/lib/tradePartner';
import { tradePartnerTheme as theme } from '@/lib/tradePartnerTheme';

export default function AdminTradePartnerNewScreen() {
  return (
    <TradePartnerAdminGate>
      <AdminTradePartnerNewForm />
    </TradePartnerAdminGate>
  );
}

function AdminTradePartnerNewForm() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { orgId, loading: orgLoading } = useTradePartnerProviderOrgId();
  const [categories, setCategories] = useState<TradePartnerCategory[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(randomTradePartnerPassword());
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    void ensureTradePartnerCategories(orgId).then((cats) => {
      setCategories(cats);
      if (cats[0]?.id) setCategoryId(cats[0].id);
    });
  }, [orgId]);

  const submit = async () => {
    let organizationId = orgId;
    if (!organizationId) {
      try {
        organizationId = await fetchTradePartnerProviderOrgId();
      } catch (e) {
        Alert.alert('Hata', (e as Error)?.message ?? 'İşletme yapılandırması bulunamadı.');
        return;
      }
    }
    if (!categoryId || !companyName.trim() || !email.trim() || password.length < 6) {
      Alert.alert('Hata', 'Kategori, firma adı, e-posta ve en az 6 karakter şifre zorunlu.');
      return;
    }
    setLoading(true);
    try {
      await supabase.auth.refreshSession();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Oturum bulunamadı');

      const result = await createTradePartnerAccount({
        organizationId,
        categoryId,
        email: email.trim(),
        password,
        companyName: companyName.trim(),
        contactName: contactName.trim() || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        notes: notes.trim() || undefined,
        accessToken: session.access_token,
      });

      if ('error' in result) throw new Error(result.error);

      Alert.alert(
        'Partner oluşturuldu',
        `Giriş: ${result.email}\nŞifre: ${password}\n\nPartner Ticaret portalına bu bilgilerle giriş yapabilir.`,
        [{ text: 'Tamam', onPress: () => router.replace(`/admin/trade-partners/${result.partnerId}`) }]
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
          <Ionicons name="chevron-back" size={20} color={theme.accent} />
          <Text style={styles.backText}>Geri</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Yeni partner</Text>
        <Text style={styles.sub}>Firma bilgileri ve portal girişi oluşturulur.</Text>

        {orgLoading ? <ActivityIndicator color={theme.accent} /> : null}

        <Text style={styles.label}>Kategori</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          {categories.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[styles.chip, categoryId === c.id && styles.chipActive]}
              onPress={() => setCategoryId(c.id)}
            >
              <Text style={[styles.chipText, categoryId === c.id && styles.chipTextActive]}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Field label="Firma adı *" value={companyName} onChangeText={setCompanyName} />
        <Field label="Yetkili kişi" value={contactName} onChangeText={setContactName} />
        <Field label="Telefon" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Field label="E-posta *" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <Field label="Adres" value={address} onChangeText={setAddress} multiline />
        <Field label="Portal şifresi *" value={password} onChangeText={setPassword} />
        <Field label="Notlar" value={notes} onChangeText={setNotes} multiline />

        <TouchableOpacity style={[styles.submit, loading && { opacity: 0.6 }]} onPress={submit} disabled={loading}>
          {loading ? <ActivityIndicator color="#0f172a" /> : <Text style={styles.submitText}>Partner oluştur</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences';
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        style={[styles.input, props.multiline && { minHeight: 72, textAlignVertical: 'top' }]}
        placeholderTextColor={theme.mutedSoft}
        multiline={props.multiline}
        keyboardType={props.keyboardType}
        autoCapitalize={props.autoCapitalize}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  backText: { color: theme.accent, fontWeight: '700' },
  title: { color: theme.text, fontSize: 24, fontWeight: '800' },
  sub: { color: theme.muted, marginTop: 4, marginBottom: 16 },
  label: { color: theme.muted, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  input: {
    backgroundColor: theme.surfaceInput,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.text,
    fontSize: 16,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    backgroundColor: theme.cardElevated,
    marginRight: 8,
  },
  chipActive: { borderColor: theme.accent, backgroundColor: theme.accentSoft },
  chipText: { color: theme.muted, fontWeight: '700', fontSize: 13 },
  chipTextActive: { color: theme.accent },
  submit: {
    marginTop: 8,
    backgroundColor: theme.accent,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  submitText: { color: '#0f172a', fontWeight: '800', fontSize: 16 },
});
