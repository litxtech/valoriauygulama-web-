import { View, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { pds } from '@/constants/personelDesignSystem';
import { appTabBar } from '@/constants/tabBarTheme';

const { size: BTN_SIZE, icon: BTN_ICON } = appTabBar.centerIdCapture;

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: BTN_SIZE,
    height: BTN_SIZE,
    marginBottom: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#1e40af',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.22,
        shadowRadius: 6,
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
    ...Platform.select({
      android: { elevation: 4 },
      default: {},
    }),
  },
  circleDim: { opacity: 0.84 },
  circleAndroid: {
    backgroundColor: '#2563eb',
    elevation: 0,
  },
});

type Props = {
  focused: boolean;
};

/**
 * Personel orta sekme — kimlik çekim; etiket: staffTabIdCapture (Kimlik).
 */
export function StaffIdCaptureCenterTabIcon({ focused }: Props) {
  const scale = focused ? 1.06 : 1;

  return (
    <View style={[styles.wrap, { transform: [{ scale }] }]}>
      {Platform.OS === 'android' ? (
        <View style={[styles.circle, styles.circleAndroid, !focused && styles.circleDim]}>
          <Ionicons name="camera" size={BTN_ICON} color="#fff" />
        </View>
      ) : (
        <LinearGradient
          colors={['#3b82f6', '#2563eb', '#1d4ed8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.circle, !focused && styles.circleDim]}
        >
          <Ionicons name="camera" size={BTN_ICON} color="#fff" />
        </LinearGradient>
      )}
    </View>
  );
}

/** @deprecated StaffIdCaptureCenterTabIcon kullanın */
export const CenterIdCaptureTabBarIcon = StaffIdCaptureCenterTabIcon;
