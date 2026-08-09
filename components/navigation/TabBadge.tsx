import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@/constants/theme';

type Props = {
  count?: number | null;
  max?: number;
  testID?: string;
};

function formatBadge(count: number, max: number): string {
  if (count > max) return `${max}+`;
  return String(count);
}

/** Unread / notification pill for tab icons. */
export const TabBadge = memo(function TabBadge({ count, max = 99, testID }: Props) {
  const n = typeof count === 'number' ? count : 0;
  if (n <= 0) return null;

  return (
    <View style={styles.badge} testID={testID} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text style={styles.text} numberOfLines={1}>
        {formatBadge(n, max)}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -5,
    right: -11,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: theme.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  text: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
});
