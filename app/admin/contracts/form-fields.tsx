import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { DEFAULT_FORM_FIELDS } from '@/lib/contractFormStrings';

const FIELD_LABELS: Record<string, string> = {
  full_name: 'Ad soyad',
  id_type: 'Kimlik türü',
  id_number: 'Kimlik numarası',
  phone: 'Telefon (WhatsApp)',
  email: 'E-posta',
  nationality: 'Uyruk',
  date_of_birth: 'Doğum tarihi',
  gender: 'Cinsiyet',
  address: 'Adres',
  check_in_date: 'Giriş tarihi',
  check_out_date: 'Çıkış tarihi',
  room_type: 'Oda tipi',
  adults: 'Yetişkin sayısı',
  children: 'Çocuk sayısı',
  family_member_tcs: 'Aile fertleri T.C. kimlik numaraları',
};

export default function ContractFormFieldsScreen() {
  const [config, setConfig] = useState<Record<string, boolean>>(DEFAULT_FORM_FIELDS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'contract_form_fields')
      .maybeSingle()
      .then(({ data }) => {
        const v = data?.value as Record<string, boolean> | null;
        if (v && typeof v === 'object') setConfig({ ...DEFAULT_FORM_FIELDS, ...v });
        setLoading(false);
      });
  }, []);

  const toggle = (key: string, value: boolean) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: 'contract_form_fields', value: config, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    setSaving(false);
    if (error) Alert.alert('Hata', error.message);
    else Alert.alert('Kaydedildi', 'Sözleşme sayfasında hangi alanların görüneceği güncellendi. Değişiklik anında yansır; deploy gerekmez.');
  };

  if (loading) return <Text style={styles.loading}>Yükleniyor...</Text>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Hangi bilgiyi almak istiyorsunuz?</Text>
      <Text style={styles.hint}>
        Aşağıdaki alanları açıp kapatabilirsiniz. Kapalı olanlar sözleşme sayfasında görünmez ve toplanmaz. Kaydettiğiniz anda tüm misafir sözleşme sayfalarına yansır.
        {'\n\n'}
        «Aile fertleri T.C.» alanı: Türk kimlik fotokopisi alınmadığı için onaylayan kişinin odadaki diğer aile bireylerinin adını ve T.C. kimlik numaralarını yazması içindir.
      </Text>
      <View style={styles.card}>
        {Object.keys(FIELD_LABELS).map((key, i, arr) => (
          <View key={key} style={[styles.row, i === arr.length - 1 && styles.rowLast]}>
            <Text style={styles.label}>{FIELD_LABELS[key]}</Text>
            <Switch
              value={config[key] ?? true}
              onValueChange={(v) => toggle(key, v)}
              trackColor={{ false: '#cbd5e0', true: '#1a365d' }}
              thumbColor="#fff"
            />
          </View>
        ))}
      </View>
      <TouchableOpacity style={[styles.btn, saving && styles.btnDisabled]} onPress={save} disabled={saving}>
        <Text style={styles.btnText}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7fafc' },
  content: { padding: 20, paddingBottom: 40 },
  loading: { padding: 24 },
  title: { fontSize: 20, fontWeight: '700', color: '#1a202c', marginBottom: 8 },
  hint: { fontSize: 14, color: '#64748b', marginBottom: 20, lineHeight: 22 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  rowLast: { borderBottomWidth: 0 },
  label: { fontSize: 16, color: '#334155', flex: 1 },
  btn: { marginTop: 24, padding: 16, backgroundColor: '#1a365d', borderRadius: 12, alignItems: 'center' },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
