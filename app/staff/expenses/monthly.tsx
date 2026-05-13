import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { formatDateShort } from '@/lib/date';

type ExpenseRow = {
  id: string;
  amount: number;
  status: string;
  expense_date: string;
  description: string | null;
  category: { name: string } | null;
};

type MonthGroup = {
  key: string;
  label: string;
  total: number;
  approvedTotal: number;
  pendingTotal: number;
  rejectedTotal: number;
  items: ExpenseRow[];
};

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' ₺';
}

const monthFormatter = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' });

export default function StaffExpensesMonthlyScreen() {
  const { staff } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);

  const load = useCallback(async () => {
    if (!staff?.id) return;
    const { data } = await supabase
      .from('staff_expenses')
      .select('id, amount, status, expense_date, description, category:category_id(name)')
      .eq('staff_id', staff.id)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500);
    setExpenses((data ?? []) as ExpenseRow[]);
    setLoading(false);
  }, [staff?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const monthGroups = useMemo<MonthGroup[]>(() => {
    const bucket = new Map<string, MonthGroup>();
    for (const item of expenses) {
      const key = item.expense_date.slice(0, 7);
      const parsed = new Date(`${key}-01T00:00:00`);
      const label = monthFormatter.format(parsed);
      const existing = bucket.get(key) ?? {
        key,
        label: label.charAt(0).toUpperCase() + label.slice(1),
        total: 0,
        approvedTotal: 0,
        pendingTotal: 0,
        rejectedTotal: 0,
        items: [],
      };
      const amount = Number(item.amount);
      existing.total += amount;
      if (item.status === 'approved') existing.approvedTotal += amount;
      else if (item.status === 'rejected') existing.rejectedTotal += amount;
      else existing.pendingTotal += amount;
      existing.items.push(item);
      bucket.set(key, existing);
    }
    return Array.from(bucket.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [expenses]);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.hint}>Aylara gore tum harcama kayitlariniz.</Text>
        {loading ? (
          <ActivityIndicator size="large" color={theme.colors.primary} style={styles.loader} />
        ) : monthGroups.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-clear-outline" size={46} color={theme.colors.textMuted} />
            <Text style={styles.emptyText}>Aylik gecmis kaydi bulunamadi.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {monthGroups.map((group) => (
              <View key={group.key} style={styles.monthCard}>
                <View style={styles.monthHeader}>
                  <Text style={styles.monthTitle}>{group.label}</Text>
                  <Text style={styles.monthTotal}>{fmtMoney(group.total)}</Text>
                </View>
                <View style={styles.monthMetaRow}>
                  <Text style={styles.metaText}>Onaylanan: {fmtMoney(group.approvedTotal)}</Text>
                  <Text style={styles.metaText}>Bekleyen: {fmtMoney(group.pendingTotal)}</Text>
                  <Text style={styles.metaText}>Reddedilen: {fmtMoney(group.rejectedTotal)}</Text>
                </View>
                <View style={styles.items}>
                  {group.items.map((item) => (
                    <View key={item.id} style={styles.itemRow}>
                      <View style={styles.itemLeft}>
                        <Text style={styles.itemDate}>{formatDateShort(item.expense_date)}</Text>
                        <Text style={styles.itemCategory} numberOfLines={1}>
                          {item.category?.name ?? 'Kategori yok'}
                        </Text>
                        {item.description ? (
                          <Text style={styles.itemDesc} numberOfLines={1}>
                            {item.description}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={styles.itemAmount}>{fmtMoney(Number(item.amount))}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 16, paddingBottom: 28 },
  hint: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 12 },
  loader: { marginTop: 40 },
  empty: { paddingVertical: 40, alignItems: 'center', justifyContent: 'center' },
  emptyText: { marginTop: 8, fontSize: 14, color: theme.colors.textMuted },
  list: { gap: 12 },
  monthCard: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
    padding: 12,
  },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  monthTotal: { fontSize: 16, fontWeight: '700', color: theme.colors.primary },
  monthMetaRow: { marginTop: 8, gap: 2 },
  metaText: { fontSize: 12, color: theme.colors.textSecondary },
  items: { marginTop: 10, gap: 8 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    paddingTop: 8,
  },
  itemLeft: { flex: 1, paddingRight: 10 },
  itemDate: { fontSize: 12, color: theme.colors.textMuted },
  itemCategory: { fontSize: 14, fontWeight: '600', color: theme.colors.text, marginTop: 1 },
  itemDesc: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 1 },
  itemAmount: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
});
