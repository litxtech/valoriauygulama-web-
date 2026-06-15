import { useCallback, useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FastPress } from '@/components/ui/FastPress';
import { theme } from '@/constants/theme';

const IS_ANDROID = Platform.OS === 'android';

export type FeedCreateMenuItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  onPress: () => void;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  items: FeedCreateMenuItem[];
  /** + düğmesinin alt hizası (px) */
  anchorTop?: number;
  anchorLeft?: number;
};

export function FeedCreateAnchorMenu({
  visible,
  onClose,
  items,
  anchorTop,
  anchorLeft = 10,
}: Props) {
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  const top = anchorTop ?? insets.top + 48;

  const closeAnimated = useCallback(() => {
    Animated.timing(progress, {
      toValue: 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onClose();
    });
  }, [onClose, progress]);

  useEffect(() => {
    if (!visible) {
      progress.setValue(0);
      return;
    }
    progress.setValue(0);
    Animated.spring(progress, {
      toValue: 1,
      damping: 22,
      stiffness: 360,
      mass: 0.75,
      useNativeDriver: true,
    }).start();
  }, [visible, progress]);

  const cardOpacity = progress;
  const cardScale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] });
  const cardY = progress.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] });
  const cardX = progress.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] });
  const backdropOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  if (!items.length) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={closeAnimated} statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]} />
        {!IS_ANDROID ? (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdropOpacity }]} pointerEvents="none">
            <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
          </Animated.View>
        ) : null}
        <Pressable style={StyleSheet.absoluteFill} onPress={closeAnimated} accessibilityRole="button" />

        <Animated.View
          style={[
            styles.anchor,
            {
              top,
              left: anchorLeft,
              opacity: cardOpacity,
              transform: [{ translateY: cardY }, { translateX: cardX }, { scale: cardScale }],
            },
          ]}
        >
          <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
            {items.map((item, index) => (
              <View key={item.key}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <FastPress
                  onPress={() => {
                    closeAnimated();
                    item.onPress();
                  }}
                  style={styles.row}
                  rippleColor="rgba(0,0,0,0.06)"
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                >
                  <View style={[styles.iconWrap, { backgroundColor: item.iconColor }]}>
                    <Ionicons name={item.icon} size={22} color="#fff" />
                  </View>
                  <Text style={styles.rowLabel}>{item.label}</Text>
                </FastPress>
              </View>
            ))}
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  anchor: {
    position: 'absolute',
    maxWidth: 280,
    minWidth: 200,
    zIndex: 10,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#262626',
    letterSpacing: -0.2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.08)',
    marginHorizontal: 12,
  },
});
