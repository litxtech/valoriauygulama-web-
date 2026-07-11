import { useMemo } from 'react';
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
import { useRestaurantAppearance } from '@/features/restaurant/hooks/useRestaurantAppearance';
import { RestaurantDashboardHeader } from '@/features/restaurant/components/RestaurantDashboardHeader';
import { RestaurantSearchBar } from '@/features/restaurant/components/RestaurantSearchBar';
import { RestaurantPromoSlider } from '@/features/restaurant/components/RestaurantPromoSlider';
import { RestaurantCategoryRail } from '@/features/restaurant/components/RestaurantCategoryRail';
import { RestaurantOrderModeChips, type OrderMode } from '@/features/restaurant/components/RestaurantOrderModeChips';
import { RestaurantExploreSection } from '@/features/restaurant/components/RestaurantExploreSection';
import { buildExploreSections } from '@/features/restaurant/utils/exploreSections';

type CategoryChip = { title: string; count: number };

type Props = {
  org: PublicKitchenMenuOrg;
  items: HotelKitchenMenuItemWithImages[];
  categoryChips: CategoryChip[];
  categoryFilter: string | null;
  onPickCategory: (title: string | null) => void;
  search: string;
  onSearchChange: (v: string) => void;
  menuLang: PublicMenuLang;
  menuTheme: ResolvedKitchenMenuTheme;
  cartLines: PublicMenuCartLine[];
  onCartPress: () => void;
  onOrdersPress: () => void;
  onItemPress: (item: HotelKitchenMenuItemWithImages) => void;
  onAddToCart: (item: HotelKitchenMenuItemWithImages) => void;
  langToggle?: React.ReactNode;
  orderMode: OrderMode;
  onOrderModeChange: (mode: OrderMode) => void;
  showExplore?: boolean;
};

export function PublicKitchenMenuPremiumHome({
  org,
  items,
  categoryChips,
  categoryFilter,
  onPickCategory,
  search,
  onSearchChange,
  menuLang,
  menuTheme,
  cartLines,
  onCartPress,
  onOrdersPress,
  onItemPress,
  onAddToCart,
  langToggle,
  orderMode,
  onOrderModeChange,
  showExplore = true,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { tokens, toggleScheme } = useRestaurantAppearance(menuTheme.primaryColor, menuTheme.navyColor);

  const railItems = useMemo(
    () =>
      categoryChips.map((c) => ({
        id: c.title,
        label: localizedCategoryLabel(items, c.title, menuLang),
        count: c.count,
      })),
    [categoryChips, items, menuLang]
  );

  const exploreSections = useMemo(() => (showExplore ? buildExploreSections(items) : []), [items, showExplore]);

  const orderLabels: Record<OrderMode, string> = {
    table: t('restaurantOrderTable', { defaultValue: 'Masa' }),
    room: t('restaurantOrderRoom', { defaultValue: 'Oda Servisi' }),
    takeaway: t('restaurantOrderTakeaway', { defaultValue: 'Gel Al' }),
    delivery: t('restaurantOrderDelivery', { defaultValue: 'Paket Servis' }),
  };

  return (
    <View style={[styles.root, { backgroundColor: tokens.bg }]}>
      <RestaurantDashboardHeader
        tokens={tokens}
        orgName={org.name}
        description={menuTheme.heroSubtitle ?? undefined}
        cartCount={cartItemCount(cartLines)}
        onCartPress={onCartPress}
        onOrdersPress={onOrdersPress}
        langToggle={langToggle}
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
