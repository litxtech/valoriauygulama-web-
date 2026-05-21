import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { adminTheme } from '@/constants/adminTheme';
import { supabase } from '@/lib/supabase';
import { ORGANIZATION_KINDS, ORGANIZATION_KIND_LABELS, type OrganizationKind } from '@/lib/organizationKinds';

function toSlug(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export default function AdminOrganizationNewScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [kind, setKind] = useState<OrganizationKind>('construction');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [currencyCode, setCurrencyCode] = useState('TRY');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const finalSlug = (slug.trim() || toSlug(name)).trim();
    if (!name.trim() || !finalSlug) {
      Alert.alert('Eksik bilgi', 'İşletme adı ve kodu zorunludur.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc('create_organization_with_defaults', {
      p_name: name.trim(),
      p_slug: finalSlug,
      p_city: city.trim() || null,
      p_address: address.trim() || null,
      p_phone: phone.trim() || null,
      p_email: email.trim() || null,
      p_currency_code: currencyCode.trim() || 'TRY',
      p_kind: kind,
    });
    setSaving(false);
    if (error) {
      Alert.alert('Hata', error.message);
      return;
    }
    Alert.alert('Kaydedildi', 'Yeni işletme oluşturuldu. Muhasebeden seçerek kullanabilirsiniz.', [
      { text: 'Tamam', onPress: () => router.replace('/admin/organizations') },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>İşletme türü</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.kindRow}>
        {ORGANIZATION_KINDS.map((k) => (
          <TouchableOpacity key={k} style={[styles.kindChip, kind === k && styles.kindChipOn]} onPress={() => setKind(k)}>
            <Text style={[styles.kindChipText, kind === k && styles.kindChipTextOn]}>
              {ORGANIZATION_KIND_LABELS[k]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.label}>İşletme adı</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={(v) => {
          setName(v);
          if (!slug) setSlug(toSlug(v));
        }}
        placeholder="Örn. ABC İnşaat"
      />
      <Text style={styles.label}>Kod (slug)</Text>
      <TextInput style={styles.input} value={slug} onChangeText={setSlug} autoCapitalize="none" />
      <Text style={styles.label}>Şehir</Text>
      <TextInput style={styles.input} value={city} onChangeText={setCity} />
      <Text style={styles.label}>Adres</Text>
      <TextInput style={[styles.input, styles.area]} value={address} onChangeText={setAddress} multiline />
      <Text style={styles.label}>Telefon</Text>
      <TextInput style={styles.input} value={phone} onChangeText={setPhone} />
      <Text style={styles.label}>E-posta</Text>
      <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" />
      <Text style={styles.label}>Para birimi</Text>
      <TextInput style={styles.input} value={currencyCode} onChangeText={setCurrencyCode} autoCapitalize="characters" />
      <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>İşletme oluştur</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 32 },
  label: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.text, marginBottom: 6 },
  kindRow: { marginBottom: 12 },
  kindChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surface,
  },
  kindChipOn: { backgroundColor: adminTheme.colors.accent, borderColor: adminTheme.colors.accent },
  kindChipText: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.text },
  kindChipTextOn: { color: '#fff' },
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
  saveBtn: { marginTop: 8, backgroundColor: adminTheme.colors.accent, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700' },
});
