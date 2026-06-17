import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { adminTheme } from '@/constants/adminTheme';
import {
  buildFnbHubPrimaryActions,
  buildFnbHubSecondaryActions,
  canAccessFnbHub,
  type FnbHubPrimaryAction,
} from '@/lib/fnbHub';
import { fetchDaySummary } from '@/lib/kitchenOps/api';
import { fmtKitchenMoney } from '@/lib/kitchenOps/stockStatus';
import { fetchKitchenFinanceStaffIds } from '@/lib/kitchenOps/financeAccessSettings';
import { canAccessKitchenFinance, canAccessKitchenOps, canAccessReservationSales, canManageHotelKitchenMenu } from '@/lib/staffPermissions';
import { supabase } from '@/lib/supabase';
import { fetchOrganizationSlugById } from '@/lib/publicKitchenMenu';
import { buildPublicKitchenMenuUrl } from '@/lib/appPublicUrl';
import { PressableScale } from '@/components/premium/PressableScale';

type Props = {
  variant?: 'staff' | 'admin';
};

function PrimaryTile({
  action,
  onPress,
}: {
  action: FnbHubPrimaryAction;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} style={styles.primaryTileWrap}>
      <View style={[styles.primaryTile, { backgroundColor: action.bg, borderColor: `${action.color}33` }]}>
        <View style={[styles.primaryIcon, { backgroundColor: `${action.color}22` }]}>
          <Ionicons name={action.icon as keyof typeof Ionicons.glyphMap} size={26} color={action.color} />
        </View>
        <Text style={[styles.primaryLabel, { color: action.color }]}>{action.label}</Text>
        <Text style={styles.primarySub}>{action.subtitle}</Text>
      </View>
    </PressableScale>
  );
}

export function FnbHubScreen({ variant = 'staff' }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const [financeStaffIds, setFinanceStaffIds] = useState<string[]>([]);
  const canUse = canAccessFnbHub(staff, financeStaffIds);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [kitchenRevenue, setKitchenRevenue] = useState(0);
  const [salesCount, setSalesCount] = useState(0);
  const [menuCount, setMenuCount] = useState(0);
  const [publicMenuUrl, setPublicMenuUrl] = useState<string | null>(null);

  const palette = variant === 'admin' ? adminTheme.colors : { primary: theme.colors.primary, textMuted: theme.colors.textSecondary };

  const primaryActions = useMemo(
    () => buildFnbHubPrimaryActions(staff, { variant, publicMenuUrl, financeStaffIds }),
    [staff, variant, publicMenuUrl, financeStaffIds]
  );
  const secondaryActions = useMemo(
    () => buildFnbHubSecondaryActions(staff, { variant, publicMenuUrl, financeStaffIds }),
    [staff, variant, publicMenuUrl, financeStaffIds]
  );

  useEffect(() => {
    if (!staff?.organization_id) {
      setFinanceStaffIds([]);
      return;
    }
    void fetchKitchenFinanceStaffIds(staff.organization_id).then(setFinanceStaffIds);
  }, [staff?.organization_id]);

  const load = useCallback(async () => {
    if (!staff?.id || !canUse) return;

    const tasks: Promise<void>[] = [];

    if (canAccessKitchenFinance(staff, financeStaffIds)) {
      tasks.push(
        fetchDaySummary()
          .then((s) => setKitchenRevenue(Number(s.total_revenue ?? 0)))
          .catch(() => setKitchenRevenue(0))
      );
    }

    if (canAccessReservationSales(staff)) {
      tasks.push(
        supabase
          .rpc('my_sales_commission_summary', { p_from: null, p_to: null })
          .then(({ data }) => {
            const row = (Array.isArray(data) ? data[0] : data) as { sales_count?: number } | null;
            setSalesCount(Number(row?.sales_count ?? 0));
          })
          .catch(() => setSalesCount(0))
      );
    }

    if (canManageHotelKitchenMenu(staff) && staff.organization_id) {
      tasks.push(
        supabase
          .from('hotel_kitchen_menu_items')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', staff.organization_id)
          .then(({ count }) => setMenuCount(count ?? 0))
          .catch(() => setMenuCount(0))
      );
      tasks.push(
        fetchOrganizationSlugById(staff.organization_id)
          .then((slug) => setPublicMenuUrl(slug ? buildPublicKitchenMenuUrl(slug) : null))
          .catch(() => setPublicMenuUrl(null))
      );
    }

    await Promise.all(tasks);
  }, [canUse, staff]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openExternal = (url: string) => {
    if (Platform.OS === 'web') window.open(url, '_blank');
    else void Linking.openURL(url);
  };

  const onPrimaryPress = (action: FnbHubPrimaryAction) => {
    if (action.externalUrl) {
      openExternal(action.externalUrl);
      return;
    }
    if (action.href) router.push(action.href as never);
  };

  if (!canUse) {
    return (
      <View style={styles.denied}>
        <Ionicons name="lock-closed-outline" size={32} color={palette.textMuted} />
        <Text style={styles.deniedTitle}>Erişim yok</Text>
        <Text style={styles.deniedDesc}>
          Mutfak, satış veya menü yetkilerinden en az biri personel kaydınızda açık olmalı.
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />}
    >
      <LinearGradient colors={['#ea580c', '#c2410c', '#9a3412']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.heroIconWrap}>
            <Ionicons name="grid" size={24} color="#fff" />
          </View>
          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>{t('fnbHubTitle')}</Text>
            <Text style={styles.heroSub}>{t('fnbHubSubtitle')}</Text>
          </View>
        </View>
        {canAccessKitchenOps(staff) ? (
          <View style={styles.heroStat}>
            <Text style={styles.heroStatLabel}>Bugün mutfak hasılat</Text>
            <Text style={styles.heroStatValue}>{fmtKitchenMoney(kitchenRevenue)}</Text>
          </View>
        ) : null}
      </LinearGradient>

      {primaryActions.length > 0 ? (
        <View style={styles.primaryRow}>
          {primaryActions.map((action) => (
            <PrimaryTile key={action.id} action={action} onPress={() => onPrimaryPress(action)} />
          ))}
        </View>
      ) : null}

      <View style={styles.statsRow}>
        {canAccessReservationSales(staff) ? (
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Toplam satış</Text>
            <Text style={styles.statValue}>{salesCount}</Text>
          </View>
        ) : null}
        {canManageHotelKitchenMenu(staff) ? (
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Menü ürünü</Text>
            <Text style={styles.statValue}>{menuCount}</Text>
          </View>
        ) : null}
      </View>

      {secondaryActions.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Diğer işlemler</Text>
          {secondaryActions.map((action) => (
            <TouchableOpacity
              key={action.id}
              style={styles.actionCard}
              onPress={() => router.push(action.href as never)}
              activeOpacity={0.85}
            >
              <View style={[styles.actionIcon, { backgroundColor: `${action.color}18` }]}>
                <Ionicons name={action.icon as keyof typeof Ionicons.glyphMap} size={24} color={action.color} />
              </View>
              <View style={styles.actionText}>
                <Text style={styles.actionLabel}>{action.label}</Text>
                <Text style={styles.actionDesc}>{action.desc}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
            </TouchableOpacity>
          ))}
        </>
      ) : null}

      <View style={styles.tipBox}>
        <Ionicons name="bulb-outline" size={18} color="#b45309" />
        <Text style={styles.tipText}>{t('fnbHubTip')}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#f8fafc' },
  deniedTitle: { fontSize: 18, fontWeight: '700', color: '#1e293b', marginTop: 12 },
  deniedDesc: { fontSize: 14, color: '#64748b', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  hero: {
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    ...theme.shadows.md,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { flex: 1 },
  heroTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.88)', marginTop: 4, lineHeight: 18 },
  heroStat: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.22)',
  },
  heroStatLabel: { fontSize: 12, color: 'rgba(255,255,255,0.75)' },
  heroStatValue: { fontSize: 24, fontWeight: '800', color: '#fff', marginTop: 2 },
  primaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  primaryTileWrap: { flexGrow: 1, minWidth: '30%', flexBasis: '30%' },
  primaryTile: {
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    minHeight: 118,
    justifyContent: 'center',
    ...theme.shadows.sm,
  },
  primaryIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  primaryLabel: { fontSize: 14, fontWeight: '800', textAlign: 'center' },
  primarySub: { fontSize: 11, color: '#64748b', marginTop: 4, textAlign: 'center', lineHeight: 15 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  statCard: {
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  statLabel: { fontSize: 12, color: '#64748b', marginBottom: 4 },
  statValue: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 10, marginTop: 8, letterSpacing: 0.3 },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  actionIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionText: { flex: 1 },
  actionLabel: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  actionDesc: { fontSize: 13, color: '#64748b', marginTop: 3, lineHeight: 18 },
  tipBox: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  tipText: { flex: 1, fontSize: 13, color: '#92400e', lineHeight: 19 },
});
