import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';
import { HotelKitchenMenuListCard } from '@/components/hotelKitchenMenu/HotelKitchenMenuListCard';
import { HotelKitchenMenuImageLightbox } from '@/components/hotelKitchenMenu/HotelKitchenMenuImageLightbox';
import { menuUi } from '@/components/hotelKitchenMenu/hotelKitchenMenuUi';
import { usePublicKitchenMenuLive } from '@/hooks/usePublicKitchenMenuRealtime';
import {
  fetchPublicKitchenMenuBySlug,
  invalidatePublicMenuCache,
  type PublicKitchenMenuOrg,
} from '@/lib/publicKitchenMenu';
import { getPublicMenuCache } from '@/lib/publicKitchenMenuCache';
import {
  distinctCategoryTitles,
  isBreakfastCategory,
  type HotelKitchenMenuItemWithImages,
} from '@/lib/hotelKitchenMenu';
import { openHotelMenuLightbox } from '@/lib/openHotelMenuLightbox';
import { scheduleMenuImagePrefetch } from '@/lib/scheduleMenuImagePrefetch';

type MenuSection = { title: string; data: HotelKitchenMenuItemWithImages[] };

type SectionFilter = 'all' | 'breakfast';

function groupByCategory(items: HotelKitchenMenuItemWithImages[]): MenuSection[] {
  const order: string[] = [];
  const map = new Map<string, HotelKitchenMenuItemWithImages[]>();
  for (const item of items) {
    const key = item.category_title.trim() || '—';
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(item);
  }
  return order.map((title) => ({ title, data: map.get(title)! }));
}

type Props = {
  orgSlug: string;
};

const SECTION_LIST_PERF = {
  initialNumToRender: 6,
  maxToRenderPerBatch: 8,
  windowSize: 7,
  removeClippedSubviews: Platform.OS === 'android',
} as const;

export function PublicKitchenMenuScreen({ orgSlug }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const slugKey = orgSlug.trim().toLowerCase();
  const cachedBoot = slugKey ? getPublicMenuCache(slugKey) : null;
  const [org, setOrg] = useState<PublicKitchenMenuOrg | null>(cachedBoot?.org ?? null);
  const [items, setItems] = useState<HotelKitchenMenuItemWithImages[]>(cachedBoot?.items ?? []);
  const [loading, setLoading] = useState(!cachedBoot);
  const [notFound, setNotFound] = useState(false);
  const [section, setSection] = useState<SectionFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [livePulse, setLivePulse] = useState(false);

  const applyBundle = useCallback(
    (bundle: { org: PublicKitchenMenuOrg; items: HotelKitchenMenuItemWithImages[] }) => {
      setOrg(bundle.org);
      setItems(bundle.items);
      setNotFound(false);
      scheduleMenuImagePrefetch(bundle.items);
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.title = `${bundle.org.name} — ${t('hotelKitchenMenuHeroTitle')}`;
      }
    },
    [t]
  );

  const bootstrap = useCallback(
    async (opts?: { silent?: boolean; forceNetwork?: boolean }) => {
      if (!opts?.silent) {
        const hit = getPublicMenuCache(slugKey);
        if (hit) {
          applyBundle(hit);
          setLoading(false);
        } else {
          setLoading(true);
        }
      }
      setNotFound(false);
      try {
        if (opts?.forceNetwork) invalidatePublicMenuCache(slugKey);
        const bundle = await fetchPublicKitchenMenuBySlug(orgSlug, { skipCache: opts?.forceNetwork });
        if (!bundle) {
          if (!getPublicMenuCache(slugKey)) {
            setOrg(null);
            setItems([]);
            setNotFound(true);
          }
          return;
        }
        applyBundle(bundle);
      } catch {
        if (!getPublicMenuCache(slugKey)) {
          setNotFound(true);
          setItems([]);
        }
      } finally {
        setLoading(false);
      }
    },
    [orgSlug, slugKey, applyBundle, org]
  );

  useEffect(() => {
    void bootstrap({ silent: !!cachedBoot });
  }, [bootstrap]);

  const onRealtime = useCallback(() => {
    setLivePulse(true);
    void bootstrap({ silent: true, forceNetwork: true }).finally(() => {
      setTimeout(() => setLivePulse(false), 1200);
    });
  }, [bootstrap]);

  usePublicKitchenMenuLive(org?.id, onRealtime);

  const categories = useMemo(() => distinctCategoryTitles(items), [items]);

  const filtered = useMemo(() => {
    let list = items;
    if (section === 'breakfast') {
      list = list.filter((i) => isBreakfastCategory(i.category_title));
    }
    if (categoryFilter) {
      list = list.filter((i) => i.category_title.trim().toLowerCase() === categoryFilter.toLowerCase());
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.category_title.toLowerCase().includes(q) ||
          (i.description ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [items, section, categoryFilter, search]);

  const sections = useMemo(() => {
    if (filtered.length === 0) return [{ title: '', data: [] as HotelKitchenMenuItemWithImages[] }];
    const q = search.trim();
    if (q || categoryFilter) return [{ title: '', data: filtered }];
    return groupByCategory(filtered);
  }, [filtered, search, categoryFilter]);

  const openImage = useCallback((item: HotelKitchenMenuItemWithImages) => {
    openHotelMenuLightbox(item, setLightbox, 0);
  }, []);

  const renderItem = ({ item }: { item: HotelKitchenMenuItemWithImages }) => (
    <HotelKitchenMenuListCard
      item={item}
      variant="browse"
      onPress={() => openImage(item)}
      onImagePress={() => openImage(item)}
    />
  );

  if (loading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={menuUi.accent} />
        <Text style={styles.loadingHint}>{t('loading')}</Text>
      </View>
    );
  }

  if (notFound || !org) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Ionicons name="qr-code-outline" size={48} color={theme.colors.textMuted} />
        <Text style={styles.notFoundTitle}>{t('publicKitchenMenuNotFoundTitle')}</Text>
        <Text style={styles.notFoundBody}>{t('publicKitchenMenuNotFoundBody')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        {...SECTION_LIST_PERF}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section: sec }) =>
          sec.title ? (
            <View style={styles.sectionHeader}>
              <View style={styles.sectionLine} />
              <Text style={styles.sectionTitle}>{sec.title}</Text>
              <View style={styles.sectionLine} />
            </View>
          ) : null
        }
        ListHeaderComponent={
          <View style={{ paddingTop: insets.top + 6 }}>
            <View style={styles.pageHeader}>
              <Text style={styles.pageTitle}>{org.name}</Text>
              <Text style={styles.pageSub} numberOfLines={1}>
                {t('publicKitchenMenuHeroSub')}
              </Text>
              {livePulse ? (
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>{t('publicKitchenMenuLiveUpdate')}</Text>
                </View>
              ) : (
                <View style={styles.liveBadgeQuiet}>
                  <Ionicons name="radio-outline" size={12} color={menuUi.accentDeep} />
                  <Text style={styles.liveTextQuiet}>{t('publicKitchenMenuLiveHint')}</Text>
                </View>
              )}
              <View style={styles.searchBar}>
                <Ionicons name="search" size={16} color={theme.colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder={t('hotelKitchenMenuSearchPh')}
                  placeholderTextColor={theme.colors.textMuted}
                  value={search}
                  onChangeText={setSearch}
                />
                {search.length > 0 ? (
                  <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            <View style={styles.sectionRow}>
              <TouchableOpacity
                style={[styles.sectionChip, section === 'all' && styles.sectionChipOn]}
                onPress={() => setSection('all')}
              >
                <Text style={[styles.sectionChipText, section === 'all' && styles.sectionChipTextOn]}>
                  {t('hotelKitchenMenuSectionAll')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sectionChip, section === 'breakfast' && styles.sectionChipOn]}
                onPress={() => setSection('breakfast')}
              >
                <Text style={[styles.sectionChipText, section === 'breakfast' && styles.sectionChipTextOn]}>
                  {t('hotelKitchenMenuSectionBreakfast')}
                </Text>
              </TouchableOpacity>
            </View>

            {categories.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catScroll}>
                <TouchableOpacity
                  style={[styles.catChip, !categoryFilter && styles.catChipOn]}
                  onPress={() => setCategoryFilter(null)}
                >
                  <Text style={[styles.catChipText, !categoryFilter && styles.catChipTextOn]}>
                    {t('hotelKitchenMenuAllCategories')}
                  </Text>
                </TouchableOpacity>
                {categories.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.catChip, categoryFilter === c && styles.catChipOn]}
                    onPress={() => setCategoryFilter(categoryFilter === c ? null : c)}
                  >
                    <Text style={[styles.catChipText, categoryFilter === c && styles.catChipTextOn]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : null}

            {filtered.length > 0 ? (
              <Text style={styles.resultCount}>{t('hotelKitchenMenuResultCount', { count: filtered.length })}</Text>
            ) : null}
          </View>
        }
        contentContainerStyle={[
          filtered.length === 0 ? styles.listEmpty : styles.list,
          { paddingBottom: insets.bottom + 24 },
        ]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{t('hotelKitchenMenuEmptyTitle')}</Text>
            <Text style={styles.emptyBody}>{t('hotelKitchenMenuEmptyBody')}</Text>
          </View>
        }
      />

      <HotelKitchenMenuImageLightbox
        visible={!!lightbox}
        urls={lightbox?.urls ?? []}
        initialIndex={lightbox?.index ?? 0}
        onClose={() => setLightbox(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: menuUi.warmBg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: menuUi.warmBg },
  loadingHint: { marginTop: 12, color: theme.colors.textMuted },
  notFoundTitle: { fontSize: 18, fontWeight: '800', marginTop: 16, color: theme.colors.text },
  notFoundBody: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', marginTop: 8 },
  pageHeader: { marginHorizontal: 16, marginBottom: 4 },
  pageTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  pageSub: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginTop: 6,
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#16a34a' },
  liveText: { color: '#15803d', fontSize: 11, fontWeight: '700' },
  liveBadgeQuiet: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  liveTextQuiet: { color: theme.colors.textMuted, fontSize: 11 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: menuUi.cardBg,
    borderRadius: 12,
    paddingHorizontal: 10,
    minHeight: 40,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...menuUi.shadowSm,
  },
  searchInput: { flex: 1, fontSize: 14, color: theme.colors.text, paddingVertical: 6, paddingHorizontal: 8 },
  sectionRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 10 },
  sectionChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: menuUi.cardBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sectionChipOn: { backgroundColor: menuUi.accent, borderColor: menuUi.accent },
  sectionChipText: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary },
  sectionChipTextOn: { color: '#fff' },
  catScroll: { paddingHorizontal: 16, paddingTop: 8, gap: 6 },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: menuUi.cardBg,
    marginRight: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  catChipOn: { backgroundColor: menuUi.accentSoft, borderColor: menuUi.accent },
  catChipText: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary },
  catChipTextOn: { color: menuUi.accentDeep, fontWeight: '700' },
  resultCount: { marginHorizontal: 20, marginTop: 10, fontSize: 13, color: theme.colors.textMuted, fontWeight: '600' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 10,
    gap: 10,
  },
  sectionLine: { flex: 1, height: 1, backgroundColor: 'rgba(184,134,11,0.2)' },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: menuUi.accentDeep, textTransform: 'uppercase' },
  list: { paddingHorizontal: 16 },
  listEmpty: { flexGrow: 1, paddingHorizontal: 16 },
  empty: { alignItems: 'center', paddingTop: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: theme.colors.text },
  emptyBody: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', marginTop: 8 },
});
