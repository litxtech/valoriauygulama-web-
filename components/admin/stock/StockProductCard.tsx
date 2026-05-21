import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';
import { adminTheme } from '@/constants/adminTheme';
import { getStockLevel, stockPercent, STOCK_LEVEL_META } from './stockUi';

export type StockProductCardData = {
  id: string;
  name: string;
  barcode: string | null;
  unit: string | null;
  current_stock: number | null;
  min_stock: number | null;
  max_stock: number | null;
  image_url: string | null;
  categoryName: string | null;
  organizationName: string | null;
  fallbackImageUrl: string | null;
  lastStaffName: string | null;
  lastMovementAt: string | null;
};

type Props = {
  product: StockProductCardData;
  onPress: () => void;
  onImagePress: (uri: string) => void;
  onEntry: () => void;
  onExit: () => void;
  onDelete: () => void;
};

export function StockProductCard({ product: p, onPress, onImagePress, onEntry, onExit, onDelete }: Props) {
  const cur = p.current_stock ?? 0;
  const min = p.min_stock ?? 0;
  const max = p.max_stock ?? Math.max(cur, min, 1);
  const level = getStockLevel(cur, min, max);
  const meta = STOCK_LEVEL_META[level];
  const pct = stockPercent(cur, max);
  const imageUri = p.image_url ?? p.fallbackImageUrl;

  return (
    <TouchableOpacity style={[styles.card, level === 'critical' || level === 'empty' ? styles.cardAlert : null]} onPress={onPress} activeOpacity={0.88}>
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.thumbWrap}
          onPress={() => imageUri && onImagePress(imageUri)}
          activeOpacity={imageUri ? 0.9 : 1}
          disabled={!imageUri}
        >
          {imageUri ? (
            <CachedImage uri={imageUri} style={styles.thumb} contentFit="cover" />
          ) : (
            <View style={styles.thumbPlaceholder}>
              <Ionicons name="cube-outline" size={28} color={adminTheme.colors.textMuted} />
            </View>
          )}
          <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
        </TouchableOpacity>

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={styles.name} numberOfLines={2}>
              {p.name}
            </Text>
            <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
              <Ionicons name={meta.icon} size={12} color={meta.color} />
              <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
            </View>
          </View>

          {p.categoryName ? (
            <View style={styles.tagRow}>
              <View style={styles.tag}>
                <Ionicons name="pricetag-outline" size={11} color={adminTheme.colors.accent} />
                <Text style={styles.tagText}>{p.categoryName}</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.stockRow}>
            <Text style={styles.stockNum}>{cur}</Text>
            <Text style={styles.stockUnit}>{p.unit ?? 'adet'}</Text>
            {min > 0 ? <Text style={styles.stockRange}>min {min}</Text> : null}
            {max > 0 ? <Text style={styles.stockRange}>· max {max}</Text> : null}
          </View>

          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${Math.max(pct, level === 'empty' ? 0 : 4)}%`, backgroundColor: meta.color }]} />
          </View>

          <View style={styles.metaRow}>
            {p.barcode ? (
              <View style={styles.metaBarcode}>
                <Ionicons name="barcode-outline" size={12} color={adminTheme.colors.textSecondary} />
                <Text style={styles.meta} numberOfLines={1}>
                  {p.barcode}
                </Text>
              </View>
            ) : (
              <Text style={styles.metaMuted}>Barkod yok</Text>
            )}
          </View>
          {p.organizationName ? (
            <Text style={styles.org} numberOfLines={1}>
              {p.organizationName}
            </Text>
          ) : null}
          {p.lastStaffName ? (
            <Text style={styles.lastMove} numberOfLines={1}>
              Son: {p.lastStaffName}
              {p.lastMovementAt ? ` · ${p.lastMovementAt}` : ''}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={onPress} hitSlop={8}>
          <Ionicons name="information-circle-outline" size={18} color={adminTheme.colors.primary} />
          <Text style={styles.actionLabel}>Detay</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.actionIn]} onPress={onEntry} hitSlop={8}>
          <Ionicons name="add-circle-outline" size={18} color={stockThemeIn} />
          <Text style={[styles.actionLabel, { color: stockThemeIn }]}>Giriş</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.actionOut]} onPress={onExit} hitSlop={8}>
          <Ionicons name="remove-circle-outline" size={18} color={stockThemeOut} />
          <Text style={[styles.actionLabel, { color: stockThemeOut }]}>Çıkış</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={onDelete} hitSlop={8}>
          <Ionicons name="trash-outline" size={18} color={adminTheme.colors.error} />
          <Text style={[styles.actionLabel, { color: adminTheme.colors.error }]}>Sil</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const stockThemeIn = '#059669';
const stockThemeOut = '#d97706';

const styles = StyleSheet.create({
  card: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    marginBottom: 12,
    overflow: 'hidden',
    ...adminTheme.shadow.sm,
  },
  cardAlert: {
    borderColor: '#fecaca',
    backgroundColor: '#fffbfb',
  },
  row: { flexDirection: 'row', padding: 12, gap: 12 },
  thumbWrap: { width: 88, height: 88, borderRadius: 14, overflow: 'hidden', backgroundColor: adminTheme.colors.surfaceTertiary },
  thumb: { width: '100%', height: '100%' },
  thumbPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statusDot: { position: 'absolute', top: 6, right: 6, width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: '#fff' },
  body: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  name: { flex: 1, fontSize: 16, fontWeight: '800', color: adminTheme.colors.text, lineHeight: 20 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 10, fontWeight: '800' },
  tagRow: { flexDirection: 'row', marginTop: 6 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff7ed', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  tagText: { fontSize: 11, fontWeight: '600', color: adminTheme.colors.accent },
  stockRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 8 },
  stockNum: { fontSize: 26, fontWeight: '800', color: adminTheme.colors.text, letterSpacing: -0.5 },
  stockUnit: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.textSecondary },
  stockRange: { fontSize: 11, color: adminTheme.colors.textMuted, marginLeft: 2 },
  barTrack: { height: 6, backgroundColor: adminTheme.colors.surfaceTertiary, borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  metaRow: { marginTop: 6 },
  metaBarcode: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  meta: { fontSize: 11, color: adminTheme.colors.textSecondary, fontWeight: '500', flex: 1 },
  metaMuted: { fontSize: 11, color: adminTheme.colors.textMuted },
  org: { fontSize: 11, fontWeight: '600', color: adminTheme.colors.info, marginTop: 2 },
  lastMove: { fontSize: 10, color: adminTheme.colors.textMuted, marginTop: 4 },
  actions: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10 },
  actionIn: { backgroundColor: 'rgba(5,150,105,0.06)' },
  actionOut: { backgroundColor: 'rgba(217,119,6,0.06)' },
  actionLabel: { fontSize: 11, fontWeight: '700', color: adminTheme.colors.primary },
});
