import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import {
  COUNTERPARTY_TYPE_META,
  counterpartyInitials,
  formatCounterpartyBalance,
  formatCounterpartyFlow,
} from '@/lib/financeCounterpartyUi';
import type { FinanceCounterpartyType } from '@/lib/financeLedger';

type Props = {
  id: string;
  name: string;
  party_type: FinanceCounterpartyType;
  phone?: string | null;
  income?: number;
  expense?: number;
  net?: number;
  onPress: () => void;
};

export function CounterpartyListCard({ name, party_type, phone, income = 0, expense = 0, net = 0, onPress }: Props) {
  const meta = COUNTERPARTY_TYPE_META[party_type] ?? COUNTERPARTY_TYPE_META.other;
  const bal = formatCounterpartyBalance(net);
  const flow = formatCounterpartyFlow(income, expense);
  const hasFlow = income >= 0.01 || expense >= 0.01;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.88}>
      <View style={[styles.avatar, { backgroundColor: meta.bg }]}>
        <Text style={[styles.avatarText, { color: meta.color }]}>{counterpartyInitials(name)}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.typeRow}>
          <Ionicons name={meta.icon} size={13} color={meta.color} />
          <Text style={[styles.type, { color: meta.color }]}>{meta.label}</Text>
          {phone ? <Text style={styles.phone}> · {phone}</Text> : null}
        </View>
        {hasFlow ? <Text style={styles.flow}>{flow}</Text> : <Text style={styles.flowMuted}>İşlem kaydı yok</Text>}
        {hasFlow && bal.tone !== 'zero' ? (
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
      </View>
      <Ionicons name="chevron-forward" size={22} color={adminTheme.colors.textMuted} />
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
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 17, fontWeight: '800' },
  body: { flex: 1, minWidth: 0 },
  name: { fontSize: 17, fontWeight: '700', color: adminTheme.colors.text },
  typeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, flexWrap: 'wrap' },
  type: { fontSize: 12, fontWeight: '600', marginLeft: 4 },
  phone: { fontSize: 12, color: adminTheme.colors.textMuted },
  flow: { fontSize: 12, color: adminTheme.colors.textSecondary, marginTop: 6, fontWeight: '500' },
  flowMuted: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 6, fontStyle: 'italic' },
  net: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  netPos: { color: '#16a34a' },
  netNeg: { color: '#dc2626' },
});
