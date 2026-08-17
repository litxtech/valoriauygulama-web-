import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Image,
  Platform,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { useCachedList } from '@/hooks/useCachedList';
import {
  listHotelIssueArchive,
  hotelIssueArchiveCategoryIcon,
  hotelIssueArchiveCategoryLabel,
  hotelIssueArchiveCategoryMeta,
  HOTEL_ISSUE_ARCHIVE_CATEGORIES,
  type HotelIssueArchiveRow,
  type HotelIssueArchiveCategory,
} from '@/lib/hotelIssueArchive';

function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function firstThumb(row: HotelIssueArchiveRow): string | null {
  const media = row.media ?? [];
  if (!media.length) return null;
  const sorted = [...media].sort((a, b) => a.sort_order - b.sort_order);
  return sorted[0].thumbnail_url ?? sorted[0].public_url;
}

export default function HotelIssueArchiveIndex() {
  const router = useRouter();
  const [categoryFilter, setCategoryFilter] = useState<HotelIssueArchiveCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    const { data, error } = await listHotelIssueArchive({ search: search.trim() || undefined });
    if (error) {
      setLoadError(error.message ?? 'Kayıtlar yüklenemedi');
      return [];
    }
    setLoadError(null);
    return ((data as HotelIssueArchiveRow[]) ?? []) as HotelIssueArchiveRow[];
  }, [search]);

  const { items, loading, refreshing, refresh, showList } = useCachedList<HotelIssueArchiveRow>({
    cacheKey: 'staff-hotel-issue-archive-list',
    fetchItems,
  });

  const filtered = useMemo(
    () => (categoryFilter === 'all' ? items : items.filter((r) => r.category === categoryFilter)),
    [items, categoryFilter]
  );

  const openRecord = useCallback(
    (id: string) => router.push(`/staff/hotel-issue-archive/${id}` as never),
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: HotelIssueArchiveRow }) => {
      const meta = hotelIssueArchiveCategoryMeta(item.category);
      const thumb = firstThumb(item);
      const creatorRaw = item.creator as { full_name: string | null } | { full_name: string | null }[] | null;
      const creator = Array.isArray(creatorRaw) ? creatorRaw[0] ?? null : creatorRaw ?? null;
      const creatorName = creator?.full_name ?? 'Personel';

      return (
        <TouchableOpacity style={styles.card} onPress={() => openRecord(item.id)} activeOpacity={0.85}>
          {thumb ? (
            <Image source={{ uri: thumb }} style={styles.cardThumb} />
          ) : (
            <View style={[styles.cardThumb, styles.cardThumbEmpty, { backgroundColor: `${meta.color}14` }]}>
              <Ionicons name={hotelIssueArchiveCategoryIcon(item.category) as never} size={22} color={meta.color} />
            </View>
          )}
          <View style={styles.cardBody}>
            <View style={styles.cardTopRow}>
              <Text style={styles.cardLocation} numberOfLines={1}>
                {item.room_number ? `Oda ${item.room_number}` : item.location_label || 'Konum yok'}
              </Text>
              <View style={[styles.catPill, { backgroundColor: `${meta.color}18` }]}>
                <Text style={[styles.catPillText, { color: meta.color }]}>{meta.label.split(' / ')[0]}</Text>
              </View>
            </View>
            <Text style={styles.cardNote} numberOfLines={2}>
              {item.note}
            </Text>
            <View style={styles.cardMetaRow}>
              <Ionicons name="person-outline" size={12} color={theme.colors.textMuted} />
              <Text style={styles.cardMeta}>{creatorName}</Text>
              <Text style={styles.cardMetaDot}>·</Text>
              <Text style={styles.cardMeta}>{formatDateTime(item.created_at)}</Text>
              {item.record_no ? (
                <>
                  <Text style={styles.cardMetaDot}>·</Text>
                  <Text style={styles.cardMeta}>{item.record_no}</Text>
                </>
              ) : null}
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
      <TouchableOpacity
        style={styles.newBtn}
        onPress={() => router.push('/staff/hotel-issue-archive/new' as never)}
      >
        <Ionicons name="camera" size={22} color="#fff" />
        <Text style={styles.newBtnText}>Foto / video kaydet</Text>
      </TouchableOpacity>

      <TextInput
        style={styles.search}
        value={search}
        onChangeText={setSearch}
        placeholder="Ara (not, konum, oda…)"
        placeholderTextColor={theme.colors.textMuted}
        returnKeyType="search"
        onSubmitEditing={() => void refresh()}
      />

      <View style={styles.filterRow}>
        <FilterChip label="Tümü" active={categoryFilter === 'all'} onPress={() => setCategoryFilter('all')} />
        {HOTEL_ISSUE_ARCHIVE_CATEGORIES.map((c) => (
          <FilterChip
            key={c.value}
            label={c.label.split(' / ')[0]}
            color={c.color}
            active={categoryFilter === c.value}
            onPress={() => setCategoryFilter(c.value)}
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
                <Ionicons name="archive-outline" size={40} color={theme.colors.textMuted} />
                <Text style={styles.empty}>
                  Henüz kayıt yok. Gördüğünüz bir sorunu, düzenlemeyi veya notu foto/video ile kaydedin.
                </Text>
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
  search: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
  },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.background,
  },
  chipText: { fontSize: 12, color: theme.colors.textSecondary },
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
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  cardThumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: theme.colors.backgroundSecondary },
  cardThumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardLocation: { flex: 1, fontSize: 15, fontWeight: '700', color: theme.colors.text },
  catPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  catPillText: { fontSize: 11, fontWeight: '700' },
  cardNote: { marginTop: 4, fontSize: 14, color: theme.colors.textSecondary, lineHeight: 19 },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, flexWrap: 'wrap' },
  cardMeta: { fontSize: 11, color: theme.colors.textMuted },
  cardMetaDot: { fontSize: 11, color: theme.colors.textMuted },
});
