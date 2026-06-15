import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { fetchTechAssetDetail } from '@/lib/technicalAssets';
import { notifyTechMaintenanceLog } from '@/lib/technicalAssetNotifications';
import { canOperateTechnicalAssets, hasTechnicalAssetsStaffAccess } from '@/lib/staffPermissions';
import { useAuthStore } from '@/stores/authStore';

const ACTION_PRESETS = ['Kontrol edildi', 'Sigorta atıldı', 'Sigorta kaldırıldı', 'Vana kapatıldı', 'Vana açıldı', 'Arıza bildirildi', 'Teknik personele devredildi'];

export default function TechnicalAssetLogScreen() {
  const { assetId } = useLocalSearchParams<{ assetId: string }>();
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const [actionType, setActionType] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const allowed = hasTechnicalAssetsStaffAccess(staff) && canOperateTechnicalAssets(staff);

  useEffect(() => {
    if (!allowed) router.replace('/staff/technical-assets');
  }, [allowed, router]);

  const submit = async () => {
    if (!assetId || !actionType.trim()) {
      Alert.alert('Eksik', 'İşlem tipi zorunludur.');
      return;
    }
    setSaving(true);
    try {
      const { data: a } = await fetchTechAssetDetail(assetId);
      if (!a) {
        Alert.alert('Hata', 'Varlık bulunamadı.');
        setSaving(false);
        return;
      }
      const { error } = await supabase.from('tech_maintenance_logs').insert({
        organization_id: a.organization_id,
        asset_id: assetId,
        staff_id: staff!.id,
        action_type: actionType.trim(),
        note: note.trim() || null,
      });
      if (error) {
        Alert.alert('Hata', error.message);
        setSaving(false);
        return;
      }
      void notifyTechMaintenanceLog({
        organizationId: a.organization_id,
        asset: a,
        actionType: actionType.trim(),
        note: note.trim() || null,
        staffId: staff!.id,
        staffName: staff?.full_name ?? null,
      });
      Alert.alert('Kaydedildi', 'Müdahale kaydı oluşturuldu.', [
        { text: 'Tamam', onPress: () => router.replace(`/staff/technical-assets/${assetId}`) },
      ]);
    } finally {
      setSaving(false);
    }
  };

  if (!allowed) {
    return (
      <View style={styles.blocked}>
        <ActivityIndicator color="#1a365d" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>Hızlı seçim</Text>
      <View style={styles.chips}>
        {ACTION_PRESETS.map((p) => (
          <TouchableOpacity key={p} style={[styles.chip, actionType === p && styles.chipOn]} onPress={() => setActionType(p)}>
            <Text style={[styles.chipText, actionType === p && styles.chipTextOn]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.label}>İşlem tipi</Text>
      <TextInput
        style={styles.input}
        value={actionType}
        onChangeText={setActionType}
        placeholder="Örn: Sigorta atıldı"
        placeholderTextColor="#94a3b8"
      />
      <Text style={styles.label}>Not (isteğe bağlı)</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={note}
        onChangeText={setNote}
        placeholder="Kısa açıklama, misafir bilgisi, koku/ıslaklık vb."
        placeholderTextColor="#94a3b8"
        multiline
      />
      <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={submit} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Kaydet</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  blocked: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 8, marginTop: 12 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0f172a',
  },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  chipOn: { backgroundColor: '#1a365d', borderColor: '#1a365d' },
  chipText: { fontSize: 13, color: '#334155', fontWeight: '600' },
  chipTextOn: { color: '#fff' },
  saveBtn: {
    marginTop: 28,
    backgroundColor: '#b8860b',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
