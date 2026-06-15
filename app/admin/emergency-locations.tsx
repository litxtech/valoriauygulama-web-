import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import {
  createEmergencyLocation,
  listEmergencyLocations,
  type EmergencyLocation,
  updateEmergencyLocation,
} from '@/lib/staffEmergency';

export default function AdminEmergencyLocationsScreen() {
  const { staff } = useAuthStore();
  const [items, setItems] = useState<EmergencyLocation[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listEmergencyLocations(false);
    setLoading(false);
    if (res.error) {
      Alert.alert('Hata', res.error);
      return;
    }
    setItems(res.data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Eksik bilgi', 'Lokasyon adı yazın.');
      return;
    }
    setSaving(true);
    const maxSort = items.reduce((mx, item) => Math.max(mx, item.sort_order), 0);
    const res = await createEmergencyLocation(trimmed, maxSort + 10, staff?.id ?? null);
    setSaving(false);
    if (res.error) {
      Alert.alert('Hata', res.error);
      return;
    }
    setName('');
    load();
  };

  const toggleActive = async (item: EmergencyLocation, next: boolean) => {
    const res = await updateEmergencyLocation(item.id, { is_active: next });
    if (res.error) {
      Alert.alert('Hata', res.error);
      return;
    }
    setItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, is_active: next } : p)));
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Acil Durum Lokasyonlari</Text>
      <Text style={styles.sub}>
        Personel acil butonunda görünen listeyi buradan yönetin. Alarm göndermek için «Personel
        toplanma alarmı» ekranını kullanın.
      </Text>

      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Ornek: Kazan Dairesi"
          placeholderTextColor="#94a3b8"
        />
        <TouchableOpacity style={[styles.addBtn, saving && styles.addBtnDisabled]} onPress={onAdd} disabled={saving}>
          <Text style={styles.addBtnText}>{saving ? '...' : 'Ekle'}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={items}
        refreshing={loading}
        onRefresh={load}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            <View style={styles.row}>
              <Text style={styles.muted}>{item.is_active ? 'Aktif' : 'Pasif'}</Text>
              <Switch value={item.is_active} onValueChange={(next) => toggleActive(item, next)} />
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Lokasyon bulunamadi.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  sub: { marginTop: 6, color: '#475569', marginBottom: 16 },
  addRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0f172a',
  },
  addBtn: {
    backgroundColor: '#dc2626',
    borderRadius: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDisabled: { opacity: 0.6 },
  addBtnText: { color: '#fff', fontWeight: '700' },
  listContent: { paddingBottom: 28 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    marginBottom: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  row: { marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  muted: { color: '#64748b' },
  empty: { textAlign: 'center', color: '#64748b', marginTop: 40 },
});
