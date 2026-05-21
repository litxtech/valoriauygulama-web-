import { TouchableOpacity } from 'react-native';
import { useRouter, usePathname, useNavigation, type Href, type Router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { adminTheme } from '@/constants/adminTheme';
import { adminStackGestureOptions } from '@/lib/adminStackNavigation';

export const ADMIN_TABS_FALLBACK = '/admin' as Href;

/** Özel header / FAB içinden güvenli geri (stack boşsa fallback). */
export function navigateAdminBack(
  router: Router,
  navigation: NavigationProp<ParamListBase>,
  pathname: string | null,
  fallback?: Href
) {
  if (navigation.canGoBack()) {
    router.back();
    return;
  }
  router.replace((fallback ?? resolveAdminBackFallback(pathname)) as never);
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
  const p = (pathname ?? '').replace(/\/+$/, '') || '/admin';
  if (p === '/admin' || p === '/admin/index') return '/admin';
  const segments = p.split('/').filter(Boolean);
  if (segments.length <= 2) return '/admin';
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
      onPress={() => {
        if (navigation.canGoBack()) {
          router.back();
          return;
        }
        router.replace((fallback ?? resolveAdminBackFallback(pathname)) as never);
      }}
      style={{ marginLeft: 8, padding: 8 }}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons name="arrow-back" size={24} color={color} />
    </TouchableOpacity>
  );
}
