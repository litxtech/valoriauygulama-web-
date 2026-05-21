import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard, AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import {
  fmtMoneyTry,
  MOVEMENT_KIND_LABELS,
  movementSummaryLine,
  type FinanceMovementKind,
} from '@/lib/financeLedger';
import { resolveCategoryLabel } from '@/lib/financeCategoriesApi';
import { formatDateShort } from '@/lib/date';

type Row = {
  id: string;
  kind: FinanceMovementKind;
  amount: number;
  movement_date: string;
  category: string;
  counterparty_name: string | null;
  description: string;
  receipt_urls: string[] | null;
  counterparty?: { name: string } | null;
};

type FilterKind = 'all' | FinanceMovementKind;

export default function AccountingMovementsIndex() {
  const router = useRouter();
  const me = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [kindFilter, setKindFilter] = useState<FilterKind>('all');
  const [search, setSearch] = useState('');

  const orgFilter = useMemo(() => {
    if (me?.app_permissions?.super_admin === true || me?.role === 'admin') {
      return selectedOrganizationId;
    }
    return me?.organization_id ?? 'all';
  }, [me, selectedOrganizationId]);

  const load = useCallback(async () => {
    if (!orgFilter || orgFilter === 'all') {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('finance_movements')
      .select(
        `
        id,
        kind,
        amount,
        movement_date,
        category,
        counterparty_name,
        description,
        receipt_urls,
        counterparty:counterparty_id(name)
      `
      )
      .eq('organization_id', orgFilter)
      .order('movement_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) setRows([]);
    else setRows((((data ?? []) as unknown) as Row[]) ?? []);
    setLoading(false);
  }, [orgFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const filtered = useMemo(() => {
    let list = rows;
    if (kindFilter !== 'all') list = list.filter((r) => r.kind === kindFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const who = (r.counterparty?.name || r.counterparty_name || '').toLowerCase();
        const desc = (r.description || '').toLowerCase();
        const cat = resolveCategoryLabel(r.category).toLowerCase();
        return who.includes(q) || desc.includes(q) || cat.includes(q);
      });
    }
    return list;
  }, [rows, kindFilter, search]);

  const partyLabel = (r: Row) =>
    r.counterparty?.name?.trim() || r.counterparty_name?.trim() || '—';

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity style={styles.backHub} onPress={() => router.push('/admin/accounting')} activeOpacity={0.8}>
          <Ionicons name="calculator-outline" size={18} color={adminTheme.colors.primary} />
          <Text style={styles.backHubText}>Muhasebe özet</Text>
        </TouchableOpacity>

        <AdminOrganizationPicker
          canUseAll={me?.app_permissions?.super_admin === true || me?.role === 'admin'}
          ownOrganizationId={me?.organization_id}
        />

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.expenseBtn]}
            onPress={() => router.push('/admin/accounting/movements/new?kind=expense' as never)}
          >
            <Ionicons name="remove-circle" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>Gider</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.incomeBtn]}
            onPress={() => router.push('/admin/accounting/movements/new?kind=income' as never)}
          >
            <Ionicons name="add-circle" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>Gelir</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.search}
          placeholder="Ara: cari, açıklama, kategori…"
          placeholderTextColor={adminTheme.colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />

        <View style={styles.chips}>
          {(['all', 'income', 'expense'] as const).map((k) => (
            <TouchableOpacity
              key={k}
              style={[styles.chip, kindFilter === k && styles.chipOn]}
              onPress={() => setKindFilter(k)}
            >
              <Text style={[styles.chipText, kindFilter === k && styles.chipTextOn]}>
                {k === 'all' ? 'Tümü' : MOVEMENT_KIND_LABELS[k]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {(!orgFilter || orgFilter === 'all') && (
          <Text style={styles.empty}>Özet ve liste için tek işletme seçin.</Text>
        )}

        {orgFilter && orgFilter !== 'all' && filtered.length === 0 && (
          <Text style={styles.empty}>Kayıt yok. Gider veya gelir ekleyin.</Text>
        )}

        {filtered.map((r) => {
          const hasReceipt = Array.isArray(r.receipt_urls) && r.receipt_urls.length > 0;
          return (
            <TouchableOpacity
              key={r.id}
              onPress={() =>
                router.push({ pathname: '/admin/accounting/movements/[id]', params: { id: r.id } } as never)
              }
              activeOpacity={0.85}
            >
              <AdminCard style={styles.card}>
                <View style={styles.cardTop}>
                  <View
                    style={[
                      styles.kindBadge,
                      r.kind === 'income' ? styles.kindIncome : styles.kindExpense,
                    ]}
                  >
                    <Text style={styles.kindBadgeText}>{MOVEMENT_KIND_LABELS[r.kind]}</Text>
                  </View>
                  <Text style={styles.date}>{formatDateShort(r.movement_date)}</Text>
                  {hasReceipt ? (
                    <Ionicons name="attach-outline" size={18} color={adminTheme.colors.textMuted} />
                  ) : null}
                </View>
                <Text style={styles.summary}>
                  {movementSummaryLine({
                    kind: r.kind,
                    amount: Number(r.amount),
                    counterpartyLabel: partyLabel(r),
                    category: r.category,
                  })}
                </Text>
                {r.description?.trim() ? (
                  <Text style={styles.desc} numberOfLines={2}>
                    {r.description.trim()}
                  </Text>
                ) : null}
              </AdminCard>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backHub: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  backHubText: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.primary },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  expenseBtn: { backgroundColor: '#dc2626' },
  incomeBtn: { backgroundColor: '#16a34a' },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  search: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: adminTheme.colors.text,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    marginBottom: 10,
  },
  chips: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  chipOn: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  chipText: { fontSize: 13, color: adminTheme.colors.text },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  empty: { textAlign: 'center', color: adminTheme.colors.textMuted, marginTop: 24 },
  card: { marginBottom: 10, padding: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  kindBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  kindIncome: { backgroundColor: '#dcfce7' },
  kindExpense: { backgroundColor: '#fee2e2' },
  kindBadgeText: { fontSize: 11, fontWeight: '700' },
  date: { flex: 1, fontSize: 12, color: adminTheme.colors.textMuted, textAlign: 'right' },
  summary: { fontSize: 15, fontWeight: '600', color: adminTheme.colors.text },
  desc: { fontSize: 13, color: adminTheme.colors.textMuted, marginTop: 4 },
});
