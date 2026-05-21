import { View, Text, StyleSheet, TouchableOpacity, Platform, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { profileScreenTheme as P } from '@/constants/profileScreenTheme';

type IconName = keyof typeof Ionicons.glyphMap;

type Variant = 'default' | 'leaf' | 'danger' | 'dangerSoft';

const VARIANT_ACCENT: Record<Variant, string> = {
  default: P.accent.blue,
  leaf: '#0D9488',
  danger: P.accent.red,
  dangerSoft: P.accent.red,
};

type Props = {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress: () => void;
  variant?: Variant;
  titleDanger?: boolean;
  chevronColor?: string;
  style?: ViewStyle;
};

export function ProfileMenuRow({
  icon,
  title,
  subtitle,
  onPress,
  variant = 'default',
  titleDanger = false,
  chevronColor,
  style,
}: Props) {
  const accent = VARIANT_ACCENT[variant];
  const iconWrapStyle = [styles.iconWrap, { backgroundColor: accent + '1A' }];

  return (
    <TouchableOpacity
      style={[styles.row, P.cardShell, Platform.OS === 'android' && styles.rowAndroid, style]}
      onPress={onPress}
      activeOpacity={0.9}
    >
      {Platform.OS === 'android' ? (
        <View style={iconWrapStyle}>
          <Ionicons name={icon} size={22} color={accent} />
        </View>
      ) : (
        <LinearGradient
          colors={[accent + '1A', accent + '08']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconWrap}
        >
          <Ionicons name={icon} size={22} color={accent} />
        </LinearGradient>
      )}
      <View style={styles.textCol}>
        <Text style={[styles.title, titleDanger && styles.titleDanger]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={chevronColor ?? P.subtext} style={styles.chevron} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  rowAndroid: {
    elevation: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.05)',
  },
  textCol: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: P.text,
    letterSpacing: 0.1,
  },
  titleDanger: { color: P.accent.red },
  subtitle: {
    fontSize: 13,
    color: P.subtext,
    marginTop: 3,
    lineHeight: 18,
  },
  chevron: { marginLeft: 6, opacity: 0.55 },
});
