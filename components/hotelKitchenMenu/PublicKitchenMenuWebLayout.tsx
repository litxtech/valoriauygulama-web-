import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PublicKitchenMenuDishCard } from '@/components/hotelKitchenMenu/PublicKitchenMenuDishCard';
import { PublicKitchenMenuDishDetailModal } from '@/components/hotelKitchenMenu/PublicKitchenMenuDishDetailModal';
import { KitchenMenuUpdatedToast } from '@/components/hotelKitchenMenu/KitchenMenuUpdatedToast';
import { PublicKitchenMenuLangToggle } from '@/components/hotelKitchenMenu/PublicKitchenMenuLangToggle';
import { PublicKitchenMenuCartBar } from '@/components/hotelKitchenMenu/PublicKitchenMenuCartBar';
import { PublicKitchenMenuCartSheet } from '@/components/hotelKitchenMenu/PublicKitchenMenuCartSheet';
import { PublicKitchenMenuWelcomeHero } from '@/components/hotelKitchenMenu/PublicKitchenMenuWelcomeHero';
import { PublicKitchenMenuOrderHistorySheet } from '@/components/hotelKitchenMenu/PublicKitchenMenuOrderHistorySheet';
import {
  menuUi,
  menuWebPageBg,
  PUBLIC_MENU_WEB_BUILD,
} from '@/components/hotelKitchenMenu/hotelKitchenMenuUi';
import type { PublicKitchenMenuOrg } from '@/lib/publicKitchenMenu';
import type { HotelKitchenMenuItemWithImages } from '@/lib/hotelKitchenMenu';
import type { MenuSectionFilter } from '@/lib/hotelKitchenMenuFilters';
import { coverImageUrl } from '@/lib/hotelKitchenMenu';
import type { PublicMenuCartLine } from '@/lib/publicKitchenMenuCart';
import { cartItemCount, cartQuantityFor, cartTotal } from '@/lib/publicKitchenMenuCart';
import type { PublicMenuLang } from '@/lib/publicKitchenMenuLang';
import type { ResolvedKitchenMenuTheme } from '@/lib/kitchenMenuTheme';
import { resolveKitchenMenuTheme } from '@/lib/kitchenMenuTheme';
import {
  localizedCategoryLabel,
  localizedProductLabel,
  resolveKitchenMenuCategoryTitle,
} from '@/lib/kitchenMenuI18n';

type CategoryChip = { title: string; count: number };
type ProductChip = { name: string; count: number };
type TagChip = { tag: string; label: string; count: number };

type Props = {
  orgSlug: string;
  org: PublicKitchenMenuOrg;
  items: HotelKitchenMenuItemWithImages[];
  filtered: HotelKitchenMenuItemWithImages[];
  grouped: { title: string; items: HotelKitchenMenuItemWithImages[] }[];
  section: MenuSectionFilter;
  setSection: (s: MenuSectionFilter) => void;
  categoryFilter: string | null;
  pickCategory: (title: string | null) => void;
  categoryChips: CategoryChip[];
  productFilter: string | null;
  setProductFilter: (v: string | null) => void;
  productChips: ProductChip[];
  tagFilter: string | null;
  setTagFilter: (v: string | null) => void;
  nameTagChips: TagChip[];
  search: string;
  setSearch: (v: string) => void;
  hasActiveFilters: boolean;
  updateToast: boolean;
  updateToastKind?: 'new_item' | 'updated';
  onUpdateToastHidden: () => void;
  menuLang: PublicMenuLang;
  onMenuLangChange: (lang: PublicMenuLang) => void;
  cartLines: PublicMenuCartLine[];
  onAddToCart: (item: HotelKitchenMenuItemWithImages) => void;
  onUpdateCartQuantity: (itemId: string, quantity: number) => void;
  onCartCleared: () => void;
  paymentBanner: 'success' | 'cancel' | null;
  onDismissPaymentBanner: () => void;
  menuTheme?: ResolvedKitchenMenuTheme;
};

export function PublicKitchenMenuWebLayout(props: Props) {
  const {
    orgSlug,
    org,
    items,
    filtered,
    grouped,
    section,
    setSection,
    categoryFilter,
    pickCategory,
    categoryChips,
    productFilter,
    setProductFilter,
    productChips,
    tagFilter,
    setTagFilter,
    nameTagChips,
    search,
    setSearch,
    hasActiveFilters,
    updateToast,
    updateToastKind = 'updated',
    onUpdateToastHidden,
    menuLang,
    onMenuLangChange,
    cartLines,
    onAddToCart,
    onUpdateCartQuantity,
    onCartCleared,
    paymentBanner,
    onDismissPaymentBanner,
    menuTheme: menuThemeProp,
  } = props;

  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height: viewportH } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const menuSectionY = useRef(0);
  const menuTheme =
    menuThemeProp ??
    resolveKitchenMenuTheme(null, {
      heroTitle: t('hotelKitchenMenuHeroTitle'),
      heroSubtitle: t('publicKitchenMenuHeroSub'),
    });

  const [detailItem, setDetailItem] = useState<HotelKitchenMenuItemWithImages | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [menuTab, setMenuTab] = useState<'explore' | 'menu'>(
    menuTheme.landingMode === 'explore' ? 'explore' : 'menu'
  );

  const promoVideos = menuTheme.promoVideos;

  useEffect(() => {
    setMenuTab(menuTheme.landingMode === 'explore' ? 'explore' : 'menu');
  }, [menuTheme.landingMode, orgSlug]);

  const accent = menuTheme.primaryColor;
  const navy = menuTheme.navyColor;
  const heroImage = menuTheme.heroImageUrl;
  const isRtl = menuLang === 'ar';
  const heroTitle =
    menuLang === 'tr'
      ? (menuTheme.heroTitle ?? t('hotelKitchenMenuHeroTitle'))
      : t('hotelKitchenMenuHeroTitle');
  const heroSubtitle =
    menuLang === 'tr'
      ? (menuTheme.heroSubtitle ?? t('publicKitchenMenuHeroSub'))
      : t('publicKitchenMenuHeroSub');
  const wide = width >= 960;
  const columns = width >= 1280 ? 4 : width >= 900 ? 3 : width >= 560 ? 2 : 1;
  const maxW = columns === 4 ? 1240 : columns === 3 ? 1040 : columns === 2 ? 760 : 640;
  const cellW =
    columns === 4 ? '23.5%' : columns === 3 ? '31.5%' : columns === 2 ? '48%' : '100%';

  const featured = useMemo(() => items.filter((it) => coverImageUrl(it)).slice(0, 3), [items]);
  const showFeatured =
    menuTheme.layout !== 'compact' && featured.length >= 2 && !hasActiveFilters && section === 'all' && !categoryFilter && menuTab === 'menu';

  const activeGrouped =
    menuTab === 'explore' ? [{ title: '', items: filtered }] : grouped;

  const clearAll = () => {
    pickCategory(null);
    setProductFilter(null);
    setTagFilter(null);
    setSearch('');
  };

  const scrollToMenu = () => {
    const y = menuSectionY.current > 0 ? menuSectionY.current : viewportH;
    scrollRef.current?.scrollTo({ y, animated: true });
    setMenuTab('menu');
  };

  const filterSidebar = (
    <View style={[styles.sidebar, wide && styles.sidebarWide]}>
      <Text style={styles.sidebarTitle}>{t('hotelKitchenMenuSectionAll')}</Text>

      <View style={styles.sectionToggle}>
        {(['all', 'breakfast'] as const).map((key) => {
          const active = section === key;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.sectionBtn, active && { backgroundColor: navy, borderColor: navy }]}
              onPress={() => setSection(key)}
            >
              <Text style={[styles.sectionBtnText, active && styles.sectionBtnTextOn]}>
                {key === 'all' ? t('hotelKitchenMenuSectionAll') : t('hotelKitchenMenuSectionBreakfast')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {categoryChips.length > 0 ? (
        <View style={styles.sidebarBlock}>
          <Text style={styles.sidebarLabel}>{t('publicKitchenMenuCategories')}</Text>
          <TouchableOpacity
            style={[styles.sidebarChip, !categoryFilter && styles.sidebarChipOn]}
            onPress={() => pickCategory(null)}
          >
            <Text style={[styles.sidebarChipText, !categoryFilter && styles.sidebarChipTextOn]}>
              {t('hotelKitchenMenuAllCategories')}
            </Text>
          </TouchableOpacity>
          {categoryChips.map((c) => (
            <TouchableOpacity
              key={c.title}
              style={[styles.sidebarChip, categoryFilter === c.title && styles.sidebarChipOn]}
              onPress={() => pickCategory(categoryFilter === c.title ? null : c.title)}
            >
              <Text style={[styles.sidebarChipText, categoryFilter === c.title && styles.sidebarChipTextOn]}>
                {localizedCategoryLabel(items, c.title, menuLang)}
              </Text>
              <Text style={[styles.sidebarCount, categoryFilter === c.title && styles.sidebarChipTextOn]}>{c.count}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {productChips.length > 0 ? (
        <View style={styles.sidebarBlock}>
          <Text style={styles.sidebarLabel}>{t('hotelKitchenMenuFilterVarieties')}</Text>
          {productChips.map((p) => (
            <TouchableOpacity
              key={p.name}
              style={[styles.sidebarChip, productFilter === p.name && styles.sidebarChipOn]}
              onPress={() => {
                setProductFilter(productFilter === p.name ? null : p.name);
                setTagFilter(null);
              }}
            >
              <Text style={[styles.sidebarChipText, productFilter === p.name && styles.sidebarChipTextOn]}>
                {localizedProductLabel(items, p.name, menuLang)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {nameTagChips.length > 0 ? (
        <View style={styles.sidebarBlock}>
          <Text style={styles.sidebarLabel}>{t('hotelKitchenMenuFilterKeywords')}</Text>
          {nameTagChips.map((tag) => (
            <TouchableOpacity
              key={tag.tag}
              style={[styles.sidebarChip, tagFilter === tag.tag && styles.sidebarChipOn]}
              onPress={() => {
                setTagFilter(tagFilter === tag.tag ? null : tag.tag);
                setProductFilter(null);
              }}
            >
              <Text style={[styles.sidebarChipText, tagFilter === tag.tag && styles.sidebarChipTextOn]}>{tag.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {hasActiveFilters ? (
        <TouchableOpacity onPress={clearAll}>
          <Text style={[styles.clearLink, { color: accent }]}>{t('hotelKitchenMenuClearFilters')}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.root, menuWebPageBg, isRtl && styles.rtl]}>
      <KitchenMenuUpdatedToast visible={updateToast} kind={updateToastKind} onHidden={onUpdateToastHidden} />

      {paymentBanner ? (
        <View style={[styles.payBanner, paymentBanner === 'success' ? styles.payOk : styles.payCancel, { paddingTop: insets.top + 8 }]}>
          <Ionicons name={paymentBanner === 'success' ? 'checkmark-circle' : 'information-circle'} size={20} color={navy} />
          <Text style={styles.payBannerText}>
            {paymentBanner === 'success' ? t('publicKitchenMenuPaymentSuccess') : t('publicKitchenMenuPaymentCancelled')}
          </Text>
          <TouchableOpacity onPress={onDismissPaymentBanner} hitSlop={10}>
            <Ionicons name="close" size={18} color={navy} />
          </TouchableOpacity>
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + (cartItemCount(cartLines) > 0 ? 110 : 40) },
        ]}
        showsVerticalScrollIndicator
      >
        <View
          style={[
            styles.welcomeViewport,
            { minHeight: viewportH, height: viewportH, paddingTop: insets.top },
          ]}
        >
          <PublicKitchenMenuWelcomeHero
            orgName={org.name}
            heroTitle={heroTitle}
            heroSubtitle={heroSubtitle}
            accentColor={accent}
            heroImage={heroImage}
            promoVideos={promoVideos}
            liveBadge={t('publicKitchenMenuLiveBadge')}
            langToggle={<PublicKitchenMenuLangToggle lang={menuLang} onChange={onMenuLangChange} />}
            onOrdersPress={() => setOrdersOpen(true)}
            fullScreen
            onEnterMenu={scrollToMenu}
          />
        </View>

        <View
          style={styles.menuSection}
          onLayout={(e) => {
            menuSectionY.current = e.nativeEvent.layout.y;
          }}
        >
          <View style={[styles.heroWrap, { backgroundColor: menuUi.webSurface }]}>
            <View style={{ maxWidth: maxW + 80, width: '100%', alignSelf: 'center', paddingHorizontal: 16 }}>
              <View style={[styles.searchBoxLight, { borderColor: `${accent}22` }]}>
                <View style={[styles.searchIconWrap, { backgroundColor: `${accent}14` }]}>
                  <Ionicons name="search" size={16} color={accent} />
                </View>
                <TextInput
                  style={styles.searchInputLight}
                  placeholder={t('hotelKitchenMenuSearchPh')}
                  placeholderTextColor="#94a3b8"
                  value={search}
                  onChangeText={setSearch}
                />
                {search ? (
                  <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color="#94a3b8" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>

        {/* Mobile filters strip */}
        {!wide && categoryChips.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mobileStrip} contentContainerStyle={styles.mobileStripInner}>
            <TouchableOpacity
              style={[styles.mobileChip, !categoryFilter && { backgroundColor: navy }]}
              onPress={() => pickCategory(null)}
            >
              <Text style={[styles.mobileChipText, !categoryFilter && styles.mobileChipTextOn]}>{t('hotelKitchenMenuAllCategories')}</Text>
            </TouchableOpacity>
            {categoryChips.map((c) => (
              <TouchableOpacity
                key={c.title}
                style={[styles.mobileChip, categoryFilter === c.title && { backgroundColor: navy }]}
                onPress={() => pickCategory(categoryFilter === c.title ? null : c.title)}
              >
                <Text style={[styles.mobileChipText, categoryFilter === c.title && styles.mobileChipTextOn]}>{localizedCategoryLabel(items, c.title, menuLang)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}

        <View style={[styles.main, { maxWidth: maxW + (wide ? 280 : 0) }]}>
          {wide ? filterSidebar : null}

          <View style={styles.menuCol}>
            <View style={styles.menuTabs}>
              <TouchableOpacity
                style={[styles.menuTab, menuTab === 'explore' && { backgroundColor: navy }]}
                onPress={() => setMenuTab('explore')}
              >
                <Text style={[styles.menuTabText, menuTab === 'explore' && styles.menuTabTextOn]}>
                  {t('publicKitchenMenuExplore')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.menuTab, menuTab === 'menu' && { backgroundColor: navy }]}
                onPress={() => setMenuTab('menu')}
              >
                <Text style={[styles.menuTabText, menuTab === 'menu' && styles.menuTabTextOn]}>
                  {t('publicKitchenMenuCategories')}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.resultsRow}>
              <Text style={styles.resultsText}>
                {menuTab === 'explore'
                  ? t('publicKitchenMenuExploreSub', { count: filtered.length })
                  : t('hotelKitchenMenuResultCount', { count: filtered.length })}
              </Text>
            </View>

            {filtered.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="restaurant-outline" size={36} color={accent} />
                <Text style={styles.emptyTitle}>{t('hotelKitchenMenuEmptyTitle')}</Text>
                <Text style={styles.emptyBody}>{t('hotelKitchenMenuEmptyBody')}</Text>
              </View>
            ) : (
              <>
                {showFeatured ? (
                  <View style={styles.block}>
                    <Text style={[styles.blockTitle, { color: navy }]}>{t('publicKitchenMenuFeatured')}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuredRow}>
                      {featured.map((item) => (
                        <View key={item.id} style={{ width: width >= 720 ? 240 : 200 }}>
                          <PublicKitchenMenuDishCard
                            item={item}
                            layout="featured"
                            themeAccent={accent}
                            themeNavy={navy}
                            displayLang={menuLang}
                            onPress={() => setDetailItem(item)}
                            onAddToCart={() => onAddToCart(item)}
                            cartQuantity={cartQuantityFor(cartLines, item.id)}
                          />
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}

                {activeGrouped.map((grp) => (
                  <View key={grp.title || 'all'} style={styles.block}>
                    {grp.title ? (
                      <View style={styles.catHead}>
                        <Text style={[styles.blockTitle, { color: navy }]}>
                          {resolveKitchenMenuCategoryTitle(grp.items[0]!, menuLang)}
                        </Text>
                        <View style={[styles.catLine, { backgroundColor: `${accent}55` }]} />
                        <Text style={styles.catCount}>{grp.items.length}</Text>
                      </View>
                    ) : null}
                    <View style={styles.grid}>
                      {grp.items.map((item) => (
                        <View key={item.id} style={{ width: cellW as `${number}%` }}>
                          <PublicKitchenMenuDishCard
                            item={item}
                            layout="premium"
                            themeAccent={accent}
                            themeNavy={navy}
                            displayLang={menuLang}
                            onPress={() => setDetailItem(item)}
                            onAddToCart={() => onAddToCart(item)}
                            cartQuantity={cartQuantityFor(cartLines, item.id)}
                          />
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </>
            )}
          </View>
        </View>

        <View style={styles.footer}>
          <View style={[styles.footerAccent, { backgroundColor: accent }]} />
          <Text style={styles.footerBrand}>{org.name}</Text>
          <Text style={styles.footerMeta}>{t('homePortalMenu')} · {PUBLIC_MENU_WEB_BUILD}</Text>
        </View>
        </View>
      </ScrollView>

      <PublicKitchenMenuDishDetailModal
        visible={!!detailItem}
        item={detailItem}
        onClose={() => setDetailItem(null)}
        onAddToCart={detailItem ? () => onAddToCart(detailItem) : undefined}
        cartQuantity={detailItem ? cartQuantityFor(cartLines, detailItem.id) : 0}
        displayLang={menuLang}
      />

      <PublicKitchenMenuCartBar
        itemCount={cartItemCount(cartLines)}
        total={cartTotal(cartLines)}
        onOpenCart={() => setCartOpen(true)}
        accentColor={accent}
      />

      {cartOpen ? (
        <PublicKitchenMenuCartSheet
          visible={cartOpen}
          onClose={() => setCartOpen(false)}
          orgSlug={orgSlug}
          orgName={org.name}
          lines={cartLines}
          lang={menuLang}
          onUpdateQuantity={onUpdateCartQuantity}
          checkoutFields={menuTheme.checkoutFields}
          accentColor={accent}
        />
      ) : null}

      <PublicKitchenMenuOrderHistorySheet
        visible={ordersOpen}
        onClose={() => setOrdersOpen(false)}
        orgName={org.name}
        orgSlug={orgSlug}
        mode="web"
        accentColor={accent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  rtl: { direction: 'rtl' } as object,
  scroll: { flex: 1 },
  scrollContent: Platform.select({
    web: { scrollSnapType: 'y proximity' } as object,
    default: {},
  }),
  welcomeViewport: {
    width: '100%',
    overflow: 'hidden',
    ...Platform.select({
      web: { scrollSnapAlign: 'start', scrollSnapStop: 'always' } as object,
      default: {},
    }),
  },
  menuSection: {
    width: '100%',
    ...Platform.select({
      web: { scrollSnapAlign: 'start' } as object,
      default: {},
    }),
  },
  heroWrap: { width: '100%', position: 'relative', paddingTop: 16, paddingBottom: 4 },
  hero: { minHeight: 300, position: 'relative', overflow: 'hidden' },
  heroCompact: { minHeight: 220 },
  heroGlow: {
    position: 'absolute',
    top: -80,
    right: -40,
    width: 320,
    height: 320,
    borderRadius: 160,
    opacity: 0.9,
  },
  heroCurve: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    height: 28,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  heroInner: { alignSelf: 'center', width: '100%', paddingHorizontal: 24, paddingBottom: 36, zIndex: 2 },
  heroTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  heroLang: { marginLeft: 'auto' },
  heroKicker: { fontSize: 11, fontWeight: '800', letterSpacing: 3.5, marginBottom: 8 },
  heroHotel: { fontSize: 34, fontWeight: '800', color: '#fff', letterSpacing: -1.2, lineHeight: 38 },
  heroSub: { fontSize: 15, color: 'rgba(255,255,255,0.72)', marginTop: 10, lineHeight: 22, maxWidth: 520, fontWeight: '500' },
  searchBoxLight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    marginBottom: 8,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minHeight: 52,
  },
  searchInputLight: { flex: 1, fontSize: 15, color: '#0f172a', paddingVertical: 10, outlineStyle: 'none' } as object,
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 26,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minHeight: 54,
    maxWidth: 460,
    backdropFilter: 'blur(12px)',
  } as object,
  searchIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: { flex: 1, fontSize: 15, color: '#fff', paddingVertical: 10, outlineStyle: 'none' } as object,
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.25)',
  },
  liveRing: { width: 10, height: 10, borderRadius: 5, backgroundColor: menuUi.liveGreen, position: 'absolute', left: 10 },
  liveCore: { width: 8, height: 8, borderRadius: 4, backgroundColor: menuUi.liveGreen },
  liveText: { fontSize: 11, fontWeight: '800', color: '#86efac', marginLeft: 14 },
  mobileStrip: {
    backgroundColor: menuUi.webGlass,
    borderBottomWidth: 1,
    borderBottomColor: menuUi.webGlassBorder,
    marginTop: -8,
  },
  mobileStripInner: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  mobileChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: menuUi.warmBg,
    borderWidth: 1,
    borderColor: menuUi.border,
    marginRight: 8,
  },
  mobileChipText: { fontSize: 13, fontWeight: '700', color: menuUi.webMuted },
  mobileChipTextOn: { color: '#fff' },
  main: {
    alignSelf: 'center',
    width: '100%',
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 20,
  },
  sidebar: { width: 220 },
  sidebarWide: {
    position: 'sticky',
    top: 16,
    alignSelf: 'flex-start',
    zIndex: 10,
  } as object,
  sidebarTitle: { fontSize: 13, fontWeight: '800', color: menuUi.navy, marginBottom: 14, letterSpacing: 0.3 },
  sidebarLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: menuUi.webMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 4,
  },
  sidebarBlock: { marginBottom: 16 },
  sectionToggle: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  sectionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: menuUi.border,
    backgroundColor: menuUi.cardBg,
    alignItems: 'center',
  },
  sectionBtnText: { fontSize: 12, fontWeight: '700', color: menuUi.webMuted },
  sectionBtnTextOn: { color: '#fff' },
  sidebarChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: menuUi.cardBg,
    borderWidth: 1,
    borderColor: menuUi.border,
  },
  sidebarChipOn: { backgroundColor: menuUi.navy, borderColor: menuUi.navy },
  sidebarChipText: { fontSize: 13, fontWeight: '600', color: menuUi.webMuted, flex: 1 },
  sidebarChipTextOn: { color: '#fff', fontWeight: '700' },
  sidebarCount: { fontSize: 11, fontWeight: '800', color: '#94a3b8', marginLeft: 8 },
  clearLink: { fontSize: 13, fontWeight: '700', marginTop: 8 },
  menuCol: { flex: 1, minWidth: 0 },
  menuTabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  menuTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: menuUi.border,
    backgroundColor: menuUi.cardBg,
    alignItems: 'center',
  },
  menuTabText: { fontSize: 13, fontWeight: '700', color: menuUi.webMuted },
  menuTabTextOn: { color: '#fff' },
  resultsRow: { marginBottom: 14 },
  resultsText: { fontSize: 13, color: menuUi.webMuted, fontWeight: '600' },
  block: { marginBottom: 28 },
  blockTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.4 },
  featuredRow: { gap: 12, paddingTop: 10, paddingRight: 8 },
  catHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  catLine: { flex: 1, height: 1 },
  catCount: { fontSize: 13, fontWeight: '800', color: menuUi.webMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: menuUi.navy },
  emptyBody: { fontSize: 14, color: menuUi.webMuted, textAlign: 'center', maxWidth: 320 },
  footer: {
    alignItems: 'center',
    paddingVertical: 32,
    marginTop: 12,
    position: 'relative',
    borderTopWidth: 1,
    borderTopColor: menuUi.border,
    backgroundColor: menuUi.webSurface,
  },
  footerAccent: { position: 'absolute', top: 0, left: '35%', right: '35%', height: 2, borderRadius: 1 },
  footerBrand: { fontSize: 15, fontWeight: '800', color: menuUi.navy },
  footerMeta: { fontSize: 11, color: menuUi.webMuted, marginTop: 6, letterSpacing: 0.5 },
  payBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 10, zIndex: 50 },
  payOk: { backgroundColor: '#ecfdf3' },
  payCancel: { backgroundColor: '#fffbeb' },
  payBannerText: { flex: 1, fontSize: 13, fontWeight: '700', color: menuUi.navy },
});
