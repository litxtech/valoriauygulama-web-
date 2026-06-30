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
  accentColor?: string;
};

export function PublicKitchenMenuCartBar({
  itemCount,
  total,
  onOpenCart,
  accentColor = menuUi.accent,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  if (itemCount <= 0) return null;

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <TouchableOpacity style={styles.bar} onPress={onOpenCart} activeOpacity={0.92}>
        <View style={styles.left}>
          <View style={[styles.badge, { backgroundColor: accentColor }]}>
            <Text style={styles.badgeText}>{itemCount}</Text>
          </View>
          <Text style={styles.label}>{t('publicKitchenMenuViewCart')}</Text>
        </View>
        <View style={styles.right}>
          <Text style={styles.total}>{formatMenuPrice(total)}</Text>
          <Ionicons name="chevron-forward" size={18} color={menuUi.webMuted} />
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
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 18,
    ...menuUi.shadowLg,
    borderWidth: 1,
    borderColor: menuUi.border,
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(14px)' } as object) : {}),
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  badgeText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  label: { fontSize: 15, fontWeight: '700', color: menuUi.navy },
  right: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  total: { fontSize: 16, fontWeight: '800', color: menuUi.price },
});
