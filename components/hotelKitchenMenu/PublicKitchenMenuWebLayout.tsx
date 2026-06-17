import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  useWindowDimensions,
  Animated,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PublicKitchenMenuDishCard } from '@/components/hotelKitchenMenu/PublicKitchenMenuDishCard';
import { PublicKitchenMenuDishDetailModal } from '@/components/hotelKitchenMenu/PublicKitchenMenuDishDetailModal';
import { KitchenMenuUpdatedToast } from '@/components/hotelKitchenMenu/KitchenMenuUpdatedToast';
import { PublicKitchenMenuLangToggle } from '@/components/hotelKitchenMenu/PublicKitchenMenuLangToggle';
import { PublicKitchenMenuCartBar } from '@/components/hotelKitchenMenu/PublicKitchenMenuCartBar';
import { PublicKitchenMenuCartSheet } from '@/components/hotelKitchenMenu/PublicKitchenMenuCartSheet';
import {
  menuUi,
  menuWebPageBg,
  PUBLIC_MENU_WEB_BUILD,
} from '@/components/hotelKitchenMenu/hotelKitchenMenuUi';
import { CachedImage } from '@/components/CachedImage';
import type { PublicKitchenMenuOrg } from '@/lib/publicKitchenMenu';
import type { HotelKitchenMenuItemWithImages } from '@/lib/hotelKitchenMenu';
import type { MenuSectionFilter } from '@/lib/hotelKitchenMenuFilters';
import { coverImageUrl } from '@/lib/hotelKitchenMenu';
import type { PublicMenuCartLine } from '@/lib/publicKitchenMenuCart';
import { cartItemCount, cartQuantityFor, cartTotal } from '@/lib/publicKitchenMenuCart';
import type { PublicMenuLang } from '@/lib/publicKitchenMenuLang';
import type { ResolvedKitchenMenuTheme } from '@/lib/kitchenMenuTheme';
import { resolveKitchenMenuTheme } from '@/lib/kitchenMenuTheme';

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

function LiveDot({ label }: { label: string }) {
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={styles.livePill}>
      <Animated.View style={[styles.liveRing, { opacity: pulse }]} />
      <View style={styles.liveCore} />
      <Text style={styles.liveText}>{label}</Text>
    </View>
  );
}

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
  const { width } = useWindowDimensions();
  const menuTheme =
    menuThemeProp ??
    resolveKitchenMenuTheme(null, {
      heroTitle: t('hotelKitchenMenuHeroTitle'),
      heroSubtitle: t('publicKitchenMenuHeroSub'),
    });

  const [detailItem, setDetailItem] = useState<HotelKitchenMenuItemWithImages | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  const accent = menuTheme.primaryColor;
  const navy = menuTheme.navyColor;
  const heroImage = menuTheme.heroImageUrl;
  const wide = width >= 960;
  const columns = width >= 1200 ? 3 : width >= 720 ? 2 : 1;
  const maxW = columns === 3 ? 1160 : columns === 2 ? 920 : 680;
  const cellW = columns === 3 ? '31.5%' : columns === 2 ? '48%' : '100%';

  const featured = useMemo(() => items.filter((it) => coverImageUrl(it)).slice(0, 3), [items]);
  const showFeatured =
    menuTheme.layout !== 'compact' && featured.length >= 2 && !hasActiveFilters && section === 'all' && !categoryFilter;

  const clearAll = () => {
    pickCategory(null);
    setProductFilter(null);
    setTagFilter(null);
    setSearch('');
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
                {c.title}
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
              <Text style={[styles.sidebarChipText, productFilter === p.name && styles.sidebarChipTextOn]}>{p.name}</Text>
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
    <View style={[styles.root, menuWebPageBg]}>
      <KitchenMenuUpdatedToast visible={updateToast} onHidden={onUpdateToastHidden} />

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
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + (cartItemCount(cartLines) > 0 ? 110 : 40) }}
        showsVerticalScrollIndicator
      >
        {/* Hero */}
        <View style={styles.heroWrap}>
          <LinearGradient colors={[...menuTheme.webHeroGradient]} style={styles.hero}>
            {heroImage ? (
              <>
                <CachedImage uri={heroImage} style={StyleSheet.absoluteFillObject} contentFit="cover" recyclingKey={`hero-${orgSlug}`} />
                <LinearGradient colors={['rgba(5,8,16,0.5)', 'rgba(5,8,16,0.92)']} style={StyleSheet.absoluteFillObject} />
              </>
            ) : null}
            <View style={[styles.heroFrame, { borderColor: `${accent}44` }]} pointerEvents="none" />
            <View style={[styles.heroInner, { paddingTop: insets.top + 28, maxWidth: maxW + 80 }]}>
              <View style={styles.heroTop}>
                <LiveDot label={t('publicKitchenMenuLiveBadge')} />
                <View style={styles.heroLang}>
                  <PublicKitchenMenuLangToggle lang={menuLang} onChange={onMenuLangChange} />
                </View>
              </View>
              <Text style={[styles.heroKicker, { color: accent }]}>{t('hotelKitchenMenuHeroTitle').toUpperCase()}</Text>
              <Text style={styles.heroHotel}>{org.name}</Text>
              <Text style={styles.heroSub}>{menuTheme.heroSubtitle ?? t('publicKitchenMenuHeroSub')}</Text>
              <View style={[styles.searchBox, { borderColor: `${accent}44` }]}>
                <Ionicons name="search" size={18} color="rgba(255,255,255,0.55)" />
                <TextInput
                  style={styles.searchInput}
                  placeholder={t('hotelKitchenMenuSearchPh')}
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={search}
                  onChangeText={setSearch}
                />
                {search ? (
                  <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.5)" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </LinearGradient>
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
                <Text style={[styles.mobileChipText, categoryFilter === c.title && styles.mobileChipTextOn]}>{c.title}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}

        <View style={[styles.main, { maxWidth: maxW + (wide ? 280 : 0) }]}>
          {wide ? filterSidebar : null}

          <View style={styles.menuCol}>
            <View style={styles.resultsRow}>
              <Text style={styles.resultsText}>{t('hotelKitchenMenuResultCount', { count: filtered.length })}</Text>
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
                        <View key={item.id} style={{ width: width >= 720 ? 320 : 260 }}>
                          <PublicKitchenMenuDishCard
                            item={item}
                            layout="featured"
                            themeAccent={accent}
                            themeNavy={navy}
                            onPress={() => setDetailItem(item)}
                            onAddToCart={() => onAddToCart(item)}
                            cartQuantity={cartQuantityFor(cartLines, item.id)}
                          />
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}

                {grouped.map((grp) => (
                  <View key={grp.title || 'all'} style={styles.block}>
                    {grp.title ? (
                      <View style={styles.catHead}>
                        <Text style={[styles.blockTitle, { color: navy }]}>{grp.title}</Text>
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

        <View style={[styles.footer, { backgroundColor: navy }]}>
          <View style={[styles.footerGold, { backgroundColor: accent }]} />
          <Text style={styles.footerBrand}>{org.name}</Text>
          <Text style={styles.footerMeta}>Menu · {PUBLIC_MENU_WEB_BUILD}</Text>
        </View>
      </ScrollView>

      <PublicKitchenMenuDishDetailModal
        visible={!!detailItem}
        item={detailItem}
        onClose={() => setDetailItem(null)}
        onAddToCart={detailItem ? () => onAddToCart(detailItem) : undefined}
        cartQuantity={detailItem ? cartQuantityFor(cartLines, detailItem.id) : 0}
      />

      <PublicKitchenMenuCartBar itemCount={cartItemCount(cartLines)} total={cartTotal(cartLines)} onOpenCart={() => setCartOpen(true)} />

      <PublicKitchenMenuCartSheet
        visible={cartOpen}
        onClose={() => setCartOpen(false)}
        orgSlug={orgSlug}
        orgName={org.name}
        lines={cartLines}
        lang={menuLang}
        onUpdateQuantity={onUpdateCartQuantity}
        onCartCleared={() => {
          onCartCleared();
          setCartOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  heroWrap: { width: '100%' },
  hero: { minHeight: 340, position: 'relative', overflow: 'hidden' },
  heroFrame: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    bottom: 16,
    borderWidth: 1,
    borderRadius: 4,
    zIndex: 1,
  },
  heroInner: { alignSelf: 'center', width: '100%', paddingHorizontal: 28, paddingBottom: 36, zIndex: 2 },
  heroTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  heroLang: { marginLeft: 'auto' },
  heroKicker: { fontSize: 11, fontWeight: '800', letterSpacing: 4, marginBottom: 10 },
  heroHotel: { fontSize: 42, fontWeight: '800', color: '#fff', letterSpacing: -1.2, lineHeight: 46 },
  heroSub: { fontSize: 15, color: 'rgba(255,255,255,0.65)', marginTop: 10, lineHeight: 22, maxWidth: 480 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    minHeight: 50,
    maxWidth: 440,
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
  mobileStrip: { backgroundColor: menuUi.webGlass, borderBottomWidth: 1, borderBottomColor: menuUi.border },
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
    paddingHorizontal: 20,
    paddingTop: 28,
    gap: 28,
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
  resultsRow: { marginBottom: 20 },
  resultsText: { fontSize: 13, color: menuUi.webMuted, fontWeight: '600' },
  block: { marginBottom: 36 },
  blockTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  featuredRow: { gap: 16, paddingTop: 14, paddingRight: 8 },
  catHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  catLine: { flex: 1, height: 1 },
  catCount: { fontSize: 13, fontWeight: '800', color: menuUi.webMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: menuUi.navy },
  emptyBody: { fontSize: 14, color: menuUi.webMuted, textAlign: 'center', maxWidth: 320 },
  footer: { alignItems: 'center', paddingVertical: 36, marginTop: 12, position: 'relative' },
  footerGold: { position: 'absolute', top: 0, left: '30%', right: '30%', height: 2 },
  footerBrand: { fontSize: 16, fontWeight: '800', color: '#fff' },
  footerMeta: { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 6, letterSpacing: 0.5 },
  payBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 10, zIndex: 50 },
  payOk: { backgroundColor: '#ecfdf3' },
  payCancel: { backgroundColor: '#fffbeb' },
  payBannerText: { flex: 1, fontSize: 13, fontWeight: '700', color: menuUi.navy },
});
