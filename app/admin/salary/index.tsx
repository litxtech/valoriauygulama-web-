import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TextInput,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminOrganizationPicker } from '@/components/admin';
import {
  SalaryStaffListCard,
  type SalaryStaffStatusTone,
} from '@/components/admin/SalaryStaffListCard';
import { formatDateShort } from '@/lib/date';
import { sendNotification } from '@/lib/notificationService';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import {
  ADMIN_SCREEN_FOCUS_TTL_MS,
  getAdminScreenCache,
  setAdminScreenCache,
} from '@/lib/adminPerf';
import { AdminStackBackButton } from '@/lib/adminStackBack';
import { organizationNameById } from '@/lib/accountingOrgScope';
import { fmtMoneyTry } from '@/lib/financeLedger';

const MONTH_NAMES = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];
const HERO_GRAD = ['#0f172a', '#1e3a5f'] as const;
const FAB_GRAD = ['#d97706', '#b45309'] as const;

type StatusFilter = 'all' | 'paid' | 'pending' | 'unpaid' | 'rejected';
type SortMode = 'name' | 'amount' | 'status';

type StaffRow = {
  id: string;
  full_name: string | null;
  department: string | null;
  organization_id: string;
};

type PaymentRow = {
  id: string;
  staff_id: string;
  period_month: number;
  period_year: number;
  created_at: string;
  amount: number;
  payment_date: string;
  status: string;
  staff_approved_at: string | null;
  staff_rejected_at: string | null;
  rejection_reason: string | null;
};

type StaffWithSalary = StaffRow & {
  lastPayment: PaymentRow | null;
  lastPaymentLabel: string;
  statusLabel: string;
  statusTone: SalaryStaffStatusTone;
};

type SalaryScreenCache = {
  staffList: StaffWithSalary[];
  summary: {
    totalStaff: number;
    totalSalary: number;
    paidAmount: number;
    paidCount: number;
    pendingApprovalAmount: number;
    pendingApprovalCount: number;
  };
};

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'unpaid', label: 'Ödenmedi' },
  { key: 'pending', label: 'Onay bekliyor' },
  { key: 'paid', label: 'Ödendi' },
  { key: 'rejected', label: 'Reddedildi' },
];

function resolveStatusTone(
  lastPayment: PaymentRow | null,
  thisYear: number,
  thisMonth: number
): SalaryStaffStatusTone {
  if (!lastPayment) return 'unpaid';
  if (lastPayment.period_year === thisYear && lastPayment.period_month === thisMonth) {
    if (lastPayment.status === 'approved') return 'paid';
    if (lastPayment.status === 'pending_approval') return 'pending';
    if (lastPayment.status === 'rejected') return 'rejected';
  }
  if (lastPayment.status === 'rejected') return 'rejected';
  if (lastPayment.status === 'pending_approval') return 'pending';
  if (lastPayment.period_year !== thisYear || lastPayment.period_month !== thisMonth) return 'unpaid';
  return 'paid';
}

export default function AdminSalaryIndexScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const organizations = useAdminOrgStore((s) => s.organizations);
  const [staffList, setStaffList] = useState<StaffWithSalary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('name');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [summary, setSummary] = useState({
    totalStaff: 0,
    totalSalary: 0,
    paidAmount: 0,
    paidCount: 0,
    pendingApprovalAmount: 0,
    pendingApprovalCount: 0,
  });
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const canUseAllOrganizations = me?.app_permissions?.super_admin === true || me?.role === 'admin';
  const showAllOrgs = canUseAllOrganizations && selectedOrganizationId === 'all';

  const load = useCallback(
    async (opts?: { force?: boolean }) => {
      const orgId = canUseAllOrganizations ? selectedOrganizationId : me?.organization_id;
      const cacheKey = `admin-salary:${orgId && orgId !== 'all' ? orgId : 'all'}`;
      if (!opts?.force) {
        const hit = getAdminScreenCache<SalaryScreenCache>(cacheKey, ADMIN_SCREEN_FOCUS_TTL_MS);
        if (hit?.staffList) {
          setStaffList(hit.staffList);
          setSummary(hit.summary);
          setLoading(false);
          return;
        }
      }
      let staffQuery = supabase
        .from('staff')
        .select('id, full_name, department, organization_id')
        .eq('is_active', true)
        .order('full_name');
      if (orgId && orgId !== 'all') staffQuery = staffQuery.eq('organization_id', orgId);
      const { data: staffData } = await staffQuery;
      const staff = (staffData ?? []) as StaffRow[];
      if (staff.length === 0) {
        const emptySummary = {
          totalStaff: 0,
          totalSalary: 0,
          paidAmount: 0,
          paidCount: 0,
          pendingApprovalAmount: 0,
          pendingApprovalCount: 0,
        };
        setStaffList([]);
        setSummary(emptySummary);
        setAdminScreenCache(cacheKey, { staffList: [], summary: emptySummary } satisfies SalaryScreenCache);
        setLoading(false);
        return;
      }

      const yearFloor = new Date().getFullYear() - 1;
      let paymentsQuery = supabase
        .from('salary_payments')
        .select(
          'id, staff_id, period_month, period_year, created_at, amount, payment_date, status, staff_approved_at, staff_rejected_at, rejection_reason'
        )
        .gte('period_year', yearFloor)
        .order('period_year', { ascending: false })
        .order('period_month', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(800);
      if (orgId && orgId !== 'all') paymentsQuery = paymentsQuery.eq('organization_id', orgId);
      const { data: paymentsData } = await paymentsQuery;

      const payments = (paymentsData ?? []) as PaymentRow[];
      const now = new Date();
      const thisYear = now.getFullYear();
      const thisMonth = now.getMonth() + 1;

      const byStaff = new Map<string, PaymentRow[]>();
      for (const p of payments) {
        const list = byStaff.get(p.staff_id) ?? [];
        list.push(p);
        byStaff.set(p.staff_id, list);
      }

      let totalSalary = 0;
      let paidAmount = 0;
      let paidCount = 0;
      let pendingApprovalAmount = 0;
      let pendingApprovalCount = 0;

      const rows: StaffWithSalary[] = staff.map((s) => {
        const list = byStaff.get(s.id) ?? [];
        const lastPayment = list[0] ?? null;
        const amount = lastPayment ? Number(lastPayment.amount) : 0;
        totalSalary += amount;

        let lastPaymentLabel = '—';
        let statusLabel = `${MONTH_NAMES[thisMonth - 1]} ödemesi YAPILMADI`;
        const statusTone = resolveStatusTone(lastPayment, thisYear, thisMonth);

        if (lastPayment) {
          lastPaymentLabel = `${formatDateShort(lastPayment.payment_date)} (${
            lastPayment.status === 'approved'
              ? 'Ödendi'
              : lastPayment.status === 'rejected'
                ? 'Reddedildi'
                : 'Ödendi'
          })`;
          if (lastPayment.period_year === thisYear && lastPayment.period_month === thisMonth) {
            if (lastPayment.status === 'approved') {
              statusLabel = `Onaylandı (${
                lastPayment.staff_approved_at ? formatDateShort(lastPayment.staff_approved_at) : '—'
              })`;
              paidAmount += Number(lastPayment.amount);
              paidCount += 1;
            } else if (lastPayment.status === 'pending_approval') {
              statusLabel = 'Onay Bekliyor (Personel onaylamadı)';
              pendingApprovalAmount += Number(lastPayment.amount);
              pendingApprovalCount += 1;
            } else {
              statusLabel = 'Reddedildi';
            }
          } else {
            statusLabel = `${MONTH_NAMES[lastPayment.period_month - 1]} ${lastPayment.period_year} ödemesi yapıldı`;
            if (lastPayment.status === 'approved') {
              paidAmount += Number(lastPayment.amount);
              paidCount += 1;
            }
          }
        } else {
          const expected = list.find((p) => p.period_year === thisYear && p.period_month === thisMonth);
          if (expected && expected.status === 'pending_approval') {
            statusLabel = 'Onay Bekliyor';
            pendingApprovalAmount += Number(expected.amount);
            pendingApprovalCount += 1;
          }
        }

        return {
          ...s,
          lastPayment,
          lastPaymentLabel,
          statusLabel,
          statusTone,
        };
      });

      const nextSummary = {
        totalStaff: staff.length,
        totalSalary,
        paidAmount,
        paidCount,
        pendingApprovalAmount,
        pendingApprovalCount,
      };
      setStaffList(rows);
      setSummary(nextSummary);
      setAdminScreenCache(cacheKey, { staffList: rows, summary: nextSummary } satisfies SalaryScreenCache);
      setLoading(false);
    },
    [canUseAllOrganizations, me?.organization_id, selectedOrganizationId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load({ force: true }).finally(() => setRefreshing(false));
  }, [load]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (statusFilter !== 'all') n += 1;
    if (sortMode !== 'name') n += 1;
    return n;
  }, [statusFilter, sortMode]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    let list = staffList;
    if (q) {
      list = list.filter((r) => {
        const name = (r.full_name ?? '').toLocaleLowerCase('tr-TR');
        const dept = (r.department ?? '').toLocaleLowerCase('tr-TR');
        return name.includes(q) || dept.includes(q);
      });
    }
    if (statusFilter !== 'all') {
      list = list.filter((r) => r.statusTone === statusFilter);
    }
    const sorted = [...list];
    if (sortMode === 'amount') {
      sorted.sort(
        (a, b) => Number(b.lastPayment?.amount ?? 0) - Number(a.lastPayment?.amount ?? 0)
      );
    } else if (sortMode === 'status') {
      const order: Record<SalaryStaffStatusTone, number> = {
        unpaid: 0,
        pending: 1,
        rejected: 2,
        paid: 3,
      };
      sorted.sort((a, b) => order[a.statusTone] - order[b.statusTone]);
    } else {
      sorted.sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '', 'tr'));
    }
    return sorted;
  }, [staffList, search, statusFilter, sortMode]);

  const needsReminder = (row: StaffWithSalary) => {
    const now = new Date();
    const thisYear = now.getFullYear();
    const thisMonth = now.getMonth() + 1;
    if (!row.lastPayment) return true;
    return !(row.lastPayment.period_year === thisYear && row.lastPayment.period_month === thisMonth);
  };

  const sendReminder = async (row: StaffWithSalary) => {
    setRemindingId(row.id);
    await sendNotification({
      staffId: row.id,
      title: 'Maaş hatırlatması',
      body: 'Maaş ödemeniz yakında yapılacak. Lütfen banka bilgilerinizi kontrol edin.',
      notificationType: 'salary_reminder',
      category: 'staff',
      data: { type: 'salary_reminder' },
    });
    setRemindingId(null);
    Alert.alert('Gönderildi', 'Personel bilgilendirildi.');
  };

  const renderItem = ({ item }: { item: StaffWithSalary }) => (
    <SalaryStaffListCard
      name={item.full_name ?? '—'}
      department={item.department}
      organizationName={
        showAllOrgs ? organizationNameById(item.organization_id, organizations) : undefined
      }
      amountLabel={item.lastPayment ? fmtMoneyTry(Number(item.lastPayment.amount)) : '—'}
      lastPaymentLabel={item.lastPaymentLabel}
      statusLabel={item.statusLabel}
      statusTone={item.statusTone}
      onPress={() =>
        router.push({ pathname: '/admin/salary/history/[id]', params: { id: item.id } })
      }
      onPayPress={() =>
        router.push({ pathname: '/admin/salary/pay', params: { staffId: item.id } })
      }
      onRemindPress={needsReminder(item) ? () => void sendReminder(item) : undefined}
      reminding={remindingId === item.id}
      dense
    />
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={[...HERO_GRAD]} style={[styles.heroBar, { paddingTop: insets.top + 8 }]}>
        <AdminStackBackButton tintColor="#fff" fallback="/admin/accounting" />
        <View style={styles.heroTitleWrap}>
          <Text style={styles.heroTitle} numberOfLines={1}>
            Maaş yönetimi
          </Text>
          <Text style={styles.heroSub} numberOfLines={1}>
            Personel maaşları · hızlı ödeme
          </Text>
        </View>
        <View style={styles.topActions}>
          <TouchableOpacity
            style={styles.heroIconBtn}
            onPress={() => router.push('/admin/salary/quick')}
            accessibilityLabel="Kolay maaş girişi"
          >
            <Ionicons name="flash-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.heroIconBtn}
            onPress={() => router.push('/admin/salary/all')}
            accessibilityLabel="Tüm ödemeler"
          >
            <Ionicons name="list-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.heroIconBtn}
            onPress={() => router.push('/admin/salary/pay')}
            accessibilityLabel="Maaş öde"
          >
            <Ionicons name="wallet-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <View style={styles.listArea}>
        <View style={styles.searchToolbar}>
          <View style={styles.searchCard}>
            <Ionicons name="search" size={18} color={adminTheme.colors.accent} />
            <TextInput
              style={styles.searchInput}
              placeholder="Personel veya departman ara…"
              placeholderTextColor={adminTheme.colors.textMuted}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
              clearButtonMode="never"
            />
            {search.length > 0 ? (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={8} style={styles.searchClear}>
                <Ionicons name="close-circle" size={18} color={adminTheme.colors.textMuted} />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.filterToggle, filtersOpen && styles.filterToggleOn]}
              onPress={() => setFiltersOpen((v) => !v)}
              hitSlop={6}
              accessibilityLabel="Detaylı filtre"
            >
              <Ionicons
                name="options-outline"
                size={18}
                color={filtersOpen || activeFilterCount > 0 ? '#7c3aed' : adminTheme.colors.textMuted}
              />
              {activeFilterCount > 0 ? (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            keyboardShouldPersistTaps="handled"
          >
            {STATUS_FILTERS.map((f) => {
              const on = statusFilter === f.key;
              return (
                <TouchableOpacity
                  key={f.key}
                  style={[
                    styles.filterChip,
                    on && styles.filterChipOn,
                    f.key === 'unpaid' && on && styles.filterChipWarn,
                    f.key === 'pending' && on && styles.filterChipWarn,
                  ]}
                  onPress={() => setStatusFilter(f.key)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      on && styles.filterChipTextOn,
                      (f.key === 'unpaid' || f.key === 'pending') && on && styles.filterChipTextWarn,
                    ]}
                  >
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {filtersOpen ? (
            <View style={styles.filterPanel}>
              <Text style={styles.filterPanelLbl}>Sıralama</Text>
              <View style={styles.sortRow}>
                {(
                  [
                    { key: 'name' as const, label: 'İsim' },
                    { key: 'amount' as const, label: 'Tutar' },
                    { key: 'status' as const, label: 'Durum' },
                  ] as const
                ).map((s) => (
                  <TouchableOpacity
                    key={s.key}
                    style={[styles.sortChip, sortMode === s.key && styles.sortChipOn]}
                    onPress={() => setSortMode(s.key)}
                  >
                    <Text style={[styles.sortChipText, sortMode === s.key && styles.sortChipTextOn]}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {activeFilterCount > 0 || search.trim() ? (
                <TouchableOpacity
                  style={styles.clearFiltersBtn}
                  onPress={() => {
                    setStatusFilter('all');
                    setSortMode('name');
                    setSearch('');
                  }}
                >
                  <Ionicons name="refresh-outline" size={14} color="#7c3aed" />
                  <Text style={styles.clearFiltersText}>Filtreleri temizle</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>

        <FlatList
          style={styles.list}
          data={loading && !refreshing ? [] : filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <View style={styles.orgCard}>
                <AdminOrganizationPicker
                  canUseAll={canUseAllOrganizations}
                  ownOrganizationId={me?.organization_id}
                />
              </View>
              {loading && !refreshing ? (
                <ActivityIndicator color={adminTheme.colors.accent} style={styles.listLoader} />
              ) : (
                <View style={styles.statsRow}>
                  <View style={styles.statPill}>
                    <Ionicons name="people-outline" size={16} color={adminTheme.colors.textMuted} />
                    <View>
                      <Text style={styles.statPillNum}>{summary.totalStaff}</Text>
                      <Text style={styles.statPillLbl}>Personel</Text>
                    </View>
                  </View>
                  <View style={[styles.statPill, styles.statPillPaid]}>
                    <Ionicons name="checkmark-circle-outline" size={16} color="#16a34a" />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.statPillNum, styles.statPillNumPaid]} numberOfLines={1}>
                        {fmtMoneyTry(summary.paidAmount)}
                      </Text>
                      <Text style={styles.statPillLbl}>Ödenen ({summary.paidCount})</Text>
                    </View>
                  </View>
                  <View style={[styles.statPill, styles.statPillPending]}>
                    <Ionicons name="time-outline" size={16} color="#b45309" />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.statPillNum, styles.statPillNumPending]} numberOfLines={1}>
                        {fmtMoneyTry(summary.pendingApprovalAmount)}
                      </Text>
                      <Text style={styles.statPillLbl}>Bekleyen ({summary.pendingApprovalCount})</Text>
                    </View>
                  </View>
                </View>
              )}
              <Text style={styles.listHint}>
                Kartı açarak geçmişi görün · kırmızı butonla hızlı maaş ödemesi
              </Text>
            </View>
          }
          contentContainerStyle={[styles.listContent, { paddingBottom: 100 + Math.max(insets.bottom, 10) }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            loading && !refreshing ? null : (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconWrap}>
                  <Ionicons name="wallet-outline" size={36} color={adminTheme.colors.accent} />
                </View>
                <Text style={styles.emptyTitle}>
                  {search.trim() || activeFilterCount > 0
                    ? 'Sonuç bulunamadı'
                    : 'Henüz personel yok'}
                </Text>
                <Text style={styles.emptySub}>
                  {search.trim() || activeFilterCount > 0
                    ? 'Arama veya filtreyi değiştirin.'
                    : 'Aktif personel eklendiğinde burada listelenir.'}
                </Text>
                {search.trim() || activeFilterCount > 0 ? (
                  <TouchableOpacity
                    style={styles.emptyBtn}
                    onPress={() => {
                      setSearch('');
                      setStatusFilter('all');
                      setSortMode('name');
                    }}
                    activeOpacity={0.9}
                  >
                    <Ionicons name="refresh" size={18} color="#fff" />
                    <Text style={styles.emptyBtnText}>Filtreyi temizle</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.emptyBtn}
                    onPress={() => router.push('/admin/salary/pay')}
                    activeOpacity={0.9}
                  >
                    <Ionicons name="wallet" size={18} color="#fff" />
                    <Text style={styles.emptyBtnText}>Maaş öde</Text>
                  </TouchableOpacity>
                )}
              </View>
            )
          }
        />
      </View>

      <View style={[styles.fabWrap, { paddingBottom: Math.max(insets.bottom, 10) }]} pointerEvents="box-none">
        <TouchableOpacity
          onPress={() => router.push('/admin/salary/pay')}
          activeOpacity={0.88}
          accessibilityLabel="Maaş öde"
        >
          <LinearGradient colors={[...FAB_GRAD]} style={styles.fab}>
            <Ionicons name="wallet" size={24} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  heroBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingBottom: 10,
  },
  heroIconBtn: { padding: 8 },
  heroTitleWrap: { flex: 1, marginHorizontal: 4 },
  heroTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  heroSub: { fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 2 },
  topActions: { flexDirection: 'row', alignItems: 'center' },
  listArea: { flex: 1 },
  list: { flex: 1 },
  searchToolbar: {
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: adminTheme.colors.border,
    zIndex: 3,
  },
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    ...adminTheme.shadow.sm,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 10, color: adminTheme.colors.text },
  searchClear: { padding: 4 },
  filterToggle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  filterToggleOn: { backgroundColor: '#ede9fe' },
  filterBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#7c3aed',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  filterBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  chipRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  filterChipOn: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  filterChipWarn: { backgroundColor: '#fffbeb', borderColor: '#f59e0b' },
  filterChipText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textMuted },
  filterChipTextOn: { color: '#fff' },
  filterChipTextWarn: { color: '#b45309' },
  filterPanel: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  filterPanelLbl: {
    fontSize: 11,
    fontWeight: '800',
    color: adminTheme.colors.textMuted,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sortRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  sortChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  sortChipOn: { backgroundColor: '#ede9fe', borderColor: '#c4b5fd' },
  sortChipText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textMuted },
  sortChipTextOn: { color: '#6d28d9' },
  clearFiltersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 8,
  },
  clearFiltersText: { fontSize: 13, fontWeight: '700', color: '#7c3aed' },
  listHeader: { paddingTop: 2, marginBottom: 4 },
  orgCard: { marginBottom: 10 },
  listLoader: { marginVertical: 12 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  statPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  statPillPaid: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  statPillPending: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  statPillNum: { fontSize: 12, fontWeight: '800', color: adminTheme.colors.text },
  statPillNumPaid: { color: '#16a34a' },
  statPillNumPending: { color: '#b45309' },
  statPillLbl: { fontSize: 10, color: adminTheme.colors.textMuted, fontWeight: '600' },
  listHint: {
    fontSize: 11,
    color: adminTheme.colors.textMuted,
    marginBottom: 8,
    lineHeight: 16,
  },
  listContent: { paddingHorizontal: 16, paddingBottom: 96 },
  fabWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'flex-end',
    paddingTop: 6,
    paddingRight: 18,
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    ...adminTheme.shadow.lg,
  },
  emptyCard: {
    alignItems: 'center',
    marginTop: 24,
    padding: 24,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff7ed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: adminTheme.colors.text, textAlign: 'center' },
  emptySub: {
    fontSize: 13,
    color: adminTheme.colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
    backgroundColor: adminTheme.colors.accent,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
