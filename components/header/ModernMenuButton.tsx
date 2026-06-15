import { useEffect, useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Easing,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { pds } from '@/constants/personelDesignSystem';

const HIT = 36;
const BAR_W = 16;
const BAR_H = 2.4;
const BAR_GAP = 3.8;
const BAR_R = 2;
const BAR_OFFSET = BAR_GAP + BAR_H;
const IS_ANDROID = Platform.OS === 'android';

type Props = {
  onPress: () => void;
  accessibilityLabel: string;
  open?: boolean;
  color?: string;
  style?: StyleProp<ViewStyle>;
  highlightLabel?: string | null;
};

function MenuBars({ open, color }: { open: boolean; color: string }) {
  const barColor = open ? '#ffffff' : color;
  if (open) {
    return (
      <View style={styles.bars}>
        <View
          style={[
            styles.bar,
            {
              width: BAR_W,
              backgroundColor: barColor,
              transform: [{ translateY: BAR_OFFSET }, { rotate: '45deg' }],
            },
          ]}
        />
        <View style={[styles.bar, { width: BAR_W * 0.72, backgroundColor: barColor, opacity: 0 }]} />
        <View
          style={[
            styles.bar,
            {
              width: BAR_W,
              backgroundColor: barColor,
              transform: [{ translateY: -BAR_OFFSET }, { rotate: '-45deg' }],
            },
          ]}
        />
      </View>
    );
  }
  return (
    <View style={styles.bars}>
      <View style={[styles.bar, { width: BAR_W, backgroundColor: barColor }]} />
      <View style={[styles.bar, { width: BAR_W * 0.72, backgroundColor: barColor }]} />
      <View style={[styles.bar, { width: BAR_W, backgroundColor: barColor }]} />
    </View>
  );
}

function MenuPill({ open, color }: { open: boolean; color: string }) {
  return (
    <View style={styles.pillOuter}>
      <View style={[styles.pillBase, { borderColor: `${color}40`, backgroundColor: `${color}12` }]} />
      {open ? (
        IS_ANDROID ? (
          <View style={[StyleSheet.absoluteFillObject, styles.pillGrad, { backgroundColor: pds.indigo }]} />
        ) : (
          <LinearGradient
            colors={pds.gradientPremium}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.pillGrad}
          />
        )
      ) : null}
      <MenuBars open={open} color={color} />
    </View>
  );
}

/** Android: anında menü — header’da X yerine aktif arka plan + hamburger kalır. */
function AndroidMenuButton({
  onPress,
  accessibilityLabel,
  open,
  color,
  style,
  highlightLabel,
}: Props) {
  const accent = color ?? pds.indigo;
  return (
    <Pressable
      onPress={onPress}
      unstable_pressDelay={0}
      android_ripple={{ color: `${accent}33`, borderless: false }}
      style={[styles.hit, style]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ expanded: open }}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
    >
      {highlightLabel && !open ? (
        <View style={styles.highlightPill} pointerEvents="none">
          <Text style={styles.highlightPillText} numberOfLines={1}>
            {highlightLabel}
          </Text>
        </View>
      ) : null}
      <View style={styles.pillOuter}>
        <View style={[styles.pillBase, { borderColor: `${accent}40`, backgroundColor: `${accent}12` }]} />
        {open ? (
          <View style={[StyleSheet.absoluteFillObject, styles.pillGrad, { backgroundColor: pds.indigo }]} />
        ) : null}
        <MenuBars open={false} color={open ? '#ffffff' : accent} />
      </View>
    </Pressable>
  );
}

function IosMenuButton({
  onPress,
  accessibilityLabel,
  open = false,
  color = pds.indigo,
  style,
  highlightLabel,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const morph = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(morph, {
      toValue: open ? 1 : 0,
      duration: open ? 160 : 130,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, morph]);

  const pressIn = () => {
    Animated.timing(scale, {
      toValue: 0.92,
      duration: 80,
      useNativeDriver: true,
    }).start();
  };

  const pressOut = () => {
    Animated.timing(scale, {
      toValue: 1,
      duration: 120,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const topRotate = morph.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });
  const bottomRotate = morph.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-45deg'],
  });
  const topTranslateY = morph.interpolate({
    inputRange: [0, 1],
    outputRange: [0, BAR_OFFSET],
  });
  const bottomTranslateY = morph.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -BAR_OFFSET],
  });
  const midOpacity = morph.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [1, 0, 0],
  });
  const midScaleX = morph.interpolate({
    inputRange: [0, 1],
    outputRange: [0.72, 0],
  });
  const barColor = open ? '#ffffff' : color;
  const pillOpacity = morph.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      activeOpacity={1}
      style={[styles.hit, style]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ expanded: open }}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        {highlightLabel && !open ? (
          <View style={styles.highlightPill} pointerEvents="none">
            <Text style={styles.highlightPillText} numberOfLines={1}>
              {highlightLabel}
            </Text>
          </View>
        ) : null}
        <View style={styles.pillOuter}>
          <View style={[styles.pillBase, { borderColor: `${color}40`, backgroundColor: `${color}12` }]} />
          <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: pillOpacity }]} pointerEvents="none">
            <LinearGradient
              colors={pds.gradientPremium}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.pillGrad}
            />
          </Animated.View>
          <View style={styles.bars}>
            <Animated.View
              style={[
                styles.bar,
                {
                  width: BAR_W,
                  backgroundColor: barColor,
                  transform: [{ translateY: topTranslateY }, { rotate: topRotate }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.bar,
                {
                  width: BAR_W * 0.72,
                  backgroundColor: barColor,
                  opacity: midOpacity,
                  transform: [{ scaleX: midScaleX }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.bar,
                {
                  width: BAR_W,
                  backgroundColor: barColor,
                  transform: [{ translateY: bottomTranslateY }, { rotate: bottomRotate }],
                },
              ]}
            />
          </View>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

export function ModernMenuButton(props: Props) {
  if (IS_ANDROID) return <AndroidMenuButton {...props} />;
  return <IosMenuButton {...props} />;
}

const styles = StyleSheet.create({
  hit: {
    width: HIT,
    height: HIT,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  highlightPill: {
    position: 'absolute',
    top: -4,
    right: -10,
    zIndex: 2,
    maxWidth: 52,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: '#dc2626',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  highlightPillText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  pillOuter: {
    width: HIT,
    height: HIT,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillBase: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    borderWidth: 1,
  },
  pillGrad: {
    flex: 1,
    borderRadius: 12,
  },
  bars: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: BAR_GAP,
    height: BAR_H * 3 + BAR_GAP * 2,
  },
  bar: {
    height: BAR_H,
    borderRadius: BAR_R,
  },
});
