import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { PublicKitchenMenuDishCard } from '@/components/hotelKitchenMenu/PublicKitchenMenuDishCard';
import type { HotelKitchenMenuItemWithImages } from '@/lib/hotelKitchenMenu';
import type { ExploreSection } from '@/features/restaurant/utils/exploreSections';
import type { RestaurantTokens } from '@/features/restaurant/tokens/restaurantTokens';
import type { PublicMenuLang } from '@/lib/publicKitchenMenuLang';
import type { PublicMenuCartLine } from '@/lib/publicKitchenMenuCart';
import { cartQuantityFor } from '@/lib/publicKitchenMenuCart';

type Props = {
  tokens: RestaurantTokens;
  section: ExploreSection;
  accent: string;
  navy: string;
  menuLang: PublicMenuLang;
  cartLines: PublicMenuCartLine[];
  onItemPress: (item: HotelKitchenMenuItemWithImages) => void;
  onAddToCart: (item: HotelKitchenMenuItemWithImages) => void;
  cardWidth?: number;
};

export function RestaurantExploreSection({
  tokens,
  section,
  accent,
  navy,
  menuLang,
  cartLines,
  onItemPress,
  onAddToCart,
  cardWidth = 200,
}: Props) {
  const { t } = useTranslation();
  const title = t(section.titleKey, { defaultValue: section.id });
  const dishSurface = {
    cardBg: tokens.bgElevated,
    border: tokens.border,
    name: tokens.text,
    desc: tokens.textMuted,
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: tokens.text }]}>{title}</Text>
        <View style={[styles.line, { backgroundColor: tokens.accentSoft }]} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {section.items.map((item) => (
          <View key={item.id} style={{ width: cardWidth }}>
            <PublicKitchenMenuDishCard
              item={item}
              layout="premium"
              themeAccent={accent}
              themeNavy={navy}
              surface={dishSurface}
              displayLang={menuLang}
              onPress={() => onItemPress(item)}
              onAddToCart={() => onAddToCart(item)}
              cartQuantity={cartQuantityFor(cartLines, item.id)}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 22 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  line: { flex: 1, height: 2, borderRadius: 1 },
  strip: { paddingHorizontal: 16, gap: 12 },
});
