import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { profileScreenTheme as P } from '@/constants/profileScreenTheme';
import { formatDateShort } from '@/lib/date';
import { monthName } from '@/lib/i18nLookup';
import { notifyAdmins } from '@/lib/notificationService';

type SalaryPaymentRow = {
  id: string;
  period_month: number;
  period_year: number;
  amount: number;
  payment_date: string;
  status: string;
  staff_approved_at: string | null;
  staff_rejected_at: string | null;
  rejection_reason: string | null;
};

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + ' ₺';
}

type StatusKey = 'approved' | 'rejected' | 'pending_approval' | 'other';

function resolveStatus(status: string): StatusKey {
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'rejected';
  if (status === 'pending_approval') return 'pending_approval';
  return 'other';
}

const STATUS_UI: Record<
  StatusKey,
  { labelKey: string; icon: keyof typeof Ionicons.glyphMap; bg: string; fg: string; border: string }
> = {
  approved: {
    labelKey: 'approved',
    icon: 'checkmark-circle',
    bg: '#ecfdf5',
    fg: '#047857',
    border: '#a7f3d0',
  },
  rejected: {
    labelKey: 'rejected',
    icon: 'close-circle',
    bg: '#fef2f2',
    fg: '#b91c1c',
    border: '#fecaca',
  },
  pending_approval: {
    labelKey: 'pendingApproval',
    icon: 'time',
    bg: '#fffbeb',
    fg: '#b45309',
    border: '#fde68a',
  },
  other: {
    labelKey: 'status',
    icon: 'ellipse-outline',
    bg: '#f8fafc',
    fg: '#64748b',
    border: '#e2e8f0',
  },
};

export default function StaffSalaryHistoryScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const staff = useAuthStore((s) => s.staff);
  const [rows, setRows] = useState<SalaryPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!staff?.id) {
      setRows([]);
      return;
    }
    const { data, error } = await supabase
      .from('salary_payments')
      .select(
        'id, period_month, period_year, amount, payment_date, status, staff_approved_at, staff_rejected_at, rejection_reason'
      )
      .eq('staff_id', staff.id)
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })
      .limit(48);
    if (error) throw error;
    setRows((data ?? []) as SalaryPaymentRow[]);
  }, [staff?.id]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await load();
      } catch (e) {
        Alert.alert(t('error'), (e as Error)?.message ?? t('recordError'));
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [load, t]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('recordError'));
    } finally {
      setRefreshing(false);
    }
  };

  const latest = rows[0] ?? null;
  const yearTotal = useMemo(
    () => rows.filter((r) => r.status === 'approved').reduce((sum, r) => sum + Number(r.amount), 0),
    [rows]
  );
  const pending = useMemo(() => rows.filter((r) => r.status === 'pending_approval'), [rows]);

  const groupedByYear = useMemo(() => {
    const map = new Map<number, SalaryPaymentRow[]>();
    for (const row of rows) {
      const y = row.period_year;
      if (!map.has(y)) map.set(y, []);
      map.get(y)!.push(row);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [rows]);

  const approveSalary = async (paymentId: string) => {
    if (!staff?.id) return;
    setActingId(paymentId);
    const { error } = await supabase
      .from('salary_payments')
      .update({ status: 'approved', staff_approved_at: new Date().toISOString(), staff_rejected_at: null, rejection_reason: null })
      .eq('id', paymentId)
      .eq('staff_id', staff.id);
    setActingId(null);
    if (error) {
      Alert.alert(t('error'), error.message);
      return;
    }
    setRows((prev) =>
      prev.map((p) =>
        p.id === paymentId
          ? { ...p, status: 'approved', staff_approved_at: new Date().toISOString(), staff_rejected_at: null, rejection_reason: null }
          : p
      )
    );
    const paid = rows.find((x) => x.id === paymentId);
    if (paid) {
      await notifyAdmins({
        title: t('approved'),
        body: t('staffSalaryApprovedNotify', {
          name: staff.full_name ?? t('staffDefaultName'),
          period: `${monthName(paid.period_month - 1)} ${paid.period_year}`,
          amount: fmtMoney(Number(paid.amount)),
        }),
        data: { screen: '/admin/salary' },
      }).catch(() => {});
    }
  };

  const rejectSalary = (paymentId: string) => {
    Alert.alert(t('rejectAppeal'), t('pleaseReview'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('rejectAppeal'),
        style: 'destructive',
        onPress: async () => {
          if (!staff?.id) return;
          setActingId(paymentId);
          const { error } = await supabase
            .from('salary_payments')
            .update({
              status: 'rejected',
              staff_rejected_at: new Date().toISOString(),
              staff_approved_at: null,
              rejection_reason: null,
            })
            .eq('id', paymentId)
            .eq('staff_id', staff.id);
          setActingId(null);
          if (error) {
            Alert.alert(t('error'), error.message);
            return;
          }
          setRows((prev) =>
            prev.map((p) =>
              p.id === paymentId
                ? {
                    ...p,
                    status: 'rejected',
                    staff_rejected_at: new Date().toISOString(),
                    staff_approved_at: null,
                  }
                : p
            )
          );
        },
      },
    ]);
  };

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      <LinearGradient colors={[P.gradient.start, P.gradient.end]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <Text style={styles.heroTitle}>{t('salaryHistory')}</Text>
        <Text style={styles.heroSub}>{t('staffSalaryHistoryIntro')}</Text>
        {latest ? (
          <View style={styles.heroSummary}>
            <View style={styles.heroSummaryCol}>
              <Text style={styles.heroSummaryLabel}>{t('lastPaidSalary')}</Text>
              <Text style={styles.heroSummaryValue}>{fmtMoney(Number(latest.amount))}</Text>
              <Text style={styles.heroSummaryMeta}>{formatDateShort(latest.payment_date)}</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroSummaryCol}>
              <Text style={styles.heroSummaryLabel}>{t('staffSalaryHistoryApprovedTotal')}</Text>
              <Text style={styles.heroSummaryValue}>{fmtMoney(yearTotal)}</Text>
              <Text style={styles.heroSummaryMeta}>{t('staffSalaryHistoryRecordCount', { count: rows.length })}</Text>
            </View>
          </View>
        ) : null}
      </LinearGradient>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={P.gradient.start} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={P.gradient.start} />}
        >
          {rows.length === 0 ? (
            <View style={[styles.emptyCard, P.cardShell]}>
              <Ionicons name="wallet-outline" size={40} color={P.subtext} />
              <Text style={styles.emptyTitle}>{t('noSalaryRecords')}</Text>
              <Text style={styles.emptySub}>{t('staffSalaryHistoryEmptyMessage')}</Text>
            </View>
          ) : (
            <>
              {pending.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>{t('pendingSalaryNotice')}</Text>
                  {pending.map((p) => (
                    <View key={p.id} style={[styles.pendingCard, P.cardShell]}>
                      <View style={styles.pendingHeader}>
                        <Text style={styles.pendingPeriod}>
                          {monthName(p.period_month - 1)} {p.period_year}
                        </Text>
                        <Text style={styles.pendingAmount}>{fmtMoney(Number(p.amount))}</Text>
                      </View>
                      <Text style={styles.pendingHint}>{t('pleaseReview')}</Text>
                      <View style={styles.pendingActions}>
                        <TouchableOpacity
                          style={[styles.pendingBtn, styles.pendingBtnApprove]}
                          onPress={() => approveSalary(p.id)}
                          disabled={actingId === p.id}
                        >
                          {actingId === p.id ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <>
                              <Ionicons name="checkmark" size={18} color="#fff" />
                              <Text style={styles.pendingBtnText}>{t('approve')}</Text>
                            </>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.pendingBtn, styles.pendingBtnReject]}
                          onPress={() => rejectSalary(p.id)}
                          disabled={actingId === p.id}
                        >
                          <Ionicons name="close" size={18} color="#fff" />
                          <Text style={styles.pendingBtnText}>{t('rejectAppeal')}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}

              {groupedByYear.map(([year, yearRows]) => (
                <View key={year} style={styles.section}>
                  <Text style={styles.sectionLabel}>{year}</Text>
                  {yearRows.map((p) => {
                    const sk = resolveStatus(p.status);
                    const ui = STATUS_UI[sk];
                    return (
                      <View key={p.id} style={[styles.rowCard, P.cardShell]}>
                        <View style={styles.rowTop}>
                          <View>
                            <Text style={styles.rowPeriod}>
                              {monthName(p.period_month - 1)} {p.period_year}
                            </Text>
                            <Text style={styles.rowDate}>{formatDateShort(p.payment_date)}</Text>
                          </View>
                          <Text style={styles.rowAmount}>{fmtMoney(Number(p.amount))}</Text>
                        </View>
                        <View style={[styles.statusChip, { backgroundColor: ui.bg, borderColor: ui.border }]}>
                          <Ionicons name={ui.icon} size={14} color={ui.fg} />
                          <Text style={[styles.statusChipText, { color: ui.fg }]}>
                            {t(ui.labelKey)}
                            {sk === 'approved' && p.staff_approved_at ? ` · ${formatDateShort(p.staff_approved_at)}` : ''}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: P.bg },
  hero: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 22,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  heroSub: { fontSize: 14, color: 'rgba(255,255,255,0.88)', marginTop: 6, lineHeight: 20 },
  heroSummary: {
    flexDirection: 'row',
    marginTop: 18,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  heroSummaryCol: { flex: 1 },
  heroDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.25)', marginHorizontal: 12 },
  heroSummaryLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  heroSummaryValue: { fontSize: 20, fontWeight: '800', color: '#fff', marginTop: 4 },
  heroSummaryMeta: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 16, paddingBottom: 32, gap: 4 },
  section: { marginBottom: 8 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: P.subtext,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
    marginLeft: 4,
  },
  emptyCard: {
    alignItems: 'center',
    padding: 32,
    gap: 10,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: P.text, marginTop: 8 },
  emptySub: { fontSize: 14, color: P.subtext, textAlign: 'center', lineHeight: 20 },
  pendingCard: { padding: 16, marginBottom: 10 },
  pendingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pendingPeriod: { fontSize: 16, fontWeight: '700', color: P.text },
  pendingAmount: { fontSize: 18, fontWeight: '800', color: P.gradient.start },
  pendingHint: { fontSize: 13, color: P.subtext, marginTop: 6 },
  pendingActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  pendingBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: theme.radius.md,
  },
  pendingBtnApprove: { backgroundColor: theme.colors.success },
  pendingBtnReject: { backgroundColor: theme.colors.error },
  pendingBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  rowCard: { padding: 16, marginBottom: 10 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  rowPeriod: { fontSize: 16, fontWeight: '700', color: P.text },
  rowDate: { fontSize: 13, color: P.subtext, marginTop: 2 },
  rowAmount: { fontSize: 17, fontWeight: '800', color: P.text },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusChipText: { fontSize: 12, fontWeight: '600' },
});
