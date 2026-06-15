import { TouchableOpacity } from 'react-native';
import { useRouter, usePathname, useNavigation, type Href, type Router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';

export const STAFF_TABS_FALLBACK = '/staff/(tabs)' as Href;

/** Özel header içinden güvenli geri (stack boşsa sekmelere / üst modüle). */
function staffGoBack(
  navigation: NavigationProp<ParamListBase>,
  router: Router,
  pathname: string | null,
  fallback?: Href
) {
  if (staffStackCanPop(navigation)) {
    navigation.goBack();
    return;
  }
  const parent = navigation.getParent();
  if (parent && staffStackCanPop(parent)) {
    parent.goBack();
    return;
  }
  const dest = (fallback ?? resolveStaffBackFallback(pathname)) as Href;
  const current = (pathname ?? '').replace(/\/+$/, '') || '/staff';
  const target = String(dest).replace(/\/+$/, '');
  if (current !== target) {
    router.replace(dest as never);
  } else {
    router.replace(STAFF_TABS_FALLBACK);
  }
}

export function navigateStaffBack(
  router: Router,
  navigation: NavigationProp<ParamListBase>,
  pathname: string | null,
  fallback?: Href
) {
  staffGoBack(navigation, router, pathname, fallback);
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

const KITCHEN_OPS_HUB = '/staff/kitchen-ops' as Href;
/** Bu gruplarda ayrı index yok; geri mutfak köküne. */
const KITCHEN_OPS_LEAF_GROUPS = new Set(['stock', 'shortages']);

/** Menüden doğrudan açılan personel alt sayfalarında stack boşsa sekmelere dön. */
export function resolveStaffBackFallback(pathname: string | null): Href {
  const p = (pathname ?? '').replace(/\/+$/, '') || '/staff';
  if (p === '/staff' || p.startsWith('/staff/(tabs)')) return STAFF_TABS_FALLBACK;
  let segments = p.split('/').filter(Boolean);
  if (segments[segments.length - 1] === 'index') {
    segments = segments.slice(0, -1);
  }
  const joined = segments.join('/');

  if (joined === 'staff' || joined === 'staff/kitchen-ops') {
    return STAFF_TABS_FALLBACK;
  }

  if (joined === 'staff/occupancy' || joined === 'staff/occupancy/operations') {
    return STAFF_TABS_FALLBACK;
  }
  if (segments[0] === 'staff' && segments[1] === 'occupancy' && segments.length >= 3) {
    if (joined === 'staff/occupancy/daily') {
      return '/staff/occupancy/operations' as Href;
    }
    if (joined === 'staff/occupancy/operations') {
      return STAFF_TABS_FALLBACK;
    }
    if (segments[2] === 'guests') {
      return '/staff/occupancy/operations' as Href;
    }
    if (segments[2] === 'rooms' && segments.length >= 4) {
      return '/staff/occupancy/operations' as Href;
    }
    return '/staff/occupancy' as Href;
  }

  if (segments[0] === 'staff' && segments[1] === 'kitchen-ops' && segments.length >= 3) {
    if (segments.length === 3) return KITCHEN_OPS_HUB;
    const group = segments[2]!;
    const last = segments[segments.length - 1]!;
    if (last === 'new' || last === 'scan') {
      if (KITCHEN_OPS_LEAF_GROUPS.has(group)) return KITCHEN_OPS_HUB;
      return `/staff/kitchen-ops/${segments.slice(2, -1).join('/')}` as Href;
    }
    if (KITCHEN_OPS_LEAF_GROUPS.has(group)) return KITCHEN_OPS_HUB;
  }

  if (segments.length <= 2) return STAFF_TABS_FALLBACK;
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
      onPress={() => staffGoBack(navigation, router, pathname, fallback)}
      style={{ marginLeft: 8, padding: 8 }}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons name="arrow-back" size={24} color={tintColor} />
    </TouchableOpacity>
  );
}
