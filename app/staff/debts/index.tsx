import { useState, useCallback, useEffect } from 'react';
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
import { theme } from '@/constants/theme';
import {
  fmtMoneyTry,
  DEBT_CATEGORY_LABELS,
  DEBT_STATUS_LABELS,
  type DebtCategory,
  type DebtStatus,
} from '@/lib/finance';
import { formatDateShort } from '@/lib/date';
import { useTranslation } from 'react-i18next';

type Row = {
  id: string;
  category: DebtCategory;
  borrower_staff_id: string | null;
  borrower_is_organization: boolean;
  lender_staff_id: string | null;
  lender_is_organization: boolean;
  description: string;
  amount_remaining: number;
  status: DebtStatus;
  created_at: string;
  borrower?: { full_name: string | null } | null;
  lender?: { full_name: string | null } | null;
};

export default function StaffDebtsIndex() {
  const { t } = useTranslation();
  const router = useRouter();
  const me = useAuthStore((s) => s.staff);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!me?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('staff_debt_entries')
      .select(
        `
        id,
        category,
        borrower_staff_id,
        borrower_is_organization,
        lender_staff_id,
        lender_is_organization,
        description,
        amount_remaining,
        status,
        created_at,
        borrower:borrower_staff_id(full_name),
        lender:lender_staff_id(full_name)
      `
      )
      .or(`borrower_staff_id.eq.${me.id},lender_staff_id.eq.${me.id}`)
      .order('created_at', { ascending: false });
    if (error) setRows([]);
    else setRows((((data ?? []) as unknown) as Row[]) ?? []);
    setLoading(false);
  }, [me?.id]);

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
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <TouchableOpacity style={styles.newBtn} onPress={() => router.push('/staff/debts/new')} activeOpacity={0.9}>
          <Ionicons name="add-circle-outline" size={22} color="#fff" />
          <Text style={styles.newBtnText}>Yeni borç / alacak</Text>
        </TouchableOpacity>

        {rows.length === 0 ? (
          <Text style={styles.empty}>Kayıt yok.</Text>
        ) : (
          rows.map((r) => (
            <TouchableOpacity
              key={r.id}
              style={styles.card}
              onPress={() => router.push({ pathname: '/staff/debts/[id]', params: { id: r.id } } as never)}
              activeOpacity={0.85}
            >
              <View style={styles.row}>
                <Text style={styles.cat}>{DEBT_CATEGORY_LABELS[r.category]}</Text>
                <Text style={styles.st}>{DEBT_STATUS_LABELS[r.status]}</Text>
              </View>
              <Text style={styles.parties} numberOfLines={2}>
                {r.borrower_is_organization ? t('staffDebtsCompanyShort') : r.borrower?.full_name || '—'} →{' '}
                {t('staffDebtsBorrowerDebtor')} ·{' '}
                {r.lender_is_organization ? t('staffDebtsCompanyShort') : r.lender?.full_name || '—'} →{' '}
                {t('staffDebtsLenderCreditor')}
              </Text>
              <Text style={styles.desc} numberOfLines={2}>
                {r.description?.trim() || '—'}
              </Text>
              <Text style={styles.amt}>{fmtMoneyTry(Number(r.amount_remaining))} kalan</Text>
              <Text style={styles.meta}>{formatDateShort(r.created_at)}</Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  newBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  empty: { textAlign: 'center', color: theme.colors.textMuted, marginTop: 24 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  cat: { fontSize: 12, fontWeight: '700', color: theme.colors.primary },
  st: { fontSize: 12, color: theme.colors.textMuted },
  parties: { fontSize: 14, fontWeight: '600', color: theme.colors.text, marginTop: 6 },
  desc: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 4 },
  amt: { fontSize: 16, fontWeight: '800', color: theme.colors.text, marginTop: 8 },
  meta: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4 },
});
