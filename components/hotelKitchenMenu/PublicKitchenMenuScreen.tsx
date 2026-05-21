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
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';
import { HotelKitchenMenuListCard } from '@/components/hotelKitchenMenu/HotelKitchenMenuListCard';
import { HotelKitchenMenuImageLightbox } from '@/components/hotelKitchenMenu/HotelKitchenMenuImageLightbox';
import { menuUi } from '@/components/hotelKitchenMenu/hotelKitchenMenuUi';
import { usePublicKitchenMenuRealtime } from '@/hooks/usePublicKitchenMenuRealtime';
import {
  fetchPublicKitchenMenuItems,
  fetchPublicKitchenMenuOrg,
  type PublicKitchenMenuOrg,
} from '@/lib/publicKitchenMenu';
import {
  distinctCategoryTitles,
  isBreakfastCategory,
  resolveLightboxUrls,
  coverImageUrl,
  type HotelKitchenMenuItemWithImages,
} from '@/lib/hotelKitchenMenu';
import { prefetchImageUrls } from '@/lib/prefetchImageUrls';

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

export function PublicKitchenMenuScreen({ orgSlug }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [org, setOrg] = useState<PublicKitchenMenuOrg | null>(null);
  const [items, setItems] = useState<HotelKitchenMenuItemWithImages[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [section, setSection] = useState<SectionFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [livePulse, setLivePulse] = useState(false);

  const loadItems = useCallback(async (organizationId: string) => {
    const rows = await fetchPublicKitchenMenuItems(organizationId);
    setItems(rows);
    prefetchImageUrls(rows.map((r) => coverImageUrl(r)), 32);
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    try {
      const row = await fetchPublicKitchenMenuOrg(orgSlug);
      if (!row) {
        setOrg(null);
        setItems([]);
        setNotFound(true);
        return;
      }
      setOrg(row);
      await loadItems(row.id);
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.title = `${row.name} — ${t('hotelKitchenMenuHeroTitle')}`;
      }
    } catch {
      setNotFound(true);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [orgSlug, loadItems, t]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const onRealtime = useCallback(() => {
    if (!org?.id) return;
    setLivePulse(true);
    void loadItems(org.id).finally(() => {
      setTimeout(() => setLivePulse(false), 1200);
    });
  }, [org?.id, loadItems]);

  usePublicKitchenMenuRealtime(org?.id, onRealtime);

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

  const openImage = useCallback(async (item: HotelKitchenMenuItemWithImages) => {
    const urls = await resolveLightboxUrls(item);
    if (urls.length) setLightbox({ urls, index: 0 });
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
          <View>
            <LinearGradient
              colors={[...menuUi.heroGradient]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.hero, { paddingTop: insets.top + 12 }]}
            >
              <Text style={styles.heroTitle}>{org.name}</Text>
              <Text style={styles.heroSub}>{t('publicKitchenMenuHeroSub')}</Text>
              {livePulse ? (
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>{t('publicKitchenMenuLiveUpdate')}</Text>
                </View>
              ) : (
                <View style={styles.liveBadgeQuiet}>
                  <Ionicons name="radio-outline" size={14} color="rgba(255,255,255,0.85)" />
                  <Text style={styles.liveTextQuiet}>{t('publicKitchenMenuLiveHint')}</Text>
                </View>
              )}
              <View style={styles.searchRow}>
                <Ionicons name="search" size={18} color="rgba(255,255,255,0.9)" />
                <TextInput
                  style={styles.searchInput}
                  placeholder={t('hotelKitchenMenuSearchPh')}
                  placeholderTextColor="rgba(255,255,255,0.55)"
                  value={search}
                  onChangeText={setSearch}
                />
              </View>
            </LinearGradient>

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
  hero: { marginHorizontal: 16, marginTop: 8, borderRadius: 22, paddingHorizontal: 20, paddingBottom: 18, ...menuUi.shadow },
  heroTitle: { fontSize: 24, fontWeight: '800', color: '#fff' },
  heroSub: { fontSize: 14, color: 'rgba(255,255,255,0.88)', marginTop: 6, lineHeight: 20 },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 10,
    backgroundColor: 'rgba(34,197,94,0.35)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ade80' },
  liveText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  liveBadgeQuiet: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  liveTextQuiet: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  searchInput: { flex: 1, fontSize: 15, color: '#fff', paddingVertical: 10, paddingHorizontal: 8 },
  sectionRow: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 14 },
  sectionChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: menuUi.cardBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sectionChipOn: { backgroundColor: menuUi.accent, borderColor: menuUi.accent },
  sectionChipText: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary },
  sectionChipTextOn: { color: '#fff' },
  catScroll: { paddingHorizontal: 16, paddingTop: 10, gap: 8 },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
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
