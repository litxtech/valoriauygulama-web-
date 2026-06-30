import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { FinanceCheckCard, FinanceCheckSummaryStrip } from '@/components/financeChecks/FinanceCheckCard';
import { CHECK_DIR_META } from '@/lib/financeCheckTheme';
import {
  CHECK_DIRECTION_LABELS,
  CHECK_STATUS_LABELS,
  type FinanceCheckDirection,
  type FinanceCheckStatus,
} from '@/lib/finance';
import { daysUntilDue } from '@/lib/financeCheckTheme';

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

type DirFilter = 'all' | FinanceCheckDirection;

export default function AdminFinanceChecksIndex() {
  const router = useRouter();
  const me = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dirFilter, setDirFilter] = useState<DirFilter>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | FinanceCheckStatus>('all');
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);

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
    if (error) setRows([]);
    else setRows((data as Row[]) ?? []);
    setLoading(false);
  }, [orgFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const setCheckStatus = useCallback(
    async (checkId: string, next: FinanceCheckStatus) => {
      if (!me?.id) return;
      setStatusSavingId(checkId);
      const { error } = await supabase
        .from('finance_checks')
        .update({ status: next, updated_by_staff_id: me.id })
        .eq('id', checkId);
      setStatusSavingId(null);
      if (error) {
        Alert.alert('Durum', error.message);
        return;
      }
      setRows((prev) => prev.map((r) => (r.id === checkId ? { ...r, status: next } : r)));
    },
    [me?.id],
  );

  const openRows = useMemo(
    () => rows.filter((r) => r.status !== 'paid' && r.status !== 'cancelled'),
    [rows]
  );

  const summary = useMemo(() => {
    let givenTotal = 0;
    let givenCount = 0;
    let receivedTotal = 0;
    let receivedCount = 0;
    let upcomingCount = 0;
    let overdueCount = 0;
    for (const r of openRows) {
      const amt = Number(r.amount);
      if (r.direction === 'given') {
        givenTotal += amt;
        givenCount += 1;
      } else {
        receivedTotal += amt;
        receivedCount += 1;
      }
      const days = daysUntilDue(r.due_date);
      if (days === null) continue;
      if (days < 0) overdueCount += 1;
      else if (days <= 7) upcomingCount += 1;
    }
    return { givenTotal, givenCount, receivedTotal, receivedCount, upcomingCount, overdueCount };
  }, [openRows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (dirFilter !== 'all') list = list.filter((r) => r.direction === dirFilter);
    if (statusFilter !== 'all') list = list.filter((r) => r.status === statusFilter);
    return list;
  }, [rows, dirFilter, statusFilter]);

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

        <FinanceCheckSummaryStrip {...summary} />

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.newBtn}
            onPress={() => router.push('/admin/finance-checks/new')}
            activeOpacity={0.9}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.newBtnText}>Yeni çek</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.notifyBtn}
            onPress={() => router.push('/admin/finance-checks/settings')}
            activeOpacity={0.9}
          >
            <Ionicons name="notifications-outline" size={20} color={adminTheme.colors.accent} />
            <Text style={styles.notifyBtnText}>Bildirim</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.dirTabs}>
          {(
            [
              { key: 'all' as const, label: 'Tümü', icon: 'layers-outline' as const },
              { key: 'received' as const, label: CHECK_DIRECTION_LABELS.received, icon: CHECK_DIR_META.received.icon },
              { key: 'given' as const, label: CHECK_DIRECTION_LABELS.given, icon: CHECK_DIR_META.given.icon },
            ] as const
          ).map((tab) => {
            const active = dirFilter === tab.key;
            const meta = tab.key === 'all' ? null : CHECK_DIR_META[tab.key];
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setDirFilter(tab.key)}
                style={[
                  styles.dirTab,
                  active && styles.dirTabOn,
                  active && meta ? { borderColor: meta.color, backgroundColor: meta.bg } : null,
                ]}
              >
                <Ionicons
                  name={tab.icon}
                  size={16}
                  color={active ? (meta?.color ?? adminTheme.colors.primary) : adminTheme.colors.textMuted}
                />
                <Text
                  style={[
                    styles.dirTabText,
                    active && styles.dirTabTextOn,
                    active && meta ? { color: meta.color } : null,
                  ]}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.filterLabel}>Durum</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusChips}>
          <TouchableOpacity
            onPress={() => setStatusFilter('all')}
            style={[styles.stChip, statusFilter === 'all' && styles.stChipOn]}
          >
            <Text style={[styles.stChipText, statusFilter === 'all' && styles.stChipTextOn]}>Tümü</Text>
          </TouchableOpacity>
          {(['draft', 'registered', 'presented', 'partial', 'paid', 'bounced', 'cancelled'] as FinanceCheckStatus[]).map(
            (st) => (
              <TouchableOpacity
                key={st}
                onPress={() => setStatusFilter(st)}
                style={[styles.stChip, statusFilter === st && styles.stChipOn]}
              >
                <Text style={[styles.stChipText, statusFilter === st && styles.stChipTextOn]} numberOfLines={1}>
                  {CHECK_STATUS_LABELS[st]}
                </Text>
              </TouchableOpacity>
            )
          )}
        </ScrollView>

        <Text style={styles.listTitle}>
          {filtered.length} kayıt
          {dirFilter !== 'all' ? ` · ${CHECK_DIRECTION_LABELS[dirFilter]}` : ''}
        </Text>

        {filtered.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="document-text-outline" size={40} color={adminTheme.colors.textMuted} />
            <Text style={styles.empty}>Henüz çek kaydı yok.</Text>
            <TouchableOpacity onPress={() => router.push('/admin/finance-checks/new')}>
              <Text style={styles.emptyLink}>İlk çeki ekle →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          filtered.map((r) => (
            <FinanceCheckCard
              key={r.id}
              id={r.id}
              direction={r.direction}
              counterpartyName={r.counterparty_name}
              amount={Number(r.amount)}
              status={r.status}
              dueDate={r.due_date}
              onPress={() =>
                router.push({ pathname: '/admin/finance-checks/[id]', params: { id: r.id } } as never)
              }
              onStatusChange={(next) => void setCheckStatus(r.id, next)}
              statusSaving={statusSavingId === r.id}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const T = adminTheme;
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  newBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: T.colors.primary,
    paddingVertical: 13,
    borderRadius: 12,
  },
  newBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  notifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: T.colors.surface,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  notifyBtnText: { color: T.colors.accent, fontSize: 14, fontWeight: '700' },
  dirTabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  dirTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: T.colors.surface,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  dirTabOn: { borderColor: T.colors.primary, backgroundColor: T.colors.surfaceTertiary },
  dirTabText: { fontSize: 11, fontWeight: '600', color: T.colors.textMuted, flexShrink: 1 },
  dirTabTextOn: { color: T.colors.primary, fontWeight: '800' },
  filterLabel: { fontSize: 12, fontWeight: '700', color: T.colors.textSecondary, marginBottom: 8 },
  statusChips: { flexDirection: 'row', gap: 8, paddingBottom: 4, marginBottom: 10 },
  stChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: T.colors.surface,
    borderWidth: 1,
    borderColor: T.colors.border,
    maxWidth: 160,
  },
  stChipOn: { backgroundColor: T.colors.primary, borderColor: T.colors.primary },
  stChipText: { fontSize: 12, color: T.colors.textSecondary, fontWeight: '600' },
  stChipTextOn: { color: '#fff' },
  listTitle: { fontSize: 13, fontWeight: '700', color: T.colors.textMuted, marginBottom: 10 },
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  empty: { textAlign: 'center', color: T.colors.textMuted, fontSize: 15 },
  emptyLink: { color: T.colors.info, fontWeight: '700', fontSize: 14 },
});
