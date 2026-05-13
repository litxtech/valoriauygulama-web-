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
  Switch,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { fetchTechAssetDetail } from '@/lib/technicalAssets';
import { hasTechnicalAssetsStaffAccess } from '@/lib/staffPermissions';
import { useAuthStore } from '@/stores/authStore';

export default function TechnicalFaultNewScreen() {
  const { assetId } = useLocalSearchParams<{ assetId?: string }>();
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [emergency, setEmergency] = useState(false);
  const [saving, setSaving] = useState(false);
  const [assetLabel, setAssetLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!hasTechnicalAssetsStaffAccess(staff)) {
      router.replace('/staff/technical-assets');
      return;
    }
    if (!assetId) return;
    (async () => {
      const { data } = await fetchTechAssetDetail(assetId);
      if (data) setAssetLabel(`${data.name} (${data.asset_code})`);
    })();
  }, [assetId, router, staff]);

  if (!hasTechnicalAssetsStaffAccess(staff) || !staff) return null;

  const submit = async () => {
    if (!title.trim()) {
      Alert.alert('Eksik', 'Başlık zorunlu.');
      return;
    }
    setSaving(true);
    try {
      let organizationId = staff.organization_id;
      if (assetId) {
        const { data: a } = await fetchTechAssetDetail(assetId);
        if (a) organizationId = a.organization_id;
      }
      const { error } = await supabase.from('tech_fault_reports').insert({
        organization_id: organizationId,
        asset_id: assetId?.trim() || null,
        title: title.trim(),
        description: description.trim() || null,
        is_emergency: emergency,
        created_by_staff_id: staff.id,
      });
      if (error) {
        Alert.alert('Hata', error.message);
        return;
      }
      Alert.alert('Kaydedildi', 'Arıza bildirimi oluşturuldu.', [{ text: 'Tamam', onPress: () => router.replace('/staff/technical-assets/faults') }]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {assetLabel ? (
        <View style={styles.assetBox}>
          <Text style={styles.assetLabel}>İlgili varlık</Text>
          <Text style={styles.assetText}>{assetLabel}</Text>
        </View>
      ) : (
        <Text style={styles.hint}>Genel arıza: varlık seçilmedi. İsterseniz önce varlık sayfasından «Arıza aç» kullanın.</Text>
      )}
      <Text style={styles.label}>Başlık *</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Örn: Ana bina su basıncı düşük" placeholderTextColor="#94a3b8" />
      <Text style={styles.label}>Açıklama</Text>
      <TextInput
        style={[styles.input, styles.tall]}
        value={description}
        onChangeText={setDescription}
        multiline
        placeholderTextColor="#94a3b8"
        placeholder="Ne oldu, nerede, kim gördü…"
      />
      <View style={styles.row}>
        <Text style={styles.label}>Acil durum</Text>
        <Switch value={emergency} onValueChange={setEmergency} />
      </View>
      <TouchableOpacity style={[styles.save, saving && { opacity: 0.7 }]} onPress={submit} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Bildir</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingBottom: 40 },
  assetBox: { backgroundColor: '#eff6ff', padding: 12, borderRadius: 10, marginBottom: 16, borderWidth: 1, borderColor: '#bfdbfe' },
  assetLabel: { fontSize: 12, color: '#1d4ed8', fontWeight: '700' },
  assetText: { fontSize: 15, color: '#1e3a8a', fontWeight: '800', marginTop: 4 },
  hint: { fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 19 },
  label: { fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: '#0f172a',
  },
  tall: { minHeight: 120, textAlignVertical: 'top' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  save: { marginTop: 28, backgroundColor: '#1a365d', padding: 16, borderRadius: 14, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
