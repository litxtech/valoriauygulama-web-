import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import {
  formatStockQty,
  getSimpleStockLevel,
  STOCK_QTY_LEVEL_COLORS,
  type StockQtyLevel,
} from '@/components/stock/stockDisplay';

export type StockInventoryListItem = {
  id: string;
  name: string;
  unit: string | null;
  current_stock: number | null;
  min_stock?: number | null;
  categoryName?: string | null;
};

type Props = {
  items: StockInventoryListItem[];
  onPress?: (item: StockInventoryListItem) => void;
  emptyMessage?: string;
  showRowIndex?: boolean;
};

const LEVEL_ICON: Record<StockQtyLevel, keyof typeof Ionicons.glyphMap> = {
  ok: 'checkmark-circle',
  critical: 'warning',
  empty: 'close-circle',
};

export function StockInventoryList({
  items,
  onPress,
  emptyMessage = 'Gösterilecek ürün yok.',
  showRowIndex = false,
}: Props) {
  if (items.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="list-outline" size={40} color={theme.colors.textMuted} />
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      {items.map((item, index) => {
        const cur = item.current_stock ?? 0;
        const level = getSimpleStockLevel(cur, item.min_stock);
        const colors = STOCK_QTY_LEVEL_COLORS[level];
        const qtyLabel = formatStockQty(cur, item.unit);
        const RowWrap = onPress ? TouchableOpacity : View;
        const rowProps = onPress
          ? { onPress: () => onPress(item), activeOpacity: 0.72, accessibilityRole: 'button' as const }
          : {};

        return (
          <RowWrap
            key={item.id}
            style={[styles.row, index > 0 && styles.rowBorder, level !== 'ok' && { backgroundColor: colors.bg }]}
            {...rowProps}
          >
            {showRowIndex ? (
              <Text style={styles.index}>{index + 1}</Text>
            ) : (
              <View style={[styles.dot, { backgroundColor: colors.fg }]} />
            )}
            <View style={styles.nameBlock}>
              <Text style={styles.name} numberOfLines={2}>
                {item.name}
              </Text>
              {item.categoryName ? (
                <Text style={styles.category} numberOfLines={1}>
                  {item.categoryName}
                </Text>
              ) : null}
            </View>
            <View style={[styles.qtyPill, { backgroundColor: colors.bg, borderColor: colors.border }]}>
              <Ionicons name={LEVEL_ICON[level]} size={14} color={colors.fg} style={styles.qtyIcon} />
              <Text style={[styles.qtyText, { color: colors.fg }]}>{qtyLabel}</Text>
            </View>
            {onPress ? <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} /> : null}
          </RowWrap>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    minHeight: 56,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.borderLight,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  index: {
    width: 22,
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  nameBlock: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '700', color: theme.colors.text, lineHeight: 21 },
  category: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted, marginTop: 2 },
  qtyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    maxWidth: '42%',
  },
  qtyIcon: { marginRight: -2 },
  qtyText: { fontSize: 14, fontWeight: '800' },
  emptyWrap: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20, gap: 10 },
  emptyText: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
