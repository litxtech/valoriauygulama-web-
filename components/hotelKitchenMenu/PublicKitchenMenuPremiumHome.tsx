import { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PublicKitchenMenuOrg } from '@/lib/publicKitchenMenu';
import type { HotelKitchenMenuItemWithImages } from '@/lib/hotelKitchenMenu';
import type { ResolvedKitchenMenuTheme } from '@/lib/kitchenMenuTheme';
import type { PublicMenuCartLine } from '@/lib/publicKitchenMenuCart';
import { cartItemCount } from '@/lib/publicKitchenMenuCart';
import type { PublicMenuLang } from '@/lib/publicKitchenMenuLang';
import { localizedCategoryLabel } from '@/lib/kitchenMenuI18n';
import { buildDietTagChips } from '@/lib/hotelKitchenMenuFilters';
import { useRestaurantAppearance } from '@/features/restaurant/hooks/useRestaurantAppearance';
import { RestaurantDashboardHeader } from '@/features/restaurant/components/RestaurantDashboardHeader';
import { RestaurantSearchBar } from '@/features/restaurant/components/RestaurantSearchBar';
import { RestaurantPromoSlider } from '@/features/restaurant/components/RestaurantPromoSlider';
import { RestaurantCategoryRail } from '@/features/restaurant/components/RestaurantCategoryRail';
import { RestaurantDietTagRail } from '@/features/restaurant/components/RestaurantDietTagRail';
import { RestaurantOrderModeChips, type OrderMode } from '@/features/restaurant/components/RestaurantOrderModeChips';
import { RestaurantExploreSection } from '@/features/restaurant/components/RestaurantExploreSection';
import { buildExploreSections } from '@/features/restaurant/utils/exploreSections';
import { PublicKitchenMenuLangToggle } from '@/components/hotelKitchenMenu/PublicKitchenMenuLangToggle';
import { PublicKitchenMenuGuestMenuButton } from '@/components/hotelKitchenMenu/PublicKitchenMenuGuestMenuButton';
import { PublicKitchenMenuHeaderExtras } from '@/components/hotelKitchenMenu/PublicKitchenMenuHeaderExtras';
import { PublicKitchenMenuGuestBook } from '@/components/hotelKitchenMenu/PublicKitchenMenuGuestBook';

type CategoryChip = { title: string; count: number };

type Props = {
  org: PublicKitchenMenuOrg;
  orgSlug: string;
  items: HotelKitchenMenuItemWithImages[];
  categoryChips: CategoryChip[];
  categoryFilter: string | null;
  onPickCategory: (title: string | null) => void;
  dietTagFilter: string | null;
  onPickDietTag: (tag: string | null) => void;
  search: string;
  onSearchChange: (v: string) => void;
  menuLang: PublicMenuLang;
  onMenuLangChange: (lang: PublicMenuLang) => void;
  menuTheme: ResolvedKitchenMenuTheme;
  cartLines: PublicMenuCartLine[];
  onCartPress: () => void;
  onOrdersPress: () => void;
  onItemPress: (item: HotelKitchenMenuItemWithImages) => void;
  onAddToCart: (item: HotelKitchenMenuItemWithImages) => void;
  orderMode: OrderMode;
  onOrderModeChange: (mode: OrderMode) => void;
  showExplore?: boolean;
};

export function PublicKitchenMenuPremiumHome({
  org,
  orgSlug,
  items,
  categoryChips,
  categoryFilter,
  onPickCategory,
  dietTagFilter,
  onPickDietTag,
  search,
  onSearchChange,
  menuLang,
  onMenuLangChange,
  menuTheme,
  cartLines,
  onCartPress,
  onOrdersPress,
  onItemPress,
  onAddToCart,
  orderMode,
  onOrderModeChange,
  showExplore = true,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { tokens, toggleScheme } = useRestaurantAppearance(menuTheme.primaryColor, menuTheme.navyColor);
  const [guestRating, setGuestRating] = useState<{ avg: number; count: number } | null>(null);

  const onGuestRatingChange = useCallback((avg: number, count: number) => {
    setGuestRating(count > 0 ? { avg, count } : null);
  }, []);

  const railItems = useMemo(
    () =>
      categoryChips.map((c) => ({
        id: c.title,
        label: localizedCategoryLabel(items, c.title, menuLang),
        count: c.count,
      })),
    [categoryChips, items, menuLang]
  );

  const dietChips = useMemo(() => buildDietTagChips(items), [items]);

  const exploreSections = useMemo(() => (showExplore ? buildExploreSections(items) : []), [items, showExplore]);

  const orderLabels: Record<OrderMode, string> = {
    table: t('restaurantOrderTable', { defaultValue: 'Masa' }),
    room: t('restaurantOrderRoom', { defaultValue: 'Oda Servisi' }),
    takeaway: t('restaurantOrderTakeaway', { defaultValue: 'Gel Al' }),
    delivery: t('restaurantOrderDelivery', { defaultValue: 'Paket Servis' }),
  };

  const heroSubtitle =
    menuLang === 'tr'
      ? (menuTheme.heroSubtitle ?? t('publicKitchenMenuHeroSub'))
      : t('publicKitchenMenuHeroSub');

  const langTone = tokens.scheme === 'dark' ? 'dark' : 'light';

  return (
    <View style={[styles.root, { backgroundColor: tokens.bg }]}>
      <RestaurantDashboardHeader
        tokens={tokens}
        orgName={org.name}
        rating={guestRating?.avg ?? 4.8}
        description={heroSubtitle}
        cartCount={cartItemCount(cartLines)}
        onCartPress={onCartPress}
        onOrdersPress={onOrdersPress}
        titleAccessory={
          <PublicKitchenMenuHeaderExtras
            organizationId={org.id}
            menuLang={menuLang}
            tokens={tokens}
          />
        }
        guestMenu={
          <PublicKitchenMenuGuestMenuButton
            organizationId={org.id}
            menuLang={menuLang}
            accentColor={menuTheme.primaryColor}
            navyColor={menuTheme.navyColor}
            iconBorderColor={tokens.border}
            iconColor={tokens.text}
          />
        }
        langToggle={
          <PublicKitchenMenuLangToggle lang={menuLang} onChange={onMenuLangChange} tone={langTone} />
        }
        onThemeToggle={toggleScheme}
        safeTop={insets.top}
      />

      <RestaurantSearchBar
        tokens={tokens}
        value={search}
        onChange={onSearchChange}
        placeholder={t('hotelKitchenMenuSearchPh')}
        sticky
      />

      <View style={styles.block}>
        <RestaurantOrderModeChips
          tokens={tokens}
          checkoutFields={menuTheme.checkoutFields}
          selected={orderMode}
          onSelect={onOrderModeChange}
          labels={orderLabels}
        />
      </View>

      <PublicKitchenMenuGuestBook
        orgSlug={orgSlug}
        tokens={tokens}
        accentColor={menuTheme.primaryColor}
        onRatingChange={onGuestRatingChange}
      />

      <View style={styles.block}>
        <RestaurantPromoSlider tokens={tokens} promos={menuTheme.promoVideos} />
      </View>

      {railItems.length > 0 ? (
        <View style={styles.block}>
          <RestaurantCategoryRail
            tokens={tokens}
            items={railItems}
            selectedId={categoryFilter}
            onSelect={onPickCategory}
            allLabel={t('hotelKitchenMenuAllCategories')}
          />
        </View>
      ) : null}

      <View style={styles.block}>
        <RestaurantDietTagRail
          tokens={tokens}
          chips={dietChips}
          selected={dietTagFilter}
          onSelect={onPickDietTag}
        />
      </View>

      {showExplore && exploreSections.length > 0
        ? exploreSections.map((section) => (
            <RestaurantExploreSection
              key={section.id}
              tokens={tokens}
              section={section}
              accent={menuTheme.primaryColor}
              navy={menuTheme.navyColor}
              menuLang={menuLang}
              cartLines={cartLines}
              onItemPress={onItemPress}
              onAddToCart={onAddToCart}
            />
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%' },
  block: { marginBottom: 8 },
});
