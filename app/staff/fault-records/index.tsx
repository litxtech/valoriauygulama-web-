import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { useCachedList } from '@/hooks/useCachedList';
import {
  listFaultRecords,
  faultCategoryIcon,
  faultCategoryLabel,
  faultStatusMeta,
  FAULT_RECORD_STATUSES,
  type FaultRecordRow,
  type FaultRecordStatus,
} from '@/lib/faultRecords';

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

export default function FaultRecordsIndex() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<FaultRecordStatus | 'all'>('all');
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    const { data, error } = await listFaultRecords();
    if (error) {
      setLoadError(error.message ?? 'Kayıtlar yüklenemedi');
      return [];
    }
    setLoadError(null);
    return ((data as FaultRecordRow[]) ?? []) as FaultRecordRow[];
  }, []);

  const { items, loading, refreshing, refresh, showList } = useCachedList<FaultRecordRow>({
    cacheKey: 'staff-fault-records-list',
    fetchItems,
  });

  const filtered = useMemo(
    () => (statusFilter === 'all' ? items : items.filter((r) => r.status === statusFilter)),
    [items, statusFilter]
  );

  const openRecord = useCallback(
    (id: string) => router.push(`/staff/fault-records/${id}` as never),
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: FaultRecordRow }) => {
      const meta = faultStatusMeta(item.status);
      return (
        <TouchableOpacity style={styles.card} onPress={() => openRecord(item.id)} activeOpacity={0.85}>
          <View style={[styles.cardIcon, { backgroundColor: `${meta.color}18` }]}>
            <Ionicons name={faultCategoryIcon(item.category) as never} size={22} color={meta.color} />
          </View>
          <View style={styles.cardBody}>
            <View style={styles.cardTopRow}>
              <Text style={styles.cardRoom} numberOfLines={1}>
                {item.room_number ? `Oda ${item.room_number}` : item.location_label || 'Konum belirtilmedi'}
              </Text>
              <View style={[styles.statusPill, { backgroundColor: `${meta.color}18` }]}>
                <Text style={[styles.statusPillText, { color: meta.color }]}>{meta.label}</Text>
              </View>
            </View>
            <Text style={styles.cardDesc} numberOfLines={2}>
              {item.fault_description}
            </Text>
            <View style={styles.cardMetaRow}>
              <Text style={styles.cardMeta}>{faultCategoryLabel(item.category)}</Text>
              <Text style={styles.cardMetaDot}>·</Text>
              <Text style={styles.cardMeta}>{item.record_no ?? ''}</Text>
              <Text style={styles.cardMetaDot}>·</Text>
              <Text style={styles.cardMeta}>{formatDate(item.created_at)}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </TouchableOpacity>
      );
    },
    [openRecord]
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.newBtn} onPress={() => router.push('/staff/fault-records/new' as never)}>
        <Ionicons name="add-circle" size={22} color="#fff" />
        <Text style={styles.newBtnText}>Yeni arıza kaydı</Text>
      </TouchableOpacity>

      <View style={styles.filterRow}>
        <FilterChip label="Tümü" active={statusFilter === 'all'} onPress={() => setStatusFilter('all')} />
        {FAULT_RECORD_STATUSES.map((s) => (
          <FilterChip
            key={s.value}
            label={s.label}
            color={s.color}
            active={statusFilter === s.value}
            onPress={() => setStatusFilter(s.value)}
          />
        ))}
      </View>

      {loading && !items.length ? <ActivityIndicator style={styles.loader} color={theme.colors.primary} /> : null}

      {showList ? (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
          contentContainerStyle={filtered.length ? styles.list : styles.listEmpty}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          ListEmptyComponent={
            loadError ? (
              <Text style={styles.error}>{loadError}</Text>
            ) : (
              <View style={styles.emptyWrap}>
                <Ionicons name="construct-outline" size={40} color={theme.colors.textMuted} />
                <Text style={styles.empty}>Henüz arıza kaydı yok. Giderdiğiniz bir arızayı kaydetmek için yukarıdaki butona dokunun.</Text>
              </View>
            )
          }
        />
      ) : null}
    </View>
  );
}

function FilterChip({
  label,
  active,
  color,
  onPress,
}: {
  label: string;
  active: boolean;
  color?: string;
  onPress: () => void;
}) {
  const tint = color ?? theme.colors.primary;
  return (
    <TouchableOpacity
      style={[styles.chip, active && { backgroundColor: `${tint}18`, borderColor: tint }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.chipText, active && { color: tint, fontWeight: '700' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
  },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.background,
  },
  chipText: { fontSize: 13, color: theme.colors.textSecondary },
  loader: { marginTop: 40 },
  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 28 },
  listEmpty: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  emptyWrap: { alignItems: 'center', gap: 12 },
  empty: { textAlign: 'center', color: theme.colors.textMuted, fontSize: 15, lineHeight: 22 },
  error: { textAlign: 'center', color: '#dc2626', fontSize: 15, lineHeight: 22 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.background,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  cardIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardRoom: { flex: 1, fontSize: 15, fontWeight: '700', color: theme.colors.text },
  statusPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  statusPillText: { fontSize: 12, fontWeight: '700' },
  cardDesc: { marginTop: 4, fontSize: 14, color: theme.colors.textSecondary, lineHeight: 19 },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  cardMeta: { fontSize: 12, color: theme.colors.textMuted },
  cardMetaDot: { fontSize: 12, color: theme.colors.textMuted },
});
