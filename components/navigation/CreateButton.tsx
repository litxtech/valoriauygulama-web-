import { memo, useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Vibration,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Plus } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { pds } from '@/constants/personelDesignSystem';
import { isExpoHapticsNativeAvailable } from '@/lib/hapticsSafe';

const SIZE = 40;

type Props = {
  onPress: () => void;
  accessibilityLabel?: string;
};

function triggerCreateHaptic() {
  if (Platform.OS === 'android') {
    Vibration.vibrate(14);
    return;
  }
  if (!isExpoHapticsNativeAvailable()) return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
}

/** Compact create control (no oversized FAB). */
export const CreateButton = memo(function CreateButton({
  onPress,
  accessibilityLabel = 'Oluştur',
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <View style={styles.slot} pointerEvents="box-none">
      <Pressable
        onPress={() => {
          triggerCreateHaptic();
          onPress();
        }}
        onPressIn={() => {
          Animated.spring(scale, {
            toValue: 0.92,
            damping: 16,
            stiffness: 420,
            useNativeDriver: true,
          }).start();
        }}
        onPressOut={() => {
          Animated.spring(scale, {
            toValue: 1,
            damping: 14,
            stiffness: 320,
            useNativeDriver: true,
          }).start();
        }}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={styles.hit}
        hitSlop={6}
      >
        <Animated.View style={[styles.fabShadow, { transform: [{ scale }] }]}>
          <LinearGradient
            colors={[...pds.gradientCta]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fab}
          >
            <Plus size={20} color="#fff" strokeWidth={2.4} />
          </LinearGradient>
        </Animated.View>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  slot: {
    width: SIZE + 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hit: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabShadow: {
    width: SIZE,
    height: SIZE,
    borderRadius: 14,
    shadowColor: '#0B3D36',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  fab: {
    width: SIZE,
    height: SIZE,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.45)',
  },
});
