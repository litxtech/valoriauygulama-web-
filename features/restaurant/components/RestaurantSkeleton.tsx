import { View, StyleSheet } from 'react-native';
import type { RestaurantTokens } from '@/features/restaurant/tokens/restaurantTokens';

type Props = {
  tokens: RestaurantTokens;
  lines?: number;
};

export function RestaurantSkeleton({ tokens, lines = 3 }: Props) {
  return (
    <View style={styles.wrap}>
      {Array.from({ length: lines }).map((_, i) => (
        <View
          key={`sk-${i}`}
          style={[styles.line, { backgroundColor: tokens.border, opacity: 0.55 - i * 0.08 }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, paddingVertical: 8 },
  line: { height: 14, borderRadius: 8, width: '100%' },
});
