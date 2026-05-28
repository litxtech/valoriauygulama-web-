import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import type { KitchenStockItem } from '@/lib/kitchenOps/types';
import { KITCHEN_STOCK_STATUS_COLORS, fmtKitchenQty, getKitchenStockStatus } from '@/lib/kitchenOps/stockStatus';
import { formatDateShort } from '@/lib/date';

type Props = {
  item: KitchenStockItem;
  onPress?: () => void;
  showQuickExit?: boolean;
  onQuickExit?: (qty: number) => void;
};

export function KitchenStockItemCard({ item, onPress, showQuickExit, onQuickExit }: Props) {
  const status = getKitchenStockStatus(item);
  const colors = KITCHEN_STOCK_STATUS_COLORS[status] ?? KITCHEN_STOCK_STATUS_COLORS.ok;
  const rawCat = item.category as { name: string } | { name: string }[] | null | undefined;
  const catName = Array.isArray(rawCat) ? rawCat[0]?.name : rawCat?.name;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.card, pressed && onPress && styles.pressed]}
    >
      <View style={styles.row}>
        {item.image_url ? (
          <CachedImage uri={item.image_url} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
            <Ionicons name="nutrition-outline" size={22} color={theme.colors.textMuted} />
          </View>
        )}
        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          {catName ? <Text style={styles.cat}>{catName}</Text> : null}
          <Text style={styles.qty}>{fmtKitchenQty(Number(item.current_quantity), item.unit)}</Text>
          <View style={styles.metaRow}>
            {item.last_in_at ? <Text style={styles.meta}>Giriş: {formatDateShort(item.last_in_at)}</Text> : null}
            {item.last_out_at ? <Text style={styles.meta}>Çıkış: {formatDateShort(item.last_out_at)}</Text> : null}
          </View>
        </View>
        <View style={[styles.badge, { backgroundColor: colors.bg }]}>
          <Text style={[styles.badgeText, { color: colors.text }]}>{colors.label}</Text>
        </View>
      </View>
      {showQuickExit && onQuickExit ? (
        <View style={styles.quickRow}>
          {[-1, -2, -5].map((n) => (
            <Pressable key={n} style={styles.quickBtn} onPress={() => onQuickExit(Math.abs(n))}>
              <Text style={styles.quickBtnText}>{n} {item.unit}</Text>
            </Pressable>
          ))}
          <Pressable style={[styles.quickBtn, styles.quickBtnAlt]} onPress={onPress}>
            <Text style={styles.quickBtnAltText}>Elle gir</Text>
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  pressed: { opacity: 0.9 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  thumb: { width: 52, height: 52, borderRadius: 10 },
  thumbPlaceholder: { backgroundColor: theme.colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  name: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  cat: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  qty: { fontSize: 18, fontWeight: '700', color: theme.colors.primary, marginTop: 4 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  meta: { fontSize: 11, color: theme.colors.textSecondary },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.borderLight },
  quickBtn: { backgroundColor: '#fffbeb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#fde68a' },
  quickBtnText: { fontSize: 13, fontWeight: '700', color: '#d97706' },
  quickBtnAlt: { backgroundColor: theme.colors.backgroundSecondary, borderColor: theme.colors.border },
  quickBtnAltText: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary },
});
