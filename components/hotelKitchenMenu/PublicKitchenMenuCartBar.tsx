import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { menuUi } from '@/components/hotelKitchenMenu/hotelKitchenMenuUi';
import { formatMenuPrice } from '@/lib/hotelKitchenMenu';

type Props = {
  itemCount: number;
  total: number;
  onOpenCart: () => void;
};

export function PublicKitchenMenuCartBar({ itemCount, total, onOpenCart }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  if (itemCount <= 0) return null;

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <TouchableOpacity style={styles.bar} onPress={onOpenCart} activeOpacity={0.92}>
        <View style={styles.left}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{itemCount}</Text>
          </View>
          <Text style={styles.label}>{t('publicKitchenMenuCart')}</Text>
        </View>
        <View style={styles.right}>
          <Text style={styles.total}>{formatMenuPrice(total)}</Text>
          <Ionicons name="chevron-forward" size={18} color="#fff" />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'fixed' as unknown as 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    paddingHorizontal: 16,
    paddingTop: 8,
    ...(Platform.OS === 'web'
      ? ({
          position: 'fixed',
          pointerEvents: 'box-none',
        } as object)
      : {}),
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: menuUi.navy,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 20,
    ...menuUi.shadowLg,
    borderWidth: 1,
    borderColor: 'rgba(212, 168, 75, 0.35)',
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: menuUi.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  badgeText: { fontSize: 13, fontWeight: '800', color: menuUi.navy },
  label: { fontSize: 16, fontWeight: '700', color: '#fff' },
  right: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  total: { fontSize: 17, fontWeight: '800', color: menuUi.accentLight },
});
