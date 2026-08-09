import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import { counterpartyInitials, resolveCounterpartyTypeMeta } from '@/lib/financeCounterpartyUi';

export type SalaryStaffStatusTone = 'paid' | 'pending' | 'unpaid' | 'rejected';

type Props = {
  name: string;
  department?: string | null;
  organizationName?: string | null;
  amountLabel: string;
  lastPaymentLabel: string;
  statusLabel: string;
  statusTone: SalaryStaffStatusTone;
  onPress: () => void;
  onPayPress?: () => void;
  onRemindPress?: () => void;
  reminding?: boolean;
  dense?: boolean;
};

const TONE_COLOR: Record<SalaryStaffStatusTone, string> = {
  paid: '#16a34a',
  pending: '#b45309',
  unpaid: '#dc2626',
  rejected: '#dc2626',
};

const TONE_ICON: Record<SalaryStaffStatusTone, keyof typeof Ionicons.glyphMap> = {
  paid: 'checkmark-circle',
  pending: 'time-outline',
  unpaid: 'alert-circle-outline',
  rejected: 'close-circle',
};

export function SalaryStaffListCard({
  name,
  department,
  organizationName,
  amountLabel,
  lastPaymentLabel,
  statusLabel,
  statusTone,
  onPress,
  onPayPress,
  onRemindPress,
  reminding,
  dense,
}: Props) {
  const meta = resolveCounterpartyTypeMeta('staff');
  const tone = TONE_COLOR[statusTone];

  return (
    <TouchableOpacity
      style={[styles.card, dense && styles.cardDense]}
      onPress={onPress}
      activeOpacity={0.88}
    >
      <View style={[styles.avatar, dense && styles.avatarDense, { backgroundColor: meta.bg }]}>
        <Text style={[styles.avatarText, dense && styles.avatarTextDense, { color: meta.color }]}>
          {counterpartyInitials(name)}
        </Text>
      </View>
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, dense && styles.nameDense]} numberOfLines={1}>
            {name}
          </Text>
          {organizationName?.trim() ? (
            <View style={[styles.orgBadge, dense && styles.orgBadgeDense]}>
              <Ionicons name="business" size={dense ? 9 : 10} color="#1d4ed8" />
              <Text style={[styles.orgBadgeText, dense && styles.orgBadgeTextDense]} numberOfLines={1}>
                {organizationName.trim()}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.typeRow}>
          <Ionicons name={meta.icon} size={13} color={meta.color} />
          <Text style={[styles.type, { color: meta.color }]}>{department?.trim() || meta.label}</Text>
        </View>
        <Text style={styles.flow} numberOfLines={1}>
          Son ödeme: {lastPaymentLabel}
        </Text>
        <View style={styles.statusRow}>
          <Ionicons name={TONE_ICON[statusTone]} size={14} color={tone} />
          <Text style={[styles.statusText, { color: tone }]} numberOfLines={1}>
            {statusLabel}
          </Text>
        </View>
        {amountLabel !== '—' ? (
          <Text style={[styles.amount, statusTone === 'paid' ? styles.amountPos : styles.amountMuted]}>
            {amountLabel}
          </Text>
        ) : null}
      </View>
      <View style={styles.trailing}>
        {onRemindPress ? (
          <TouchableOpacity
            style={styles.remindBtn}
            onPress={(e) => {
              e?.stopPropagation?.();
              onRemindPress();
            }}
            hitSlop={8}
            disabled={reminding}
            accessibilityLabel="Hatırlat"
          >
            {reminding ? (
              <ActivityIndicator size="small" color="#b45309" />
            ) : (
              <Ionicons name="notifications-outline" size={18} color="#b45309" />
            )}
          </TouchableOpacity>
        ) : null}
        {onPayPress ? (
          <TouchableOpacity
            style={styles.payBtn}
            onPress={(e) => {
              e?.stopPropagation?.();
              onPayPress();
            }}
            hitSlop={8}
            accessibilityLabel="Maaş öde"
          >
            <Ionicons name="cash-outline" size={18} color="#b91c1c" />
          </TouchableOpacity>
        ) : null}
        <Ionicons name="chevron-forward" size={20} color={adminTheme.colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  cardDense: { padding: 10, marginBottom: 8, borderRadius: 14, gap: 10 },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarDense: { width: 42, height: 42, borderRadius: 21 },
  avatarText: { fontSize: 17, fontWeight: '800' },
  avatarTextDense: { fontSize: 14 },
  body: { flex: 1, minWidth: 0 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  name: { fontSize: 17, fontWeight: '700', color: adminTheme.colors.text, flexShrink: 1 },
  nameDense: { fontSize: 15 },
  orgBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    maxWidth: '100%',
  },
  orgBadgeDense: { paddingHorizontal: 6, paddingVertical: 2 },
  orgBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1d4ed8',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    maxWidth: 140,
  },
  orgBadgeTextDense: { fontSize: 9, maxWidth: 110 },
  typeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, flexWrap: 'wrap' },
  type: { fontSize: 12, fontWeight: '600', marginLeft: 4 },
  flow: { fontSize: 12, color: adminTheme.colors.textSecondary, marginTop: 6, fontWeight: '500' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  statusText: { fontSize: 12, fontWeight: '700', flexShrink: 1 },
  amount: { fontSize: 13, fontWeight: '800', marginTop: 4 },
  amountPos: { color: '#16a34a' },
  amountMuted: { color: adminTheme.colors.text },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  payBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  remindBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
  },
});
