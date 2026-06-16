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
import { theme } from '@/constants/theme';
import { PublicKitchenMenuDishCard } from '@/components/hotelKitchenMenu/PublicKitchenMenuDishCard';
import { PublicKitchenMenuDishDetailModal } from '@/components/hotelKitchenMenu/PublicKitchenMenuDishDetailModal';
import { KitchenMenuUpdatedToast } from '@/components/hotelKitchenMenu/KitchenMenuUpdatedToast';
import { PublicKitchenMenuLangToggle } from '@/components/hotelKitchenMenu/PublicKitchenMenuLangToggle';
import { PublicKitchenMenuCartBar } from '@/components/hotelKitchenMenu/PublicKitchenMenuCartBar';
import { PublicKitchenMenuCartSheet } from '@/components/hotelKitchenMenu/PublicKitchenMenuCartSheet';
import { categoryAccentColor, menuUi, menuWebPageBg } from '@/components/hotelKitchenMenu/hotelKitchenMenuUi';
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

function LivePulseBadge({ label }: { label: string }) {
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={styles.liveBadge}>
      <Animated.View style={[styles.liveDotRing, { opacity: pulse }]} />
      <View style={styles.liveDotCore} />
      <Text style={styles.liveBadgeText}>{label}</Text>
    </View>
  );
}

export function PublicKitchenMenuWebLayout({
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
}: Props) {
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

  const cartCount = cartItemCount(cartLines);
  const cartSum = cartTotal(cartLines);

  const columns = width >= 1200 ? 3 : width >= 760 ? 2 : 1;
  const contentMax = columns === 3 ? 1180 : columns === 2 ? 920 : 640;
  const cellWidth = columns === 3 ? '31.6%' : columns === 2 ? '48.2%' : '100%';

  const featured = useMemo(
    () => items.filter((it) => coverImageUrl(it)).slice(0, 4),
    [items]
  );

  const showFeatured =
    menuTheme.layout !== 'compact' && featured.length >= 2 && !hasActiveFilters && section === 'all' && !categoryFilter;

  const accent = menuTheme.primaryColor;
  const navy = menuTheme.navyColor;
  const accentSoft = menuTheme.accentLightColor;
  const heroImage = menuTheme.heroImageUrl;

  return (
    <View style={[styles.root, menuWebPageBg]}>
      <KitchenMenuUpdatedToast visible={updateToast} onHidden={onUpdateToastHidden} />

      {paymentBanner ? (
        <View
          style={[
            styles.paymentBanner,
            paymentBanner === 'success' ? styles.paymentBannerOk : styles.paymentBannerCancel,
            { paddingTop: insets.top + 10 },
          ]}
        >
          <Ionicons
            name={paymentBanner === 'success' ? 'checkmark-circle' : 'information-circle'}
            size={22}
            color={paymentBanner === 'success' ? '#166534' : '#92400e'}
          />
          <Text style={styles.paymentBannerText}>
            {paymentBanner === 'success'
              ? t('publicKitchenMenuPaymentSuccess')
              : t('publicKitchenMenuPaymentCancelled')}
          </Text>
          <TouchableOpacity onPress={onDismissPaymentBanner} hitSlop={10}>
            <Ionicons name="close" size={20} color={menuUi.navy} />
          </TouchableOpacity>
        </View>
      ) : null}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + (cartCount > 0 ? 120 : 48) }}
        showsVerticalScrollIndicator
      >
        <LinearGradient
          colors={[...menuTheme.webHeroGradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          {heroImage ? (
            <>
              <CachedImage uri={heroImage} style={styles.heroBgImage} contentFit="cover" recyclingKey={`hero-${orgSlug}`} />
              <LinearGradient
                colors={['rgba(8,16,28,0.55)', 'rgba(8,16,28,0.78)', navy + 'ee']}
                style={StyleSheet.absoluteFillObject}
              />
            </>
          ) : null}

          <View style={styles.heroPattern} pointerEvents="none" />
          <View style={[styles.heroGlowOrb, styles.heroGlowOrbA, { backgroundColor: menuTheme.webHeroGlow }]} />
          <View style={[styles.heroGlowOrb, styles.heroGlowOrbB, { backgroundColor: menuTheme.webHeroGlow }]} />
          <View style={[styles.heroGoldLine, { backgroundColor: accent }]} />

          <View style={[styles.heroInner, { maxWidth: contentMax + 80, paddingTop: insets.top + 32 }]}>
            <View style={styles.heroTopRow}>
              <LivePulseBadge label={t('publicKitchenMenuLiveBadge')} />
              <Text style={styles.heroHint}>{t('publicKitchenMenuLiveHint')}</Text>
              <View style={styles.heroLang}>
                <PublicKitchenMenuLangToggle lang={menuLang} onChange={onMenuLangChange} />
              </View>
            </View>

            <Text style={[styles.heroEyebrow, { color: accentSoft }]}>{t('hotelKitchenMenuHeroTitle').toUpperCase()}</Text>
            <Text style={styles.heroHotel}>{org.name}</Text>
            <View style={[styles.heroDivider, { backgroundColor: accent }]} />
            <Text style={[styles.heroTagline, { color: accentSoft }]}>
              {menuTheme.heroTitle ?? t('hotelKitchenMenuHeroTitle')}
            </Text>
            <Text style={styles.heroSub}>{menuTheme.heroSubtitle ?? t('publicKitchenMenuHeroSub')}</Text>

            <View style={styles.heroStats}>
              <View style={[styles.statPill, { borderColor: `${accent}44` }]}>
                <Ionicons name="restaurant-outline" size={16} color={accent} />
                <Text style={styles.statText}>{t('hotelKitchenMenuResultCount', { count: items.length })}</Text>
              </View>
              {categoryChips.length > 0 ? (
                <View style={[styles.statPill, { borderColor: `${accent}44` }]}>
                  <Ionicons name="layers-outline" size={16} color={accent} />
                  <Text style={styles.statText}>
                    {categoryChips.length} {t('publicKitchenMenuCategories').toLowerCase()}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={[styles.searchWrap, { borderColor: `${accent}55` }]}>
              <Ionicons name="search" size={20} color={accentSoft} />
              <TextInput
                style={styles.searchInput}
                placeholder={t('hotelKitchenMenuSearchPh')}
                placeholderTextColor="rgba(255,255,255,0.45)"
                value={search}
                onChangeText={setSearch}
              />
              {search.length > 0 ? (
                <TouchableOpacity onPress={() => setSearch('')} hitSlop={10}>
                  <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.65)" />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </LinearGradient>

        <View style={[styles.content, { maxWidth: contentMax + 40 }]}>
          <View style={[styles.filtersPanel, { borderTopColor: accent }]}>
            <View style={[styles.filtersPanelHeader, { backgroundColor: navy }]}>
              <Ionicons name="options-outline" size={16} color={accent} />
              <Text style={styles.filtersPanelHeaderText}>{t('hotelKitchenMenuSectionAll')}</Text>
            </View>
            <View style={styles.filtersPanelBody}>
            <View style={styles.sectionRow}>
              <TouchableOpacity
                style={[
                  styles.sectionChip,
                  section === 'all' && { backgroundColor: `${accent}22`, borderColor: accent },
                ]}
                onPress={() => setSection('all')}
              >
                <Ionicons name="grid-outline" size={16} color={section === 'all' ? navy : menuUi.webMuted} />
                <Text style={[styles.sectionChipText, section === 'all' && { color: navy, fontWeight: '800' }]}>
                  {t('hotelKitchenMenuSectionAll')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.sectionChip,
                  section === 'breakfast' && { backgroundColor: `${accent}22`, borderColor: accent },
                ]}
                onPress={() => setSection('breakfast')}
              >
                <Ionicons name="sunny-outline" size={16} color={section === 'breakfast' ? navy : menuUi.webMuted} />
                <Text style={[styles.sectionChipText, section === 'breakfast' && { color: navy, fontWeight: '800' }]}>
                  {t('hotelKitchenMenuSectionBreakfast')}
                </Text>
              </TouchableOpacity>
            </View>

            {categoryChips.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
                style={styles.chipScroll}
              >
                <TouchableOpacity
                  style={[styles.catChip, !categoryFilter && { backgroundColor: navy, borderColor: navy }]}
                  onPress={() => pickCategory(null)}
                >
                  <Text style={[styles.catChipText, !categoryFilter && styles.catChipTextOn]}>
                    {t('hotelKitchenMenuAllCategories')}
                  </Text>
                </TouchableOpacity>
                {categoryChips.map((c) => (
                  <TouchableOpacity
                    key={c.title}
                    style={[
                      styles.catChip,
                      categoryFilter === c.title && { backgroundColor: navy, borderColor: navy },
                    ]}
                    onPress={() => pickCategory(categoryFilter === c.title ? null : c.title)}
                  >
                    <Text style={[styles.catChipText, categoryFilter === c.title && styles.catChipTextOn]}>
                      {c.title}
                    </Text>
                    <Text style={[styles.catCount, categoryFilter === c.title && styles.catCountOn]}>
                      {c.count}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : null}

            {productChips.length > 0 ? (
              <View style={styles.subFilter}>
                <Text style={styles.subLabel}>{t('hotelKitchenMenuFilterVarieties')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {productChips.map((p) => (
                    <TouchableOpacity
                      key={p.name}
                      style={[styles.tagChip, productFilter === p.name && styles.tagChipOn]}
                      onPress={() => {
                        setProductFilter(productFilter === p.name ? null : p.name);
                        setTagFilter(null);
                      }}
                    >
                      <Text style={[styles.tagChipText, productFilter === p.name && styles.tagChipTextOn]}>
                        {p.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {nameTagChips.length > 0 ? (
              <View style={styles.subFilter}>
                <Text style={styles.subLabel}>{t('hotelKitchenMenuFilterKeywords')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
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
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <View style={styles.filterFooter}>
              <Text style={styles.resultCount}>{t('hotelKitchenMenuResultCount', { count: filtered.length })}</Text>
              {hasActiveFilters ? (
                <TouchableOpacity
                  onPress={() => {
                    pickCategory(null);
                    setProductFilter(null);
                    setTagFilter(null);
                    setSearch('');
                  }}
                >
                  <Text style={[styles.clearFilters, { color: accent }]}>{t('hotelKitchenMenuClearFilters')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            </View>
          </View>

          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="restaurant-outline" size={40} color={menuUi.accent} />
              </View>
              <Text style={styles.emptyTitle}>{t('hotelKitchenMenuEmptyTitle')}</Text>
              <Text style={styles.emptyBody}>{t('hotelKitchenMenuEmptyBody')}</Text>
            </View>
          ) : (
            <>
              {showFeatured ? (
                <View style={styles.featuredBlock}>
                  <View style={styles.sectionHead}>
                    <View style={[styles.sectionIconWrap, { backgroundColor: `${accent}22` }]}>
                      <Ionicons name="sparkles" size={16} color={accent} />
                    </View>
                    <Text style={[styles.sectionTitle, { color: navy }]}>{t('publicKitchenMenuFeatured')}</Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.featuredRow}
                  >
                    {featured.map((item) => (
                      <View key={`feat-${item.id}`} style={styles.featuredCell}>
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
                <View key={grp.title || 'all'} style={styles.categoryBlock}>
                  {grp.title ? (
                    <View style={styles.categoryHead}>
                      <View style={[styles.categoryDot, { backgroundColor: accent }]} />
                      <View style={[styles.categoryAccent, { backgroundColor: categoryAccentColor(grp.title) }]} />
                      <Text style={[styles.categoryTitle, { color: navy }]}>{grp.title}</Text>
                      <View style={styles.categoryLine} />
                      <View style={[styles.categoryCountBadge, { backgroundColor: `${accent}22`, borderColor: `${accent}55` }]}>
                        <Text style={[styles.categoryCount, { color: navy }]}>{grp.items.length}</Text>
                      </View>
                    </View>
                  ) : null}
                  <View style={[styles.grid, { gap: columns > 1 ? 22 : 18 }]}>
                    {grp.items.map((item) => (
                      <View key={item.id} style={{ width: cellWidth as `${number}%` }}>
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

        <LinearGradient
          colors={[navy, menuTheme.webHeroGradient[1], navy]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.footer}
        >
          <View style={[styles.footerGoldBar, { backgroundColor: accent }]} />
          <Text style={styles.footerBrand}>{org.name}</Text>
          <Text style={styles.footerSub}>{menuTheme.heroSubtitle ?? t('publicKitchenMenuHeroSub')}</Text>
        </LinearGradient>
      </ScrollView>

      <PublicKitchenMenuDishDetailModal
        visible={!!detailItem}
        item={detailItem}
        onClose={() => setDetailItem(null)}
        onAddToCart={
          detailItem
            ? () => {
                onAddToCart(detailItem);
              }
            : undefined
        }
        cartQuantity={detailItem ? cartQuantityFor(cartLines, detailItem.id) : 0}
      />

      <PublicKitchenMenuCartBar
        itemCount={cartCount}
        total={cartSum}
        onOpenCart={() => setCartOpen(true)}
      />

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
  root: { flex: 1, backgroundColor: menuUi.webSurface },
  scroll: { flex: 1 },
  hero: { width: '100%', position: 'relative', overflow: 'hidden', minHeight: 420 },
  heroBgImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  heroPattern: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.35,
    backgroundImage:
      'repeating-linear-gradient(135deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 12px)',
  } as object,
  heroGoldLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    opacity: 0.9,
  },
  heroGlowOrb: {
    position: 'absolute',
    borderRadius: 999,
  },
  heroGlowOrbA: { width: 360, height: 360, top: -120, right: -80, opacity: 0.85 },
  heroGlowOrbB: { width: 240, height: 240, bottom: -80, left: -50, opacity: 0.5 },
  heroInner: {
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 28,
    paddingBottom: 44,
    zIndex: 2,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 18,
    flexWrap: 'wrap',
  },
  heroLang: { marginLeft: 'auto' },
  paymentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
    zIndex: 50,
  },
  paymentBannerOk: { backgroundColor: '#ecfdf3' },
  paymentBannerCancel: { backgroundColor: '#fffbeb' },
  paymentBannerText: { flex: 1, fontSize: 14, fontWeight: '700', color: menuUi.navy },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(22, 163, 74, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(134, 239, 172, 0.35)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    position: 'relative',
  },
  liveDotRing: {
    position: 'absolute',
    left: 10,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: menuUi.liveGreen,
  },
  liveDotCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: menuUi.liveGreen,
  },
  liveBadgeText: { fontSize: 12, fontWeight: '800', color: '#bbf7d0', letterSpacing: 0.3 },
  heroHint: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 3.2,
    marginBottom: 8,
  },
  heroHotel: {
    fontSize: 48,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -1.5,
    lineHeight: 52,
  },
  heroDivider: {
    width: 56,
    height: 3,
    borderRadius: 2,
    marginTop: 14,
    marginBottom: 12,
  },
  heroTagline: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.15,
  },
  heroSub: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.68)',
    marginTop: 8,
    lineHeight: 22,
    maxWidth: 520,
  },
  heroStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 22 },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 14,
  },
  statText: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.92)' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 26,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 18,
    paddingHorizontal: 18,
    minHeight: 58,
    borderWidth: 1.5,
    gap: 12,
    maxWidth: 560,
    backdropFilter: 'blur(12px)',
  } as object,
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
    paddingVertical: 12,
    outlineStyle: 'none',
  } as object,
  content: {
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 22,
    marginTop: -28,
  },
  filtersPanel: {
    backgroundColor: menuUi.webGlass,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: menuUi.webGlassBorder,
    borderTopWidth: 4,
    ...menuUi.shadowLg,
    marginBottom: 32,
    overflow: 'hidden',
    position: 'sticky',
    top: 12,
    zIndex: 20,
    backdropFilter: 'blur(16px)',
  } as object,
  filtersPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  filtersPanelHeaderText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  filtersPanelBody: { padding: 18, paddingTop: 14 },
  sectionRow: { flexDirection: 'row', gap: 10 },
  sectionChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: menuUi.warmBg,
    borderWidth: 1,
    borderColor: menuUi.border,
  },
  sectionChipText: { fontSize: 14, fontWeight: '700', color: menuUi.webMuted },
  chipScroll: { marginTop: 14 },
  chipRow: { gap: 8, paddingRight: 8 },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 24,
    backgroundColor: menuUi.warmBg,
    borderWidth: 1,
    borderColor: menuUi.border,
  },
  catChipOn: { backgroundColor: menuUi.navy, borderColor: menuUi.navy },
  catChipText: { fontSize: 13, fontWeight: '700', color: menuUi.webMuted },
  catChipTextOn: { color: '#fff' },
  catCount: { fontSize: 11, fontWeight: '800', color: '#94a3b8' },
  catCountOn: { color: 'rgba(255,255,255,0.85)' },
  subFilter: { marginTop: 14 },
  subLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  tagChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: menuUi.warmBg,
    borderWidth: 1,
    borderColor: menuUi.border,
    marginRight: 8,
  },
  tagChipOn: { backgroundColor: menuUi.navyMid, borderColor: menuUi.navyMid },
  tagChipText: { fontSize: 13, fontWeight: '600', color: menuUi.webMuted },
  tagChipTextOn: { color: '#fff', fontWeight: '700' },
  filterFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  resultCount: { fontSize: 13, color: menuUi.webMuted, fontWeight: '600' },
  clearFilters: { fontSize: 13, fontWeight: '700', color: menuUi.accent },
  featuredBlock: { marginBottom: 36 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  sectionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  featuredRow: { gap: 18, paddingRight: 8 },
  featuredCell: { width: 300 },
  categoryBlock: { marginBottom: 40 },
  categoryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  categoryDot: { width: 8, height: 8, borderRadius: 4 },
  categoryAccent: { width: 3, height: 26, borderRadius: 2 },
  categoryTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  categoryLine: { flex: 1, height: 1, backgroundColor: menuUi.border },
  categoryCountBadge: {
    minWidth: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  categoryCount: { fontSize: 13, fontWeight: '800' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
  },
  empty: { alignItems: 'center', paddingVertical: 64, paddingHorizontal: 24 },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: menuUi.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: menuUi.navy },
  emptyBody: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 24,
    maxWidth: 360,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 44,
    marginTop: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  footerGoldBar: {
    position: 'absolute',
    top: 0,
    left: '20%',
    right: '20%',
    height: 3,
    borderRadius: 2,
  },
  footerBrand: { fontSize: 17, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
  footerSub: { fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 6, textAlign: 'center', maxWidth: 420 },
});
