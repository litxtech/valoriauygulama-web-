import { TouchableOpacity } from 'react-native';
import { useRouter, usePathname, useNavigation, type Href, type Router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { adminTheme } from '@/constants/adminTheme';
import { adminStackGestureOptions } from '@/lib/adminStackNavigation';
import { exitAdminPanelToStaffTabs, signalStaffExitedAdminPanelFromRoot } from '@/lib/staffAdminTabNavigation';

export const ADMIN_TABS_FALLBACK = '/admin' as Href;
export const ADMIN_KITCHEN_OPS_HUB = '/admin/kitchen-ops' as Href;

function normPath(pathname: string | null): string {
  return (pathname ?? '').replace(/\/+$/, '') || '/admin';
}

export function isAdminKitchenOpsHubPath(pathname: string | null): boolean {
  const p = normPath(pathname);
  return p === ADMIN_KITCHEN_OPS_HUB || p === '/admin/kitchen-ops/index';
}

/** kitchen-ops iç içe stack → admin stack (admin/_layout). */
export function getAdminStackNavigation(navigation: NavigationProp<ParamListBase>) {
  return navigation.getParent()?.getParent();
}

function getRootNavigation(navigation: NavigationProp<ParamListBase>) {
  let nav: NavigationProp<ParamListBase> | undefined = navigation;
  while (nav?.getParent()) {
    nav = nav.getParent();
  }
  return nav;
}

/**
 * Mutfak Operasyon Yönetimi kökü:
 * - Admin panelinden geldiyse → /admin
 * - Hamburgerden geldiyse → personel feed (suppress + root pop / replace)
 */
export function navigateAdminKitchenOpsHubBack(
  router: Router,
  navigation: NavigationProp<ParamListBase>
) {
  const adminStack = getAdminStackNavigation(navigation);
  if (adminStack && adminStackCanPop(adminStack)) {
    adminStack.goBack();
    return;
  }

  signalStaffExitedAdminPanelFromRoot();

  const root = getRootNavigation(navigation);
  if (root && adminStackCanPop(root)) {
    root.goBack();
    return;
  }

  exitAdminPanelToStaffTabs(router);
}

/** Özel header / FAB içinden güvenli geri (stack boşsa fallback). */
function adminGoBack(
  router: Router,
  navigation: NavigationProp<ParamListBase>,
  pathname: string | null,
  fallback?: Href
) {
  const p = normPath(pathname);

  if (adminStackCanPop(navigation)) {
    navigation.goBack();
    return;
  }

  let ancestor: NavigationProp<ParamListBase> | undefined = navigation.getParent() ?? undefined;
  while (ancestor) {
    if (adminStackCanPop(ancestor)) {
      ancestor.goBack();
      return;
    }
    ancestor = ancestor.getParent() ?? undefined;
  }

  if (isAdminKitchenOpsHubPath(pathname)) {
    navigateAdminKitchenOpsHubBack(router, navigation);
    return;
  }

  router.replace((fallback ?? resolveAdminBackFallback(pathname)) as never);
}

export function navigateAdminBack(
  router: Router,
  navigation: NavigationProp<ParamListBase>,
  pathname: string | null,
  fallback?: Href
) {
  adminGoBack(router, navigation, pathname, fallback);
}

export function buildAdminNestedStackOptions(t: (key: string) => string) {
  return ({ navigation }: { navigation: NavigationProp<ParamListBase> }) => ({
    headerShown: true,
    headerStyle: { backgroundColor: adminTheme.colors.surface },
    headerTintColor: adminTheme.colors.text,
    headerTitleStyle: { fontWeight: '700' as const, fontSize: 17 },
    ...adminStackGestureForNavigation(navigation),
    headerBackVisible: false,
    headerLeft: () => <AdminStackBackButton accessibilityLabel={t('back')} />,
  });
}

/** Doğrudan menü / deep-link ile açılan admin alt sayfalarında stack boşsa üst rotaya dön. */
export function resolveAdminBackFallback(pathname: string | null): Href {
  const p = normPath(pathname);
  if (p === '/admin' || p === '/admin/index') return ADMIN_TABS_FALLBACK;
  let segments = p.split('/').filter(Boolean);
  if (segments[segments.length - 1] === 'index') {
    segments = segments.slice(0, -1);
  }
  if (segments.join('/') === 'admin/kitchen-ops') return ADMIN_TABS_FALLBACK;
  if (segments.join('/') === 'admin/report') return ADMIN_TABS_FALLBACK;
  if (segments[0] === 'admin' && segments[1] === 'report' && segments.length >= 3) {
    return '/admin/report' as Href;
  }
  if (segments[0] === 'admin' && segments[1] === 'kitchen-ops' && segments.length === 3) {
    return ADMIN_KITCHEN_OPS_HUB;
  }
  if (segments.length <= 2) return ADMIN_TABS_FALLBACK;
  return `/${segments.slice(0, -1).join('/')}` as Href;
}

export function adminStackCanPop(navigation: NavigationProp<ParamListBase>): boolean {
  return (navigation.getState()?.routes?.length ?? 0) > 1;
}

/** ScrollView / yatay listelerle çakışmaması için kaydırarak geri kapalı; header + donanım geri. */
export function adminStackGestureForNavigation(_navigation: NavigationProp<ParamListBase>) {
  return adminStackGestureOptions;
}

type AdminStackBackButtonProps = {
  tintColor?: string;
  fallback?: Href;
  accessibilityLabel?: string;
};

export function AdminStackBackButton({
  tintColor,
  fallback,
  accessibilityLabel = 'Geri',
}: AdminStackBackButtonProps) {
  const router = useRouter();
  const navigation = useNavigation();
  const pathname = usePathname();
  const color = tintColor ?? adminTheme.colors.text;

  return (
    <TouchableOpacity
      onPress={() => adminGoBack(router, navigation, pathname, fallback)}
      style={{ marginLeft: 8, padding: 8 }}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons name="arrow-back" size={24} color={color} />
    </TouchableOpacity>
  );
}
