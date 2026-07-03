import { useCallback, useMemo, useState } from 'react';
import { useCachedList } from '@/hooks/useCachedList';
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';
import { fixedAssetStatusLabel, FIXED_ASSET_STATUSES } from '@/lib/fixedAssets';

type AssetRow = {
  id: string;
  category: string;
  name: string;
  location: string;
  status: string;
  quantity: number;
  created_at: string;
  updated_at: string;
  added_by: string;
  adder: { full_name: string | null } | null;
  photos: { photo_url: string }[] | null;
};

const PREVIEW_HEIGHT = 168;

export default function StaffFixedAssetsListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    const { data } = await supabase
      .from('fixed_assets')
      .select(
        'id, category, name, location, status, quantity, created_at, updated_at, added_by, adder:added_by(full_name), photos:fixed_asset_photos(photo_url)'
      )
      .order('updated_at', { ascending: false })
      .order('created_at', { foreignTable: 'photos', ascending: false })
      .limit(120)
      .limit(1, { foreignTable: 'photos' });
    return ((data ?? []) as AssetRow[]) ?? [];
  }, []);

  const { items: assets, loading, refreshing, refresh } = useCachedList<AssetRow>({
    cacheKey: 'staff-fixed-assets-list',
    fetchItems,
  });

  const filtered = useMemo(
    () =>
      assets.filter((a) => {
        const q = search.trim().toLowerCase();
        const searchOk =
          !q ||
          a.name.toLowerCase().includes(q) ||
          (a.category || '').toLowerCase().includes(q) ||
          (a.location || '').toLowerCase().includes(q);
        const statusOk = status === 'all' || a.status === status;
        return searchOk && statusOk;
      }),
    [assets, search, status]
  );

  const fabBottom = 16 + Math.max(insets.bottom, 8);

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={theme.colors.textMuted} />
        <TextInput
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder="Ara…"
          placeholderTextColor={theme.colors.textMuted}
        />
        {search.length > 0 ? (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={12}>
            <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.filterBlock}>
        <Text style={styles.filterLabel}>Durum</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
          {['all', ...FIXED_ASSET_STATUSES.map((s) => s.value)].map((item) => {
            const isAll = item === 'all';
            const chipLabel = isAll ? 'Tümü' : fixedAssetStatusLabel(item);
            const isActive = status === item;
            return (
              <TouchableOpacity
                key={item}
                style={[styles.chip, isActive && styles.chipActive]}
                onPress={() => setStatus(item)}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipText, isActive && styles.chipTextActive]} numberOfLines={1}>
                  {chipLabel}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        style={styles.list}
        contentContainerStyle={[styles.listContent, { paddingBottom: fabBottom + 56 }]}
        data={filtered}
        keyExtractor={(asset) => asset.id}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.primary} />}
        showsVerticalScrollIndicator={false}
        renderItem={({ item: asset }) => {
          const thumb = asset.photos?.[0]?.photo_url;
          return (
            <View key={asset.id} style={styles.card}>
              {thumb ? (
                <TouchableOpacity
                  activeOpacity={0.92}
                  onPress={() => setPreviewUri(thumb)}
                  style={styles.previewTouch}
                >
                  <CachedImage uri={thumb} style={styles.previewImage} contentFit="cover" />
                  <View style={styles.previewHint}>
                    <Ionicons name="expand-outline" size={16} color="#fff" />
                    <Text style={styles.previewHintText}>Tam ekran</Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <View style={styles.previewPlaceholder}>
                  <Ionicons name="image-outline" size={36} color={theme.colors.textMuted} />
                </View>
              )}

              <TouchableOpacity
                style={styles.cardBody}
                onPress={() => router.push(`/staff/demirbaslar/${asset.id}`)}
                activeOpacity={0.85}
              >
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {asset.name}
                </Text>
                <View style={styles.rowBottom}>
                  <View style={[styles.statusPill, statusTone(asset.status)]}>
                    <Text style={styles.statusPillText}>{fixedAssetStatusLabel(asset.status)}</Text>
                  </View>
                  <Text style={styles.rowHint}>
                    Adet {asset.quantity} · {asset.adder?.full_name ?? '—'}
                  </Text>
                </View>
                <View style={styles.cardFooter}>
                  <Text style={styles.detailLink}>Detay</Text>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.primary} />
                </View>
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <Text style={styles.empty}>Demirbaşlar yükleniyor…</Text>
          ) : (
            <Text style={styles.empty}>Kayıt bulunamadı.</Text>
          )
        }
      />

      <TouchableOpacity
        style={[styles.fab, { bottom: fabBottom }]}
        onPress={() => router.push('/staff/demirbaslar/new')}
        activeOpacity={0.92}
      >
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={styles.fabText}>Yeni</Text>
      </TouchableOpacity>

      <ImagePreviewModal visible={!!previewUri} uri={previewUri} onClose={() => setPreviewUri(null)} />
    </View>
  );
}

function statusTone(status: string) {
  switch (status) {
    case 'yerinde':
      return { backgroundColor: theme.colors.success + '22' };
    case 'eksik':
    case 'arizali':
      return { backgroundColor: theme.colors.error + '22' };
    case 'bakimda':
      return { backgroundColor: theme.colors.primary + '22' };
    case 'tasindi':
      return { backgroundColor: theme.colors.textMuted + '22' };
    default:
      return { backgroundColor: theme.colors.borderLight };
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  searchWrap: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  search: { flex: 1, paddingVertical: 10, fontSize: 15, color: theme.colors.text },
  filterBlock: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  filterLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  chipScroll: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    maxWidth: 200,
  },
  chipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  chipText: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  list: { flex: 1 },
  listContent: { padding: 16, gap: 14 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  previewTouch: { position: 'relative' },
  previewImage: {
    width: '100%',
    height: PREVIEW_HEIGHT,
    backgroundColor: theme.colors.borderLight,
  },
  previewHint: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  previewHintText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  previewPlaceholder: {
    width: '100%',
    height: PREVIEW_HEIGHT,
    backgroundColor: theme.colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { padding: 14 },
  rowTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.text },
  rowBottom: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusPillText: { fontSize: 11, fontWeight: '700', color: theme.colors.text },
  rowHint: { fontSize: 12, color: theme.colors.textMuted, flex: 1 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.borderLight,
  },
  detailLink: { fontSize: 14, fontWeight: '700', color: theme.colors.primary },
  empty: { color: theme.colors.textMuted, textAlign: 'center', marginTop: 32, fontSize: 14 },
  fab: {
    position: 'absolute',
    right: 16,
    borderRadius: 24,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    ...theme.shadows.md,
  },
  fabText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
