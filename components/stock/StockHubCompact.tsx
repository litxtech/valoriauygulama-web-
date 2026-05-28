import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { theme } from '@/constants/theme';

type IonIcon = ComponentProps<typeof Ionicons>['name'];

export type StockHubItem = {
  key: string;
  label: string;
  icon: IonIcon;
  route: string;
  color: string;
  bg: string;
};

const PRIMARY: StockHubItem[] = [
  { key: 'barcode', label: 'Barkod', icon: 'scan-outline', route: '/staff/stock/scan', color: '#2563eb', bg: '#eff6ff' },
  { key: 'in', label: 'Giriş', icon: 'arrow-down-circle-outline', route: '/staff/stock/entry', color: '#059669', bg: '#ecfdf5' },
  { key: 'out', label: 'Çıkış', icon: 'arrow-up-circle-outline', route: '/staff/stock/exit', color: '#d97706', bg: '#fffbeb' },
];

const SECONDARY: StockHubItem[] = [
  { key: 'mine', label: 'Eklediğim / Çıkardığım', icon: 'time-outline', route: '/staff/stock/my-movements', color: '#6d28d9', bg: '#f5f3ff' },
  { key: 'all', label: 'Tüm stoklar', icon: 'list-outline', route: '/staff/stock/all', color: '#0f766e', bg: '#f0fdfa' },
];

type Props = {
  onNavigate: (route: string) => void;
};

function HubTile({ item, onPress, wide }: { item: StockHubItem; onPress: () => void; wide?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, wide && styles.tileWide, pressed && styles.tilePressed]}
      android_ripple={{ color: theme.colors.borderLight }}
    >
      <View style={[styles.iconWrap, { backgroundColor: item.bg }]}>
        <Ionicons name={item.icon} size={20} color={item.color} />
      </View>
      <Text style={styles.tileLabel} numberOfLines={1}>
        {item.label}
      </Text>
    </Pressable>
  );
}

export function StockHubCompact({ onNavigate }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row3}>
        {PRIMARY.map((item) => (
          <HubTile key={item.key} item={item} onPress={() => onNavigate(item.route)} />
        ))}
      </View>
      <View style={styles.row2}>
        {SECONDARY.map((item) => (
          <HubTile key={item.key} item={item} wide onPress={() => onNavigate(item.route)} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginBottom: 16 },
  row3: { flexDirection: 'row', gap: 8 },
  row2: { flexDirection: 'row', gap: 8 },
  tile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    minHeight: 44,
  },
  tileWide: { paddingHorizontal: 12 },
  tilePressed: { opacity: 0.88, backgroundColor: theme.colors.backgroundSecondary },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: { flex: 1, fontSize: 13, fontWeight: '700', color: theme.colors.text },
});
