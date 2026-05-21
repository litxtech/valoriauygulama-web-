import { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Switch,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { theme } from '@/constants/theme';
import { apiGet, apiPost } from '@/lib/kbsApi';
import { isKbsUiEnabled } from '@/lib/kbsUiEnabled';
import { kbsQueryOptions } from '@/lib/kbsReactQuery';
import { AdminButton } from '@/components/admin';

type PermissionCatalogItem = { code: string; name: string; description?: string | null };
type UserRow = {
  id: string;
  fullName?: string | null;
  role: string;
  isActive: boolean;
  kbsAccessEnabled?: boolean;
  permissions: Record<string, boolean>;
};

export default function AdminKbsPermissionsScreen() {
  const { t } = useTranslation();
  const kbsUi = isKbsUiEnabled();
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  const catalogQ = useQuery({
    queryKey: ['kbs', 'admin', 'permission_catalog'],
    queryFn: async () => {
      const res = await apiGet<PermissionCatalogItem[]>('/admin/permission-catalog');
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
    ...kbsQueryOptions,
  });

  const usersQ = useQuery({
    queryKey: ['kbs', 'admin', 'users_with_permissions'],
    queryFn: async () => {
      const res = await apiGet<UserRow[]>('/admin/users-with-permissions');
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
    ...kbsQueryOptions,
  });

  const codes = useMemo(() => (catalogQ.data ?? []).map((p) => p.code), [catalogQ.data]);
  const catalogByCode = useMemo(() => {
    const m = new Map<string, PermissionCatalogItem>();
    for (const p of catalogQ.data ?? []) m.set(p.code, p);
    return m;
  }, [catalogQ.data]);

  const toggleKbsTab = async (user: UserRow) => {
    const next = !(user.kbsAccessEnabled !== false);
    setSavingUserId(user.id);
    try {
      const res = await apiPost('/admin/users/' + user.id + '/kbs-access', { enabled: next });
      if (!res.ok) {
        Alert.alert(t('adminKbsAccessAlertTitle'), res.error.message);
        return;
      }
      usersQ.refetch();
    } finally {
      setSavingUserId(null);
    }
  };

  const toggle = async (user: UserRow, code: string) => {
    const next = !(user.permissions?.[code] ?? false);
    setSavingUserId(user.id);
    try {
      const res = await apiPost('/admin/users/' + user.id + '/permissions', { permissions: { [code]: next } });
      if (!res.ok) {
        Alert.alert(t('adminPermissionUpdateAlertTitle'), res.error.message);
        return;
      }
      usersQ.refetch();
    } finally {
      setSavingUserId(null);
    }
  };

  const initialLoading = catalogQ.isPending || usersQ.isPending;
  const loadError =
    catalogQ.isError || usersQ.isError
      ? (catalogQ.error as Error)?.message ?? (usersQ.error as Error)?.message ?? t('requestFailed')
      : null;
  const refreshing = (catalogQ.isFetching || usersQ.isFetching) && !initialLoading;
  const onRefresh = async () => {
    await Promise.all([catalogQ.refetch(), usersQ.refetch()]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('adminKbsPermissionsTitle')}</Text>
      <Text style={styles.p}>{t('adminKbsPermissionsIntro')}</Text>
      {!kbsUi ? <Text style={styles.banner}>{t('adminKbsStaffTabDisabledBanner')}</Text> : null}

      {initialLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={styles.loadingText}>{t('adminUsersLoading')}</Text>
        </View>
      ) : null}

      {loadError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{loadError}</Text>
          <AdminButton
            title={t('feedRetryButton')}
            onPress={() => void onRefresh()}
            variant="outline"
            size="sm"
          />
        </View>
      ) : null}

      <FlatList
        data={usersQ.data ?? []}
        keyExtractor={(it) => it.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.userRow}>
              <Text style={styles.userTitle}>
                {item.fullName || item.id.slice(0, 8)} • {item.role}
                {item.isActive ? '' : t('adminUserInactiveSuffix')}
              </Text>
              <View style={styles.kbsSwitchRow}>
                <Text style={styles.kbsSwitchLabel}>{t('adminKbsTabLabel')}</Text>
                <Switch
                  value={item.kbsAccessEnabled !== false}
                  onValueChange={() => toggleKbsTab(item)}
                  disabled={savingUserId != null}
                  trackColor={{ false: '#ccc', true: '#bde7cf' }}
                  thumbColor={Platform.OS === 'android' ? (item.kbsAccessEnabled !== false ? '#0f5132' : '#f4f3f4') : undefined}
                />
              </View>
            </View>

            {codes.length === 0 ? (
              <Text style={styles.meta}>{t('adminPermissionCatalogMissing')}</Text>
            ) : (
              <View style={styles.grid}>
                {codes.map((code) => {
                  const allowed = item.permissions?.[code] === true;
                  const meta = catalogByCode.get(code);
                  return (
                    <TouchableOpacity
                      key={code}
                      style={[styles.pill, allowed ? styles.pillOn : styles.pillOff, savingUserId === item.id && { opacity: 0.65 }]}
                      onPress={() => toggle(item, code)}
                      disabled={savingUserId != null}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.pillText, allowed ? styles.pillTextOn : styles.pillTextOff]} numberOfLines={1}>
                        {meta?.name ?? code}
                      </Text>
                      <Text style={styles.pillSub} numberOfLines={1}>
                        {code}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}
        ListEmptyComponent={
          !initialLoading && !loadError ? (
            <Text style={styles.empty}>{t('adminUsersEmpty')}</Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: theme.colors.backgroundSecondary, gap: 10 },
  title: { fontSize: 18, fontWeight: '900', color: theme.colors.text },
  p: { color: theme.colors.textSecondary, lineHeight: 20 },
  banner: {
    fontSize: 13,
    lineHeight: 19,
    color: '#92400e',
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fcd34d',
    padding: 12,
    borderRadius: 12,
  },
  empty: { color: theme.colors.textSecondary, marginTop: 12 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  loadingText: { color: theme.colors.textSecondary, fontSize: 14 },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  errorText: { color: '#991b1b', fontSize: 13, lineHeight: 18 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.borderLight, padding: 12, marginBottom: 10, gap: 10 },
  userRow: { gap: 8 },
  userTitle: { fontWeight: '900', color: theme.colors.text },
  kbsSwitchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kbsSwitchLabel: { fontSize: 14, fontWeight: '700', color: theme.colors.textSecondary },
  meta: { color: theme.colors.textSecondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 10, borderWidth: 1, width: '48%' },
  pillOn: { backgroundColor: '#e6f7ee', borderColor: '#bde7cf' },
  pillOff: { backgroundColor: '#f6f6f6', borderColor: theme.colors.borderLight },
  pillText: { fontWeight: '900' },
  pillTextOn: { color: '#0f5132' },
  pillTextOff: { color: theme.colors.text },
  pillSub: { marginTop: 2, fontFamily: 'monospace', fontSize: 11, color: theme.colors.textSecondary },
});

