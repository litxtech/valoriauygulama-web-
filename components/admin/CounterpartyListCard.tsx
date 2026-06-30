import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import { CachedImage } from '@/components/CachedImage';
import {
  counterpartyInitials,
  formatCounterpartyBalance,
  formatCounterpartyFlow,
  resolveCounterpartyTypeMeta,
} from '@/lib/financeCounterpartyUi';
import type { FinanceCounterpartyType } from '@/lib/financeLedger';
import { fmtMoneyTry } from '@/lib/financeLedger';

type Props = {
  id: string;
  name: string;
  party_type: FinanceCounterpartyType;
  party_type_label?: string | null;
  phone?: string | null;
  income?: number;
  expense?: number;
  net?: number;
  profileImage?: string | null;
  /** İşletme / şirket adı — ödeme listelerinde etiket */
  organizationName?: string | null;
  onPress: () => void;
  /** Uzun basınca listeden kaldır */
  onLongPress?: () => void;
  selectionMode?: boolean;
  selected?: boolean;
  /** Daha sıkı satır — hızlı ödeme listesi */
  dense?: boolean;
  /** Bakiye henüz gelmedi */
  amountsPending?: boolean;
  /** Açık borç / alacak kaydı toplamı */
  openDebt?: number;
};

export function CounterpartyListCard({
  name,
  party_type,
  party_type_label,
  phone,
  income = 0,
  expense = 0,
  net = 0,
  profileImage,
  organizationName,
  onPress,
  onLongPress,
  selectionMode = false,
  selected = false,
  dense,
  amountsPending = false,
  openDebt = 0,
}: Props) {
  const meta = resolveCounterpartyTypeMeta(party_type, party_type_label);
  const bal = formatCounterpartyBalance(net);
  const flow = formatCounterpartyFlow(income, expense);
  const hasFlow = !amountsPending && (income >= 0.01 || expense >= 0.01);
  const hasOpenDebt = !amountsPending && openDebt >= 0.01;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        dense && styles.cardDense,
        selectionMode && selected && styles.cardSelected,
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={450}
      activeOpacity={0.88}
    >
      {selectionMode ? (
        <View style={[styles.check, selected && styles.checkOn]}>
          {selected ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
        </View>
      ) : null}
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
          <Text style={[styles.type, { color: meta.color }]}>{meta.label}</Text>
          {phone ? <Text style={styles.phone}> · {phone}</Text> : null}
        </View>
        {amountsPending ? (
          <Text style={styles.flowMuted}>Tutarlar yükleniyor…</Text>
        ) : hasFlow ? (
          <Text style={styles.flow}>{flow}</Text>
        ) : (
          <Text style={styles.flowMuted}>İşlem kaydı yok</Text>
        )}
        {!amountsPending && hasFlow && bal.tone !== 'zero' ? (
          <Text
            style={[
              styles.net,
              bal.tone === 'positive' && styles.netPos,
              bal.tone === 'negative' && styles.netNeg,
            ]}
            numberOfLines={2}
          >
            {bal.text}
          </Text>
        ) : null}
        {hasOpenDebt ? (
          <View style={[styles.debtBadge, dense && styles.debtBadgeDense]}>
            <Ionicons name="alert-circle-outline" size={dense ? 11 : 12} color="#b45309" />
            <Text style={[styles.debtBadgeText, dense && styles.debtBadgeTextDense]}>
              Açık borç {fmtMoneyTry(openDebt)}
            </Text>
          </View>
        ) : null}
      </View>
      {selectionMode ? null : (
        <Ionicons name="chevron-forward" size={22} color={adminTheme.colors.textMuted} />
      )}
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
  cardDense: { padding: 10, marginBottom: 6, borderRadius: 12, gap: 10 },
  cardSelected: { borderColor: adminTheme.colors.accent, backgroundColor: '#fff7ed' },
  check: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: adminTheme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: adminTheme.colors.accent, borderColor: adminTheme.colors.accent },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarDense: { width: 42, height: 42, borderRadius: 21 },
  avatarImg: { overflow: 'hidden' },
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
  phone: { fontSize: 12, color: adminTheme.colors.textMuted },
  flow: { fontSize: 12, color: adminTheme.colors.textSecondary, marginTop: 6, fontWeight: '500' },
  flowMuted: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 6, fontStyle: 'italic' },
  net: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  netPos: { color: '#16a34a' },
  netNeg: { color: '#dc2626' },
  debtBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  debtBadgeDense: { marginTop: 4, paddingHorizontal: 6, paddingVertical: 2 },
  debtBadgeText: { fontSize: 11, fontWeight: '700', color: '#b45309' },
  debtBadgeTextDense: { fontSize: 10 },
});
