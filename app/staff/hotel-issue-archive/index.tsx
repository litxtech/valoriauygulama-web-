import { memo, useCallback, useEffect, useMemo, useState, type ComponentProps } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@/constants/theme';
import { PressableScale } from '@/components/premium/PressableScale';
import { useCachedList } from '@/hooks/useCachedList';
import { HotelIssueArchiveRecordCard } from '@/components/hotelIssueArchive/HotelIssueArchiveRecordCard';
import {
  listHotelIssueArchive,
  HOTEL_ISSUE_ARCHIVE_CATEGORIES,
  type HotelIssueArchiveRow,
  type HotelIssueArchiveCategory,
} from '@/lib/hotelIssueArchive';

const SEARCH_DEBOUNCE_MS = 400;
const ACCENT = '#7c3aed';

export default function HotelIssueArchiveIndex() {
  const router = useRouter();
  const [categoryFilter, setCategoryFilter] = useState<HotelIssueArchiveCategory | 'all'>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchItems = useCallback(async () => {
    const { data, error } = await listHotelIssueArchive({ search: search || undefined });
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

  const counts = useMemo(() => {
    const base: Record<string, number> = { all: items.length };
    for (const c of HOTEL_ISSUE_ARCHIVE_CATEGORIES) base[c.value] = 0;
    for (const row of items) base[row.category] = (base[row.category] ?? 0) + 1;
    return base;
  }, [items]);

  const openRecord = useCallback(
    (id: string) => router.push(`/staff/hotel-issue-archive/${id}` as never),
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: HotelIssueArchiveRow }) => (
      <ArchiveRow item={item} onPress={() => openRecord(item.id)} />
    ),
    [openRecord]
  );

  const header = useMemo(
    () => (
      <View>
        <LinearGradient
          colors={['#1e1b4b', '#312e81', '#4c1d95']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroTop}>
            <View style={styles.heroIcon}>
              <Ionicons name="archive" size={22} color="#c4b5fd" />
            </View>
            <PressableScale style={styles.addBtn} onPress={() => router.push('/staff/hotel-issue-archive/new' as never)}>
              <Ionicons name="camera" size={18} color="#1e1b4b" />
              <Text style={styles.addBtnText}>Kaydet</Text>
            </PressableScale>
          </View>
          <Text style={styles.heroTitle}>Otel Sorun Arşivi</Text>
          <Text style={styles.heroSub}>Foto, video ve notlarla otel durumlarını belgeleyin</Text>
        </LinearGradient>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsRow}>
          <StatPill label="Toplam" value={counts.all} color="#fff" icon="layers-outline" active={categoryFilter === 'all'} onPress={() => setCategoryFilter('all')} />
          {HOTEL_ISSUE_ARCHIVE_CATEGORIES.map((c) => (
            <StatPill
              key={c.value}
              label={c.label.split(' / ')[0]}
              value={counts[c.value] ?? 0}
              color={c.color}
              icon={c.icon as ComponentProps<typeof Ionicons>['name']}
              active={categoryFilter === c.value}
              onPress={() => setCategoryFilter(categoryFilter === c.value ? 'all' : c.value)}
            />
          ))}
        </ScrollView>

        <View style={styles.searchCard}>
          <Ionicons name="search" size={18} color={theme.colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder="Not, konum veya oda ara…"
            placeholderTextColor={theme.colors.textMuted}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchInput.length > 0 ? (
            <PressableScale onPress={() => setSearchInput('')}>
              <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
            </PressableScale>
          ) : null}
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Kayıtlar</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{filtered.length}</Text>
          </View>
        </View>

        {loadError ? <Text style={styles.error}>{loadError}</Text> : null}
        {!loading && filtered.length === 0 ? (
          <View style={styles.emptyBox}>
            <View style={styles.emptyIcon}>
              <Ionicons name="cloud-upload-outline" size={28} color={ACCENT} />
            </View>
            <Text style={styles.emptyTitle}>Henüz kayıt yok</Text>
            <Text style={styles.emptyHint}>
              Gördüğünüz bir sorunu, düzenlemeyi veya durumu foto/video ile kaydedin.
            </Text>
          </View>
        ) : null}
      </View>
    ),
    [counts, searchInput, categoryFilter, filtered.length, loadError, loading, router]
  );

  return (
    <View style={styles.root}>
      {loading && !items.length ? (
        <ActivityIndicator style={styles.loader} color={ACCENT} />
      ) : null}
      {showList ? (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          ListHeaderComponent={header}
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ACCENT} />}
        />
      ) : null}
    </View>
  );
}

const ArchiveRow = memo(function ArchiveRow({
  item,
  onPress,
}: {
  item: HotelIssueArchiveRow;
  onPress: () => void;
}) {
  return <HotelIssueArchiveRecordCard item={item} onPress={onPress} />;
});

function StatPill({
  label,
  value,
  color,
  icon,
  active,
  onPress,
}: {
  label: string;
  value: number;
  color: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  active: boolean;
  onPress: () => void;
}) {
  const tint = color === '#fff' ? ACCENT : color;
  return (
    <PressableScale
      style={[styles.statPill, active && { borderColor: tint, backgroundColor: `${tint}12` }]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={14} color={tint} />
      <Text style={[styles.statValue, { color: tint }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  loader: { marginTop: 48 },
  list: { padding: 16, paddingBottom: 40 },
  hero: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    overflow: 'hidden',
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(196,181,253,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  heroSub: { fontSize: 13, color: '#c4b5fd', marginTop: 4, lineHeight: 18 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#c4b5fd',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  addBtnText: { color: '#1e1b4b', fontWeight: '800', fontSize: 13 },
  statsRow: { gap: 8, paddingBottom: 12 },
  statPill: {
    minWidth: 88,
    backgroundColor: theme.colors.background,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    alignItems: 'center',
    gap: 2,
    ...theme.shadows.sm,
  },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 10, color: theme.colors.textMuted, fontWeight: '600', textAlign: 'center' },
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.background,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    marginBottom: 12,
    ...theme.shadows.sm,
  },
  searchInput: { flex: 1, fontSize: 15, color: theme.colors.text, padding: 0 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.text },
  countBadge: {
    backgroundColor: `${ACCENT}18`,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countBadgeText: { fontSize: 12, fontWeight: '800', color: ACCENT },
  error: { color: '#dc2626', fontSize: 14, marginBottom: 8 },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: `${ACCENT}12`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  emptyHint: { marginTop: 6, fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
