import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
} from 'react-native';
import {
  ADMIN_SCREEN_FOCUS_TTL_MS,
  createDebouncedRunner,
  getAdminScreenCache,
  setAdminScreenCache,
} from '@/lib/adminPerf';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { sendNotification } from '@/lib/notificationService';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard, AdminOrganizationPicker } from '@/components/admin';
import { CachedImage } from '@/components/CachedImage';
import { ExpenseReceiptThumbnail } from '@/components/expenses/ExpenseReceiptThumbnail';
import { expenseReceiptPreviewModalStyle, EXPENSE_RECEIPT_PREVIEW_COMPACT } from '@/lib/expenseReceiptPreviewStyles';
import { formatDateShort } from '@/lib/date';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import {
  confirmBulkApproval,
  pickExpenseRejectReason,
} from '@/lib/adminExpenseRejectReasons';

type ExpenseRow = {
  id: string;
  amount: number;
  description: string | null;
  receipt_image_url: string | null;
  status: string;
  expense_date: string;
  created_at: string;
  staff_id: string;
  staff: { full_name: string | null; department: string | null } | null;
  category: { name: string } | null;
  organization: { name: string } | null;
};

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' ₺';
}

const MONTHS_TR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

function monthKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function labelForMonthKey(ym: string): string {
  const [y, m] = ym.split('-').map((x) => parseInt(x, 10));
  if (!y || !m || m < 1 || m > 12) return ym;
  return `${MONTHS_TR[m - 1]} ${y}`;
}

type AggRow = { amount: number | string; status: string; expense_date: string };

type MonthBucket = {
  key: string;
  label: string;
  /** Onaylı + beklemede (reddedilenler hariç) — raporlardaki “güncel tutar” ile uyumlu */
  totalActive: number;
  approved: number;
  pending: number;
};

/** Son 12 ay — tüm geçmişi sayfalayıp çekmek ana ekranı kilitlemesin */
async function fetchExpenseAggRows(organizationId?: string | 'all'): Promise<AggRow[]> {
  const since = new Date();
  since.setMonth(since.getMonth() - 12);
  const sinceStr = since.toISOString().slice(0, 10);
  const out: AggRow[] = [];
  const page = 500;
  let from = 0;
  for (;;) {
    let q = supabase
      .from('staff_expenses')
      .select('amount,status,expense_date')
      .gte('expense_date', sinceStr)
      .order('expense_date', { ascending: true })
      .range(from, from + page - 1);
    if (organizationId && organizationId !== 'all') {
      q = q.eq('organization_id', organizationId);
    }
    const { data, error } = await q;
    if (error) break;
    const chunk = (data ?? []) as AggRow[];
    out.push(...chunk);
    if (chunk.length < page) break;
    from += page;
    if (from >= 3000) break;
  }
  return out;
}

function aggregateExpenses(rows: AggRow[]): {
  months: MonthBucket[];
  grandTotalActive: number;
  grandApproved: number;
  thisMonthActive: number;
  lastMonthApproved: number;
  approvedThisMonth: number;
} {
  const byMonth = new Map<string, { approved: number; pending: number }>();
  let grandTotalActive = 0;
  let grandApproved = 0;

  for (const r of rows) {
    const amt = Number(r.amount) || 0;
    const ym = String(r.expense_date || '').slice(0, 7);
    if (ym.length !== 7) continue;

    if (!byMonth.has(ym)) byMonth.set(ym, { approved: 0, pending: 0 });
    const b = byMonth.get(ym)!;
    if (r.status === 'approved') {
      b.approved += amt;
      grandApproved += amt;
    } else if (r.status === 'pending') {
      b.pending += amt;
    }
    if (r.status !== 'rejected') grandTotalActive += amt;
  }

  const months: MonthBucket[] = [...byMonth.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, v]) => ({
      key,
      label: labelForMonthKey(key),
      totalActive: v.approved + v.pending,
      approved: v.approved,
      pending: v.pending,
    }));

  const now = new Date();
  const ymThis = monthKeyFromDate(now);
  const lastRef = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const ymLast = monthKeyFromDate(lastRef);

  const thisBucket = byMonth.get(ymThis);
  const lastBucket = byMonth.get(ymLast);
  const thisMonthActive = thisBucket ? thisBucket.approved + thisBucket.pending : 0;
  const approvedThisMonth = thisBucket?.approved ?? 0;
  const lastMonthApproved = lastBucket?.approved ?? 0;

  return {
    months,
    grandTotalActive,
    grandApproved,
    thisMonthActive,
    lastMonthApproved,
    approvedThisMonth,
  };
}

export default function AdminExpensesScreen() {
  const router = useRouter();
  const me = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const [pending, setPending] = useState<ExpenseRow[]>([]);
  const [allExpenses, setAllExpenses] = useState<ExpenseRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const realtimeDebounce = useRef(createDebouncedRunner(1_200)).current;
  const [actingId, setActingId] = useState<string | null>(null);
  const [selectedPending, setSelectedPending] = useState<Set<string>>(() => new Set());
  const [bulkActing, setBulkActing] = useState(false);
  const [summary, setSummary] = useState<{
    thisMonthTotal: number;
    lastMonthTotal: number;
    pendingCount: number;
    pendingAmount: number;
    approvedThisMonth: number;
    grandTotalActive: number;
    grandApproved: number;
  }>({
    thisMonthTotal: 0,
    lastMonthTotal: 0,
    pendingCount: 0,
    pendingAmount: 0,
    approvedThisMonth: 0,
    grandTotalActive: 0,
    grandApproved: 0,
  });
  const [monthlyHistory, setMonthlyHistory] = useState<MonthBucket[]>([]);
  const [receiptModal, setReceiptModal] = useState<string | null>(null);

  const load = useCallback(async (opts?: { force?: boolean }) => {
    const canUseAll = me?.app_permissions?.super_admin === true || me?.role === 'admin';
    const orgId = canUseAll ? selectedOrganizationId : me?.organization_id;
    const cacheKey = `expenses:${orgId ?? 'all'}`;
    if (!opts?.force) {
      const cached = getAdminScreenCache<{
        pending: ExpenseRow[];
        allExpenses: ExpenseRow[];
        monthlyHistory: MonthBucket[];
        summary: typeof summary;
      }>(cacheKey, ADMIN_SCREEN_FOCUS_TTL_MS);
      if (cached) {
        setPending(cached.pending);
        setAllExpenses(cached.allExpenses);
        setMonthlyHistory(cached.monthlyHistory);
        setSummary(cached.summary);
        setLoading(false);
        return;
      }
    }
    let pendingQuery = supabase
      .from('staff_expenses')
      .select('id, amount, description, receipt_image_url, status, expense_date, created_at, staff_id, staff:staff_id(full_name, department), category:category_id(name), organization:organization_id(name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(80);
    let allQuery = supabase
      .from('staff_expenses')
      .select('id, amount, description, receipt_image_url, status, expense_date, created_at, staff_id, staff:staff_id(full_name, department), category:category_id(name), organization:organization_id(name)')
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(40);
    if (orgId && orgId !== 'all') {
      pendingQuery = pendingQuery.eq('organization_id', orgId);
      allQuery = allQuery.eq('organization_id', orgId);
    }
    const [pendingRes, allDataRes, aggRows] = await Promise.all([
      pendingQuery,
      allQuery,
      fetchExpenseAggRows(orgId),
    ]);

    const pendingList = (pendingRes.data ?? []) as unknown as ExpenseRow[];
    setPending(pendingList);

    const allList = (allDataRes.data ?? []) as unknown as ExpenseRow[];
    setAllExpenses(allList);

    const agg = aggregateExpenses(aggRows);
    setMonthlyHistory(agg.months);

    const pendingAmount = pendingList.reduce((s, e) => s + Number(e.amount), 0);
    const nextSummary = {
      thisMonthTotal: agg.thisMonthActive,
      lastMonthTotal: agg.lastMonthApproved,
      pendingCount: pendingList.length,
      pendingAmount,
      approvedThisMonth: agg.approvedThisMonth,
      grandTotalActive: agg.grandTotalActive,
      grandApproved: agg.grandApproved,
    };
    setSummary(nextSummary);
    setAdminScreenCache(cacheKey, {
      pending: pendingList,
      allExpenses: allList,
      monthlyHistory: agg.months,
      summary: nextSummary,
    });
    setLoading(false);
  }, [me?.app_permissions?.super_admin, me?.organization_id, me?.role, selectedOrganizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel('admin-expenses-hub')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_expenses' }, () => {
        realtimeDebounce.schedule(() => {
          void load({ force: true });
        });
      })
      .subscribe();
    return () => {
      realtimeDebounce.cancel();
      supabase.removeChannel(channel);
    };
  }, [load, realtimeDebounce]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load({ force: true }).finally(() => setRefreshing(false));
  }, [load]);

  const getExpenseSummary = (e: ExpenseRow) =>
    `${fmtMoney(Number(e.amount))} · ${formatDateShort(e.expense_date)} · ${e.category?.name ?? '—'}`;

  const approve = async (e: ExpenseRow) => {
    if (!me?.id) return;
    setActingId(e.id);
    const { error } = await supabase
      .from('staff_expenses')
      .update({ status: 'approved', approved_by: me.id, approved_at: new Date().toISOString(), rejection_reason: null })
      .eq('id', e.id);
    setActingId(null);
    if (error) {
      Alert.alert('Hata', error.message);
      return;
    }
    if (e.staff_id) {
      await sendNotification({
        staffId: e.staff_id,
        title: 'Harcama onaylandı',
        body: `Girdiğiniz harcama onaylandı: ${getExpenseSummary(e)}`,
        category: 'admin',
        data: { screen: '/staff/expenses' },
        createdByStaffId: me.id,
      });
    }
    void load({ force: true });
  };

  const rejectWithReason = async (e: ExpenseRow, reason: string) => {
    if (!me?.id) return false;
    const { error } = await supabase
      .from('staff_expenses')
      .update({
        status: 'rejected',
        approved_by: me.id,
        approved_at: new Date().toISOString(),
        rejection_reason: reason,
      })
      .eq('id', e.id);
    if (error) {
      Alert.alert('Hata', error.message);
      return false;
    }
    if (e.staff_id) {
      await sendNotification({
        staffId: e.staff_id,
        title: 'Harcama geri bildirimi',
        body: `Girdiğiniz harcama: ${getExpenseSummary(e)} — ${reason}`,
        category: 'admin',
        data: { screen: '/staff/expenses' },
        createdByStaffId: me.id,
      });
    }
    return true;
  };

  const reject = (e: ExpenseRow) => {
    pickExpenseRejectReason((reason) => {
      void rejectWithReason(e, reason).then((ok) => {
        if (ok) void load({ force: true });
      });
    }, 'Harcamayı reddet');
  };

  const pendingSelected = useMemo(
    () => pending.filter((e) => selectedPending.has(e.id)),
    [pending, selectedPending]
  );

  const togglePendingSelect = (id: string) => {
    setSelectedPending((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkApprovePending = async (rows: ExpenseRow[]) => {
    if (!me?.id || !rows.length) return;
    setBulkActing(true);
    let ok = 0;
    for (const e of rows) {
      setActingId(e.id);
      const { error } = await supabase
        .from('staff_expenses')
        .update({
          status: 'approved',
          approved_by: me.id,
          approved_at: new Date().toISOString(),
          rejection_reason: null,
        })
        .eq('id', e.id);
      if (!error) {
        ok++;
        if (e.staff_id) {
          await sendNotification({
            staffId: e.staff_id,
            title: 'Harcama onaylandı',
            body: `Girdiğiniz harcama onaylandı: ${getExpenseSummary(e)}`,
            category: 'admin',
            data: { screen: '/staff/expenses' },
            createdByStaffId: me.id,
          });
        }
      }
    }
    setActingId(null);
    setBulkActing(false);
    setSelectedPending(new Set());
    void load({ force: true });
    Alert.alert('Tamam', `${ok} harcama onaylandı.`);
  };

  const bulkRejectPending = async (rows: ExpenseRow[], reason: string) => {
    if (!rows.length) return;
    setBulkActing(true);
    let ok = 0;
    for (const e of rows) {
      if (await rejectWithReason(e, reason)) ok++;
    }
    setBulkActing(false);
    setSelectedPending(new Set());
    void load({ force: true });
    Alert.alert('Tamam', `${ok} harcama reddedildi.`);
  };

  const percentChange =
    summary.lastMonthTotal > 0
      ? ((summary.approvedThisMonth - summary.lastMonthTotal) / summary.lastMonthTotal) * 100
      : null;

  const statusIcon = (s: string) => (s === 'approved' ? 'checkmark-circle' : s === 'rejected' ? 'close-circle' : 'time');

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <AdminOrganizationPicker
          canUseAll={me?.app_permissions?.super_admin === true || me?.role === 'admin'}
          ownOrganizationId={me?.organization_id}
        />
        <AdminCard style={styles.totalHeroCard}>
          <View style={styles.totalHeroHeader}>
            <Ionicons name="stats-chart" size={22} color={adminTheme.colors.accent} />
            <Text style={styles.totalHeroTitle}>Toplam harcamalar</Text>
          </View>
          <Text style={styles.totalHeroValue}>{fmtMoney(summary.grandTotalActive)}</Text>
          <Text style={styles.totalHeroHint}>
            Tüm ayların güncel tutarı (onaylı + beklemede; reddedilenler dahil değil). Onaylanmış toplam: {fmtMoney(summary.grandApproved)}
          </Text>
        </AdminCard>

        <AdminCard style={styles.cardSpacing}>
          <Text style={styles.summaryTitle}>Genel özet</Text>
          <Text style={styles.summaryRow}>Bu ay güncel tutar: {fmtMoney(summary.thisMonthTotal)}</Text>
          <Text style={styles.summaryRow}>
            Geçen aya göre (onaylı):{' '}
            {percentChange === null
              ? 'Geçen ay onaylı harcama yok'
              : `${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(0)}%`}
          </Text>
          <Text style={styles.summaryRow}>Onay bekleyen: {summary.pendingCount} harcama ({fmtMoney(summary.pendingAmount)})</Text>
          <Text style={styles.summaryRow}>Bu ay onaylanan: {fmtMoney(summary.approvedThisMonth)}</Text>
        </AdminCard>

        {monthlyHistory.length > 0 && (
          <AdminCard style={styles.cardSpacing}>
            <Text style={styles.summaryTitle}>Aylık geçmiş</Text>
            <Text style={styles.monthlySectionHint}>Her ay için onaylı ve beklemedeki harcamaların toplamı</Text>
            {monthlyHistory.map((m) => (
              <View key={m.key} style={styles.monthRow}>
                <Text style={styles.monthRowLabel}>{m.label}</Text>
                <View style={styles.monthRowRight}>
                  <Text style={styles.monthRowAmount}>{fmtMoney(m.totalActive)}</Text>
                  {(m.pending > 0 || m.approved > 0) && (
                    <Text style={styles.monthRowSub}>
                      Onaylı {fmtMoney(m.approved)}
                      {m.pending > 0 ? ` · Beklemede ${fmtMoney(m.pending)}` : ''}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </AdminCard>
        )}

        <View style={styles.reportLinks}>
          <TouchableOpacity style={styles.reportBtn} onPress={() => router.push('/admin/expenses/all')} activeOpacity={0.8}>
            <Ionicons name="list-outline" size={20} color={adminTheme.colors.accent} />
            <Text style={styles.reportBtnText}>Tüm harcamalar</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.reportLinks}>
          <TouchableOpacity style={styles.reportBtn} onPress={() => router.push('/admin/expenses/by-category')} activeOpacity={0.8}>
            <Ionicons name="pie-chart-outline" size={20} color={adminTheme.colors.accent} />
            <Text style={styles.reportBtnText}>Kategori bazlı analiz</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.reportBtn} onPress={() => router.push('/admin/expenses/by-staff')} activeOpacity={0.8}>
            <Ionicons name="people-outline" size={20} color={adminTheme.colors.accent} />
            <Text style={styles.reportBtnText}>Personel bazlı rapor</Text>
          </TouchableOpacity>
        </View>

        {pending.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Onay bekleyen harcamalar ({pending.length})</Text>
            <View style={styles.bulkRow}>
              <TouchableOpacity
                style={styles.bulkBtn}
                onPress={() => setSelectedPending(new Set(pending.map((e) => e.id)))}
                disabled={bulkActing}
              >
                <Text style={styles.bulkBtnText}>Tümünü seç</Text>
              </TouchableOpacity>
              {selectedPending.size > 0 ? (
                <TouchableOpacity style={styles.bulkBtnMuted} onPress={() => setSelectedPending(new Set())}>
                  <Text style={styles.bulkBtnMutedText}>Seçimi kaldır</Text>
                </TouchableOpacity>
              ) : null}
              {selectedPending.size > 0 ? (
                <>
                  <TouchableOpacity
                    style={[styles.bulkBtn, styles.bulkBtnOk]}
                    onPress={() =>
                      confirmBulkApproval(pendingSelected.length, () => void bulkApprovePending(pendingSelected))
                    }
                    disabled={bulkActing}
                  >
                    <Text style={styles.bulkBtnTextLight}>Onayla ({selectedPending.size})</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.bulkBtn, styles.bulkBtnNo]}
                    onPress={() =>
                      pickExpenseRejectReason(
                        (reason) => void bulkRejectPending(pendingSelected, reason),
                        'Seçilenleri reddet'
                      )
                    }
                    disabled={bulkActing}
                  >
                    <Text style={styles.bulkBtnTextLight}>Reddet</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity
                    style={[styles.bulkBtn, styles.bulkBtnOk]}
                    onPress={() => confirmBulkApproval(pending.length, () => void bulkApprovePending(pending), 'Tümünü onayla')}
                    disabled={bulkActing}
                  >
                    <Text style={styles.bulkBtnTextLight}>Tümünü onayla</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.bulkBtn, styles.bulkBtnNo]}
                    onPress={() =>
                      pickExpenseRejectReason(
                        (reason) => void bulkRejectPending(pending, reason),
                        'Tümünü reddet'
                      )
                    }
                    disabled={bulkActing}
                  >
                    <Text style={styles.bulkBtnTextLight}>Tümünü reddet</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
            <View style={styles.cardList}>
              {pending.map((e) => (
                <View key={e.id} style={[styles.card, selectedPending.has(e.id) && styles.cardSelected]}>
                  <TouchableOpacity style={styles.cardCheck} onPress={() => togglePendingSelect(e.id)}>
                    <Ionicons
                      name={selectedPending.has(e.id) ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={selectedPending.has(e.id) ? adminTheme.colors.accent : adminTheme.colors.textMuted}
                    />
                  </TouchableOpacity>
                  <View style={styles.cardMain}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardStaff}>{e.staff?.full_name ?? '—'} · {formatDateShort(e.expense_date)}</Text>
                    <Text style={styles.cardAmount}>{fmtMoney(Number(e.amount))}</Text>
                  </View>
                  <Text style={styles.cardCategory}>{e.category?.name ?? '—'}</Text>
                  {e.organization?.name ? (
                    <Text style={styles.cardOrg}>{e.organization.name}</Text>
                  ) : null}
                  {e.description ? <Text style={styles.cardDesc} numberOfLines={2}>{e.description}</Text> : null}
                  {e.receipt_image_url ? (
                    <ExpenseReceiptThumbnail
                      uri={e.receipt_image_url}
                      onPress={() => setReceiptModal(e.receipt_image_url!)}
                      style={styles.receiptPreviewRow}
                    />
                  ) : null}
                  <View style={styles.cardActions}>
                    <View style={styles.approveRow}>
                      <TouchableOpacity
                        style={[styles.approveBtn, styles.approveBtnOk]}
                        onPress={() => approve(e)}
                        disabled={actingId === e.id}
                      >
                        {actingId === e.id ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="checkmark" size={18} color="#fff" />
                            <Text style={styles.approveBtnText}>Onayla</Text>
                          </>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.approveBtn, styles.approveBtnNo]}
                        onPress={() => reject(e)}
                        disabled={actingId === e.id || bulkActing}
                      >
                        <Ionicons name="close" size={18} color="#fff" />
                        <Text style={styles.approveBtnText}>Reddet</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>Tüm harcamalar (son 50)</Text>
        {loading ? (
          <ActivityIndicator size="large" color={adminTheme.colors.accent} style={styles.loader} />
        ) : (
          <View style={styles.table}>
            {allExpenses.slice(0, 20).map((e) => (
              <View key={e.id} style={styles.tableRow}>
                <Text style={styles.tableCellDate}>{formatDateShort(e.expense_date)}</Text>
                <View style={styles.tableNameCol}>
                  <Text style={styles.tableCellName} numberOfLines={1}>{e.staff?.full_name ?? '—'}</Text>
                  {e.organization?.name ? (
                    <Text style={styles.tableCellOrg} numberOfLines={1}>{e.organization.name}</Text>
                  ) : null}
                </View>
                <Text style={styles.tableCellCat} numberOfLines={1}>{e.category?.name ?? '—'}</Text>
                <Text style={styles.tableCellAmount}>{fmtMoney(Number(e.amount))}</Text>
                <View style={styles.tableCellStatus}>
                  <Ionicons name={statusIcon(e.status) as any} size={16} color={e.status === 'approved' ? adminTheme.colors.success : e.status === 'rejected' ? adminTheme.colors.error : adminTheme.colors.warning} />
                </View>
                {e.receipt_image_url ? (
                  <ExpenseReceiptThumbnail
                    uri={e.receipt_image_url}
                    onPress={() => setReceiptModal(e.receipt_image_url!)}
                    compact
                  />
                ) : (
                  <View style={{ width: EXPENSE_RECEIPT_PREVIEW_COMPACT }} />
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={!!receiptModal} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setReceiptModal(null)}>
          <View style={styles.modalContent}>
            {receiptModal ? (
              <CachedImage uri={receiptModal} style={expenseReceiptPreviewModalStyle} contentFit="contain" />
            ) : null}
            <TouchableOpacity style={styles.modalClose} onPress={() => setReceiptModal(null)}>
              <Text style={styles.modalCloseText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  cardSpacing: { marginBottom: 12 },
  totalHeroCard: { marginBottom: 12, borderColor: adminTheme.colors.accent, borderWidth: 1 },
  totalHeroHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  totalHeroTitle: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  totalHeroValue: { fontSize: 26, fontWeight: '800', color: adminTheme.colors.accent, marginBottom: 8 },
  totalHeroHint: { fontSize: 12, color: adminTheme.colors.textSecondary, lineHeight: 18 },
  summaryTitle: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.text, marginBottom: 8 },
  summaryRow: { fontSize: 14, color: adminTheme.colors.textSecondary, marginBottom: 4 },
  monthlySectionHint: { fontSize: 12, color: adminTheme.colors.textMuted, marginBottom: 12 },
  monthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: adminTheme.colors.borderLight,
  },
  monthRowLabel: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.text, flex: 1, paddingRight: 12 },
  monthRowRight: { alignItems: 'flex-end' },
  monthRowAmount: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  monthRowSub: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 2, textAlign: 'right' },
  reportLinks: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  reportBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, backgroundColor: adminTheme.colors.surface, borderRadius: 8, borderWidth: 1, borderColor: adminTheme.colors.border },
  reportBtnText: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.accent },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.text, marginBottom: 12 },
  cardList: { gap: 12, marginBottom: 20 },
  bulkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'center' },
  bulkBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  bulkBtnMuted: { paddingHorizontal: 10, paddingVertical: 8 },
  bulkBtnMutedText: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.textMuted },
  bulkBtnText: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.primary },
  bulkBtnOk: { backgroundColor: adminTheme.colors.success, borderColor: adminTheme.colors.success },
  bulkBtnNo: { backgroundColor: adminTheme.colors.error, borderColor: adminTheme.colors.error },
  bulkBtnTextLight: { fontSize: 13, fontWeight: '700', color: '#fff' },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  cardSelected: { borderColor: adminTheme.colors.accent, backgroundColor: 'rgba(37,99,235,0.05)' },
  cardCheck: { paddingTop: 2 },
  cardMain: { flex: 1, minWidth: 0 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardStaff: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.text },
  cardAmount: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  cardCategory: { fontSize: 13, color: adminTheme.colors.textSecondary },
  cardOrg: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.accent, marginTop: 2 },
  cardDesc: { fontSize: 13, color: adminTheme.colors.textMuted, marginTop: 4 },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: adminTheme.colors.borderLight },
  receiptPreviewRow: { marginTop: 8, alignSelf: 'flex-start' },
  approveRow: { flexDirection: 'row', gap: 8 },
  approveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  approveBtnOk: { backgroundColor: adminTheme.colors.success },
  approveBtnNo: { backgroundColor: adminTheme.colors.error },
  approveBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  loader: { marginVertical: 24 },
  table: { backgroundColor: adminTheme.colors.surface, borderRadius: 8, borderWidth: 1, borderColor: adminTheme.colors.border, overflow: 'hidden' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: adminTheme.colors.borderLight },
  tableCellDate: { width: 72, fontSize: 12, color: adminTheme.colors.textSecondary },
  tableNameCol: { flex: 1, maxWidth: 90, justifyContent: 'center' },
  tableCellName: { fontSize: 13, color: adminTheme.colors.text },
  tableCellOrg: { fontSize: 10, color: adminTheme.colors.accent, fontWeight: '600', marginTop: 2 },
  tableCellCat: { flex: 1, fontSize: 12, color: adminTheme.colors.textMuted, maxWidth: 90 },
  tableCellAmount: { width: 72, fontSize: 13, fontWeight: '600', color: adminTheme.colors.text },
  tableCellStatus: { width: 24, marginRight: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', maxWidth: 340, alignItems: 'center' },
  modalClose: { marginTop: 16, paddingVertical: 10, paddingHorizontal: 24, backgroundColor: adminTheme.colors.surface },
  modalCloseText: { fontSize: 16, fontWeight: '600', color: adminTheme.colors.text },
});
