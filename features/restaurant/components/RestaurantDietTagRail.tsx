import { ScrollView, TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { RestaurantTokens } from '@/features/restaurant/tokens/restaurantTokens';
import type { DietTagChip } from '@/lib/hotelKitchenMenuFilters';
import { kitchenMenuTagI18nKey, type KitchenMenuTagId } from '@/lib/kitchenMenuTags';

type Props = {
  tokens: RestaurantTokens;
  chips: DietTagChip[];
  selected: string | null;
  onSelect: (tag: string | null) => void;
};

const ICONS: Record<KitchenMenuTagId, keyof typeof Ionicons.glyphMap> = {
  meat: 'flame-outline',
  vegetarian: 'leaf-outline',
  seafood: 'fish-outline',
  vegan: 'nutrition-outline',
  dessert: 'ice-cream-outline',
  breakfast: 'sunny-outline',
  drink: 'wine-outline',
};

export function RestaurantDietTagRail({ tokens, chips, selected, onSelect }: Props) {
  const { t } = useTranslation();
  if (!chips.length) return null;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: tokens.textMuted }]}>
        {t('kitchenMenuQuickFilters', { defaultValue: 'Hızlı filtre' })}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {chips.map((chip) => {
          const active = selected === chip.tag;
          return (
            <TouchableOpacity
              key={chip.tag}
              style={[
                styles.chip,
                {
                  borderColor: active ? tokens.accent : tokens.border,
                  backgroundColor: active ? tokens.accentSoft : tokens.bgElevated,
                },
              ]}
              onPress={() => onSelect(active ? null : chip.tag)}
              activeOpacity={0.85}
            >
              <Ionicons
                name={ICONS[chip.tag]}
                size={15}
                color={active ? tokens.accent : tokens.textMuted}
              />
              <Text style={[styles.chipText, { color: active ? tokens.accent : tokens.text }]}>
                {t(kitchenMenuTagI18nKey(chip.tag))}
              </Text>
              <Text style={[styles.count, { color: tokens.textMuted }]}>{chip.count}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 4 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    paddingHorizontal: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  strip: { paddingHorizontal: 16, gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: '700' },
  count: { fontSize: 11, fontWeight: '600' },
});
