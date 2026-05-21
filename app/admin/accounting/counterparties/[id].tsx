import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard } from '@/components/admin';
import {
  COUNTERPARTY_TYPE_META,
  counterpartyInitials,
  formatCounterpartyBalance,
  formatCounterpartyFlow,
} from '@/lib/financeCounterpartyUi';
import { fetchCounterpartyBalanceMap } from '@/lib/financeCounterpartyBalances';
import { fmtMoneyTry } from '@/lib/financeLedger';
import { resolveCategoryLabel } from '@/lib/financeCategoriesApi';
import type { FinanceCounterpartyType } from '@/lib/financeLedger';
import { formatDateShort } from '@/lib/date';

type CpRow = {
  id: string;
  organization_id: string;
  name: string;
  party_type: FinanceCounterpartyType;
  phone: string | null;
  notes: string | null;
};

type MovRow = {
  id: string;
  kind: string;
  amount: number;
  movement_date: string;
  category: string;
  description: string;
};

export default function CounterpartyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [cp, setCp] = useState<CpRow | null>(null);
  const [movements, setMovements] = useState<MovRow[]>([]);
  const [income, setIncome] = useState(0);
  const [expense, setExpense] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data: c, error: e1 } = await supabase
      .from('finance_counterparties')
      .select('id, organization_id, name, party_type, phone, notes')
      .eq('id', id)
      .single();

    if (e1 || !c) {
      setCp(null);
      setLoading(false);
      return;
    }
    const row = c as CpRow;
    setCp(row);

    const [{ data: m }, balMap] = await Promise.all([
      supabase
        .from('finance_movements')
        .select('id, kind, amount, movement_date, category, description')
        .eq('counterparty_id', id)
        .order('movement_date', { ascending: false })
        .limit(50),
      fetchCounterpartyBalanceMap(row.organization_id),
    ]);

    setMovements((m as MovRow[]) ?? []);
    const b = balMap.get(id);
    setIncome(b?.income ?? 0);
    setExpense(b?.expense ?? 0);
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
      </View>
    );
  }

  if (!cp) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Cari bulunamadı.</Text>
      </View>
    );
  }

  const meta = COUNTERPARTY_TYPE_META[cp.party_type] ?? COUNTERPARTY_TYPE_META.other;
  const net = income - expense;
  const balance = formatCounterpartyBalance(net);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.hero}>
        <View style={[styles.avatar, { backgroundColor: meta.bg }]}>
          <Text style={[styles.avatarText, { color: meta.color }]}>{counterpartyInitials(cp.name)}</Text>
        </View>
        <Text style={styles.heroName}>{cp.name}</Text>
        <View style={[styles.badge, { backgroundColor: meta.bg }]}>
          <Ionicons name={meta.icon} size={14} color={meta.color} />
          <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
        </View>
        {cp.phone ? (
          <Text style={styles.phone}>
            <Ionicons name="call-outline" size={14} color={adminTheme.colors.textMuted} /> {cp.phone}
          </Text>
        ) : null}
        {cp.notes?.trim() ? <Text style={styles.notes}>{cp.notes.trim()}</Text> : null}
      </View>

      <AdminCard style={styles.balanceCard}>
        <Text style={styles.balanceTitle}>Bu cari ile toplam (defter kayıtları)</Text>
        <Text style={styles.flowLine}>{formatCounterpartyFlow(income, expense)}</Text>
        <View style={styles.balanceRow}>
          <View style={styles.balanceCol}>
            <Text style={styles.balanceLbl}>↑ Aldığınız</Text>
            <Text style={[styles.balanceVal, styles.in]}>{fmtMoneyTry(income)}</Text>
          </View>
          <View style={styles.balanceCol}>
            <Text style={styles.balanceLbl}>↓ Ödediğiniz</Text>
            <Text style={[styles.balanceVal, styles.out]}>{fmtMoneyTry(expense)}</Text>
          </View>
        </View>
        <Text
          style={[
            styles.balanceNet,
            balance.tone === 'positive' && styles.netPos,
            balance.tone === 'negative' && styles.netNeg,
          ]}
        >
          {balance.text}
        </Text>
        <Text style={styles.balanceHint}>{balance.hint}</Text>
      </AdminCard>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionIncome]}
          onPress={() =>
            router.push({
              pathname: '/admin/accounting/movements/new',
              params: { kind: 'income', counterpartyId: cp.id },
            } as never)
          }
        >
          <Ionicons name="arrow-down-circle" size={22} color="#fff" />
          <Text style={styles.actionBtnText}>Tahsilat ekle</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionExpense]}
          onPress={() =>
            router.push({
              pathname: '/admin/accounting/movements/new',
              params: { kind: 'expense', counterpartyId: cp.id },
            } as never)
          }
        >
          <Ionicons name="arrow-up-circle" size={22} color="#fff" />
          <Text style={styles.actionBtnText}>Ödeme ekle</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>İşlem geçmişi</Text>
      {movements.length === 0 ? (
        <Text style={styles.muted}>Henüz bu cari ile kayıt yok. Yukarıdan ekleyin.</Text>
      ) : (
        movements.map((m) => (
          <TouchableOpacity
            key={m.id}
            onPress={() =>
              router.push({ pathname: '/admin/accounting/movements/[id]', params: { id: m.id } } as never)
            }
            activeOpacity={0.85}
          >
            <AdminCard style={styles.movCard}>
              <View style={styles.movTop}>
                <Text style={styles.movKind}>{m.kind === 'income' ? 'Tahsilat' : 'Ödeme'}</Text>
                <Text style={[styles.movAmt, m.kind === 'income' ? styles.in : styles.out]}>
                  {m.kind === 'income' ? '+' : '−'}
                  {fmtMoneyTry(Number(m.amount))}
                </Text>
              </View>
              <Text style={styles.movMeta}>
                {formatDateShort(m.movement_date)} · {resolveCategoryLabel(m.category)}
              </Text>
              {m.description?.trim() ? (
                <Text style={styles.movDesc} numberOfLines={2}>
                  {m.description.trim()}
                </Text>
              ) : null}
            </AdminCard>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  muted: { textAlign: 'center', color: adminTheme.colors.textMuted, marginTop: 12 },
  hero: { alignItems: 'center', marginBottom: 16 },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 26, fontWeight: '800' },
  heroName: { fontSize: 22, fontWeight: '800', color: adminTheme.colors.text, marginTop: 12, textAlign: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 8,
  },
  badgeText: { fontSize: 13, fontWeight: '600' },
  phone: { fontSize: 14, color: adminTheme.colors.textMuted, marginTop: 10 },
  notes: { fontSize: 13, color: adminTheme.colors.textSecondary, marginTop: 8, textAlign: 'center', paddingHorizontal: 20 },
  balanceCard: { padding: 16, marginBottom: 12 },
  balanceTitle: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.textMuted, marginBottom: 12 },
  balanceRow: { flexDirection: 'row', gap: 12 },
  balanceCol: { flex: 1 },
  balanceLbl: { fontSize: 12, color: adminTheme.colors.textMuted },
  balanceVal: { fontSize: 18, fontWeight: '800', marginTop: 4 },
  in: { color: '#16a34a' },
  out: { color: '#dc2626' },
  flowLine: { fontSize: 13, color: adminTheme.colors.textSecondary, marginBottom: 12, fontWeight: '500' },
  balanceNet: { fontSize: 15, fontWeight: '700', marginTop: 14, textAlign: 'center', color: adminTheme.colors.text },
  balanceHint: {
    fontSize: 12,
    color: adminTheme.colors.textMuted,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 17,
    paddingHorizontal: 8,
  },
  netPos: { color: '#16a34a' },
  netNeg: { color: '#dc2626' },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  actionIncome: { backgroundColor: '#16a34a' },
  actionExpense: { backgroundColor: '#dc2626' },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.textMuted, marginBottom: 10 },
  movCard: { marginBottom: 8, padding: 14 },
  movTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  movKind: { fontSize: 14, fontWeight: '600' },
  movAmt: { fontSize: 16, fontWeight: '800' },
  movMeta: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 6 },
  movDesc: { fontSize: 13, color: adminTheme.colors.textSecondary, marginTop: 4 },
});
