import { View, Text, TouchableOpacity, Pressable, Platform, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type IconName = keyof typeof Ionicons.glyphMap;

type Props = {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  badge?: number;
  color: string;
  badgeColor?: string;
};

const ICON = 24;
const HIT = 34;

export function ModernHeaderIconButton({
  icon,
  onPress,
  accessibilityLabel,
  badge = 0,
  color,
  badgeColor = '#dc2626',
}: Props) {
  const showBadge = badge > 0;
  const iconNode = (
    <>
      <Ionicons name={icon} size={ICON} color={color} />
      {showBadge ? (
        <View style={[styles.badge, { backgroundColor: badgeColor }]} pointerEvents="none">
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
    </>
  );

  if (Platform.OS === 'android') {
    return (
      <Pressable
        onPress={onPress}
        android_ripple={{ color: `${color}28`, borderless: true }}
        style={styles.hit}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      >
        {iconNode}
      </Pressable>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.65}
      style={styles.hit}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
    >
      {iconNode}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  hit: {
    width: HIT,
    height: HIT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  badgeText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '800',
  },
});
