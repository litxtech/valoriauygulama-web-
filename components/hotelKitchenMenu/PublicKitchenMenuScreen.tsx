import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';
import { PublicKitchenMenuDishCard } from '@/components/hotelKitchenMenu/PublicKitchenMenuDishCard';
import { HotelKitchenMenuImageLightbox } from '@/components/hotelKitchenMenu/HotelKitchenMenuImageLightbox';
import { menuUi } from '@/components/hotelKitchenMenu/hotelKitchenMenuUi';
import { usePublicKitchenMenuLive, type PublicMenuLiveEvent } from '@/hooks/usePublicKitchenMenuRealtime';
import {
  fetchPublicKitchenMenuBySlug,
  invalidatePublicMenuCache,
  type PublicKitchenMenuOrg,
} from '@/lib/publicKitchenMenu';
import { getPublicMenuCache, setPublicMenuCache } from '@/lib/publicKitchenMenuCache';
import type { HotelKitchenMenuItemWithImages } from '@/lib/hotelKitchenMenu';
import {
  buildCategoryChips,
  buildNameTagChips,
  buildProductChips,
  filterMenuItems,
  type MenuSectionFilter,
} from '@/lib/hotelKitchenMenuFilters';
import { KitchenMenuUpdatedToast } from '@/components/hotelKitchenMenu/KitchenMenuUpdatedToast';
import { PublicKitchenMenuWebLayout } from '@/components/hotelKitchenMenu/PublicKitchenMenuWebLayout';
import { openHotelMenuLightbox } from '@/lib/openHotelMenuLightbox';
import { scheduleMenuImagePrefetch } from '@/lib/scheduleMenuImagePrefetch';
import { prefetchImageUrls } from '@/lib/prefetchImageUrls';
import { resolvePromoVideoPoster } from '@/lib/kitchenMenuPromoVideo';
import {
  cartLineFromItem,
  clearPublicMenuCart,
  loadPublicMenuCart,
  mergeCartLine,
  savePublicMenuCart,
  setCartQuantity,
  syncPublicMenuCartLines,
  type PublicMenuCartLine,
} from '@/lib/publicKitchenMenuCart';
import {
  applyPublicMenuLang,
  readPublicMenuLang,
  type PublicMenuLang,
} from '@/lib/publicKitchenMenuLang';
import {
  localizedCategoryLabel,
  localizedProductLabel,
  resolveKitchenMenuCategoryTitle,
} from '@/lib/kitchenMenuI18n';
import { resolveKitchenMenuTheme } from '@/lib/kitchenMenuTheme';
import {
  fetchPublicKitchenMenuOrderByPayment,
  rememberPublicKitchenMenuOrder,
} from '@/lib/publicKitchenMenuOrderHistory';

type Props = {
  orgSlug: string;
};

function groupByCategory(items: HotelKitchenMenuItemWithImages[]): { title: string; items: HotelKitchenMenuItemWithImages[] }[] {
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
  return order.map((title) => ({ title, items: map.get(title)! }));
}

export function PublicKitchenMenuScreen({ orgSlug }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const slugKey = orgSlug.trim().toLowerCase();
  const cachedBoot = slugKey ? getPublicMenuCache(slugKey) : null;

  const [org, setOrg] = useState<PublicKitchenMenuOrg | null>(cachedBoot?.org ?? null);
  const [items, setItems] = useState<HotelKitchenMenuItemWithImages[]>(cachedBoot?.items ?? []);
  const [loading, setLoading] = useState(!cachedBoot);
  const [notFound, setNotFound] = useState(false);
  const [section, setSection] = useState<MenuSectionFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [productFilter, setProductFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [updateToast, setUpdateToast] = useState(false);
  const [updateToastKind, setUpdateToastKind] = useState<'new_item' | 'updated'>('updated');
  const [menuLang, setMenuLang] = useState<PublicMenuLang>('tr');
  const [cartLines, setCartLines] = useState<PublicMenuCartLine[]>([]);
  const [paymentBanner, setPaymentBanner] = useState<'success' | 'cancel' | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    if (!isWeb) return;
    const lang = readPublicMenuLang();
    setMenuLang(lang);
    void applyPublicMenuLang(lang);
  }, [isWeb]);

  useEffect(() => {
    if (!slugKey) return;
    setCartLines(loadPublicMenuCart(slugKey));
  }, [slugKey]);

  useEffect(() => {
    if (!slugKey || !isWeb) return;
    savePublicMenuCart(slugKey, cartLines);
  }, [slugKey, cartLines, isWeb]);

  useEffect(() => {
    if (!isWeb || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    if (payment === 'success' || payment === 'cancel') {
      setPaymentBanner(payment);
      if (payment === 'success' && slugKey) {
        clearPublicMenuCart(slugKey);
        setCartLines([]);
        const orderId = params.get('order');
        const paymentId = params.get('id');
        const token = params.get('token');
        if (orderId) {
          rememberPublicKitchenMenuOrder(slugKey, orderId);
        } else if (paymentId && token) {
          void fetchPublicKitchenMenuOrderByPayment(slugKey, paymentId, token)
            .then((order) => {
              if (order?.id) rememberPublicKitchenMenuOrder(slugKey, order.id);
            })
            .catch(() => {});
        }
      }
      params.delete('payment');
      params.delete('id');
      params.delete('token');
      params.delete('order');
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
      window.history.replaceState({}, '', next);
    }
  }, [isWeb, slugKey]);

  const handleMenuLangChange = useCallback((lang: PublicMenuLang) => {
    setMenuLang(lang);
    void applyPublicMenuLang(lang);
  }, []);

  const handleAddToCart = useCallback((item: HotelKitchenMenuItemWithImages) => {
    setCartLines((prev) => mergeCartLine(prev, cartLineFromItem(item, 1, menuLang)));
  }, [menuLang]);

  const handleUpdateCartQuantity = useCallback((itemId: string, quantity: number) => {
    setCartLines((prev) => setCartQuantity(prev, itemId, quantity));
  }, []);

  const handleCartCleared = useCallback(() => {
    setCartLines([]);
  }, []);

  const webColumns = width >= 1080 ? 2 : 1;
  const webColumnGap = 14;
  const webContentMax = webColumns === 2 ? 920 : 640;

  const applyBundle = useCallback(
    (bundle: { org: PublicKitchenMenuOrg; items: HotelKitchenMenuItemWithImages[] }) => {
      setOrg(bundle.org);
      setItems(bundle.items);
      setNotFound(false);
      setCartLines((prev) => syncPublicMenuCartLines(prev, bundle.items, menuLang));
      scheduleMenuImagePrefetch(bundle.items);
      const theme = resolveKitchenMenuTheme(bundle.org.kitchen_menu_public_theme, {
        heroTitle: t('hotelKitchenMenuHeroTitle'),
        heroSubtitle: t('publicKitchenMenuHeroSub'),
      });
      prefetchImageUrls(
        theme.promoVideos.map((v) => resolvePromoVideoPoster(v)),
        8
      );
      if (isWeb && typeof document !== 'undefined') {
        document.title = `${bundle.org.name} — ${t('hotelKitchenMenuHeroTitle')}`;
      }
    },
    [t, isWeb, menuLang]
  );

  useEffect(() => {
    if (!items.length) return;
    setCartLines((prev) => syncPublicMenuCartLines(prev, items, menuLang));
  }, [menuLang, items]);

  const bootstrap = useCallback(
    async (opts?: { silent?: boolean; forceNetwork?: boolean; cacheOnly?: boolean }) => {
      const cached = !opts?.forceNetwork ? getPublicMenuCache(slugKey) : null;
      if (cached) {
        applyBundle(cached);
        setLoading(false);
        if (opts?.cacheOnly) return;
      } else if (!opts?.silent) {
        setLoading(true);
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
    [orgSlug, slugKey, applyBundle]
  );

  useEffect(() => {
    if (!slugKey) {
      setLoading(false);
      return;
    }
    if (cachedBoot) {
      void bootstrap({ silent: true, cacheOnly: true });
      if (typeof window !== 'undefined' && typeof requestIdleCallback === 'function') {
        const id = requestIdleCallback(() => void bootstrap({ silent: true }), { timeout: 400 });
        return () => cancelIdleCallback(id);
      }
      void bootstrap({ silent: true });
      return;
    }
    void bootstrap({ silent: false });
  }, [bootstrap, slugKey, cachedBoot]);

  const refreshForNewItems = useCallback(async () => {
    if (!slugKey) return;
    try {
      const bundle = await fetchPublicKitchenMenuBySlug(orgSlug, { skipCache: true });
      if (!bundle) return;
      const prevIds = new Set(itemsRef.current.map((i) => i.id));
      const hasNew = bundle.items.some((i) => !prevIds.has(i.id));
      if (!hasNew) return;
      setPublicMenuCache(slugKey, bundle);
      applyBundle(bundle);
      setUpdateToastKind('new_item');
      setUpdateToast(true);
    } catch {
      /* ağ hatası — mevcut menüyü bozma */
    }
  }, [applyBundle, orgSlug, slugKey]);

  const onLiveEvent = useCallback(
    (_event: PublicMenuLiveEvent) => {
      void refreshForNewItems();
    },
    [refreshForNewItems]
  );

  usePublicKitchenMenuLive(org?.id, onLiveEvent);

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

  const menuTheme = useMemo(
    () =>
      resolveKitchenMenuTheme(org?.kitchen_menu_public_theme, {
        heroTitle: t('hotelKitchenMenuHeroTitle'),
        heroSubtitle: t('publicKitchenMenuHeroSub'),
      }),
    [org?.kitchen_menu_public_theme, t]
  );

  const grouped = useMemo(() => {
    if (hasActiveFilters) return [{ title: '', items: filtered }];
    return groupByCategory(filtered);
  }, [filtered, hasActiveFilters]);

  const pickCategory = useCallback((title: string | null) => {
    setCategoryFilter(title);
    setProductFilter(null);
    setTagFilter(null);
  }, []);

  const openImage = useCallback((item: HotelKitchenMenuItemWithImages) => {
    openHotelMenuLightbox(item, setLightbox, 0);
  }, []);

  if (loading) {
    if (isWeb) {
      return (
        <View style={styles.webLoading}>
          <LinearGradient colors={[...menuUi.webHeroGradient]} style={styles.webLoadingHero}>
            <View style={styles.webLoadingHeroInner}>
              <View style={styles.skeletonLineLg} />
              <View style={styles.skeletonLineMd} />
              <View style={styles.skeletonSearch} />
            </View>
          </LinearGradient>
          <View style={styles.webLoadingBody}>
            <ActivityIndicator size="large" color={menuUi.accent} />
            <Text style={styles.loadingHint}>{t('loading')}</Text>
          </View>
        </View>
      );
    }
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={menuUi.accent} />
        <Text style={styles.loadingHint}>{t('loading')}</Text>
      </View>
    );
  }

  if (!slugKey || notFound || !org) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Ionicons name="qr-code-outline" size={48} color={menuUi.navyMid} />
        <Text style={styles.notFoundTitle}>{t('publicKitchenMenuNotFoundTitle')}</Text>
        <Text style={styles.notFoundBody}>{t('publicKitchenMenuNotFoundBody')}</Text>
      </View>
    );
  }

  if (isWeb) {
    return (
      <PublicKitchenMenuWebLayout
        orgSlug={slugKey}
        org={org}
        items={items}
        filtered={filtered}
        grouped={grouped}
        section={section}
        setSection={setSection}
        categoryFilter={categoryFilter}
        pickCategory={pickCategory}
        categoryChips={categoryChips}
        productFilter={productFilter}
        setProductFilter={setProductFilter}
        productChips={productChips}
        tagFilter={tagFilter}
        setTagFilter={setTagFilter}
        nameTagChips={nameTagChips}
        search={search}
        setSearch={setSearch}
        hasActiveFilters={hasActiveFilters}
        updateToast={updateToast}
        updateToastKind={updateToastKind}
        onUpdateToastHidden={() => setUpdateToast(false)}
        menuLang={menuLang}
        onMenuLangChange={handleMenuLangChange}
        cartLines={cartLines}
        onAddToCart={handleAddToCart}
        onUpdateCartQuantity={handleUpdateCartQuantity}
        onCartCleared={handleCartCleared}
        paymentBanner={paymentBanner}
        onDismissPaymentBanner={() => setPaymentBanner(null)}
        menuTheme={menuTheme}
      />
    );
  }

  const header = (
    <LinearGradient colors={[...menuUi.heroGradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      <View
        style={[
          styles.heroInner,
          { paddingTop: insets.top + (isWeb ? 24 : 12) },
          isWeb && { maxWidth: webContentMax + 80, alignSelf: 'center', width: '100%' },
        ]}
      >
        <View style={styles.heroBrand}>
          <View style={styles.heroIcon}>
            <Ionicons name="restaurant" size={isWeb ? 20 : 22} color={menuUi.accentLight} />
          </View>
          <View style={styles.heroTexts}>
            <Text style={[styles.heroHotel, isWeb && styles.heroHotelWeb]}>{org.name}</Text>
            <Text style={styles.heroTagline}>{t('hotelKitchenMenuHeroTitle')}</Text>
            {isWeb && items.length > 0 ? (
              <Text style={styles.heroMeta}>
                {t('hotelKitchenMenuResultCount', { count: items.length })}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color="rgba(255,255,255,0.65)" />
          <TextInput
            style={styles.searchInput}
            placeholder={t('hotelKitchenMenuSearchPh')}
            placeholderTextColor="rgba(255,255,255,0.5)"
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 ? (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={10}>
              <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </LinearGradient>
  );

  const filters = (
    <View style={[styles.filtersPanel, isWeb && styles.filtersPanelWeb]}>
      <View style={styles.sectionRow}>
        <TouchableOpacity
          style={[styles.sectionChip, section === 'all' && styles.sectionChipOn]}
          onPress={() => setSection('all')}
        >
          <Ionicons name="grid-outline" size={15} color={section === 'all' ? menuUi.navy : '#64748b'} />
          <Text style={[styles.sectionChipText, section === 'all' && styles.sectionChipTextOn]}>
            {t('hotelKitchenMenuSectionAll')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sectionChip, section === 'breakfast' && styles.sectionChipOn]}
          onPress={() => setSection('breakfast')}
        >
          <Ionicons name="sunny-outline" size={15} color={section === 'breakfast' ? menuUi.navy : '#64748b'} />
          <Text style={[styles.sectionChipText, section === 'breakfast' && styles.sectionChipTextOn]}>
            {t('hotelKitchenMenuSectionBreakfast')}
          </Text>
        </TouchableOpacity>
      </View>

      {categoryChips.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catScroll}
          style={styles.catScrollView}
        >
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
                {localizedCategoryLabel(items, c.title, menuLang)}
              </Text>
              <View style={[styles.countBadge, categoryFilter === c.title && styles.countBadgeOn]}>
                <Text style={[styles.countBadgeText, categoryFilter === c.title && styles.countBadgeTextOn]}>
                  {c.count}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      {productChips.length > 0 ? (
        <View style={styles.subFilterBlock}>
          <Text style={styles.subFilterLabel}>{t('hotelKitchenMenuFilterVarieties')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catScroll}>
            {productChips.map((p) => (
              <TouchableOpacity
                key={p.name}
                style={[styles.productChip, productFilter === p.name && styles.productChipOn]}
                onPress={() => {
                  setProductFilter(productFilter === p.name ? null : p.name);
                  setTagFilter(null);
                }}
              >
                <Text style={[styles.productChipText, productFilter === p.name && styles.productChipTextOn]}>
                  {localizedProductLabel(items, p.name, menuLang)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {nameTagChips.length > 0 ? (
        <View style={styles.subFilterBlock}>
          <Text style={styles.subFilterLabel}>{t('hotelKitchenMenuFilterKeywords')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catScroll}>
            {nameTagChips.map((tag) => (
              <TouchableOpacity
                key={tag.tag}
                style={[styles.tagChip, tagFilter === tag.tag && styles.tagChipOn]}
                onPress={() => {
                  setTagFilter(tagFilter === tag.tag ? null : tag.tag);
                  setProductFilter(null);
                }}
              >
                <Text style={[styles.tagChipText, tagFilter === tag.tag && styles.tagChipTextOn]}>
                  {tag.label}
                </Text>
                <Text style={[styles.tagChipCount, tagFilter === tag.tag && styles.tagChipCountOn]}>
                  {tag.count}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.filterFooter}>
        {filtered.length > 0 ? (
          <Text style={styles.resultCount}>{t('hotelKitchenMenuResultCount', { count: filtered.length })}</Text>
        ) : (
          <View style={styles.resultCount} />
        )}
        {hasActiveFilters ? (
          <TouchableOpacity
            onPress={() => {
              pickCategory(null);
              setProductFilter(null);
              setTagFilter(null);
              setSearch('');
            }}
            hitSlop={8}
          >
            <Text style={styles.clearFilters}>{t('hotelKitchenMenuClearFilters')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <KitchenMenuUpdatedToast
        visible={updateToast}
        kind={updateToastKind}
        onHidden={() => setUpdateToast(false)}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={isWeb}
        stickyHeaderIndices={isWeb ? undefined : undefined}
      >
        {header}
        <View style={[styles.body, isWeb && styles.bodyWeb, isWeb && { maxWidth: webContentMax + 40 }]}>
          {filters}

          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="restaurant-outline" size={36} color={menuUi.accent} />
              </View>
              <Text style={styles.emptyTitle}>{t('hotelKitchenMenuEmptyTitle')}</Text>
              <Text style={styles.emptyBody}>{t('hotelKitchenMenuEmptyBody')}</Text>
            </View>
          ) : (
            grouped.map((grp) => (
              <View key={grp.title || 'all'} style={styles.categoryBlock}>
                {grp.title ? (
                  <View style={styles.categoryHead}>
                    <View style={styles.categoryDot} />
                    <Text style={styles.categoryTitle}>
                      {resolveKitchenMenuCategoryTitle(grp.items[0]!, menuLang)}
                    </Text>
                    <View style={styles.categoryLine} />
                  </View>
                ) : null}
                <View
                  style={[
                    isWeb ? styles.webMenuGrid : styles.nativeList,
                    isWeb && webColumns === 2 && { gap: webColumnGap },
                  ]}
                >
                  {grp.items.map((item) => (
                    <View
                      key={item.id}
                      style={
                        isWeb
                          ? webColumns === 2
                            ? styles.webMenuCell2
                            : styles.webMenuCell1
                          : styles.nativeListItem
                      }
                    >
                      <PublicKitchenMenuDishCard
                        item={item}
                        layout={isWeb ? 'compact' : 'list'}
                        displayLang={menuLang}
                        onPress={() => openImage(item)}
                        onImagePress={() => openImage(item)}
                      />
                    </View>
                  ))}
                </View>
              </View>
            ))
          )}
        </View>

        {isWeb ? (
          <View style={styles.footer}>
            <Text style={styles.footerText}>{org.name}</Text>
            <Text style={styles.footerSub}>{t('hotelKitchenMenuHeroTitle')}</Text>
          </View>
        ) : null}
      </ScrollView>

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
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: menuUi.warmBg },
  loadingHint: { marginTop: 12, color: theme.colors.textMuted },
  notFoundTitle: { fontSize: 18, fontWeight: '800', marginTop: 16, color: menuUi.navy },
  notFoundBody: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', marginTop: 8, maxWidth: 320 },
  hero: { width: '100%' },
  heroInner: { paddingHorizontal: 20, paddingBottom: 22 },
  heroBrand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(184, 134, 11, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(212, 168, 75, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTexts: { flex: 1, minWidth: 0 },
  heroHotel: { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  heroHotelWeb: { fontSize: 22, letterSpacing: -0.3 },
  heroTagline: { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 4, fontWeight: '600' },
  heroMeta: { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 6, fontWeight: '600' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 48,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
    paddingVertical: Platform.OS === 'web' ? 10 : 8,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  body: { paddingHorizontal: 16, paddingTop: 4 },
  bodyWeb: {
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 20,
  },
  filtersPanel: {
    backgroundColor: menuUi.cardBg,
    borderRadius: 16,
    padding: 14,
    marginTop: -12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: menuUi.border,
    ...menuUi.shadowSm,
  },
  filtersPanelWeb: {
    marginTop: -16,
    marginBottom: 16,
    borderRadius: 18,
    padding: 16,
    ...(Platform.OS === 'web'
      ? ({
          position: 'sticky',
          top: 12,
          zIndex: 20,
          backdropFilter: 'blur(10px)',
          backgroundColor: 'rgba(255,255,255,0.94)',
        } as object)
      : {}),
  },
  sectionRow: { flexDirection: 'row', gap: 10 },
  sectionChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: menuUi.warmBg,
    borderWidth: 1,
    borderColor: menuUi.border,
  },
  sectionChipOn: { backgroundColor: menuUi.accentSoft, borderColor: menuUi.accent },
  sectionChipText: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  sectionChipTextOn: { color: menuUi.navy, fontWeight: '800' },
  catScrollView: { marginTop: 12 },
  catScroll: { gap: 8, paddingRight: 8 },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: menuUi.warmBg,
    borderWidth: 1,
    borderColor: menuUi.border,
  },
  catChipOn: { backgroundColor: menuUi.navy, borderColor: menuUi.navy },
  catChipText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  catChipTextOn: { color: '#fff', fontWeight: '700' },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(100,116,139,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  countBadgeOn: { backgroundColor: 'rgba(255,255,255,0.22)' },
  countBadgeText: { fontSize: 11, fontWeight: '800', color: '#64748b' },
  countBadgeTextOn: { color: '#fff' },
  subFilterBlock: { marginTop: 12 },
  subFilterLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    paddingLeft: 2,
  },
  productChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: menuUi.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(184, 134, 11, 0.35)',
    marginRight: 8,
  },
  productChipOn: { backgroundColor: menuUi.accent, borderColor: menuUi.accent },
  productChipText: { fontSize: 13, fontWeight: '700', color: menuUi.navy },
  productChipTextOn: { color: '#fff' },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: menuUi.warmBg,
    borderWidth: 1,
    borderColor: menuUi.border,
    marginRight: 8,
  },
  tagChipOn: { backgroundColor: menuUi.navyMid, borderColor: menuUi.navyMid },
  tagChipText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  tagChipTextOn: { color: '#fff', fontWeight: '700' },
  tagChipCount: { fontSize: 11, fontWeight: '800', color: '#94a3b8' },
  tagChipCountOn: { color: 'rgba(255,255,255,0.85)' },
  filterFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 12,
  },
  resultCount: { fontSize: 13, color: '#64748b', fontWeight: '600', flex: 1 },
  clearFilters: { fontSize: 13, fontWeight: '700', color: menuUi.accent },
  categoryBlock: { marginTop: Platform.OS === 'web' ? 8 : 20 },
  categoryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: Platform.OS === 'web' ? 10 : 14,
    marginTop: Platform.OS === 'web' ? 12 : 0,
  },
  categoryDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: menuUi.accent },
  categoryTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: menuUi.navy,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  categoryLine: { flex: 1, height: 1, backgroundColor: menuUi.border },
  webMenuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    width: '100%',
  },
  webMenuCell1: { width: '100%' },
  webMenuCell2: {
    width: '48.5%',
    flexGrow: 0,
    flexShrink: 0,
  },
  nativeList: { gap: 0 },
  nativeListItem: { width: '100%' },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: menuUi.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: menuUi.navy },
  emptyBody: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 22 },
  footer: {
    alignItems: 'center',
    paddingVertical: 28,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: menuUi.border,
  },
  footerText: { fontSize: 14, fontWeight: '800', color: menuUi.navy },
  footerSub: { fontSize: 12, color: '#64748b', marginTop: 4 },
  webLoading: { flex: 1, backgroundColor: menuUi.webSurface },
  webLoadingHero: { height: 280, width: '100%' },
  webLoadingHeroInner: { padding: 28, paddingTop: 48, gap: 14, maxWidth: 640 },
  skeletonLineLg: {
    height: 36,
    width: '70%',
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  skeletonLineMd: {
    height: 18,
    width: '45%',
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  skeletonSearch: {
    height: 52,
    width: '100%',
    borderRadius: 14,
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  webLoadingBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 40 },
});
