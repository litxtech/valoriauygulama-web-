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
  DEBT_CATEGORY_LABELS,
  DEBT_STATUS_LABELS,
  type DebtCategory,
  type DebtStatus,
} from '@/lib/finance';
import { formatDateShort } from '@/lib/date';

type Row = {
  id: string;
  organization_id: string;
  category: DebtCategory;
  borrower_staff_id: string | null;
  borrower_is_organization: boolean;
  lender_staff_id: string | null;
  lender_is_organization: boolean;
  description: string;
  amount_principal: number;
  amount_remaining: number;
  status: DebtStatus;
  due_date: string | null;
  created_at: string;
  borrower?: { full_name: string | null } | null;
  lender?: { full_name: string | null } | null;
};

function partyBorrow(r: Row): string {
  if (r.borrower_is_organization) return 'Şirket / Otel';
  return r.borrower?.full_name?.trim() || 'Personel';
}

function partyLend(r: Row): string {
  if (r.lender_is_organization) return 'Şirket / Otel';
  return r.lender?.full_name?.trim() || 'Personel';
}

export default function AdminDebtsIndex() {
  const router = useRouter();
  const me = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const orgFilter = useMemo(() => {
    if (me?.app_permissions?.super_admin === true || me?.role === 'admin') {
      return selectedOrganizationId;
    }
    return me?.organization_id ?? 'all';
  }, [me, selectedOrganizationId]);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('staff_debt_entries')
      .select(
        `
        id,
        organization_id,
        category,
        borrower_staff_id,
        borrower_is_organization,
        lender_staff_id,
        lender_is_organization,
        description,
        amount_principal,
        amount_remaining,
        status,
        due_date,
        created_at,
        borrower:borrower_staff_id(full_name),
        lender:lender_staff_id(full_name)
      `
      )
      .order('created_at', { ascending: false });
    if (orgFilter && orgFilter !== 'all') q = q.eq('organization_id', orgFilter);
    const { data, error } = await q;
    if (error) {
      setRows([]);
      setLoading(false);
      return;
    }
    setRows((((data ?? []) as unknown) as Row[]) ?? []);
    setLoading(false);
  }, [orgFilter]);

  useEffect(() => {
    load();
  }, [load]);

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
        <TouchableOpacity style={styles.newBtn} onPress={() => router.push('/admin/debts/new')} activeOpacity={0.9}>
          <Ionicons name="add-circle-outline" size={22} color="#fff" />
          <Text style={styles.newBtnText}>Yeni borç / alacak</Text>
        </TouchableOpacity>

        {rows.length === 0 ? (
          <Text style={styles.empty}>Kayıt yok.</Text>
        ) : (
          rows.map((r) => (
            <TouchableOpacity
              key={r.id}
              onPress={() => router.push({ pathname: '/admin/debts/[id]', params: { id: r.id } } as never)}
              activeOpacity={0.85}
            >
              <AdminCard style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.cat}>{DEBT_CATEGORY_LABELS[r.category]}</Text>
                  <Text style={styles.st}>{DEBT_STATUS_LABELS[r.status]}</Text>
                </View>
                <Text style={styles.parties}>
                  Borçlu: {partyBorrow(r)} · Alacaklı: {partyLend(r)}
                </Text>
                <Text style={styles.desc} numberOfLines={2}>
                  {r.description?.trim() || '—'}
                </Text>
                <View style={styles.row}>
                  <Text style={styles.amt}>{fmtMoneyTry(Number(r.amount_remaining))} kalan</Text>
                  <Text style={styles.meta}>{formatDateShort(r.created_at)}</Text>
                </View>
                {r.due_date ? <Text style={styles.due}>Vade: {formatDateShort(r.due_date)}</Text> : null}
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
  empty: { textAlign: 'center', color: adminTheme.colors.textMuted, marginTop: 24 },
  card: { marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cat: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.info },
  st: { fontSize: 12, color: adminTheme.colors.textMuted },
  parties: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.text, marginTop: 6 },
  desc: { fontSize: 13, color: adminTheme.colors.textSecondary, marginTop: 4 },
  amt: { fontSize: 16, fontWeight: '800', color: adminTheme.colors.text, marginTop: 8 },
  meta: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 8 },
  due: { fontSize: 12, color: adminTheme.colors.warning, marginTop: 4 },
});
