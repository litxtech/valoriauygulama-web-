import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { theme } from '@/constants/theme';
import { formatDateShort } from '@/lib/date';
import { monthName } from '@/lib/i18nLookup';
import {
  formatSalaryMoney,
  formatSalaryTime,
  paymentTypeLabelKey,
  type SalaryEntryKind,
  type SalaryPeriodGroup,
  type StaffSalaryPayment,
  type StaffSalarySummary,
} from '@/lib/staffSalaryTracking';

type StatusKey = 'approved' | 'rejected' | 'pending_approval' | 'other';

const STATUS_UI: Record<
  StatusKey,
  { labelKey: string; icon: keyof typeof Ionicons.glyphMap; bg: string; fg: string; border: string }
> = {
  approved: { labelKey: 'approved', icon: 'checkmark-circle', bg: '#ecfdf5', fg: '#047857', border: '#a7f3d0' },
  rejected: { labelKey: 'rejected', icon: 'close-circle', bg: '#fef2f2', fg: '#b91c1c', border: '#fecaca' },
  pending_approval: { labelKey: 'pendingApproval', icon: 'time', bg: '#fffbeb', fg: '#b45309', border: '#fde68a' },
  other: { labelKey: 'status', icon: 'ellipse-outline', bg: '#f8fafc', fg: '#64748b', border: '#e2e8f0' },
};

function resolveStatus(status: string): StatusKey {
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'rejected';
  if (status === 'pending_approval') return 'pending_approval';
  return 'other';
}

export type SalaryDetailPayload =
  | {
      kind: 'paid';
      summary: StaffSalarySummary;
      rows: StaffSalaryPayment[];
      entryKinds: Map<string, SalaryEntryKind>;
    }
  | {
      kind: 'month';
      summary: StaffSalarySummary;
      rows: StaffSalaryPayment[];
      periodLabel: string;
      entryKinds: Map<string, SalaryEntryKind>;
    }
  | { kind: 'period'; group: SalaryPeriodGroup; entryKinds: Map<string, SalaryEntryKind> }
  | { kind: 'payment'; payment: StaffSalaryPayment; entryKind?: SalaryEntryKind };

type Props = {
  visible: boolean;
  payload: SalaryDetailPayload | null;
  onClose: () => void;
  onApprove?: (id: string) => void;
  onAppeal?: (id: string) => void;
  onOpenPayment?: (payment: StaffSalaryPayment, entryKind?: SalaryEntryKind) => void;
  actingId?: string | null;
};

function DetailRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, accent ? { color: accent } : null]} numberOfLines={3}>
        {value}
      </Text>
    </View>
  );
}

function StatusBadge({ statusKey, t }: { statusKey: StatusKey; t: (key: string) => string }) {
  const ui = STATUS_UI[statusKey];
  return (
    <View style={[styles.statusChip, { backgroundColor: ui.bg, borderColor: ui.border }]}>
      <Ionicons name={ui.icon} size={12} color={ui.fg} />
      <Text style={[styles.statusChipText, { color: ui.fg }]}>{t(ui.labelKey)}</Text>
    </View>
  );
}

function PaymentDetailBlock({
  payment,
  entryKind,
  t,
  showActions,
  actingId,
  onApprove,
  onAppeal,
}: {
  payment: StaffSalaryPayment;
  entryKind?: SalaryEntryKind;
  t: (key: string, opts?: Record<string, unknown>) => string;
  showActions?: boolean;
  actingId?: string | null;
  onApprove?: (id: string) => void;
  onAppeal?: (id: string) => void;
}) {
  const statusKey = resolveStatus(payment.status);
  const period = `${monthName(payment.period_month - 1)} ${payment.period_year}`;

  return (
    <View style={styles.paymentBlock}>
      <View style={styles.paymentHead}>
        <Text style={styles.paymentAmount}>{formatSalaryMoney(Number(payment.amount))}</Text>
        <StatusBadge statusKey={statusKey} t={t} />
      </View>
      <DetailRow label={t('staffSalaryPeriodLabel')} value={period} />
      <DetailRow
        label={t('staffSalaryEntryKind')}
        value={entryKind === 'extra' ? t('staffSalaryEntryTypeExtra') : t('staffSalaryEntryTypeRegular')}
      />
      <DetailRow
        label={t('staffSalaryPaymentDate')}
        value={`${formatDateShort(payment.payment_date)}${formatSalaryTime(payment.payment_time) ? ` · ${formatSalaryTime(payment.payment_time)}` : ''}`}
      />
      <DetailRow label={t('staffSalaryEntryPosted')} value={formatDateShort(payment.created_at)} />
      <DetailRow label={t('staffSalaryPaymentType')} value={t(paymentTypeLabelKey(payment.payment_type))} />
      {payment.bank_or_reference ? (
        <DetailRow label={t('staffSalaryReference')} value={payment.bank_or_reference} />
      ) : null}
      {payment.description ? <DetailRow label={t('staffSalaryDescription')} value={payment.description} /> : null}
      {payment.staff_approved_at ? (
        <DetailRow label={t('staffSalaryApprovedAt')} value={formatDateShort(payment.staff_approved_at)} />
      ) : null}
      {payment.staff_rejected_at ? (
        <DetailRow label={t('staffSalaryRejectedAt')} value={formatDateShort(payment.staff_rejected_at)} />
      ) : null}
      {payment.rejection_reason ? (
        <DetailRow label={t('staffSalaryAppeal')} value={payment.rejection_reason} accent="#b91c1c" />
      ) : null}
      {showActions && statusKey === 'pending_approval' && onApprove && onAppeal ? (
        <View style={styles.sheetActions}>
          <TouchableOpacity
            style={styles.appealBtn}
            onPress={() => onAppeal(payment.id)}
            disabled={actingId === payment.id}
          >
            <Ionicons name="alert-circle-outline" size={16} color="#b91c1c" />
            <Text style={styles.appealBtnText}>{t('staffSalaryAppeal')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.approveBtn}
            onPress={() => onApprove(payment.id)}
            disabled={actingId === payment.id}
          >
            {actingId === payment.id ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark" size={16} color="#fff" />
                <Text style={styles.approveBtnText}>{t('approve')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

function PaymentListSection({
  title,
  rows,
  entryKinds,
  t,
  onOpenPayment,
}: {
  title: string;
  rows: StaffSalaryPayment[];
  entryKinds: Map<string, SalaryEntryKind>;
  t: (key: string, opts?: Record<string, unknown>) => string;
  onOpenPayment?: (payment: StaffSalaryPayment, entryKind?: SalaryEntryKind) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {rows.map((p, idx) => {
        const kind = entryKinds.get(p.id);
        const sk = resolveStatus(p.status);
        const ui = STATUS_UI[sk];
        return (
          <TouchableOpacity
            key={p.id}
            style={[styles.listItem, idx < rows.length - 1 && styles.listItemBorder]}
            activeOpacity={0.7}
            onPress={() => onOpenPayment?.(p, kind)}
            disabled={!onOpenPayment}
          >
            <View style={styles.listItemMain}>
              <Text style={styles.listItemAmount}>{formatSalaryMoney(Number(p.amount))}</Text>
              <Text style={styles.listItemMeta}>
                {formatDateShort(p.payment_date)}
                {formatSalaryTime(p.payment_time) ? ` · ${formatSalaryTime(p.payment_time)}` : ''}
                {' · '}
                {kind === 'extra' ? t('staffSalaryEntryTypeExtra') : t('staffSalaryEntryTypeRegular')}
              </Text>
            </View>
            <View style={styles.listItemRight}>
              <View style={[styles.statusChip, { backgroundColor: ui.bg, borderColor: ui.border }]}>
                <Text style={[styles.statusChipText, { color: ui.fg }]}>{t(ui.labelKey)}</Text>
              </View>
              {onOpenPayment ? <Ionicons name="chevron-forward" size={16} color="#94a3b8" /> : null}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function StaffSalaryDetailSheet({
  visible,
  payload,
  onClose,
  onApprove,
  onAppeal,
  onOpenPayment,
  actingId,
}: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  if (!payload) return null;

  const title = (() => {
    switch (payload.kind) {
      case 'paid':
        return t('staffSalaryPaidCardTitle');
      case 'month':
        return `${t('staffSalaryCurrentPeriod')} · ${payload.periodLabel}`;
      case 'period':
        return `${monthName(payload.group.month - 1)} ${payload.group.year}`;
      case 'payment':
        return t('staffSalaryDetailTitle');
    }
  })();

  const renderBody = () => {
    switch (payload.kind) {
      case 'paid': {
        const { summary, rows, entryKinds } = payload;
        const approved = rows.filter((r) => r.status === 'approved');
        const pending = rows.filter((r) => r.status === 'pending_approval');
        return (
          <>
            <View style={styles.heroBox}>
              <Text style={styles.heroLabel}>{t('staffSalaryTotalReceived')}</Text>
              <Text style={styles.heroValue}>{formatSalaryMoney(summary.allTimeApprovedPaid)}</Text>
            </View>
            <DetailRow
              label={t('staffSalaryYearPaidLabel', { year: summary.currentYear })}
              value={formatSalaryMoney(summary.yearApprovedPaid)}
            />
            <DetailRow label={t('staffSalaryRegularTotal')} value={formatSalaryMoney(summary.regularApprovedTotal)} />
            <DetailRow
              label={t('staffSalaryExtraTotal')}
              value={formatSalaryMoney(summary.extraApprovedTotal)}
              accent="#0369a1"
            />
            <DetailRow label={t('staffSalaryApprovedCount')} value={String(summary.approvedCount)} />
            {summary.pendingCount > 0 ? (
              <DetailRow
                label={t('staffSalaryPendingAmount')}
                value={`${summary.pendingCount} · ${formatSalaryMoney(summary.pendingTotal)}`}
                accent="#b45309"
              />
            ) : null}
            <PaymentListSection
              title={t('staffSalaryAllPayments')}
              rows={approved}
              entryKinds={entryKinds}
              t={t}
              onOpenPayment={onOpenPayment}
            />
            {pending.length > 0 ? (
              <PaymentListSection
                title={t('pendingSalaryNotice')}
                rows={pending}
                entryKinds={entryKinds}
                t={t}
                onOpenPayment={onOpenPayment}
              />
            ) : null}
          </>
        );
      }
      case 'month': {
        const { summary, rows, periodLabel, entryKinds } = payload;
        const monthRows = rows.filter(
          (r) => r.period_year === summary.currentYear && r.period_month === summary.currentMonth
        );
        return (
          <>
            <View style={styles.heroBoxBlue}>
              <Text style={styles.heroLabel}>{periodLabel}</Text>
              {summary.baseSalary != null && summary.baseSalary > 0 ? (
                <>
                  <Text style={styles.heroValueBlue}>{formatSalaryMoney(summary.monthApprovedPaid)}</Text>
                  <Text style={styles.heroSub}>
                    {t('staffSalaryMonthProgress')}: {summary.monthProgressPct ?? 0}%
                  </Text>
                </>
              ) : (
                <Text style={styles.heroSub}>{t('staffSalaryNoContractHint')}</Text>
              )}
            </View>
            {summary.baseSalary != null && summary.baseSalary > 0 ? (
              <>
                <DetailRow label={t('staffSalaryContractAmount')} value={formatSalaryMoney(summary.baseSalary)} />
                <DetailRow
                  label={t('staffSalaryMonthPaid')}
                  value={formatSalaryMoney(summary.monthApprovedPaid)}
                  accent="#047857"
                />
                <DetailRow
                  label={t('staffSalaryRemainingThisMonth')}
                  value={summary.monthRemaining != null ? formatSalaryMoney(summary.monthRemaining) : '—'}
                  accent="#b45309"
                />
              </>
            ) : null}
            {summary.monthPendingPaid > 0 ? (
              <DetailRow
                label={t('staffSalaryPendingAmount')}
                value={formatSalaryMoney(summary.monthPendingPaid)}
                accent="#b45309"
              />
            ) : null}
            {summary.yearRemaining != null ? (
              <DetailRow
                label={t('staffSalaryRemainingYear', {
                  year: summary.currentYear,
                  amount: formatSalaryMoney(summary.yearRemaining),
                })}
                value={formatSalaryMoney(summary.yearRemaining)}
              />
            ) : null}
            <PaymentListSection
              title={t('staffSalaryMonthEntries')}
              rows={monthRows}
              entryKinds={entryKinds}
              t={t}
              onOpenPayment={onOpenPayment}
            />
          </>
        );
      }
      case 'period': {
        const { group, entryKinds } = payload;
        return (
          <>
            <View style={styles.heroBoxPurple}>
              <Text style={styles.heroLabel}>{t('staffSalaryHistoryApprovedTotal')}</Text>
              <Text style={styles.heroValuePurple}>
                {group.approvedTotal > 0 ? formatSalaryMoney(group.approvedTotal) : '—'}
              </Text>
              {group.pendingTotal > 0 ? (
                <Text style={styles.heroSub}>
                  {t('staffSalaryPendingAmount')}: +{formatSalaryMoney(group.pendingTotal)}
                </Text>
              ) : null}
            </View>
            <DetailRow
              label={t('staffSalaryHistoryRecordCount', { count: group.rows.length })}
              value={String(group.rows.length)}
            />
            {group.rows.map((p) => (
              <PaymentDetailBlock
                key={p.id}
                payment={p}
                entryKind={entryKinds.get(p.id)}
                t={t}
                showActions
                actingId={actingId}
                onApprove={onApprove}
                onAppeal={onAppeal}
              />
            ))}
          </>
        );
      }
      case 'payment':
        return (
          <PaymentDetailBlock
            payment={payload.payment}
            entryKind={payload.entryKind}
            t={t}
            showActions
            actingId={actingId}
            onApprove={onApprove}
            onAppeal={onAppeal}
          />
        );
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
          onPress={(e) => e.stopPropagation?.()}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.headerTitle} numberOfLines={2}>
              {title}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={12}>
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {renderBody()}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '88%',
    paddingTop: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#cbd5e1',
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: '#111827', paddingRight: 12 },
  closeBtn: { padding: 4 },
  scroll: { padding: 16, paddingBottom: 24, gap: 4 },
  heroBox: {
    backgroundColor: '#ecfdf5',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  heroBoxBlue: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#93c5fd',
  },
  heroBoxPurple: {
    backgroundColor: '#f5f3ff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#c4b5fd',
  },
  heroLabel: { fontSize: 12, fontWeight: '600', color: '#64748b', marginBottom: 4 },
  heroValue: { fontSize: 26, fontWeight: '800', color: '#047857' },
  heroValueBlue: { fontSize: 26, fontWeight: '800', color: '#0369a1' },
  heroValuePurple: { fontSize: 26, fontWeight: '800', color: '#6d28d9' },
  heroSub: { fontSize: 12, color: '#64748b', marginTop: 4 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f1f5f9',
  },
  detailLabel: { flex: 1, fontSize: 13, color: '#64748b' },
  detailValue: { flex: 1.2, fontSize: 13, fontWeight: '600', color: '#111827', textAlign: 'right' },
  section: { marginTop: 14 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: 8,
  },
  listItemBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f1f5f9' },
  listItemMain: { flex: 1 },
  listItemAmount: { fontSize: 15, fontWeight: '800', color: '#111827' },
  listItemMeta: { fontSize: 11, color: '#64748b', marginTop: 2 },
  listItemRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  paymentBlock: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  paymentHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  paymentAmount: { fontSize: 20, fontWeight: '800', color: '#111827' },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusChipText: { fontSize: 10, fontWeight: '600' },
  sheetActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  appealBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fff',
  },
  appealBtnText: { fontSize: 13, fontWeight: '700', color: '#b91c1c' },
  approveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#059669',
  },
  approveBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
