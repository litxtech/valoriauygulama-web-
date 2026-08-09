import type { ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { adminTheme } from '@/constants/adminTheme';
import { AdminOrganizationPicker } from '@/components/admin';
import { useAuthStore } from '@/stores/authStore';
import { accountingCanUseAllOrg } from '@/lib/accountingOrgScope';
import { safeRouterReplace } from '@/lib/safeRouter';

type NavItem = {
  key: string;
  href: '/muhasebe/payments';
  icon: keyof typeof Ionicons.glyphMap;
  labelKey: string;
};

const NAV: NavItem[] = [
  {
    key: 'payments',
    href: '/muhasebe/payments',
    icon: 'people-outline',
    labelKey: 'muhasebeWebNavPayments',
  },
];

type Props = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
};

export function MuhasebeWebShell({ children, title, subtitle }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const me = useAuthStore((s) => s.staff);
  const signOut = useAuthStore((s) => s.signOut);
  const canUseAllOrg = accountingCanUseAllOrg(me);
  const wide = width >= 900;

  const onSignOut = async () => {
    await signOut();
    safeRouterReplace(router, '/muhasebe/login');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#0f172a', '#1e293b']} style={styles.topBar}>
        <View style={styles.brandRow}>
          <View style={styles.brandIcon}>
            <Ionicons name="calculator-outline" size={20} color="#f59e0b" />
          </View>
          <View style={styles.brandTextWrap}>
            <Text style={styles.brandTitle}>{t('muhasebeWebBrand')}</Text>
            {title ? (
              <Text style={styles.brandSub} numberOfLines={1}>
                {title}
              </Text>
            ) : (
              <Text style={styles.brandSub} numberOfLines={1}>
                {subtitle ?? t('muhasebeWebBrandSub')}
              </Text>
            )}
          </View>
        </View>
        <View style={styles.topActions}>
          <AdminOrganizationPicker
            canUseAll={canUseAllOrg}
            ownOrganizationId={me?.organization_id}
            compact
          />
          <TouchableOpacity style={styles.signOutBtn} onPress={onSignOut} activeOpacity={0.85}>
            <Ionicons name="log-out-outline" size={18} color="#e2e8f0" />
            {wide ? <Text style={styles.signOutText}>{t('muhasebeWebSignOut')}</Text> : null}
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <View style={[styles.body, wide && styles.bodyWide]}>
        {wide ? (
          <View style={styles.sideNav}>
            <Text style={styles.sideLabel}>{t('muhasebeWebNavLabel')}</Text>
            {NAV.map((item) => {
              const active = pathname?.includes(item.href);
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.navItem, active && styles.navItemActive]}
                  onPress={() => router.replace(item.href)}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name={item.icon}
                    size={18}
                    color={active ? adminTheme.colors.accent : adminTheme.colors.textSecondary}
                  />
                  <Text style={[styles.navText, active && styles.navTextActive]}>{t(item.labelKey)}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={styles.adminLink}
              onPress={() => router.push('/admin/accounting' as never)}
              activeOpacity={0.85}
            >
              <Ionicons name="grid-outline" size={16} color={adminTheme.colors.textMuted} />
              <Text style={styles.adminLinkText}>{t('muhasebeWebOpenFullAdmin')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View
          style={[
            styles.contentScroll,
            styles.contentInner,
            { paddingBottom: Math.max(insets.bottom, 24) },
            Platform.OS === 'web' && styles.contentInnerWeb,
          ]}
        >
          {!wide ? (
            <View style={styles.mobileNavRow}>
              {NAV.map((item) => {
                const active = pathname?.includes(item.href);
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[styles.mobileNavChip, active && styles.mobileNavChipActive]}
                    onPress={() => router.replace(item.href)}
                  >
                    <Text style={[styles.mobileNavText, active && styles.mobileNavTextActive]}>
                      {t(item.labelKey)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
          <View style={styles.contentBody}>{children}</View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  topBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  brandIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(245,158,11,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTextWrap: { flexShrink: 1 },
  brandTitle: { color: '#f8fafc', fontSize: 16, fontWeight: '800' },
  brandSub: { color: '#94a3b8', fontSize: 12, marginTop: 1 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(148,163,184,0.15)',
  },
  signOutText: { color: '#e2e8f0', fontSize: 13, fontWeight: '600' },
  body: { flex: 1, flexDirection: 'column' },
  bodyWide: { flexDirection: 'row' },
  sideNav: {
    width: 220,
    padding: 16,
    borderRightWidth: 1,
    borderRightColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surface,
  },
  sideLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: adminTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  navItemActive: { backgroundColor: '#fff7ed' },
  navText: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.textSecondary },
  navTextActive: { color: adminTheme.colors.accent },
  adminLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    paddingVertical: 8,
  },
  adminLinkText: { fontSize: 12, color: adminTheme.colors.textMuted, fontWeight: '600' },
  contentScroll: { flex: 1 },
  contentInner: { padding: 16, flex: 1 },
  contentInnerWeb: { maxWidth: 1280, width: '100%', alignSelf: 'center' },
  contentBody: { flex: 1, minHeight: 0 },
  mobileNavRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  mobileNavChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  mobileNavChipActive: {
    backgroundColor: '#fff7ed',
    borderColor: adminTheme.colors.accentBright,
  },
  mobileNavText: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.textSecondary },
  mobileNavTextActive: { color: adminTheme.colors.accent },
});
