import { ScrollView, TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RestaurantTokens } from '@/features/restaurant/tokens/restaurantTokens';

export type CategoryRailItem = {
  id: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  count?: number;
};

type Props = {
  tokens: RestaurantTokens;
  items: CategoryRailItem[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  allLabel: string;
};

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  breakfast: 'sunny-outline',
  grill: 'flame-outline',
  kebab: 'restaurant-outline',
  pizza: 'pizza-outline',
  burger: 'fast-food-outline',
  pasta: 'nutrition-outline',
  soup: 'cafe-outline',
  salad: 'leaf-outline',
  desserts: 'ice-cream-outline',
  coffee: 'cafe-outline',
  drinks: 'wine-outline',
  kids: 'happy-outline',
  vegetarian: 'leaf-outline',
  seafood: 'fish-outline',
  turkish: 'flag-outline',
};

function iconForLabel(label: string): keyof typeof Ionicons.glyphMap {
  const l = label.toLowerCase();
  if (l.includes('kahvalt') || l.includes('breakfast')) return CATEGORY_ICONS.breakfast;
  if (l.includes('izgara') || l.includes('grill')) return CATEGORY_ICONS.grill;
  if (l.includes('kebap')) return CATEGORY_ICONS.kebab;
  if (l.includes('pizza')) return CATEGORY_ICONS.pizza;
  if (l.includes('burger')) return CATEGORY_ICONS.burger;
  if (l.includes('makarna') || l.includes('pasta')) return CATEGORY_ICONS.pasta;
  if (l.includes('çorba') || l.includes('corba') || l.includes('soup')) return CATEGORY_ICONS.soup;
  if (l.includes('salata') || l.includes('salad')) return CATEGORY_ICONS.salad;
  if (l.includes('tatlı') || l.includes('tatli') || l.includes('dessert')) return CATEGORY_ICONS.desserts;
  if (l.includes('kahve') || l.includes('coffee')) return CATEGORY_ICONS.coffee;
  if (l.includes('içecek') || l.includes('icecek') || l.includes('drink')) return CATEGORY_ICONS.drinks;
  if (l.includes('çocuk') || l.includes('kids')) return CATEGORY_ICONS.kids;
  if (l.includes('deniz') || l.includes('balık') || l.includes('seafood')) return CATEGORY_ICONS.seafood;
  return 'grid-outline';
}

export function RestaurantCategoryRail({ tokens, items, selectedId, onSelect, allLabel }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
    >
      <TouchableOpacity
        style={[
          styles.chip,
          { borderColor: tokens.border, backgroundColor: !selectedId ? tokens.navy : tokens.bgElevated },
        ]}
        onPress={() => onSelect(null)}
      >
        <Ionicons name="apps-outline" size={15} color={!selectedId ? '#fff' : tokens.textMuted} />
        <Text style={[styles.chipText, { color: !selectedId ? '#fff' : tokens.text }]}>{allLabel}</Text>
      </TouchableOpacity>
      {items.map((item) => {
        const active = selectedId === item.id;
        const icon = item.icon ?? iconForLabel(item.label);
        return (
          <TouchableOpacity
            key={item.id}
            style={[
              styles.chip,
              {
                borderColor: active ? tokens.accent : tokens.border,
                backgroundColor: active ? tokens.accentSoft : tokens.bgElevated,
              },
            ]}
            onPress={() => onSelect(active ? null : item.id)}
          >
            <Ionicons name={icon} size={15} color={active ? tokens.accent : tokens.textMuted} />
            <Text style={[styles.chipText, { color: active ? tokens.accent : tokens.text }]} numberOfLines={1}>
              {item.label}
            </Text>
            {item.count != null ? (
              <View style={[styles.count, { backgroundColor: active ? tokens.accent : tokens.border }]}>
                <Text style={[styles.countText, { color: active ? '#fff' : tokens.textMuted }]}>{item.count}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: { paddingHorizontal: 16, gap: 8, paddingVertical: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 180,
  },
  chipText: { fontSize: 13, fontWeight: '700' },
  count: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  countText: { fontSize: 10, fontWeight: '800' },
});
