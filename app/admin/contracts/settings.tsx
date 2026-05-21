import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

const STORE_KEYS = {
  google_play_url: 'Google Play (Android) uygulama URL',
  app_store_url: 'App Store (iOS) uygulama URL',
} as const;

export default function ContractAppSettings() {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({ google_play_url: '', app_store_url: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('app_settings').select('key, value').in('key', Object.keys(STORE_KEYS));
      const map: Record<string, string> = {};
      (data ?? []).forEach((r: { key: string; value: unknown }) => {
        map[r.key] = r.value != null && r.value !== '' ? String(r.value) : '';
      });
      setValues((prev) => ({ ...prev, ...map }));
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      for (const key of Object.keys(STORE_KEYS)) {
        const val = (values[key] ?? '').trim() || null;
        await supabase.from('app_settings').upsert(
          { key, value: val, updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        );
      }
      Alert.alert('Kaydedildi', 'Mağaza linkleri güncellendi.');
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Kaydedilemedi');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a365d" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.qrHubBtn} onPress={() => router.push('/admin/qr-designs')} activeOpacity={0.88}>
        <Ionicons name="qr-code-outline" size={22} color="#fff" />
        <Text style={styles.qrHubBtnText}>Sözleşme QR ve URL → QR Merkezi</Text>
        <Ionicons name="chevron-forward" size={20} color="#fff" />
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Mağaza yönlendirme</Text>
      <Text style={styles.hint}>
        Sözleşme onayı sonrası müşteriyi App Store / Play Store’a yönlendirmek için linkler. QR ve sözleşme base URL artık QR Merkezi’nde.
      </Text>

      {(Object.keys(STORE_KEYS) as (keyof typeof STORE_KEYS)[]).map((key) => (
        <View key={key} style={styles.field}>
          <Text style={styles.label}>{STORE_KEYS[key]}</Text>
          <TextInput
            style={styles.input}
            value={values[key] ?? ''}
            onChangeText={(t) => setValues((prev) => ({ ...prev, [key]: t }))}
            placeholder="https://..."
            autoCapitalize="none"
          />
        </View>
      ))}

      <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Kaydet</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f7fafc' },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  qrHubBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1a365d',
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
  },
  qrHubBtnText: { flex: 1, color: '#fff', fontWeight: '700', fontSize: 15 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 8 },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#fff',
  },
  hint: { fontSize: 12, color: '#64748b', marginBottom: 16, lineHeight: 18 },
  saveBtn: { backgroundColor: '#1a365d', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
