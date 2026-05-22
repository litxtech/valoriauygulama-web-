import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { menuUi } from '@/components/hotelKitchenMenu/hotelKitchenMenuUi';

const SHOW_MS = 2600;

type Props = {
  visible: boolean;
  onHidden?: () => void;
};

export function KitchenMenuUpdatedToast({ visible, onHidden }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(-72)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }

    if (!visible) {
      Animated.parallel([
        Animated.timing(slide, { toValue: -72, duration: 200, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.spring(slide, { toValue: 0, friction: 8, tension: 95, useNativeDriver: true }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    hideTimer.current = setTimeout(() => onHidden?.(), SHOW_MS);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [visible, onHidden, slide, opacity]);

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        { top: insets.top + 10, opacity, transform: [{ translateY: slide }] },
      ]}
    >
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="checkmark-circle" size={22} color={menuUi.liveGreen} />
        </View>
        <Text style={styles.text}>{t('publicKitchenMenuLiveUpdate')}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 50,
    alignItems: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: 'rgba(134, 239, 172, 0.65)',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 16,
    maxWidth: 360,
    width: '100%',
    shadowColor: '#14532d',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(22, 163, 74, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, fontSize: 15, fontWeight: '800', color: '#166534' },
});
