import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import { ExpenseReceiptThumbnail } from '@/components/expenses/ExpenseReceiptThumbnail';
import { expenseReceiptPreviewModalStyle } from '@/lib/expenseReceiptPreviewStyles';
import { formatDateShort } from '@/lib/date';
import { useCachedFocusLoad } from '@/hooks/useCachedFocusLoad';

type ExpensesCache = {
  expenses: ExpenseRow[];
  summary: {
    thisMonth: number;
    lastMonth: number;
    pendingCount: number;
    pendingAmount: number;
  };
};

type CategoryRow = { id: string; name: string; icon: string | null };
type ExpenseRow = {
  id: string;
  amount: number;
  description: string | null;
  receipt_image_url: string | null;
  status: string;
  expense_date: string;
  rejection_reason: string | null;
  category: { name: string } | null;
};

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' ₺';
}

export default function StaffExpensesScreen() {
  const router = useRouter();
  const { staff } = useAuthStore();
  const [receiptModal, setReceiptModal] = useState<string | null>(null);

  const cacheKey = staff?.id ? `staff-expenses:${staff.id}` : 'staff-expenses:none';

  const fetchData = useCallback(async (): Promise<ExpensesCache | null> => {
    if (!staff?.id) return null;
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);

    const { data: list } = await supabase
      .from('staff_expenses')
      .select('id, amount, description, receipt_image_url, status, expense_date, rejection_reason, category:category_id(name)')
      .eq('staff_id', staff.id)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100);
    const rows = (list ?? []) as unknown as ExpenseRow[];

    const thisMonth = rows
      .filter((e) => e.expense_date >= thisMonthStart && e.status === 'approved')
      .reduce((s, e) => s + Number(e.amount), 0);
    const lastMonth = rows
      .filter((e) => e.expense_date >= lastMonthStart && e.expense_date <= lastMonthEnd && e.status === 'approved')
      .reduce((s, e) => s + Number(e.amount), 0);
    const pending = rows.filter((e) => e.status === 'pending');
    const pendingAmount = pending.reduce((s, e) => s + Number(e.amount), 0);

    return {
      expenses: rows,
      summary: {
        thisMonth,
        lastMonth,
        pendingCount: pending.length,
        pendingAmount,
      },
    };
  }, [staff?.id]);

  const { data, loading, refreshing, refresh, reload } = useCachedFocusLoad<ExpensesCache>({
    cacheKey,
    enabled: !!staff?.id,
    fetchData,
  });

  const expenses = data?.expenses ?? [];
  const summary = data?.summary ?? { thisMonth: 0, lastMonth: 0, pendingCount: 0, pendingAmount: 0 };

  useEffect(() => {
    if (!staff?.id) return;
    const channel = supabase
      .channel('staff-expenses-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_expenses', filter: `staff_id=eq.${staff.id}` }, () => {
        void reload({ silent: true });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [staff?.id, reload]);

  const onRefresh = useCallback(() => {
    refresh();
  }, [refresh]);

  const exportCsv = useCallback(() => {
    const headers = 'Tarih,Kategori,Açıklama,Tutar,Durum\n';
    const rows = expenses
      .map(
        (e) =>
          `${e.expense_date},"${(e.category?.name ?? '').replace(/"/g, '""')}","${(e.description ?? '').replace(/"/g, '""')}",${e.amount},${e.status === 'approved' ? 'Onaylandı' : e.status === 'rejected' ? 'Reddedildi' : 'Beklemede'}`
      )
      .join('\n');
    const csv = '\uFEFF' + headers + rows;
    if (Platform.OS === 'web') {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `harcamalarim-${formatDateShort(new Date()).replace(/\./g, '-')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      Alert.alert('Excel/CSV', 'Masaüstünde Excel ile açabilirsiniz. Web sürümünde indirme yapılır.');
    }
  }, [expenses]);

  const statusLabel = (s: string) => (s === 'approved' ? 'Onaylandı' : s === 'rejected' ? 'Reddedildi' : 'Onay bekliyor');
  const statusIcon = (s: string) => (s === 'approved' ? 'checkmark-circle' : s === 'rejected' ? 'close-circle' : 'time');

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Özet</Text>
          <Text style={styles.summaryRow}>Bu Ay Toplam: {fmtMoney(summary.thisMonth)}</Text>
          <Text style={styles.summaryRow}>Geçen Ay: {fmtMoney(summary.lastMonth)}</Text>
          {summary.pendingCount > 0 && (
            <Text style={styles.summaryPending}>
              Onay Bekleyen: {fmtMoney(summary.pendingAmount)} ({summary.pendingCount} harcama)
            </Text>
          )}
        </View>

        <TouchableOpacity style={styles.newBtn} onPress={() => router.push('/staff/expenses/new')} activeOpacity={0.8}>
          <Ionicons name="add-circle" size={24} color={theme.colors.white} />
          <Text style={styles.newBtnText}>Yeni Harcama Girişi</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.monthlyBtn} onPress={() => router.push('/staff/expenses/monthly')} activeOpacity={0.85}>
          <Ionicons name="calendar-outline" size={20} color={theme.colors.primary} />
          <Text style={styles.monthlyBtnText}>Aylık Geçmiş</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Harcamalarım</Text>
        {loading && expenses.length === 0 ? (
          <ActivityIndicator size="large" color={theme.colors.primary} style={styles.loader} />
        ) : expenses.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="wallet-outline" size={48} color={theme.colors.textMuted} />
            <Text style={styles.emptyText}>Henüz harcama kaydı yok</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/staff/expenses/new')} activeOpacity={0.8}>
              <Text style={styles.emptyBtnText}>İlk harcamayı gir</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.list}>
            {expenses.map((e) => (
              <View key={e.id} style={styles.card}>
                <View style={styles.cardRow}>
                  <Text style={styles.cardDate}>{formatDateShort(e.expense_date)}</Text>
                  <View style={styles.statusBadge}>
                    <Ionicons name={statusIcon(e.status) as any} size={14} color={e.status === 'approved' ? theme.colors.success : e.status === 'rejected' ? theme.colors.error : theme.colors.primary} />
                    <Text style={[styles.statusText, e.status === 'approved' && styles.statusApproved, e.status === 'rejected' && styles.statusRejected]}>{statusLabel(e.status)}</Text>
                  </View>
                </View>
                {e.status === 'rejected' && e.rejection_reason ? (
                  <Text style={styles.rejectionReason}>{e.rejection_reason}</Text>
                ) : null}
                <Text style={styles.cardCategory}>{e.category?.name ?? '—'}</Text>
                {e.description ? <Text style={styles.cardDesc} numberOfLines={2}>{e.description}</Text> : null}
                {e.receipt_image_url ? (
                  <ExpenseReceiptThumbnail
                    uri={e.receipt_image_url}
                    onPress={() => setReceiptModal(e.receipt_image_url)}
                    style={styles.receiptPreviewRow}
                  />
                ) : null}
                <View style={styles.cardFooter}>
                  <Text style={styles.cardAmount}>{fmtMoney(Number(e.amount))}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {expenses.length > 0 && (
          <View style={styles.exportRow}>
            <TouchableOpacity style={styles.exportBtn} onPress={exportCsv} activeOpacity={0.8}>
              <Ionicons name="download-outline" size={20} color={theme.colors.primary} />
              <Text style={styles.exportBtnText}>Excel (CSV) indir</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <Modal visible={!!receiptModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setReceiptModal(null)}>
          <View style={styles.modalContent}>
            {receiptModal ? (
              <CachedImage uri={receiptModal} style={expenseReceiptPreviewModalStyle} contentFit="contain" />
            ) : null}
            <TouchableOpacity style={styles.modalClose} onPress={() => setReceiptModal(null)}>
              <Text style={styles.modalCloseText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  summaryCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  summaryTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text, marginBottom: 8 },
  summaryRow: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 4 },
  summaryPending: { fontSize: 14, color: theme.colors.primary, marginTop: 4, fontWeight: '600' },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    marginBottom: 20,
    gap: 8,
  },
  newBtnText: { color: theme.colors.white, fontSize: 16, fontWeight: '700' },
  monthlyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
    marginBottom: 20,
  },
  monthlyBtnText: { color: theme.colors.primary, fontSize: 15, fontWeight: '700' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 12 },
  loader: { marginVertical: 24 },
  empty: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { fontSize: 15, color: theme.colors.textMuted, marginTop: 8 },
  emptyBtn: { marginTop: 16, paddingVertical: 10, paddingHorizontal: 20, backgroundColor: theme.colors.primary, borderRadius: theme.radius.sm },
  emptyBtnText: { color: theme.colors.white, fontWeight: '600' },
  list: { gap: 12 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardDate: { fontSize: 13, color: theme.colors.textMuted },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusText: { fontSize: 12, color: theme.colors.primary },
  statusApproved: { color: theme.colors.success },
  statusRejected: { color: theme.colors.error },
  rejectionReason: { fontSize: 12, color: theme.colors.error, marginTop: 4, fontStyle: 'italic' },
  cardCategory: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  cardDesc: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 4 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.colors.borderLight },
  cardAmount: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  receiptPreviewRow: { marginTop: 10, alignSelf: 'flex-start' },
  exportRow: { marginTop: 20, flexDirection: 'row', justifyContent: 'center' },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 16 },
  exportBtnText: { fontSize: 14, color: theme.colors.primary, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', maxWidth: 340, alignItems: 'center' },
  modalClose: { marginTop: 16, paddingVertical: 10, paddingHorizontal: 24, backgroundColor: theme.colors.surface, borderRadius: 8 },
  modalCloseText: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
});
