import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { formatPaymentAmount, isPaymentArchived, type AdminPaymentRequestRow } from '@/lib/payments';
import { paymentKindLabel, paymentStatusLabel, paymentText } from '@/lib/paymentsI18n';
import { adminPaymentLaneForRow, ADMIN_PAYMENT_LANE_META, type AdminPaymentLane } from '@/lib/adminPaymentLanes';
import { AdminGuestAccountSummary } from '@/components/admin/AdminGuestAccountSummary';
import { formatAdminDateTime, guestRoomNumber } from '@/lib/adminGuestAccountSummary';
import { tipPaymentMethodLabel, tipStatusLabel } from '@/lib/staffTipsI18n';

const STATUS_COLOR = {
  pending: '#f59e0b',
  paid: '#22c55e',
  failed: '#ef4444',
  expired: '#94a3b8',
  cancelled: '#94a3b8',
  refunded: '#6366f1',
} as const;

function metaStaffName(row: AdminPaymentRequestRow): string {
  const meta = row.metadata;
  if (meta && typeof meta.staff_name === 'string') return meta.staff_name.trim();
  return row.tip_detail?.staff?.full_name?.trim() ?? '';
}

function metaGuestName(row: AdminPaymentRequestRow): string {
  return (
    row.guest_detail?.full_name?.trim() ||
    (typeof row.metadata?.guest_name === 'string' ? row.metadata.guest_name : '') ||
    ''
  );
}

type Props = {
  item: AdminPaymentRequestRow;
  lane: AdminPaymentLane;
  onPress: () => void;
  onOpenGuest?: (guestId: string) => void;
  onAccept?: () => void;
  onRefund?: () => void;
  onCancel?: () => void;
  onArchive?: () => void;
  onRecordIncome?: () => void;
  acting?: boolean;
};

export function AdminPaymentCard({
  item,
  lane,
  onPress,
  onOpenGuest,
  onAccept,
  onRefund,
  onCancel,
  onArchive,
  onRecordIncome,
  acting,
}: Props) {
  const archived = isPaymentArchived(item);
  const laneMeta = ADMIN_PAYMENT_LANE_META[lane];
  const isTip = item.service_kind === 'staff_tip';
  const staffName = metaStaffName(item);
  const guestName = metaGuestName(item);
  const creatorName = item.creator_staff?.full_name?.trim() ?? '';
  const room = guestRoomNumber(item.guest_detail) || item.tip_detail?.room_number || null;
  const tipStatus = item.tip_detail?.status;
  const tipId = item.reference_id ?? null;
  const canAccept =
    isTip && tipStatus === 'pending' && item.status !== 'refunded' && item.status !== 'cancelled';
  const canRefund = isTip && !!tipId && item.status === 'paid' && tipStatus === 'confirmed';

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      style={[styles.card, { borderLeftColor: laneMeta.accent }]}
      onPress={onPress}
    >
      <View style={styles.topRow}>
        <View style={[styles.lanePill, { backgroundColor: laneMeta.bg }]}>
          <Ionicons name={laneMeta.icon} size={14} color={laneMeta.accent} />
          <Text style={[styles.lanePillText, { color: laneMeta.accent }]}>{laneMeta.title}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: STATUS_COLOR[item.status] + '22' }]}>
          <Text style={[styles.badgeText, { color: STATUS_COLOR[item.status] }]}>
            {paymentStatusLabel(item.status, { archived })}
          </Text>
        </View>
      </View>

      <Text style={styles.purposeLabel}>Ne için</Text>
      {isTip ? (
        <Text style={styles.purpose} numberOfLines={2}>
          Bahşiş · {guestName || 'Misafir'} → {staffName || 'Personel'}
        </Text>
      ) : (
        <Text style={styles.purpose} numberOfLines={2}>
          {item.title}
        </Text>
      )}

      <Text style={styles.amount}>{formatPaymentAmount(Number(item.amount), item.currency)}</Text>
      <Text style={styles.kindLine}>{paymentKindLabel(item.service_kind)}{room ? ` · Oda ${room}` : ''}</Text>

      <View style={styles.factGrid}>
        <View style={styles.fact}>
          <Text style={styles.factLabel}>Kim ödedi</Text>
          <Text style={styles.factValue} numberOfLines={1}>
            {guestName || '—'}
          </Text>
        </View>
        <View style={styles.fact}>
          <Text style={styles.factLabel}>Ne zaman</Text>
          <Text style={styles.factValue} numberOfLines={1}>
            {item.paid_at ? formatAdminDateTime(item.paid_at) : formatAdminDateTime(item.created_at)}
          </Text>
        </View>
      </View>

      {(creatorName || staffName) && !isTip ? (
        <Text style={styles.byline}>
          Kayıt: {creatorName || '—'}
          {staffName ? ` · İlgili: ${staffName}` : ''}
        </Text>
      ) : null}

      {isTip && item.tip_detail ? (
        <View style={[styles.tipBox, { backgroundColor: laneMeta.bg }]}>
          <Text style={styles.tipLine}>
            Bahşiş: {tipStatusLabel(item.tip_detail.status as 'pending' | 'confirmed' | 'cancelled' | 'refunded')}
          </Text>
          <Text style={styles.tipLine}>Yöntem: {tipPaymentMethodLabel(item.tip_detail.payment_method)}</Text>
          {item.tip_detail.note ? <Text style={styles.tipNote}>Not: {item.tip_detail.note}</Text> : null}
        </View>
      ) : null}

      {!isTip && item.description ? <Text style={styles.desc}>{item.description}</Text> : null}

      {item.guest_detail?.id && onOpenGuest ? (
        <AdminGuestAccountSummary guest={item.guest_detail} onOpenProfile={onOpenGuest} compact={!isTip} />
      ) : null}

      {!archived && item.status === 'pending' && onCancel ? (
        <View style={styles.actions} onStartShouldSetResponder={() => true}>
          <TouchableOpacity
            style={[styles.btn, styles.btnCancel]}
            disabled={acting}
            onPress={(e) => {
              e.stopPropagation?.();
              onCancel();
            }}
          >
            <Ionicons name="close-circle-outline" size={18} color="#fff" />
            <Text style={styles.btnText}>{paymentText('paymentsCancelLink')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!archived && item.status === 'paid' && onRecordIncome ? (
        <View style={styles.actions} onStartShouldSetResponder={() => true}>
          <TouchableOpacity
            style={[styles.btn, styles.btnIncome]}
            disabled={acting}
            onPress={(e) => {
              e.stopPropagation?.();
              onRecordIncome();
            }}
          >
            <Ionicons name="add-circle-outline" size={18} color="#fff" />
            <Text style={styles.btnText}>Gelir kaydı</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!archived &&
      (item.status === 'paid' ||
        item.status === 'refunded' ||
        item.status === 'failed' ||
        item.status === 'expired' ||
        item.status === 'cancelled') &&
      onArchive ? (
        <View style={styles.actions} onStartShouldSetResponder={() => true}>
          <TouchableOpacity
            style={[styles.btn, styles.btnArchive]}
            disabled={acting}
            onPress={(e) => {
              e.stopPropagation?.();
              onArchive();
            }}
          >
            <Ionicons name="archive-outline" size={18} color="#fff" />
            <Text style={styles.btnText}>{paymentText('paymentsClosePaidLink')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {isTip && !archived && (canAccept || canRefund) ? (
        <View style={styles.actions} onStartShouldSetResponder={() => true}>
          {canAccept && onAccept ? (
            <TouchableOpacity
              style={[styles.btn, styles.btnAccept]}
              disabled={acting}
              onPress={(e) => {
                e.stopPropagation?.();
                onAccept();
              }}
            >
              {acting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-done-outline" size={18} color="#fff" />
                  <Text style={styles.btnText}>Kabul et</Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}
          {canRefund && onRefund ? (
            <TouchableOpacity
              style={[styles.btn, styles.btnRefund]}
              disabled={acting}
              onPress={(e) => {
                e.stopPropagation?.();
                onRefund();
              }}
            >
              <Ionicons name="return-down-back-outline" size={18} color="#fff" />
              <Text style={styles.btnText}>İade</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : !archived ? (
        <View style={styles.chevronRow}>
          <Text style={styles.detailHint}>Detay & QR</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderLeftWidth: 4,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  lanePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  lanePillText: { fontSize: 11, fontWeight: '800' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: '800' },
  purposeLabel: { fontSize: 10, fontWeight: '700', color: theme.colors.textMuted, marginTop: 10, letterSpacing: 0.4 },
  purpose: { fontSize: 15, fontWeight: '800', color: theme.colors.text, marginTop: 2, lineHeight: 21 },
  amount: { fontSize: 22, fontWeight: '900', color: '#635bff', marginTop: 8 },
  kindLine: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4 },
  factGrid: { flexDirection: 'row', gap: 10, marginTop: 12 },
  fact: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 10,
    padding: 10,
  },
  factLabel: { fontSize: 10, fontWeight: '700', color: theme.colors.textMuted },
  factValue: { fontSize: 12, fontWeight: '700', color: theme.colors.text, marginTop: 4 },
  byline: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 8 },
  tipBox: { marginTop: 10, padding: 10, borderRadius: 10, gap: 3 },
  tipLine: { fontSize: 11, fontWeight: '600', color: theme.colors.textSecondary },
  tipNote: { fontSize: 11, fontStyle: 'italic', color: theme.colors.text },
  desc: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
  },
  btnAccept: { backgroundColor: '#16a34a' },
  btnRefund: { backgroundColor: '#6366f1' },
  btnCancel: { backgroundColor: '#64748b' },
  btnArchive: { backgroundColor: '#475569' },
  btnIncome: { backgroundColor: '#16a34a' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  chevronRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 10 },
  detailHint: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted },
});
