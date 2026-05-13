import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { canAccessTechnicalAssetsAdminRoutes } from '@/lib/staffPermissions';
import { useRouter } from 'expo-router';
import type { TechBuildingRow, TechLocationRow } from '@/lib/technicalAssets';

export default function AdminTechnicalStructureScreen() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const orgId = staff?.organization_id;
  const [buildings, setBuildings] = useState<TechBuildingRow[]>([]);
  const [locations, setLocations] = useState<(TechLocationRow & { tech_buildings?: { name?: string } | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [bName, setBName] = useState('');
  const [lName, setLName] = useState('');
  const [lBuildingId, setLBuildingId] = useState<string | null>(null);
  const [lFloor, setLFloor] = useState('');

  const ok = canAccessTechnicalAssetsAdminRoutes(staff);

  const load = useCallback(async () => {
    if (!orgId) return;
    const [br, lr] = await Promise.all([
      supabase
        .from('tech_buildings')
        .select('*')
        .eq('organization_id', orgId)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
      supabase
        .from('tech_locations')
        .select('*, tech_buildings(name)')
        .eq('organization_id', orgId)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
    ]);
    if (!br.error) setBuildings((br.data as TechBuildingRow[]) ?? []);
    if (!lr.error) setLocations((lr.data as (TechLocationRow & { tech_buildings?: { name?: string } | null })[]) ?? []);
  }, [orgId]);

  useEffect(() => {
    if (!ok) {
      router.replace('/admin');
      return;
    }
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load, ok, router]);

  const addBuilding = async () => {
    if (!orgId || !bName.trim()) return;
    const { error } = await supabase.from('tech_buildings').insert({
      organization_id: orgId,
      name: bName.trim(),
      sort_order: buildings.length,
    });
    if (error) Alert.alert('Hata', error.message);
    else {
      setBName('');
      await load();
    }
  };

  const deleteBuilding = (b: TechBuildingRow) => {
    Alert.alert(
      'Binayı sil',
      `"${b.name}" ve içindeki tüm lokasyonlar silinecek. Bu binaya bağlı varlıklar varsa silinemeyebilir.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('tech_buildings').delete().eq('id', b.id);
            if (error) Alert.alert('Hata', error.message);
            else await load();
          },
        },
      ]
    );
  };

  const deleteLocation = (l: TechLocationRow) => {
    Alert.alert('Lokasyonu sil', `"${l.name}" silinsin mi?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('tech_locations').delete().eq('id', l.id);
          if (error) Alert.alert('Hata', error.message);
          else await load();
        },
      },
    ]);
  };

  const addLocation = async () => {
    if (!orgId || !lName.trim() || !lBuildingId) {
      Alert.alert('Eksik', 'Bina ve lokasyon adı seçin.');
      return;
    }
    const { error } = await supabase.from('tech_locations').insert({
      organization_id: orgId,
      building_id: lBuildingId,
      name: lName.trim(),
      floor: lFloor.trim() || null,
      sort_order: locations.filter((x) => x.building_id === lBuildingId).length,
    });
    if (error) Alert.alert('Hata', error.message);
    else {
      setLName('');
      setLFloor('');
      await load();
    }
  };

  if (!ok || !orgId) return null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {loading ? (
        <View style={styles.inlineLoading}>
          <ActivityIndicator size="small" color="#1a365d" />
          <Text style={styles.inlineLoadingText}>Bina ve lokasyonlar yükleniyor…</Text>
        </View>
      ) : null}
      <Text style={styles.section}>Yeni bina / birim</Text>
      <TextInput style={styles.input} value={bName} onChangeText={setBName} placeholder="Örn: Bungalov 1" placeholderTextColor="#a0aec0" />
      <TouchableOpacity style={styles.btn} onPress={addBuilding}>
        <Text style={styles.btnText}>Bina ekle</Text>
      </TouchableOpacity>

      <Text style={[styles.section, { marginTop: 28 }]}>Yeni lokasyon</Text>
      <Text style={styles.hint}>Önce binayı seçin; sonra o binadaki oda / pano / hat ismini yazın.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
        {buildings.map((b) => (
          <TouchableOpacity
            key={b.id}
            style={[styles.chip, lBuildingId === b.id && styles.chipOn]}
            onPress={() => setLBuildingId(b.id)}
          >
            <Text style={[styles.chipText, lBuildingId === b.id && styles.chipTextOn]}>{b.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <TextInput style={styles.input} value={lName} onChangeText={setLName} placeholder="Örn: Dış pano" placeholderTextColor="#a0aec0" />
      <TextInput style={styles.input} value={lFloor} onChangeText={setLFloor} placeholder="Kat (isteğe bağlı)" placeholderTextColor="#a0aec0" />
      <TouchableOpacity style={styles.btn} onPress={addLocation}>
        <Text style={styles.btnText}>Lokasyon ekle</Text>
      </TouchableOpacity>

      <Text style={[styles.section, { marginTop: 28 }]}>Kayıtlı binalar</Text>
      {buildings.map((b) => (
        <View key={b.id} style={styles.rowRow}>
          <View style={styles.rowGrow}>
            <Text style={styles.rowTitle}>{b.name}</Text>
          </View>
          <TouchableOpacity onPress={() => deleteBuilding(b)} hitSlop={12} accessibilityLabel="Binayı sil">
            <Ionicons name="trash-outline" size={22} color="#e53e3e" />
          </TouchableOpacity>
        </View>
      ))}

      <Text style={[styles.section, { marginTop: 20 }]}>Kayıtlı lokasyonlar</Text>
      {locations.map((l) => (
        <View key={l.id} style={styles.rowRow}>
          <View style={styles.rowGrow}>
            <Text style={styles.rowTitle}>{l.tech_buildings?.name ?? '—'} / {l.name}</Text>
            {l.floor ? <Text style={styles.rowSub}>Kat: {l.floor}</Text> : null}
          </View>
          <TouchableOpacity onPress={() => deleteLocation(l)} hitSlop={12} accessibilityLabel="Lokasyonu sil">
            <Ionicons name="trash-outline" size={22} color="#e53e3e" />
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7fafc' },
  content: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  inlineLoading: {
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#edf2f7',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inlineLoadingText: { fontSize: 13, color: '#4a5568', fontWeight: '600' },
  section: { fontSize: 16, fontWeight: '800', color: '#1a365d', marginBottom: 10 },
  hint: { fontSize: 13, color: '#718096', marginBottom: 10 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    marginBottom: 10,
    color: '#1a202c',
  },
  btn: { backgroundColor: '#1a365d', padding: 14, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800' },
  chipScroll: { marginBottom: 10 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginRight: 8,
  },
  chipOn: { backgroundColor: '#1a365d', borderColor: '#1a365d' },
  chipText: { fontSize: 13, fontWeight: '700', color: '#4a5568' },
  chipTextOn: { color: '#fff' },
  rowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 8,
    gap: 10,
  },
  rowGrow: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: '#2d3748' },
  rowSub: { fontSize: 13, color: '#718096', marginTop: 4 },
});
