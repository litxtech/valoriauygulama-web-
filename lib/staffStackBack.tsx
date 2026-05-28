import { TouchableOpacity } from 'react-native';
import { useRouter, usePathname, useNavigation, type Href, type Router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';

export const STAFF_TABS_FALLBACK = '/staff/(tabs)' as Href;

/** Özel header içinden güvenli geri (stack boşsa sekmelere / üst modüle). */
export function navigateStaffBack(
  router: Router,
  navigation: NavigationProp<ParamListBase>,
  pathname: string | null,
  fallback?: Href
) {
  if (staffStackCanPop(navigation)) {
    navigation.goBack();
    return;
  }
  router.replace((fallback ?? resolveStaffBackFallback(pathname)) as never);
}

export function buildStaffNestedStackOptions(t?: (key: string) => string) {
  const tr = typeof t === 'function' ? t : (key: string) => key;
  return ({ navigation }: { navigation: NavigationProp<ParamListBase> }) => ({
    headerShown: true,
    headerStyle: { backgroundColor: '#fff' },
    headerTintColor: '#1a1d21',
    headerTitleStyle: { fontWeight: '700' as const, fontSize: 17 },
    ...staffStackGestureForNavigation(navigation),
    headerBackVisible: false,
    headerLeft: () => <StaffStackBackButton accessibilityLabel={tr('back')} />,
  });
}

/** Menüden doğrudan açılan personel alt sayfalarında stack boşsa sekmelere dön. */
export function resolveStaffBackFallback(pathname: string | null): Href {
  const p = (pathname ?? '').replace(/\/+$/, '') || '/staff';
  if (p === '/staff' || p.startsWith('/staff/(tabs)')) return '/staff/(tabs)' as Href;
  let segments = p.split('/').filter(Boolean);
  // file-based `index` rotaları: .../personnel/index ≡ .../personnel (replace no-op olmasın)
  if (segments[segments.length - 1] === 'index') {
    segments = segments.slice(0, -1);
  }
  if (segments.length <= 2) return '/staff/(tabs)' as Href;
  return `/${segments.slice(0, -1).join('/')}` as Href;
}

export function staffStackCanPop(navigation: NavigationProp<ParamListBase>): boolean {
  return (navigation.getState()?.routes?.length ?? 0) > 1;
}

/** ScrollView / form ekranları: kaydırma ile geri yanlışlıkla tetiklenmesin (admin ile aynı). */
export const staffStackScrollSafeGestureOptions = {
  gestureEnabled: false,
  fullScreenGestureEnabled: false,
} as const;

/** Kenar kaydırması; tam ekran geri ScrollView ile çakışır. */
export function staffStackGestureForNavigation(navigation: NavigationProp<ParamListBase>) {
  const canPop = staffStackCanPop(navigation);
  return {
    gestureEnabled: canPop,
    fullScreenGestureEnabled: false,
  } as const;
}

type StaffStackBackButtonProps = {
  tintColor?: string;
  fallback?: Href;
  accessibilityLabel?: string;
};

export function StaffStackBackButton({
  tintColor = '#1a1d21',
  fallback,
  accessibilityLabel = 'Geri',
}: StaffStackBackButtonProps) {
  const router = useRouter();
  const navigation = useNavigation();
  const pathname = usePathname();

  return (
    <TouchableOpacity
      onPress={() => {
        if (staffStackCanPop(navigation)) {
          navigation.goBack();
          return;
        }
        router.replace((fallback ?? resolveStaffBackFallback(pathname)) as never);
      }}
      style={{ marginLeft: 8, padding: 8 }}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons name="arrow-back" size={24} color={tintColor} />
    </TouchableOpacity>
  );
}
