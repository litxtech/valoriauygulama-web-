import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { hasTechnicalAssetsStaffAccess } from '@/lib/staffPermissions';
import { useAuthStore } from '@/stores/authStore';
import { Ionicons } from '@expo/vector-icons';
import { criticalityLabel, techAssetHasUsageGuide, type TechCriticality } from '@/lib/technicalAssets';
import { useCachedList } from '@/hooks/useCachedList';

type Row = {
  id: string;
  name: string;
  asset_code: string;
  criticality: string;
  status: string;
  building_id: string;
  usage_guide_text: string | null;
  usage_guide_video_url: string | null;
};

type BuildingChip = { id: string; name: string };

const STATUSES = ['active', 'inactive', 'maintenance', 'fault'] as const;
const CRITS = ['low', 'medium', 'high', 'critical'] as const;

export default function TechnicalAssetsBrowseScreen() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const [buildings, setBuildings] = useState<BuildingChip[]>([]);
  const [search, setSearch] = useState('');
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [critFilter, setCritFilter] = useState<string | null>(null);

  const cacheKey = `tech-assets-browse:${buildingId ?? 'all'}:${statusFilter ?? 'all'}:${critFilter ?? 'all'}`;

  const fetchItems = useCallback(async () => {
    let q = supabase
      .from('tech_assets')
      .select('id, name, asset_code, criticality, status, building_id, usage_guide_text, usage_guide_video_url')
      .order('name', { ascending: true })
      .limit(500);
    if (buildingId) q = q.eq('building_id', buildingId);
    if (statusFilter) q = q.eq('status', statusFilter);
    if (critFilter) q = q.eq('criticality', critFilter);
    const { data, error } = await q;
    return ((error ? [] : data) ?? []) as Row[];
  }, [buildingId, critFilter, statusFilter]);

  const { items: rawRows, refreshing, refresh, showList } = useCachedList({
    cacheKey,
    enabled: hasTechnicalAssetsStaffAccess(staff),
    fetchItems,
  });

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rawRows;
    return rawRows.filter((r) => r.name.toLowerCase().includes(s) || r.asset_code.toLowerCase().includes(s));
  }, [rawRows, search]);

  useEffect(() => {
    if (!hasTechnicalAssetsStaffAccess(staff)) {
      router.replace('/staff/technical-assets');
      return;
    }
    supabase.from('tech_buildings').select('id, name').order('name').then(({ data }) => {
      setBuildings((data as BuildingChip[]) ?? []);
    });
  }, [router, staff]);

  const onRefresh = refresh;

  if (!hasTechnicalAssetsStaffAccess(staff)) return null;

  if (!showList && rawRows.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a365d" />
      </View>
    );
  }

  const header = (
    <View style={styles.header}>
      <TextInput
        style={styles.search}
        value={search}
        onChangeText={setSearch}
        placeholder="Ara: ad veya kod"
        placeholderTextColor="#94a3b8"
      />
      <Text style={styles.filterLabel}>Bina</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        <TouchableOpacity style={[styles.chip, buildingId === null && styles.chipOn]} onPress={() => setBuildingId(null)}>
          <Text style={[styles.chipText, buildingId === null && styles.chipTextOn]}>Tümü</Text>
        </TouchableOpacity>
        {buildings.map((b) => (
          <TouchableOpacity key={b.id} style={[styles.chip, buildingId === b.id && styles.chipOn]} onPress={() => setBuildingId(b.id)}>
            <Text style={[styles.chipText, buildingId === b.id && styles.chipTextOn]}>{b.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <Text style={styles.filterLabel}>Durum</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        <TouchableOpacity style={[styles.chip, statusFilter === null && styles.chipOn]} onPress={() => setStatusFilter(null)}>
          <Text style={[styles.chipText, statusFilter === null && styles.chipTextOn]}>Tümü</Text>
        </TouchableOpacity>
        {STATUSES.map((st) => (
          <TouchableOpacity key={st} style={[styles.chip, statusFilter === st && styles.chipOn]} onPress={() => setStatusFilter(st)}>
            <Text style={[styles.chipText, statusFilter === st && styles.chipTextOn]}>{st}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <Text style={styles.filterLabel}>Kritiklik</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        <TouchableOpacity style={[styles.chip, critFilter === null && styles.chipOn]} onPress={() => setCritFilter(null)}>
          <Text style={[styles.chipText, critFilter === null && styles.chipTextOn]}>Tümü</Text>
        </TouchableOpacity>
        {CRITS.map((c) => (
          <TouchableOpacity key={c} style={[styles.chip, critFilter === c && styles.chipOn]} onPress={() => setCritFilter(c)}>
            <Text style={[styles.chipText, critFilter === c && styles.chipTextOn]}>{criticalityLabel(c)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={header}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Kayıt bulunamadı</Text>
          <Text style={styles.emptyHint}>Filtreleri sıfırlayın veya yönetimden varlık ekleyin.</Text>
        </View>
      }
      renderItem={({ item }) => (
        <TouchableOpacity style={styles.card} onPress={() => router.push(`/staff/technical-assets/${item.id}`)} activeOpacity={0.85}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            {techAssetHasUsageGuide(item) ? (
              <View style={styles.guideBadge}>
                <Ionicons name="school-outline" size={14} color="#1d4ed8" />
              </View>
            ) : null}
          </View>
          <Text style={styles.cardCode}>{item.asset_code}</Text>
          <Text style={styles.cardMeta}>
            {criticalityLabel(item.criticality as TechCriticality)} · {item.status}
          </Text>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  header: { paddingBottom: 12 },
  search: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
    marginBottom: 10,
  },
  filterLabel: { fontSize: 12, fontWeight: '800', color: '#64748b', marginBottom: 6, marginTop: 4 },
  chipRow: { marginBottom: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
    marginRight: 8,
  },
  chipOn: { backgroundColor: '#1a365d' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  chipTextOn: { color: '#fff' },
  list: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  guideBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  cardCode: { fontSize: 13, color: '#64748b', marginTop: 4, fontFamily: 'monospace' },
  cardMeta: { fontSize: 12, color: '#94a3b8', marginTop: 6, textTransform: 'capitalize' },
  empty: { padding: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: '#334155', textAlign: 'center' },
  emptyHint: { fontSize: 14, color: '#64748b', textAlign: 'center', marginTop: 10, lineHeight: 20 },
});
