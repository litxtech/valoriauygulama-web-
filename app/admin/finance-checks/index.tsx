import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
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
  CHECK_DIRECTION_LABELS,
  CHECK_STATUS_LABELS,
  type FinanceCheckDirection,
  type FinanceCheckStatus,
} from '@/lib/finance';
import { formatDateShort } from '@/lib/date';

type Row = {
  id: string;
  organization_id: string;
  direction: FinanceCheckDirection;
  counterparty_name: string;
  amount: number;
  status: FinanceCheckStatus;
  due_date: string | null;
  created_at: string;
};

export default function AdminFinanceChecksIndex() {
  const router = useRouter();
  const me = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dirFilter, setDirFilter] = useState<'all' | FinanceCheckDirection>('all');

  const orgFilter = useMemo(() => {
    if (me?.app_permissions?.super_admin === true || me?.role === 'admin') {
      return selectedOrganizationId;
    }
    return me?.organization_id ?? 'all';
  }, [me, selectedOrganizationId]);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('finance_checks')
      .select('id, organization_id, direction, counterparty_name, amount, status, due_date, created_at')
      .order('due_date', { ascending: true, nullsFirst: false });
    if (orgFilter && orgFilter !== 'all') q = q.eq('organization_id', orgFilter);
    const { data, error } = await q;
    if (error) {
      setRows([]);
      setLoading(false);
      return;
    }
    setRows((data as Row[]) ?? []);
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
    if (dirFilter === 'all') return rows;
    return rows.filter((r) => r.direction === dirFilter);
  }, [rows, dirFilter]);

  const upcoming = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    const in7 = new Date(t);
    in7.setDate(in7.getDate() + 7);
    return filtered.filter((r) => {
      if (!r.due_date) return false;
      const d = new Date(r.due_date);
      return d >= t && d <= in7 && r.status !== 'paid' && r.status !== 'cancelled';
    });
  }, [filtered]);

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
      >
        <AdminOrganizationPicker
          canUseAll={me?.app_permissions?.super_admin === true || me?.role === 'admin'}
          ownOrganizationId={me?.organization_id}
        />
        <TouchableOpacity
          style={styles.newBtn}
          onPress={() => router.push('/admin/finance-checks/new')}
          activeOpacity={0.9}
        >
          <Ionicons name="add-circle-outline" size={22} color="#fff" />
          <Text style={styles.newBtnText}>Yeni çek kaydı</Text>
        </TouchableOpacity>

        <View style={styles.chips}>
          {(['all', 'given', 'received'] as const).map((k) => (
            <TouchableOpacity
              key={k}
              onPress={() => setDirFilter(k === 'all' ? 'all' : k)}
              style={[styles.chip, (k === 'all' ? dirFilter === 'all' : dirFilter === k) && styles.chipOn]}
            >
              <Text style={[styles.chipText, (k === 'all' ? dirFilter === 'all' : dirFilter === k) && styles.chipTextOn]}>
                {k === 'all' ? 'Tümü' : CHECK_DIRECTION_LABELS[k]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {upcoming.length > 0 ? (
          <AdminCard style={styles.hintCard}>
            <Text style={styles.hintTitle}>7 gün içinde vade</Text>
            {upcoming.map((r) => (
              <Text key={r.id} style={styles.hintLine} numberOfLines={1}>
                {CHECK_DIRECTION_LABELS[r.direction]} · {r.counterparty_name} · {formatDateShort(r.due_date!)} ·{' '}
                {fmtMoneyTry(Number(r.amount))}
              </Text>
            ))}
          </AdminCard>
        ) : null}

        {filtered.length === 0 ? (
          <Text style={styles.empty}>Kayıt yok. Yeni çek ekleyin.</Text>
        ) : (
          filtered.map((r) => (
            <TouchableOpacity
              key={r.id}
              onPress={() => router.push({ pathname: '/admin/finance-checks/[id]', params: { id: r.id } } as never)}
              activeOpacity={0.85}
            >
              <AdminCard style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{CHECK_DIRECTION_LABELS[r.direction]}</Text>
                  </View>
                  <Text style={styles.amount}>{fmtMoneyTry(Number(r.amount))}</Text>
                </View>
                <Text style={styles.cp}>{r.counterparty_name}</Text>
                <View style={styles.meta}>
                  <Text style={styles.metaText}>{CHECK_STATUS_LABELS[r.status]}</Text>
                  {r.due_date ? <Text style={styles.metaText}>Vade: {formatDateShort(r.due_date)}</Text> : null}
                </View>
              </AdminCard>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: adminTheme.colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  newBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  chipOn: { backgroundColor: adminTheme.colors.infoLight, borderColor: adminTheme.colors.info },
  chipText: { fontSize: 13, color: adminTheme.colors.textSecondary },
  chipTextOn: { color: adminTheme.colors.info, fontWeight: '600' },
  hintCard: { marginBottom: 12, backgroundColor: adminTheme.colors.warningLight },
  hintTitle: { fontWeight: '700', marginBottom: 6, color: adminTheme.colors.text },
  hintLine: { fontSize: 13, color: adminTheme.colors.textSecondary, marginBottom: 4 },
  empty: { textAlign: 'center', color: adminTheme.colors.textMuted, marginTop: 24 },
  card: { marginBottom: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: {
    backgroundColor: adminTheme.colors.surfaceTertiary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.textSecondary },
  amount: { fontSize: 18, fontWeight: '800', color: adminTheme.colors.text },
  cp: { fontSize: 15, fontWeight: '600', color: adminTheme.colors.text, marginTop: 6 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  metaText: { fontSize: 12, color: adminTheme.colors.textMuted },
});
