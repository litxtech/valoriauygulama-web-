import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { PressableScale } from '@/components/premium/PressableScale';
import { KitchenDashboardStat } from '@/components/kitchenOps/KitchenUi';
import { fmtKitchenMoney } from '@/lib/kitchenOps/stockStatus';
import { KITCHEN_PAYMENT_TYPES, KITCHEN_PERSONNEL_PAYMENT_TYPES } from '@/lib/kitchenOps/constants';
import { fetchDaySummary, checkPosMismatch } from '@/lib/kitchenOps/api';
import type { KitchenDaySummary } from '@/lib/kitchenOps/types';
import { EMPTY_KITCHEN_DAY_SUMMARY } from '@/lib/kitchenOps/types';
import { fetchKitchenFinanceActivity, type KitchenFinanceActivityTab } from '@/lib/kitchenOps/financeBridge';
import { todayKitchenDateIso } from '@/lib/kitchenOps/revenueTables';
import { useKitchenFinanceAccess } from '@/hooks/useKitchenFinanceAccess';
import { KitchenFinancePrintBar } from '@/components/kitchenOps/KitchenPrintBar';

const PAY_LABELS = Object.fromEntries(KITCHEN_PAYMENT_TYPES.map((p) => [p.value, p.label]));
const PERSONNEL_LABELS = Object.fromEntries(KITCHEN_PERSONNEL_PAYMENT_TYPES.map((p) => [p.value, p.label]));

type ActionCard = {
  key: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  colors: [string, string];
  iconBg: string;
};

const KITCHEN_ACTIONS: ActionCard[] = [
  {
    key: 'revenue',
    title: 'Hasılat gir',
    subtitle: 'Masa / ödeme tipi ile kayıt',
    icon: 'cash-outline',
    route: '/staff/kitchen-ops/revenue/new',
    colors: ['#059669', '#047857'],
    iconBg: 'rgba(255,255,255,0.22)',
  },
  {
    key: 'revenue_list',
    title: 'Hasılat listesi',
    subtitle: 'Bugünkü tüm kayıtlar',
    icon: 'list-outline',
    route: '/staff/kitchen-ops/revenue',
    colors: ['#0d9488', '#0f766e'],
    iconBg: 'rgba(255,255,255,0.22)',
  },
];

const RECEPTION_ACTIONS: ActionCard[] = [
  {
    key: 'reception',
    title: 'POS eşleştirme',
    subtitle: 'Otel POS onayı ve gün sonu',
    icon: 'checkmark-done-outline',
    route: '/staff/kitchen-ops/reception',
    colors: ['#2563eb', '#1d4ed8'],
    iconBg: 'rgba(255,255,255,0.22)',
  },
  {
    key: 'expense',
    title: 'Gider gir',
    subtitle: 'Kime, nereye ödendi',
    icon: 'receipt-outline',
    route: '/staff/kitchen-ops/expenses/new',
    colors: ['#ea580c', '#c2410c'],
    iconBg: 'rgba(255,255,255,0.22)',
  },
  {
    key: 'payment',
    title: 'Personel ödemesi',
    subtitle: 'Maaş, avans, prim kaydı',
    icon: 'people-outline',
    route: '/staff/kitchen-ops/personnel/new',
    colors: ['#7c3aed', '#6d28d9'],
    iconBg: 'rgba(255,255,255,0.22)',
  },
];

function ActionGradientCard({ item, onPress }: { item: ActionCard; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} style={styles.actionWrap}>
      <LinearGradient colors={item.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actionCard}>
        <View style={[styles.actionIcon, { backgroundColor: item.iconBg }]}>
          <Ionicons name={item.icon} size={22} color="#fff" />
        </View>
        <Text style={styles.actionTitle}>{item.title}</Text>
        <Text style={styles.actionSub}>{item.subtitle}</Text>
      </LinearGradient>
    </PressableScale>
  );
}

function ActivityTabButton({
  label,
  active,
  count,
  onPress,
}: {
  label: string;
  active: boolean;
  count: number;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.activityTab, active && styles.activityTabActive]}>
      <Text style={[styles.activityTabText, active && styles.activityTabTextActive]}>
        {label}
        {count > 0 ? ` (${count})` : ''}
      </Text>
    </Pressable>
  );
}

export function KitchenFinanceBridge() {
  const router = useRouter();
  const { loading: accessLoading, allowed, isReception, canEnterRevenue, canEnterExpense } = useKitchenFinanceAccess();
  const [summary, setSummary] = useState<KitchenDaySummary>({ ...EMPTY_KITCHEN_DAY_SUMMARY });
  const [posMismatch, setPosMismatch] = useState(false);
  const [activityTab, setActivityTab] = useState<KitchenFinanceActivityTab>('revenue');
  const [revenues, setRevenues] = useState<Awaited<ReturnType<typeof fetchKitchenFinanceActivity>>['revenues']>([]);
  const [expenses, setExpenses] = useState<Awaited<ReturnType<typeof fetchKitchenFinanceActivity>>['expenses']>([]);
  const [payments, setPayments] = useState<Awaited<ReturnType<typeof fetchKitchenFinanceActivity>>['payments']>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const todayLabel = new Date().toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const date = todayKitchenDateIso();
      const [daySummary, mismatch, activity] = await Promise.all([
        fetchDaySummary(date),
        checkPosMismatch(date).catch(() => false),
        fetchKitchenFinanceActivity(date),
      ]);
      setSummary(daySummary);
      setPosMismatch(mismatch);
      setRevenues(activity.revenues);
      setExpenses(activity.expenses);
      setPayments(activity.payments);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    load().finally(() => setLoading(false));
  }, [allowed, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (accessLoading || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Finans özeti yükleniyor…</Text>
      </View>
    );
  }

  if (!allowed) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={48} color={theme.colors.textMuted} />
        <Text style={styles.deniedTitle}>Finans paneline erişim yok</Text>
        <Text style={styles.denied}>
          Bu ekranı yalnızca adminin seçtiği personel, resepsiyon yetkilileri ve yöneticiler görebilir.
        </Text>
        <Text style={styles.deniedHint}>Admin → Mutfak Operasyon → Finans erişimi üzerinden personel seçilir.</Text>
      </View>
    );
  }

  const netRemaining = Number(summary.net_remaining ?? 0);
  const kitchenActions = canEnterRevenue ? KITCHEN_ACTIONS : [];
  const receptionActions = isReception || canEnterExpense ? RECEPTION_ACTIONS : [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient colors={['#312e81', '#4338ca', '#4f46e5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.heroIconWrap}>
            <Ionicons name="git-compare-outline" size={24} color="#fff" />
          </View>
          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>Mutfak ↔ Resepsiyon</Text>
            <Text style={styles.heroSub}>{todayLabel}</Text>
          </View>
        </View>
        <Text style={styles.heroRole}>
          {isReception && canEnterRevenue
            ? 'Resepsiyon + mutfak finans yetkisi'
            : isReception
              ? 'Resepsiyon eşleştirme ve gider'
              : 'Mutfak hasılat ve finans takibi'}
        </Text>
      </LinearGradient>

      {loadError ? (
        <Pressable style={styles.errorBox} onPress={() => void load()}>
          <Ionicons name="alert-circle" size={18} color="#dc2626" />
          <Text style={styles.errorText}>{loadError} — yenilemek için dokunun</Text>
        </Pressable>
      ) : null}

      <KitchenFinancePrintBar defaultOpen />

      {posMismatch ? (
        <View style={styles.warnBox}>
          <Ionicons name="warning" size={18} color="#b45309" />
          <Text style={styles.warnText}>POS farkı: Otel POS hasılatı ile kayıtlar uyuşmuyor.</Text>
          <PressableScale onPress={() => router.push('/staff/kitchen-ops/reception' as never)}>
            <Text style={styles.warnLink}>Eşleştir →</Text>
          </PressableScale>
        </View>
      ) : null}

      <View style={[styles.netCard, netRemaining >= 0 ? styles.netPositive : styles.netNegative]}>
        <Text style={styles.netLabel}>Temiz kalan para</Text>
        <Text style={styles.netValue}>{fmtKitchenMoney(netRemaining)}</Text>
        <Text style={styles.netFormula}>
          Hasılat {fmtKitchenMoney(summary.total_revenue)} − Gider {fmtKitchenMoney(summary.total_expenses)} − Ödeme{' '}
          {fmtKitchenMoney(summary.personnel_expenses)}
        </Text>
      </View>

      <View style={styles.statsRow}>
        <KitchenDashboardStat label="Hasılat" value={fmtKitchenMoney(summary.total_revenue)} tone="positive" icon="trending-up-outline" />
        <KitchenDashboardStat label="Gider" value={fmtKitchenMoney(summary.total_expenses)} tone="warning" icon="trending-down-outline" />
        <KitchenDashboardStat label="Ödeme" value={fmtKitchenMoney(summary.personnel_expenses)} tone="info" icon="people-outline" />
      </View>

      <View style={styles.statsRowSecondary}>
        <KitchenDashboardStat label="POS" value={fmtKitchenMoney(summary.total_pos)} tone="neutral" icon="card-outline" />
        <KitchenDashboardStat label="Nakit" value={fmtKitchenMoney(summary.total_cash)} tone="neutral" icon="wallet-outline" />
        <KitchenDashboardStat
          label="Cari net"
          value={fmtKitchenMoney(summary.cari_net)}
          tone="neutral"
          icon="swap-horizontal-outline"
          onPress={() => router.push('/staff/kitchen-ops/cari' as never)}
        />
      </View>

      {kitchenActions.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Mutfak işlemleri</Text>
          <View style={styles.actionGrid}>
            {kitchenActions.map((item) => (
              <ActionGradientCard key={item.key} item={item} onPress={() => router.push(item.route as never)} />
            ))}
          </View>
        </>
      ) : null}

      {receptionActions.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Resepsiyon işlemleri</Text>
          <View style={styles.actionGrid}>
            {receptionActions.map((item) => (
              <ActionGradientCard key={item.key} item={item} onPress={() => router.push(item.route as never)} />
            ))}
          </View>
        </>
      ) : null}

      <PressableScale onPress={() => router.push('/staff/kitchen-ops/finance' as never)}>
        <View style={styles.reportCard}>
          <Ionicons name="pie-chart-outline" size={22} color="#4f46e5" />
          <View style={styles.reportText}>
            <Text style={styles.reportTitle}>Detaylı finans özeti</Text>
            <Text style={styles.reportSub}>Günlük rapor ve yazdırma</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
        </View>
      </PressableScale>

      <Text style={styles.sectionTitle}>Bugünkü hareketler</Text>
      <View style={styles.activityTabs}>
        <ActivityTabButton label="Hasılat" active={activityTab === 'revenue'} count={revenues.length} onPress={() => setActivityTab('revenue')} />
        <ActivityTabButton label="Gider" active={activityTab === 'expense'} count={expenses.length} onPress={() => setActivityTab('expense')} />
        <ActivityTabButton label="Ödeme" active={activityTab === 'payment'} count={payments.length} onPress={() => setActivityTab('payment')} />
      </View>

      <View style={styles.activityList}>
        {activityTab === 'revenue'
          ? revenues.length === 0
            ? <Text style={styles.activityEmpty}>Bugün hasılat kaydı yok.</Text>
            : revenues.map((item) => (
                <View key={item.id} style={styles.activityCard}>
                  <View style={styles.activityRow}>
                    <Text style={[styles.activityAmount, { color: '#059669' }]}>{fmtKitchenMoney(item.amount)}</Text>
                    <Text style={styles.activityMeta}>{PAY_LABELS[item.payment_type] ?? item.payment_type}</Text>
                  </View>
                  <Text style={styles.activityDesc}>{item.description}</Text>
                </View>
              ))
          : null}

        {activityTab === 'expense'
          ? expenses.length === 0
            ? <Text style={styles.activityEmpty}>Bugün gider kaydı yok.</Text>
            : expenses.map((item) => (
                <View key={item.id} style={styles.activityCard}>
                  <View style={styles.activityRow}>
                    <Text style={[styles.activityAmount, { color: '#ea580c' }]}>{fmtKitchenMoney(Number(item.amount))}</Text>
                    <Text style={styles.activityMeta}>{item.category}</Text>
                  </View>
                  {item.supplier_name ? <Text style={styles.activityWho}>Ödenen: {item.supplier_name}</Text> : null}
                  {item.description ? <Text style={styles.activityDesc}>{item.description}</Text> : null}
                </View>
              ))
          : null}

        {activityTab === 'payment'
          ? payments.length === 0
            ? <Text style={styles.activityEmpty}>Bugün personel ödemesi yok.</Text>
            : payments.map((item) => (
                <View key={item.id} style={styles.activityCard}>
                  <View style={styles.activityRow}>
                    <Text style={[styles.activityAmount, { color: '#2563eb' }]}>{fmtKitchenMoney(Number(item.amount))}</Text>
                    <Text style={styles.activityMeta}>{PERSONNEL_LABELS[item.payment_type] ?? item.payment_type}</Text>
                  </View>
                  <Text style={styles.activityWho}>Kime: {item.staff_name}</Text>
                  {item.description ? <Text style={styles.activityDesc}>{item.description}</Text> : null}
                </View>
              ))
          : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: theme.colors.backgroundSecondary },
  loadingText: { marginTop: 12, fontSize: 14, color: theme.colors.textMuted },
  deniedTitle: { marginTop: 12, fontSize: 17, fontWeight: '800', color: theme.colors.text },
  denied: { marginTop: 8, fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  deniedHint: { marginTop: 8, fontSize: 13, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 18 },
  hero: { borderRadius: 18, padding: 18, marginBottom: 12, ...theme.shadows.md },
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
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.88)', marginTop: 2, textTransform: 'capitalize' },
  heroRole: { fontSize: 13, color: 'rgba(255,255,255,0.9)', marginTop: 10, fontWeight: '600' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: { flex: 1, color: '#dc2626', fontSize: 13, fontWeight: '600' },
  warnBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  warnText: { flex: 1, color: '#b45309', fontSize: 13, fontWeight: '600' },
  warnLink: { color: '#b45309', fontWeight: '800', fontSize: 13 },
  netCard: {
    borderRadius: 16,
    padding: 18,
    marginBottom: 10,
    borderWidth: 1,
    ...theme.shadows.sm,
  },
  netPositive: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  netNegative: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  netLabel: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary },
  netValue: { fontSize: 32, fontWeight: '900', color: theme.colors.text, marginTop: 4 },
  netFormula: { fontSize: 12, color: theme.colors.textMuted, marginTop: 8, lineHeight: 18 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  statsRowSecondary: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: theme.colors.text, marginTop: 8, marginBottom: 10 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  actionWrap: { width: '48%', flexGrow: 1, minWidth: '46%' },
  actionCard: { borderRadius: 16, padding: 14, minHeight: 118, ...theme.shadows.sm },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  actionTitle: { fontSize: 15, fontWeight: '800', color: '#fff' },
  actionSub: { fontSize: 12, color: 'rgba(255,255,255,0.88)', marginTop: 4, lineHeight: 16 },
  reportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 14,
    marginTop: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  reportText: { flex: 1 },
  reportTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  reportSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  activityTabs: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  activityTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    alignItems: 'center',
  },
  activityTabActive: { backgroundColor: '#eef2ff', borderColor: '#c7d2fe' },
  activityTabText: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary },
  activityTabTextActive: { color: '#4338ca' },
  activityList: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    padding: 12,
    marginBottom: 8,
  },
  activityCard: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  activityRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  activityAmount: { fontSize: 17, fontWeight: '800' },
  activityMeta: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted },
  activityWho: { fontSize: 13, fontWeight: '600', color: theme.colors.text, marginTop: 4 },
  activityDesc: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },
  activityEmpty: { textAlign: 'center', color: theme.colors.textMuted, paddingVertical: 20, fontSize: 14 },
});
