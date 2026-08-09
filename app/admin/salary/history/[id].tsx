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
  Share,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { printToLocalPdfFile } from '@/lib/persistExpoPrintPdf';
import * as Sharing from 'expo-sharing';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { formatDateShort } from '@/lib/date';
import { sendPdfToPrinterEmail } from '@/lib/printerEmail';

const MONTH_NAMES = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

type PaymentRow = {
  id: string;
  period_month: number;
  period_year: number;
  amount: number;
  payment_date: string;
  payment_time: string | null;
  payment_type: string;
  bank_or_reference: string | null;
  description: string | null;
  status: string;
  staff_approved_at: string | null;
  staff_rejected_at: string | null;
  rejection_reason: string | null;
  created_at: string;
};

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + ' ₺';
}

function formatTime(t: string | null): string {
  if (!t) return '—';
  const parts = String(t).split(':');
  return `${parts[0]}:${parts[1]}`;
}

export default function AdminSalaryHistoryScreen() {
  const router = useRouter();
  const { id: staffId } = useLocalSearchParams<{ id: string }>();
  const [staffName, setStaffName] = useState<string>('');
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [mailSending, setMailSending] = useState(false);

  const load = useCallback(async () => {
    if (!staffId) return;
    const { data: staff } = await supabase.from('staff').select('full_name').eq('id', staffId).single();
    setStaffName((staff?.full_name as string) ?? 'Personel');

    const { data } = await supabase
      .from('salary_payments')
      .select('id, period_month, period_year, amount, payment_date, payment_time, payment_type, bank_or_reference, description, status, staff_approved_at, staff_rejected_at, rejection_reason, created_at')
      .eq('staff_id', staffId)
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false });
    setPayments((data ?? []) as PaymentRow[]);
    setLoading(false);
  }, [staffId]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const deletePayment = (p: PaymentRow) => {
    Alert.alert('Maaş kaydını sil', `${MONTH_NAMES[p.period_month - 1]} ${p.period_year} - ${fmtMoney(Number(p.amount))} kaydı silinecek.`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          setActingId(p.id);
          const { error } = await supabase.from('salary_payments').delete().eq('id', p.id);
          setActingId(null);
          if (error) Alert.alert('Hata', error.message);
          else load();
        },
      },
    ]);
  };

  const summaryTotal = payments.slice(0, 6).reduce((s, p) => s + Number(p.amount), 0);
  const avgAmount = payments.length > 0 ? payments.reduce((s, p) => s + Number(p.amount), 0) / payments.length : 0;

  const exportCsv = useCallback(() => {
    const lines = ['Dönem,Tarih,Saat,Tutar,Tür,Durum,Personel Onay'];
    for (const p of payments) {
      const period = `${MONTH_NAMES[p.period_month - 1]} ${p.period_year}`;
      const statusTr = p.status === 'approved' ? 'Onaylandı' : p.status === 'rejected' ? 'Reddedildi' : 'Onay bekliyor';
      const approvedAt = p.staff_approved_at ? formatDateShort(p.staff_approved_at) : (p.staff_rejected_at ? formatDateShort(p.staff_rejected_at) : '—');
      lines.push(`"${period}","${p.payment_date}","${formatTime(p.payment_time)}",${p.amount},"${p.payment_type}","${statusTr}","${approvedAt}"`);
    }
    const csv = '\uFEFF' + lines.join('\n');
    if (Platform.OS === 'web') {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `maas-gecmisi-${staffName.replace(/\s/g, '-')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      Share.share({ message: csv, title: 'Maaş geçmişi (CSV)' }).catch(() => {});
    }
  }, [payments, staffName]);

  const exportPdf = useCallback(async (mode: 'share' | 'mail' = 'share') => {
    const html = `
      <!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body{font-family:sans-serif;padding:20px;color:#333}
      h1{font-size:18px} table{width:100%;border-collapse:collapse;font-size:11px}
      th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
      th{background:#f5f5f5}
      </style></head><body>
      <h1>${staffName} - Maaş Geçmişi</h1>
      <p>Rapor tarihi: ${formatDateShort(new Date())}</p>
      <table><tr><th>Dönem</th><th>Tarih</th><th>Saat</th><th>Tutar</th><th>Durum</th></tr>
      ${payments
        .map((p) => `<tr><td>${MONTH_NAMES[p.period_month - 1]} ${p.period_year}</td><td>${formatDateShort(p.payment_date)}</td><td>${formatTime(p.payment_time)}</td><td>${fmtMoney(Number(p.amount))}</td><td>${p.status === 'approved' ? 'Onaylandı' : p.status === 'rejected' ? 'Reddedildi' : 'Onay bekliyor'}</td></tr>`)
        .join('')}
      </table></body></html>`;
    const { uri } = await printToLocalPdfFile({ html });
    if (mode === 'mail') {
      await sendPdfToPrinterEmail({
        pdfUri: uri,
        subject: `Maaş Geçmişi - ${staffName}`,
        fileName: `maas-gecmisi-${String(staffId ?? 'personel')}.pdf`,
      });
      return;
    }
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Maaş geçmişi (PDF)' });
  }, [payments, staffId, staffName]);

  const statusIcon = (s: string) => (s === 'approved' ? 'checkmark-circle' : s === 'rejected' ? 'close-circle' : 'time');
  const statusColor = (s: string) => (s === 'approved' ? adminTheme.colors.success : s === 'rejected' ? adminTheme.colors.error : adminTheme.colors.warning);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={adminTheme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>{staffName} – Maaş geçmişi</Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Özet</Text>
          <Text style={styles.summaryRow}>Son 6 ay toplam: {fmtMoney(summaryTotal)}</Text>
          <Text style={styles.summaryRow}>Ortalama maaş: {fmtMoney(avgAmount)}</Text>
        </View>

        <View style={styles.exportRow}>
          <TouchableOpacity style={styles.exportBtn} onPress={exportCsv}>
            <Ionicons name="download-outline" size={18} color={adminTheme.colors.accent} />
            <Text style={styles.exportBtnText}>Excel/CSV indir</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.exportBtn} onPress={() => exportPdf()}>
            <Ionicons name="document-text-outline" size={18} color={adminTheme.colors.accent} />
            <Text style={styles.exportBtnText}>PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.exportBtn}
            onPress={async () => {
              setMailSending(true);
              try {
                await exportPdf('mail');
              } finally {
                setMailSending(false);
              }
            }}
            disabled={mailSending}
          >
            {mailSending ? <ActivityIndicator size="small" color={adminTheme.colors.accent} /> : <Ionicons name="mail-outline" size={18} color={adminTheme.colors.accent} />}
            <Text style={styles.exportBtnText}>Yazıcı Mail</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Ödeme geçmişi</Text>
        {loading ? (
          <ActivityIndicator size="large" color={adminTheme.colors.accent} style={styles.loader} />
        ) : (
          <View style={styles.list}>
            {payments.map((p) => (
              <View key={p.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardPeriod}>{MONTH_NAMES[p.period_month - 1]} {p.period_year} – {fmtMoney(Number(p.amount))}</Text>
                  <View style={styles.statusBadge}>
                    <Ionicons name={statusIcon(p.status) as any} size={18} color={statusColor(p.status)} />
                    <Text style={[styles.statusText, { color: statusColor(p.status) }]}>
                      {p.status === 'approved' ? 'Onaylandı' : p.status === 'rejected' ? 'Reddedildi' : 'Onay bekliyor'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.cardRow}>Ödeme tarihi: {formatDateShort(p.payment_date)} {formatTime(p.payment_time)}</Text>
                {p.staff_approved_at && <Text style={styles.cardRow}>Personel onayı: {formatDateShort(p.staff_approved_at)} ✅</Text>}
                {p.staff_rejected_at && <Text style={styles.cardRow}>Personel red: {formatDateShort(p.staff_rejected_at)} {p.rejection_reason ? `– ${p.rejection_reason}` : ''}</Text>}
                <Text style={styles.cardRow}>Ödeme türü: {p.payment_type === 'transfer' ? 'Havale/EFT' : p.payment_type === 'cash' ? 'Nakit' : 'Kredi kartı'}{p.bank_or_reference ? ` (${p.bank_or_reference})` : ''}</Text>
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={styles.smallBtn}
                    onPress={() => router.push({ pathname: '/admin/salary/edit/[paymentId]', params: { paymentId: p.id } })}
                    disabled={!!actingId}
                  >
                    <Ionicons name="create-outline" size={16} color={adminTheme.colors.accent} />
                    <Text style={styles.smallBtnText}>Düzenle</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.smallBtn, styles.deleteBtn]} onPress={() => deletePayment(p)} disabled={!!actingId}>
                    <Ionicons name="trash-outline" size={16} color={adminTheme.colors.error} />
                    <Text style={[styles.smallBtnText, { color: adminTheme.colors.error }]}>Sil</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
        {!loading && payments.length === 0 && (
          <Text style={styles.empty}>Bu personel için henüz maaş kaydı yok.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  backBtn: { padding: 8, marginRight: 8 },
  title: { fontSize: 18, fontWeight: '700', color: adminTheme.colors.text, flex: 1 },
  summaryCard: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: adminTheme.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    marginBottom: 16,
  },
  summaryTitle: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.text, marginBottom: 8 },
  summaryRow: { fontSize: 14, color: adminTheme.colors.textSecondary, marginBottom: 4 },
  exportRow: { flexDirection: 'row', marginBottom: 16 },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 14 },
  exportBtnText: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.accent },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.text, marginBottom: 12 },
  list: { gap: 12 },
  card: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: adminTheme.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  cardPeriod: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text, flex: 1 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusText: { fontSize: 12, fontWeight: '600' },
  cardRow: { fontSize: 13, color: adminTheme.colors.textSecondary, marginBottom: 4 },
  cardActions: { flexDirection: 'row', gap: 16, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: adminTheme.colors.borderLight },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  deleteBtn: {},
  smallBtnText: { fontSize: 13, color: adminTheme.colors.accent, fontWeight: '600' },
  loader: { marginVertical: 24 },
  empty: { fontSize: 14, color: adminTheme.colors.textMuted, textAlign: 'center', marginTop: 24 },
});
