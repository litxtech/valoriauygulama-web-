import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { adminTheme } from '@/constants/adminTheme';
import { supabase } from '@/lib/supabase';

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  currency_code: string;
  is_active: boolean;
};

export default function AdminOrganizationEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [currencyCode, setCurrencyCode] = useState('TRY');
  const [isActive, setIsActive] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from('organizations')
      .select('id,name,slug,city,address,phone,email,currency_code,is_active')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) {
      Alert.alert('Hata', error?.message ?? 'Otel kaydi bulunamadi.');
      router.back();
      return;
    }
    const row = data as OrgRow;
    setName(row.name);
    setSlug(row.slug);
    setCity(row.city ?? '');
    setAddress(row.address ?? '');
    setPhone(row.phone ?? '');
    setEmail(row.email ?? '');
    setCurrencyCode(row.currency_code ?? 'TRY');
    setIsActive(row.is_active);
    setLoading(false);
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!id || !name.trim() || !slug.trim()) {
      Alert.alert('Eksik bilgi', 'Otel adi ve kodu zorunludur.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc('update_organization_admin', {
      p_org_id: id,
      p_name: name.trim(),
      p_slug: slug.trim(),
      p_city: city.trim() || null,
      p_address: address.trim() || null,
      p_phone: phone.trim() || null,
      p_email: email.trim() || null,
      p_currency_code: currencyCode.trim() || 'TRY',
      p_is_active: isActive,
    });
    setSaving(false);
    if (error) {
      Alert.alert('Hata', error.message);
      return;
    }
    Alert.alert('Kaydedildi', 'Otel bilgileri guncellendi.');
  };

  if (loading) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>Otel Adi</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} />
      <Text style={styles.label}>Otel Kodu (slug)</Text>
      <TextInput style={styles.input} value={slug} onChangeText={setSlug} autoCapitalize="none" />
      <Text style={styles.label}>Sehir</Text>
      <TextInput style={styles.input} value={city} onChangeText={setCity} />
      <Text style={styles.label}>Adres</Text>
      <TextInput style={[styles.input, styles.area]} value={address} onChangeText={setAddress} multiline />
      <Text style={styles.label}>Telefon</Text>
      <TextInput style={styles.input} value={phone} onChangeText={setPhone} />
      <Text style={styles.label}>E-posta</Text>
      <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" />
      <Text style={styles.label}>Para Birimi</Text>
      <TextInput style={styles.input} value={currencyCode} onChangeText={setCurrencyCode} autoCapitalize="characters" />

      <TouchableOpacity style={[styles.toggleBtn, isActive ? styles.toggleOn : styles.toggleOff]} onPress={() => setIsActive((v) => !v)}>
        <Text style={styles.toggleText}>{isActive ? 'Durum: Aktif' : 'Durum: Pasif'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Degisiklikleri Kaydet</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 32 },
  label: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.text, marginBottom: 6 },
  input: {
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    color: adminTheme.colors.text,
  },
  area: { minHeight: 70, textAlignVertical: 'top' },
  toggleBtn: { borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  toggleOn: { backgroundColor: '#dcfce7' },
  toggleOff: { backgroundColor: '#fee2e2' },
  toggleText: { fontWeight: '700', color: '#111827' },
  saveBtn: { marginTop: 12, backgroundColor: adminTheme.colors.accent, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700' },
});

