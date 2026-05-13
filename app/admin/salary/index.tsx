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
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard, AdminOrganizationPicker } from '@/components/admin';
import { formatDateShort } from '@/lib/date';
import { sendNotification } from '@/lib/notificationService';
import { useAdminOrgStore } from '@/stores/adminOrgStore';

const MONTH_NAMES = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

type StaffRow = {
  id: string;
  full_name: string | null;
  department: string | null;
};

type PaymentRow = {
  id: string;
  staff_id: string;
  period_month: number;
  period_year: number;
  created_at: string;
  amount: number;
  payment_date: string;
  status: string;
  staff_approved_at: string | null;
  staff_rejected_at: string | null;
  rejection_reason: string | null;
};

type StaffWithSalary = StaffRow & {
  lastPayment: PaymentRow | null;
  lastPaymentLabel: string;
  statusLabel: string;
};

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + ' ₺';
}

export default function AdminSalaryIndexScreen() {
  const router = useRouter();
  const { staff: me } = useAuthStore();
  const { selectedOrganizationId } = useAdminOrgStore();
  const [staffList, setStaffList] = useState<StaffWithSalary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    totalStaff: 0,
    totalSalary: 0,
    paidAmount: 0,
    paidCount: 0,
    pendingApprovalAmount: 0,
    pendingApprovalCount: 0,
  });
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const canUseAllOrganizations = me?.app_permissions?.super_admin === true || me?.role === 'admin';

  const load = useCallback(async () => {
    const orgId = canUseAllOrganizations ? selectedOrganizationId : me?.organization_id;
    let staffQuery = supabase
      .from('staff')
      .select('id, full_name, department, organization_id')
      .eq('is_active', true)
      .order('full_name');
    if (orgId && orgId !== 'all') staffQuery = staffQuery.eq('organization_id', orgId);
    const { data: staffData } = await staffQuery;
    const staff = (staffData ?? []) as StaffRow[];
    if (staff.length === 0) {
      setStaffList([]);
      setSummary({ totalStaff: 0, totalSalary: 0, paidAmount: 0, paidCount: 0, pendingApprovalAmount: 0, pendingApprovalCount: 0 });
      setLoading(false);
      return;
    }

    let paymentsQuery = supabase
      .from('salary_payments')
      .select('id, staff_id, period_month, period_year, created_at, amount, payment_date, status, staff_approved_at, staff_rejected_at, rejection_reason')
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })
      .order('created_at', { ascending: false });
    if (orgId && orgId !== 'all') paymentsQuery = paymentsQuery.eq('organization_id', orgId);
    const { data: paymentsData } = await paymentsQuery;

    const payments = (paymentsData ?? []) as PaymentRow[];
    const now = new Date();
    const thisYear = now.getFullYear();
    const thisMonth = now.getMonth() + 1;

    const byStaff = new Map<string, PaymentRow[]>();
    for (const p of payments) {
      const list = byStaff.get(p.staff_id) ?? [];
      list.push(p);
      byStaff.set(p.staff_id, list);
    }

    let totalSalary = 0;
    let paidAmount = 0;
    let paidCount = 0;
    let pendingApprovalAmount = 0;
    let pendingApprovalCount = 0;

    const rows: StaffWithSalary[] = staff.map((s) => {
      const list = byStaff.get(s.id) ?? [];
      const lastPayment = list[0] ?? null;
      const lastApproved = list.find((p) => p.status === 'approved');
      const lastPending = list.find((p) => p.status === 'pending_approval');
      const amount = lastPayment ? Number(lastPayment.amount) : 0;
      totalSalary += amount;

      let lastPaymentLabel = '—';
      let statusLabel = `${MONTH_NAMES[thisMonth - 1]} ödemesi YAPILMADI`;
      if (lastPayment) {
        lastPaymentLabel = `${formatDateShort(lastPayment.payment_date)} (${lastPayment.status === 'approved' ? 'Ödendi' : lastPayment.status === 'rejected' ? 'Reddedildi' : 'Ödendi'})`;
        if (lastPayment.period_year === thisYear && lastPayment.period_month === thisMonth) {
          if (lastPayment.status === 'approved') {
            statusLabel = `Onaylandı (${lastPayment.staff_approved_at ? formatDateShort(lastPayment.staff_approved_at) : '—'})`;
            paidAmount += Number(lastPayment.amount);
            paidCount += 1;
          } else if (lastPayment.status === 'pending_approval') {
            statusLabel = 'Onay Bekliyor (Personel onaylamadı)';
            pendingApprovalAmount += Number(lastPayment.amount);
            pendingApprovalCount += 1;
          } else {
            statusLabel = 'Reddedildi';
          }
        } else {
          statusLabel = `${MONTH_NAMES[lastPayment.period_month - 1]} ${lastPayment.period_year} ödemesi yapıldı`;
          if (lastPayment.status === 'approved') {
            paidAmount += Number(lastPayment.amount);
            paidCount += 1;
          }
        }
      } else {
        const expected = list.find((p) => p.period_year === thisYear && p.period_month === thisMonth);
        if (expected && expected.status === 'pending_approval') {
          statusLabel = 'Onay Bekliyor';
          pendingApprovalAmount += Number(expected.amount);
          pendingApprovalCount += 1;
        }
      }

      return {
        ...s,
        lastPayment,
        lastPaymentLabel,
        statusLabel,
      };
    });

    setStaffList(rows);
    setSummary({
      totalStaff: staff.length,
      totalSalary,
      paidAmount,
      paidCount,
      pendingApprovalAmount,
      pendingApprovalCount,
    });
    setLoading(false);
  }, [canUseAllOrganizations, me?.organization_id, selectedOrganizationId]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const statusIcon = (row: StaffWithSalary) => {
    if (!row.lastPayment) return 'alert-circle-outline';
    if (row.lastPayment.status === 'approved') return 'checkmark-circle';
    if (row.lastPayment.status === 'rejected') return 'close-circle';
    return 'time-outline';
  };

  const statusColor = (row: StaffWithSalary) => {
    if (!row.lastPayment) return adminTheme.colors.warning;
    if (row.lastPayment.status === 'approved') return adminTheme.colors.success;
    if (row.lastPayment.status === 'rejected') return adminTheme.colors.error;
    return adminTheme.colors.warning;
  };

  const needsReminder = (row: StaffWithSalary) => {
    const now = new Date();
    const thisYear = now.getFullYear();
    const thisMonth = now.getMonth() + 1;
    if (!row.lastPayment) return true;
    return !(row.lastPayment.period_year === thisYear && row.lastPayment.period_month === thisMonth);
  };

  const sendReminder = async (row: StaffWithSalary) => {
    setRemindingId(row.id);
    await sendNotification({
      staffId: row.id,
      title: 'Maaş hatırlatması',
      body: 'Maaş ödemeniz yakında yapılacak. Lütfen banka bilgilerinizi kontrol edin.',
      notificationType: 'salary_reminder',
      category: 'staff',
      data: { type: 'salary_reminder' },
    });
    setRemindingId(null);
    Alert.alert('Gönderildi', 'Personel bilgilendirildi.');
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <AdminOrganizationPicker
          canUseAll={canUseAllOrganizations}
          ownOrganizationId={me?.organization_id}
        />
        <AdminCard>
          <Text style={styles.summaryTitle}>Toplu özet</Text>
          <Text style={styles.summaryRow}>Toplam personel: {summary.totalStaff} kişi</Text>
          <Text style={styles.summaryRow}>Toplam maaş: {fmtMoney(summary.totalSalary)}</Text>
          <Text style={styles.summaryRow}>Ödenen: {fmtMoney(summary.paidAmount)} ({summary.paidCount} kişi)</Text>
          <Text style={styles.summaryRow}>Onay bekleyen: {fmtMoney(summary.pendingApprovalAmount)} ({summary.pendingApprovalCount} kişi)</Text>
        </AdminCard>

        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/admin/salary/new')} activeOpacity={0.8}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.primaryBtnText}>Yeni maaş kaydı</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Personel maaşları</Text>
        {loading ? (
          <ActivityIndicator size="large" color={adminTheme.colors.accent} style={styles.loader} />
        ) : (
          <View style={styles.cardList}>
            {staffList.map((row) => (
              <View key={row.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardName}>{row.full_name ?? '—'} ({row.department ?? '—'})</Text>
                  <Text style={styles.cardAmount}>{row.lastPayment ? fmtMoney(Number(row.lastPayment.amount)) : '—'}</Text>
                </View>
                <Text style={styles.cardRow}>Son ödeme: {row.lastPaymentLabel}</Text>
                <View style={styles.statusRow}>
                  <Ionicons name={statusIcon(row) as any} size={18} color={statusColor(row)} />
                  <Text style={[styles.statusText, { color: statusColor(row) }]}>{row.statusLabel}</Text>
                </View>
                <View style={styles.cardActions}>
                  <TouchableOpacity style={styles.smallBtn} onPress={() => router.push({ pathname: '/admin/salary/history/[id]', params: { id: row.id } })}>
                    <Ionicons name="create-outline" size={16} color={adminTheme.colors.accent} />
                    <Text style={styles.smallBtnText}>Düzenle</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.smallBtn} onPress={() => router.push({ pathname: '/admin/salary/new', params: { staffId: row.id } })}>
                    <Ionicons name="cash-outline" size={16} color={adminTheme.colors.accent} />
                    <Text style={styles.smallBtnText}>Yeni ödeme</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.smallBtn} onPress={() => router.push({ pathname: '/admin/salary/history/[id]', params: { id: row.id } })}>
                    <Ionicons name="document-text-outline" size={16} color={adminTheme.colors.accent} />
                    <Text style={styles.smallBtnText}>Geçmiş</Text>
                  </TouchableOpacity>
                  {needsReminder(row) && (
                    <TouchableOpacity style={styles.smallBtn} onPress={() => sendReminder(row)} disabled={!!remindingId}>
                      <Ionicons name="notifications-outline" size={16} color={adminTheme.colors.warning} />
                      <Text style={[styles.smallBtnText, { color: adminTheme.colors.warning }]}>Hatırlat</Text>
                    </TouchableOpacity>
                  )}
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
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  summaryTitle: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.text, marginBottom: 8 },
  summaryRow: { fontSize: 14, color: adminTheme.colors.textSecondary, marginBottom: 4 },
  actionsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: adminTheme.colors.accent,
    borderRadius: adminTheme.radius.md,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.text, marginBottom: 12 },
  cardList: { gap: 12 },
  card: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: adminTheme.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardName: { fontSize: 15, fontWeight: '600', color: adminTheme.colors.text, flex: 1 },
  cardAmount: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  cardRow: { fontSize: 13, color: adminTheme.colors.textSecondary, marginBottom: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  statusText: { fontSize: 13, fontWeight: '500' },
  cardActions: { flexDirection: 'row', gap: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: adminTheme.colors.borderLight },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  smallBtnText: { fontSize: 13, color: adminTheme.colors.accent, fontWeight: '600' },
  loader: { marginVertical: 24 },
});
