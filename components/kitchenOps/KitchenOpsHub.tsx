import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { theme } from '@/constants/theme';

type IonIcon = ComponentProps<typeof Ionicons>['name'];

export type KitchenHubTile = {
  key: string;
  label: string;
  subtitle?: string;
  icon: IonIcon;
  route: string;
  color: string;
  bg: string;
};

const STOCK_TILES: KitchenHubTile[] = [
  { key: 'add', label: 'Stok Ekle', subtitle: 'Ürün girişi', icon: 'add-circle-outline', route: '/staff/kitchen-ops/stock/entry', color: '#059669', bg: '#ecfdf5' },
  { key: 'out', label: 'Stok Çıkışı', subtitle: 'Kullanım / fire', icon: 'remove-circle-outline', route: '/staff/kitchen-ops/stock/exit', color: '#d97706', bg: '#fffbeb' },
  { key: 'current', label: 'Mevcut Stok', subtitle: 'Ne var ne yok', icon: 'layers-outline', route: '/staff/kitchen-ops/stock/current', color: '#2563eb', bg: '#eff6ff' },
  { key: 'low', label: 'Azalan Ürünler', subtitle: 'Kritik seviye', icon: 'alert-circle-outline', route: '/staff/kitchen-ops/stock/low', color: '#dc2626', bg: '#fef2f2' },
];

const QUICK_TILES: KitchenHubTile[] = [
  { key: 'handover', label: 'Teslim Kaydı', icon: 'swap-horizontal-outline', route: '/staff/kitchen-ops/handovers', color: '#0d9488', bg: '#ecfdf5' },
  { key: 'shortages', label: 'Eksik Listesi', icon: 'clipboard-outline', route: '/staff/kitchen-ops/shortages', color: '#E67E22', bg: '#fff7ed' },
  { key: 'scan', label: 'Barkod Oku', icon: 'scan-outline', route: '/staff/kitchen-ops/stock/scan', color: '#7c3aed', bg: '#f5f3ff' },
  { key: 'revenue', label: 'Hasılat', icon: 'cash-outline', route: '/staff/kitchen-ops/revenue', color: '#10b981', bg: '#ecfdf5' },
  { key: 'expense', label: 'Gider', icon: 'receipt-outline', route: '/staff/kitchen-ops/expenses', color: '#ea580c', bg: '#fff7ed' },
  { key: 'close', label: 'Gün Sonu', icon: 'moon-outline', route: '/staff/kitchen-ops/day-close', color: '#4f46e5', bg: '#eef2ff' },
];

type Props = {
  onNavigate: (route: string) => void;
  alertCount?: number;
};

function BigTile({ item, onPress, badge }: { item: KitchenHubTile; onPress: () => void; badge?: number }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.bigTile, pressed && styles.pressed]}
      android_ripple={{ color: theme.colors.borderLight }}
    >
      <View style={[styles.iconWrap, { backgroundColor: item.bg }]}>
        <Ionicons name={item.icon} size={28} color={item.color} />
        {badge != null && badge > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.bigLabel}>{item.label}</Text>
      {item.subtitle ? <Text style={styles.bigSub}>{item.subtitle}</Text> : null}
    </Pressable>
  );
}

function SmallTile({ item, onPress }: { item: KitchenHubTile; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.smallTile, pressed && styles.pressed]}
      android_ripple={{ color: theme.colors.borderLight }}
    >
      <View style={[styles.smallIcon, { backgroundColor: item.bg }]}>
        <Ionicons name={item.icon} size={20} color={item.color} />
      </View>
      <Text style={styles.smallLabel} numberOfLines={1}>{item.label}</Text>
    </Pressable>
  );
}

export function KitchenOpsHub({ onNavigate, alertCount }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle}>Mutfak Stok</Text>
      <View style={styles.grid2}>
        {STOCK_TILES.map((item) => (
          <BigTile
            key={item.key}
            item={item}
            onPress={() => onNavigate(item.route)}
            badge={item.key === 'low' ? alertCount : undefined}
          />
        ))}
      </View>
      <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Hızlı İşlemler</Text>
      <View style={styles.row4}>
        {QUICK_TILES.map((item) => (
          <SmallTile key={item.key} item={item} onPress={() => onNavigate(item.route)} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary, marginBottom: 4, marginLeft: 2 },
  grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  bigTile: {
    width: '48%',
    flexGrow: 1,
    minWidth: '46%',
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    minHeight: 110,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#dc2626',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  bigLabel: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  bigSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  row4: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  smallTile: {
    flex: 1,
    minWidth: '22%',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  smallIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  smallLabel: { fontSize: 11, fontWeight: '700', color: theme.colors.text, textAlign: 'center' },
  pressed: { opacity: 0.88 },
});
