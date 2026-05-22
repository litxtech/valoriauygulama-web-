import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  ScrollView,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';
import { HotelKitchenMenuListCard } from '@/components/hotelKitchenMenu/HotelKitchenMenuListCard';
import { HotelKitchenMenuImageLightbox } from '@/components/hotelKitchenMenu/HotelKitchenMenuImageLightbox';
import { menuUi } from '@/components/hotelKitchenMenu/hotelKitchenMenuUi';
import { scheduleMenuImagePrefetch } from '@/lib/scheduleMenuImagePrefetch';
import {
  fetchGuestFavoriteItemIds,
  fetchHotelKitchenMenuForGuest,
  fetchHotelKitchenMenuItems,
  getHotelKitchenMenuCache,
  type HotelKitchenMenuItemWithImages,
} from '@/lib/hotelKitchenMenu';
import {
  buildCategoryChips,
  buildNameTagChips,
  buildProductChips,
  filterMenuItems,
  type MenuSectionFilter,
} from '@/lib/hotelKitchenMenuFilters';
import { openHotelMenuLightbox } from '@/lib/openHotelMenuLightbox';

type MenuSection = { title: string; data: HotelKitchenMenuItemWithImages[] };

type Props = {
  mode: 'guest' | 'staff';
  detailHref: (id: string) => Href;
  manageHref?: Href;
  showManage?: boolean;
};

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

export function HotelKitchenMenuBrowse({ mode, detailHref, manageHref, showManage }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<HotelKitchenMenuItemWithImages[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [section, setSection] = useState<MenuSectionFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [productFilter, setProductFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);

  const cacheKey = 'list:available';

  const applyRows = useCallback(
    (rows: HotelKitchenMenuItemWithImages[], favIds?: Set<string>) => {
      if (mode === 'guest' && favIds) {
        setFavorites(favIds);
      } else if (mode === 'guest') {
        setFavorites(new Set(rows.filter((r) => r.is_favorited).map((r) => r.id)));
      }
      setItems(rows);
      scheduleMenuImagePrefetch(rows);
    },
    [mode]
  );

  const load = useCallback(
    async (opts?: { silent?: boolean; skipCache?: boolean }) => {
      const cached = !opts?.skipCache ? getHotelKitchenMenuCache(cacheKey) : null;
      try {
        if (mode === 'guest') {
          const rows = await fetchHotelKitchenMenuForGuest({
            skipCache: opts?.skipCache,
            withFavorites: false,
          });
          applyRows(rows);
          void fetchGuestFavoriteItemIds()
            .then((favIds) => setFavorites(favIds))
            .catch(() => {});
        } else {
          const rows = await fetchHotelKitchenMenuItems({
            availableOnly: true,
            skipCache: opts?.skipCache,
          });
          applyRows(rows);
        }
      } catch {
        if (!cached?.length) setItems([]);
      }
    },
    [mode, applyRows, cacheKey]
  );

  useFocusEffect(
    useCallback(() => {
      const cached = getHotelKitchenMenuCache(cacheKey);
      if (cached?.length) {
        applyRows(cached);
        setLoading(false);
        void load({ silent: true });
      } else {
        setLoading(true);
        void load({ skipCache: true }).finally(() => setLoading(false));
      }
      return undefined;
    }, [load, cacheKey, applyRows])
  );

  const openImage = useCallback(
    (item: HotelKitchenMenuItemWithImages) => {
      openHotelMenuLightbox(item, setLightbox, 0);
    },
    []
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load({ silent: true, skipCache: true }).catch(() => {});
    setRefreshing(false);
  };

  const categoryChips = useMemo(() => buildCategoryChips(items, section), [items, section]);
  const productChips = useMemo(
    () => buildProductChips(items, section, categoryFilter),
    [items, section, categoryFilter]
  );
  const nameTagChips = useMemo(
    () =>
      productChips.length >= 2
        ? []
        : buildNameTagChips(items, section, categoryFilter, productFilter),
    [items, section, categoryFilter, productFilter, productChips.length]
  );

  const filtered = useMemo(
    () =>
      filterMenuItems({
        items,
        section,
        categoryFilter,
        productFilter,
        tagFilter,
        search,
      }),
    [items, section, categoryFilter, productFilter, tagFilter, search]
  );

  const hasActiveFilters = !!(categoryFilter || productFilter || tagFilter || search.trim());

  const sections = useMemo(() => {
    if (filtered.length === 0) return [{ title: '', data: [] as HotelKitchenMenuItemWithImages[] }];
    if (hasActiveFilters) return [{ title: '', data: filtered }];
    return groupByCategory(filtered);
  }, [filtered, hasActiveFilters]);

  const pickCategory = useCallback((title: string | null) => {
    setCategoryFilter(title);
    setProductFilter(null);
    setTagFilter(null);
  }, []);

  const itemCount = filtered.length;

  const renderItem = ({ item }: { item: HotelKitchenMenuItemWithImages }) => (
    <HotelKitchenMenuListCard
      item={item}
      variant="browse"
      showFavorite={mode === 'guest'}
      favorited={favorites.has(item.id)}
      onPress={() => router.push(detailHref(item.id))}
      onImagePress={() => openImage(item)}
    />
  );

  const ListHeader = (
    <View>
      <View style={styles.pageHeader}>
        <View style={styles.titleRow}>
          <View style={styles.titleIcon}>
            <Ionicons name="restaurant" size={18} color={menuUi.accentDeep} />
          </View>
          <View style={styles.titleTexts}>
            <Text style={styles.pageTitle}>{t('hotelKitchenMenuHeroTitle')}</Text>
            <Text style={styles.pageSub} numberOfLines={1}>
              {t('hotelKitchenMenuIntro')}
            </Text>
          </View>
        </View>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color={theme.colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('hotelKitchenMenuSearchPh')}
            placeholderTextColor={theme.colors.textMuted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 ? (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {showManage && manageHref ? (
        <TouchableOpacity style={styles.manageBtn} onPress={() => router.push(manageHref)} activeOpacity={0.88}>
          <LinearGradient
            colors={[menuUi.accent, menuUi.accentDeep]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.manageBtnGrad}
          >
            <Ionicons name="create-outline" size={20} color="#fff" />
            <Text style={styles.manageBtnText}>{t('hotelKitchenMenuManageCta')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      ) : null}

      <View style={styles.sectionRow}>
        <TouchableOpacity
          style={[styles.sectionChip, section === 'all' && styles.sectionChipOn]}
          onPress={() => setSection('all')}
          activeOpacity={0.85}
        >
          <Ionicons
            name="grid-outline"
            size={16}
            color={section === 'all' ? '#fff' : theme.colors.textSecondary}
          />
          <Text style={[styles.sectionChipText, section === 'all' && styles.sectionChipTextOn]}>
            {t('hotelKitchenMenuSectionAll')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sectionChip, section === 'breakfast' && styles.sectionChipOn]}
          onPress={() => setSection('breakfast')}
          activeOpacity={0.85}
        >
          <Ionicons
            name="sunny-outline"
            size={16}
            color={section === 'breakfast' ? '#fff' : theme.colors.textSecondary}
          />
          <Text style={[styles.sectionChipText, section === 'breakfast' && styles.sectionChipTextOn]}>
            {t('hotelKitchenMenuSectionBreakfast')}
          </Text>
        </TouchableOpacity>
      </View>

      {categoryChips.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catScrollContent}>
          <TouchableOpacity
            style={[styles.catChip, !categoryFilter && styles.catChipOn]}
            onPress={() => pickCategory(null)}
          >
            <Text style={[styles.catChipText, !categoryFilter && styles.catChipTextOn]}>
              {t('hotelKitchenMenuAllCategories')}
            </Text>
          </TouchableOpacity>
          {categoryChips.map((c) => (
            <TouchableOpacity
              key={c.title}
              style={[styles.catChip, categoryFilter === c.title && styles.catChipOn]}
              onPress={() => pickCategory(categoryFilter === c.title ? null : c.title)}
            >
              <Text style={[styles.catChipText, categoryFilter === c.title && styles.catChipTextOn]}>
                {c.title} ({c.count})
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      {productChips.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.catScrollContent, { marginTop: 10 }]}
        >
          {productChips.map((p) => (
            <TouchableOpacity
              key={p.name}
              style={[styles.catChip, productFilter === p.name && styles.catChipOn]}
              onPress={() => {
                setProductFilter(productFilter === p.name ? null : p.name);
                setTagFilter(null);
              }}
            >
              <Text style={[styles.catChipText, productFilter === p.name && styles.catChipTextOn]}>{p.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      {nameTagChips.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.catScrollContent, { marginTop: 10 }]}
        >
          {nameTagChips.map((tag) => (
            <TouchableOpacity
              key={tag.tag}
              style={[styles.catChip, tagFilter === tag.tag && styles.catChipOn]}
              onPress={() => {
                setTagFilter(tagFilter === tag.tag ? null : tag.tag);
                setProductFilter(null);
              }}
            >
              <Text style={[styles.catChipText, tagFilter === tag.tag && styles.catChipTextOn]}>
                {tag.label} ({tag.count})
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      {itemCount > 0 || hasActiveFilters ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <Text style={styles.resultCount}>
            {itemCount > 0 ? t('hotelKitchenMenuResultCount', { count: itemCount }) : ' '}
          </Text>
          {hasActiveFilters ? (
            <TouchableOpacity
              onPress={() => {
                pickCategory(null);
                setSearch('');
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: menuUi.accent }}>
                {t('hotelKitchenMenuClearFilters')}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: menuUi.warmBg }]}>
        <ActivityIndicator size="large" color={menuUi.accent} />
        <Text style={styles.loadingHint}>{t('loading')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        renderSectionHeader={({ section: sec }) =>
          sec.title ? (
            <View style={styles.sectionHeader}>
              <View style={styles.sectionLine} />
              <Text style={styles.sectionTitle}>{sec.title}</Text>
              <View style={styles.sectionLine} />
            </View>
          ) : null
        }
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={ListHeader}
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={7}
        contentContainerStyle={[
          itemCount === 0 ? styles.listEmpty : styles.list,
          { paddingBottom: insets.bottom + 24 },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={menuUi.accent} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="restaurant-outline" size={40} color={menuUi.accent} />
            </View>
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
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingHint: { fontSize: 14, color: theme.colors.textMuted },
  pageHeader: { marginHorizontal: 16, marginTop: 6, marginBottom: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  titleIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: menuUi.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleTexts: { flex: 1, minWidth: 0 },
  pageTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.text, letterSpacing: -0.2 },
  pageSub: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 1 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    backgroundColor: menuUi.cardBg,
    borderRadius: 12,
    paddingHorizontal: 10,
    minHeight: 40,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...menuUi.shadowSm,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.text,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  manageBtn: { marginHorizontal: 16, marginTop: 10, borderRadius: 12, overflow: 'hidden', ...menuUi.shadowSm },
  manageBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  manageBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  sectionRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 10 },
  sectionChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: menuUi.cardBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sectionChipOn: { backgroundColor: menuUi.accent, borderColor: menuUi.accent },
  sectionChipText: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary },
  sectionChipTextOn: { color: '#fff' },
  catScrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 2, gap: 6 },
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
  resultCount: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 2,
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 6,
    paddingHorizontal: 4,
    gap: 10,
  },
  sectionLine: { flex: 1, height: 1, backgroundColor: 'rgba(184,134,11,0.2)' },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: menuUi.accentDeep,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    maxWidth: '50%',
  },
  list: { paddingHorizontal: 16, paddingTop: 4 },
  listEmpty: { flexGrow: 1, paddingHorizontal: 16 },
  empty: { alignItems: 'center', paddingTop: 40, paddingBottom: 48 },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: menuUi.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  emptyBody: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 32,
    lineHeight: 21,
  },
});
