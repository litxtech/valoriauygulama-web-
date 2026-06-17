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
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { formatDateShort } from '@/lib/date';
import { monthName } from '@/lib/i18nLookup';
import { notifyAdmins } from '@/lib/notificationService';
import {
  buildStaffSalarySummary,
  classifySalaryPaymentKinds,
  formatSalaryMoney,
  formatSalaryTime,
  groupSalaryPaymentsByPeriod,
  paymentTypeLabelKey,
  type StaffSalaryPayment,
} from '@/lib/staffSalaryTracking';
import {
  StaffSalaryDetailSheet,
  type SalaryDetailPayload,
} from '@/components/staff/StaffSalaryDetailSheet';

type StatusKey = 'approved' | 'rejected' | 'pending_approval' | 'other';

function resolveStatus(status: string): StatusKey {
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'rejected';
  if (status === 'pending_approval') return 'pending_approval';
  return 'other';
}

const STATUS_DOT: Record<StatusKey, string> = {
  approved: '#059669',
  rejected: '#dc2626',
  pending_approval: '#d97706',
  other: '#94a3b8',
};

function SummaryRow({
  icon,
  title,
  subtitle,
  value,
  onPress,
  accent,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  value: string;
  onPress: () => void;
  accent?: string;
}) {
  return (
    <TouchableOpacity style={styles.summaryRow} activeOpacity={0.7} onPress={onPress}>
      <Ionicons name={icon} size={16} color={accent ?? '#64748b'} />
      <View style={styles.summaryRowText}>
        <Text style={styles.summaryRowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.summaryRowSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      <Text style={[styles.summaryRowValue, accent ? { color: accent } : null]}>{value}</Text>
      <Ionicons name="chevron-forward" size={14} color="#cbd5e1" />
    </TouchableOpacity>
  );
}

function PaymentRow({
  payment,
  kind,
  statusKey,
  t,
  onPress,
  compact,
}: {
  payment: StaffSalaryPayment;
  kind: 'regular' | 'extra' | undefined;
  statusKey: StatusKey;
  t: (key: string) => string;
  onPress: () => void;
  compact?: boolean;
}) {
  const dateLine = formatSalaryTime(payment.payment_time)
    ? `${formatDateShort(payment.payment_date)} ${formatSalaryTime(payment.payment_time)}`
    : formatDateShort(payment.payment_date);

  return (
    <TouchableOpacity
      style={[styles.paymentRow, compact && styles.paymentRowCompact]}
      activeOpacity={0.7}
      onPress={onPress}
    >
      <View style={[styles.statusDot, { backgroundColor: STATUS_DOT[statusKey] }]} />
      <View style={styles.paymentRowMain}>
        <View style={styles.paymentRowTop}>
          <Text style={styles.paymentAmount}>{formatSalaryMoney(Number(payment.amount))}</Text>
          <Text style={styles.paymentDate}>{dateLine}</Text>
        </View>
        <Text style={styles.paymentMeta} numberOfLines={1}>
          {kind === 'extra' ? t('staffSalaryEntryTypeExtra') : t('staffSalaryEntryTypeRegular')}
          {' · '}
          {t(paymentTypeLabelKey(payment.payment_type))}
          {statusKey === 'pending_approval' ? ` · ${t('pendingApproval')}` : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color="#cbd5e1" />
    </TouchableOpacity>
  );
}

export default function StaffSalaryHistoryScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const staff = useAuthStore((s) => s.staff);
  const [rows, setRows] = useState<StaffSalaryPayment[]>([]);
  const [baseSalary, setBaseSalary] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [detailPayload, setDetailPayload] = useState<SalaryDetailPayload | null>(null);

  const load = useCallback(async () => {
    if (!staff?.id) {
      setRows([]);
      setBaseSalary(null);
      return;
    }
    const [{ data, error }, staffRes] = await Promise.all([
      supabase
        .from('salary_payments')
        .select(
          'id, period_month, period_year, amount, payment_date, payment_time, payment_type, bank_or_reference, description, status, staff_approved_at, staff_rejected_at, rejection_reason, created_at'
        )
        .eq('staff_id', staff.id)
        .order('payment_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(120),
      supabase.from('staff').select('salary').eq('id', staff.id).maybeSingle(),
    ]);
    if (error) throw error;
    setRows((data ?? []) as StaffSalaryPayment[]);
    setBaseSalary(staffRes.data?.salary != null ? Number(staffRes.data.salary) : null);
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

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
    }, [load])
  );

  useEffect(() => {
    if (!staff?.id) return;
    const channel = supabase
      .channel(`staff-salary-live-${staff.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'salary_payments', filter: `staff_id=eq.${staff.id}` },
        () => {
          load().catch(() => {});
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [staff?.id, load]);

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

  const summary = useMemo(() => buildStaffSalarySummary(rows, baseSalary), [rows, baseSalary]);
  const entryKinds = useMemo(() => classifySalaryPaymentKinds(rows), [rows]);
  const periodGroups = useMemo(() => groupSalaryPaymentsByPeriod(rows), [rows]);
  const pending = useMemo(() => rows.filter((r) => r.status === 'pending_approval'), [rows]);
  const currentPeriodLabel = `${monthName(summary.currentMonth - 1)} ${summary.currentYear}`;

  const monthSubtitle =
    summary.baseSalary != null && summary.baseSalary > 0
      ? `${currentPeriodLabel} · ${formatSalaryMoney(summary.monthApprovedPaid)}`
      : currentPeriodLabel;

  const openPaymentDetail = (payment: StaffSalaryPayment) => {
    setDetailPayload({ kind: 'payment', payment, entryKind: entryKinds.get(payment.id) });
  };

  const approveSalary = async (paymentId: string) => {
    if (!staff?.id) return;
    setActingId(paymentId);
    const { error } = await supabase
      .from('salary_payments')
      .update({
        status: 'approved',
        staff_approved_at: new Date().toISOString(),
        staff_rejected_at: null,
        rejection_reason: null,
      })
      .eq('id', paymentId)
      .eq('staff_id', staff.id);
    setActingId(null);
    if (error) {
      Alert.alert(t('error'), error.message);
      return;
    }
    await load();
    setDetailPayload(null);
    const paid = rows.find((x) => x.id === paymentId);
    if (paid) {
      await notifyAdmins({
        title: t('approved'),
        body: t('staffSalaryApprovedNotify', {
          name: staff.full_name ?? t('staffDefaultName'),
          period: `${monthName(paid.period_month - 1)} ${paid.period_year}`,
          amount: formatSalaryMoney(Number(paid.amount)),
        }),
        data: { screen: '/admin/salary' },
      }).catch(() => {});
    }
  };

  const appealSalary = (paymentId: string) => {
    Alert.alert(t('staffSalaryAppeal'), t('staffSalaryAppealConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('staffSalaryAppeal'),
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
              rejection_reason: t('staffSalaryAppeal'),
            })
            .eq('id', paymentId)
            .eq('staff_id', staff.id);
          setActingId(null);
          if (error) {
            Alert.alert(t('error'), error.message);
            return;
          }
          await load();
          setDetailPayload(null);
          const paid = rows.find((x) => x.id === paymentId);
          if (paid) {
            await notifyAdmins({
              title: t('staffSalaryAppeal'),
              body: t('staffSalaryRejectedNotify', {
                name: staff.full_name ?? t('staffDefaultName'),
                period: `${monthName(paid.period_month - 1)} ${paid.period_year}`,
                amount: formatSalaryMoney(Number(paid.amount)),
              }),
              data: { screen: '/admin/salary' },
            }).catch(() => {});
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
          }
        >
          {rows.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="wallet-outline" size={24} color="#94a3b8" />
              <Text style={styles.emptyTitle}>{t('noSalaryRecords')}</Text>
              <Text style={styles.emptySub}>{t('staffSalaryHistoryEmptyMessage')}</Text>
            </View>
          ) : (
            <>
              <View style={styles.summaryBox}>
                <View style={styles.liveRow}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>{t('staffSalaryLiveShort')}</Text>
                </View>
                <SummaryRow
                  icon="wallet-outline"
                  title={t('staffSalaryPaidCardTitle')}
                  subtitle={t('staffSalaryTotalReceived')}
                  value={formatSalaryMoney(summary.allTimeApprovedPaid)}
                  accent="#047857"
                  onPress={() => setDetailPayload({ kind: 'paid', summary, rows, entryKinds })}
                />
                <View style={styles.divider} />
                <SummaryRow
                  icon="calendar-outline"
                  title={t('staffSalaryCurrentPeriod')}
                  subtitle={monthSubtitle}
                  value={
                    summary.baseSalary != null && summary.baseSalary > 0
                      ? `${summary.monthProgressPct ?? 0}%`
                      : formatSalaryMoney(summary.monthApprovedPaid)
                  }
                  accent="#0369a1"
                  onPress={() =>
                    setDetailPayload({
                      kind: 'month',
                      summary,
                      rows,
                      periodLabel: currentPeriodLabel,
                      entryKinds,
                    })
                  }
                />
              </View>

              {pending.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>{t('pendingSalaryNotice')}</Text>
                  <View style={styles.listBox}>
                    {pending.map((p, idx) => (
                      <View key={p.id}>
                        {idx > 0 ? <View style={styles.divider} /> : null}
                        <PaymentRow
                          payment={p}
                          kind={entryKinds.get(p.id)}
                          statusKey="pending_approval"
                          t={t}
                          onPress={() => openPaymentDetail(p)}
                        />
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionLabel}>{t('staffSalaryTimelineTitle')}</Text>
                  <Text style={styles.sectionCount}>
                    {t('staffSalaryHistoryRecordCount', { count: rows.length })}
                  </Text>
                </View>
                <View style={styles.listBox}>
                  {periodGroups.map((group, gi) => (
                    <View key={group.key}>
                      {gi > 0 ? <View style={styles.monthDivider} /> : null}
                      <TouchableOpacity
                        style={styles.monthHeader}
                        activeOpacity={0.7}
                        onPress={() => setDetailPayload({ kind: 'period', group, entryKinds })}
                      >
                        <Text style={styles.monthTitle}>
                          {monthName(group.month - 1)} {group.year}
                        </Text>
                        <Text style={styles.monthMeta}>
                          {group.approvedTotal > 0 ? formatSalaryMoney(group.approvedTotal) : '—'}
                          {' · '}
                          {t('staffSalaryHistoryRecordCount', { count: group.rows.length })}
                        </Text>
                        <Ionicons name="chevron-forward" size={14} color="#cbd5e1" />
                      </TouchableOpacity>
                      {group.rows.map((p, idx) => (
                        <View key={p.id}>
                          {idx > 0 ? <View style={styles.dividerInset} /> : null}
                          <PaymentRow
                            payment={p}
                            kind={entryKinds.get(p.id)}
                            statusKey={resolveStatus(p.status)}
                            t={t}
                            onPress={() => openPaymentDetail(p)}
                            compact
                          />
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              </View>
            </>
          )}
        </ScrollView>
      )}
      <StaffSalaryDetailSheet
        visible={detailPayload != null}
        payload={detailPayload}
        onClose={() => setDetailPayload(null)}
        onApprove={approveSalary}
        onAppeal={appealSalary}
        onOpenPayment={(payment, entryKind) =>
          setDetailPayload({ kind: 'payment', payment, entryKind: entryKind ?? entryKinds.get(payment.id) })
        }
        actingId={actingId}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' },
  scrollContent: { padding: 12, paddingBottom: 24, gap: 10 },
  summaryBox: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 2,
  },
  liveDot: { width: 5, height: 5, borderRadius: 999, backgroundColor: '#059669' },
  liveText: { fontSize: 10, fontWeight: '600', color: '#64748b' },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  summaryRowText: { flex: 1, minWidth: 0 },
  summaryRowTitle: { fontSize: 13, fontWeight: '600', color: '#111827' },
  summaryRowSub: { fontSize: 11, color: '#64748b', marginTop: 1 },
  summaryRowValue: { fontSize: 13, fontWeight: '700', color: '#111827' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#e2e8f0' },
  dividerInset: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#f1f5f9',
    marginLeft: 22,
  },
  monthDivider: { height: 6, backgroundColor: '#f8fafc' },
  section: { gap: 6 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  sectionCount: { fontSize: 10, color: '#94a3b8' },
  listBox: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#f8fafc',
  },
  monthTitle: { fontSize: 12, fontWeight: '700', color: '#334155' },
  monthMeta: { flex: 1, fontSize: 11, color: '#64748b', textAlign: 'right' },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  paymentRowCompact: { paddingVertical: 7 },
  statusDot: { width: 6, height: 6, borderRadius: 999 },
  paymentRowMain: { flex: 1, minWidth: 0 },
  paymentRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  paymentAmount: { fontSize: 13, fontWeight: '700', color: '#111827' },
  paymentDate: { fontSize: 11, color: '#64748b' },
  paymentMeta: { fontSize: 10, color: '#94a3b8', marginTop: 2 },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyTitle: { fontSize: 14, fontWeight: '600', color: '#111827', marginTop: 8 },
  emptySub: { fontSize: 12, color: '#64748b', textAlign: 'center', marginTop: 4, lineHeight: 17 },
});
