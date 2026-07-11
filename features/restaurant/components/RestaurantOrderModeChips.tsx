import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { KitchenMenuCheckoutFields } from '@/lib/kitchenMenuCheckoutFields';
import type { RestaurantTokens } from '@/features/restaurant/tokens/restaurantTokens';

export type OrderMode = 'table' | 'room' | 'takeaway' | 'delivery';

type Props = {
  tokens: RestaurantTokens;
  checkoutFields: KitchenMenuCheckoutFields;
  selected: OrderMode;
  onSelect: (mode: OrderMode) => void;
  labels: Record<OrderMode, string>;
};

function enabledModes(fields: KitchenMenuCheckoutFields): OrderMode[] {
  const out: OrderMode[] = [];
  if (fields.table !== 'hidden') out.push('table');
  if (fields.room !== 'hidden') out.push('room');
  if (fields.location !== 'hidden') out.push('delivery');
  out.push('takeaway');
  return [...new Set(out)];
}

const MODE_ICONS: Record<OrderMode, keyof typeof Ionicons.glyphMap> = {
  table: 'restaurant-outline',
  room: 'bed-outline',
  takeaway: 'bag-handle-outline',
  delivery: 'bicycle-outline',
};

export function RestaurantOrderModeChips({ tokens, checkoutFields, selected, onSelect, labels }: Props) {
  const modes = enabledModes(checkoutFields);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
      {modes.map((mode) => {
        const active = selected === mode;
        return (
          <TouchableOpacity
            key={mode}
            style={[
              styles.chip,
              {
                borderColor: active ? tokens.accent : tokens.border,
                backgroundColor: active ? tokens.accentSoft : tokens.bgElevated,
              },
            ]}
            onPress={() => onSelect(mode)}
          >
            <Ionicons name={MODE_ICONS[mode]} size={16} color={active ? tokens.accent : tokens.textMuted} />
            <Text style={[styles.text, { color: active ? tokens.accent : tokens.text }]}>{labels[mode]}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: { paddingHorizontal: 16, gap: 8, paddingVertical: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  text: { fontSize: 13, fontWeight: '700' },
});
