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
import { categoryAccentColor, menuUi } from '@/components/hotelKitchenMenu/hotelKitchenMenuUi';
import type { PublicKitchenMenuOrg } from '@/lib/publicKitchenMenu';
import type { HotelKitchenMenuItemWithImages } from '@/lib/hotelKitchenMenu';
import type { MenuSectionFilter } from '@/lib/hotelKitchenMenuFilters';
import { coverImageUrl } from '@/lib/hotelKitchenMenu';
import type { PublicMenuCartLine } from '@/lib/publicKitchenMenuCart';
import { cartItemCount, cartQuantityFor, cartTotal } from '@/lib/publicKitchenMenuCart';
import type { PublicMenuLang } from '@/lib/publicKitchenMenuLang';

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
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
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

  const showFeatured = featured.length >= 2 && !hasActiveFilters && section === 'all' && !categoryFilter;

  return (
    <View style={styles.root}>
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
          colors={[...menuUi.webHeroGradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={[styles.heroGlowOrb, styles.heroGlowOrbA]} />
          <View style={[styles.heroGlowOrb, styles.heroGlowOrbB]} />

          <View style={[styles.heroInner, { maxWidth: contentMax + 80, paddingTop: insets.top + 28 }]}>
            <View style={styles.heroTopRow}>
              <LivePulseBadge label={t('publicKitchenMenuLiveBadge')} />
              <Text style={styles.heroHint}>{t('publicKitchenMenuLiveHint')}</Text>
              <View style={styles.heroLang}>
                <PublicKitchenMenuLangToggle lang={menuLang} onChange={onMenuLangChange} />
              </View>
            </View>

            <Text style={styles.heroHotel}>{org.name}</Text>
            <Text style={styles.heroTagline}>{t('hotelKitchenMenuHeroTitle')}</Text>
            <Text style={styles.heroSub}>{t('publicKitchenMenuHeroSub')}</Text>

            <View style={styles.heroStats}>
              <View style={styles.statPill}>
                <Ionicons name="restaurant-outline" size={16} color={menuUi.accentLight} />
                <Text style={styles.statText}>{t('hotelKitchenMenuResultCount', { count: items.length })}</Text>
              </View>
              {categoryChips.length > 0 ? (
                <View style={styles.statPill}>
                  <Ionicons name="layers-outline" size={16} color={menuUi.accentLight} />
                  <Text style={styles.statText}>
                    {categoryChips.length} {t('publicKitchenMenuCategories').toLowerCase()}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.searchWrap}>
              <Ionicons name="search" size={20} color="rgba(255,255,255,0.55)" />
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
          <View style={styles.filtersPanel}>
            <View style={styles.sectionRow}>
              <TouchableOpacity
                style={[styles.sectionChip, section === 'all' && styles.sectionChipOn]}
                onPress={() => setSection('all')}
              >
                <Ionicons name="grid-outline" size={16} color={section === 'all' ? menuUi.navy : menuUi.webMuted} />
                <Text style={[styles.sectionChipText, section === 'all' && styles.sectionChipTextOn]}>
                  {t('hotelKitchenMenuSectionAll')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sectionChip, section === 'breakfast' && styles.sectionChipOn]}
                onPress={() => setSection('breakfast')}
              >
                <Ionicons name="sunny-outline" size={16} color={section === 'breakfast' ? menuUi.navy : menuUi.webMuted} />
                <Text style={[styles.sectionChipText, section === 'breakfast' && styles.sectionChipTextOn]}>
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
                  <Text style={styles.clearFilters}>{t('hotelKitchenMenuClearFilters')}</Text>
                </TouchableOpacity>
              ) : null}
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
                    <Ionicons name="sparkles" size={18} color={menuUi.accent} />
                    <Text style={styles.sectionTitle}>{t('publicKitchenMenuFeatured')}</Text>
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
                      <View style={[styles.categoryAccent, { backgroundColor: categoryAccentColor(grp.title) }]} />
                      <Text style={styles.categoryTitle}>{grp.title}</Text>
                      <View style={styles.categoryLine} />
                      <Text style={styles.categoryCount}>{grp.items.length}</Text>
                    </View>
                  ) : null}
                  <View style={[styles.grid, { gap: columns > 1 ? 20 : 16 }]}>
                    {grp.items.map((item) => (
                      <View key={item.id} style={{ width: cellWidth as `${number}%` }}>
                        <PublicKitchenMenuDishCard
                          item={item}
                          layout="premium"
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

        <View style={styles.footer}>
          <Text style={styles.footerBrand}>{org.name}</Text>
          <Text style={styles.footerSub}>{t('publicKitchenMenuHeroSub')}</Text>
        </View>
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
  hero: { width: '100%', position: 'relative', overflow: 'hidden' },
  heroGlowOrb: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: menuUi.webHeroGlow,
  },
  heroGlowOrbA: { width: 280, height: 280, top: -80, right: -40, opacity: 0.9 },
  heroGlowOrbB: { width: 200, height: 200, bottom: -60, left: -30, opacity: 0.55 },
  heroInner: {
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 24,
    paddingBottom: 36,
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
  heroHotel: {
    fontSize: 42,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -1.2,
    lineHeight: 46,
  },
  heroTagline: {
    fontSize: 16,
    fontWeight: '700',
    color: menuUi.accentLight,
    marginTop: 8,
    letterSpacing: 0.2,
  },
  heroSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.62)',
    marginTop: 6,
    lineHeight: 20,
    maxWidth: 480,
  },
  heroStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  statText: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.88)' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    paddingHorizontal: 16,
    minHeight: 54,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    gap: 10,
    maxWidth: 520,
  },
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
    paddingHorizontal: 20,
    marginTop: -20,
  },
  filtersPanel: {
    backgroundColor: menuUi.webGlass,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: menuUi.webGlassBorder,
    ...menuUi.shadowSm,
    marginBottom: 28,
    position: 'sticky',
    top: 12,
    zIndex: 20,
    backdropFilter: 'blur(14px)',
  } as object,
  sectionRow: { flexDirection: 'row', gap: 10 },
  sectionChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: menuUi.warmBg,
    borderWidth: 1,
    borderColor: menuUi.border,
  },
  sectionChipOn: { backgroundColor: menuUi.accentSoft, borderColor: menuUi.accent },
  sectionChipText: { fontSize: 14, fontWeight: '700', color: menuUi.webMuted },
  sectionChipTextOn: { color: menuUi.navy, fontWeight: '800' },
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
  featuredBlock: { marginBottom: 32 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: menuUi.navy, letterSpacing: -0.3 },
  featuredRow: { gap: 16, paddingRight: 8 },
  featuredCell: { width: 280 },
  categoryBlock: { marginBottom: 36 },
  categoryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  categoryAccent: { width: 4, height: 28, borderRadius: 2 },
  categoryTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: menuUi.navy,
    letterSpacing: -0.4,
  },
  categoryLine: { flex: 1, height: 1, backgroundColor: menuUi.border },
  categoryCount: { fontSize: 13, fontWeight: '800', color: menuUi.webMuted },
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
    paddingVertical: 40,
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: menuUi.border,
  },
  footerBrand: { fontSize: 15, fontWeight: '800', color: menuUi.navy },
  footerSub: { fontSize: 13, color: menuUi.webMuted, marginTop: 4 },
});
