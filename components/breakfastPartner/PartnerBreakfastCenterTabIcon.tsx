import { View, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { appTabBar } from '@/constants/tabBarTheme';
import { partnerTheme } from '@/lib/breakfastPartnerTheme';

const { size: BTN_SIZE, icon: BTN_ICON } = appTabBar.centerMessage;

type Props = {
  focused: boolean;
};

/** Orta sekme — kahvaltı teyit (partner portal). */
export function PartnerBreakfastCenterTabIcon({ focused }: Props) {
  const scale = focused ? 1.06 : 1;

  return (
    <View style={[styles.wrap, { transform: [{ scale }] }]}>
      {Platform.OS === 'android' ? (
        <View style={[styles.circle, styles.circleAndroid, !focused && styles.circleDim]}>
          <Ionicons name={focused ? 'sunny' : 'sunny-outline'} size={BTN_ICON} color="#0f172a" />
        </View>
      ) : (
        <LinearGradient
          colors={[...partnerTheme.accentGradient]}
          style={[styles.circle, !focused && styles.circleDim]}
        >
          <Ionicons name={focused ? 'sunny' : 'sunny-outline'} size={BTN_ICON} color="#0f172a" />
        </LinearGradient>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: BTN_SIZE,
    height: BTN_SIZE,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.22,
        shadowRadius: 5,
      },
      android: {},
      default: {},
    }),
  },
  circle: {
    width: BTN_SIZE,
    height: BTN_SIZE,
    borderRadius: BTN_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleAndroid: {
    backgroundColor: partnerTheme.accent,
    elevation: 3,
  },
  circleDim: { opacity: 0.82 },
});
