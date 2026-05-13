import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Share,
  Alert,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Asset } from 'expo-asset';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard, AdminOrganizationPicker } from '@/components/admin';
import { formatDateShort } from '@/lib/date';
import { sendPdfToPrinterEmail } from '@/lib/printerEmail';
import { useAdminOrgStore } from '@/stores/adminOrgStore';

const MONTH_NAMES = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

type PaymentRow = {
  id: string;
  staff_id: string;
  period_month: number;
  period_year: number;
  amount: number;
  payment_date: string;
  payment_time: string | null;
  status: string;
  payment_type?: string | null;
  bank_or_reference?: string | null;
  description?: string | null;
  staff: { full_name: string | null; department: string | null } | null;
};

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' ₺';
}

function formatTimeOnly(t: string | null): string {
  if (!t) return '—';
  const parts = String(t).split(':');
  return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : t;
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Tümü' },
  { value: 'approved', label: 'Onaylı' },
  { value: 'pending_approval', label: 'Onay bekleyen' },
  { value: 'rejected', label: 'Reddedilen' },
];

function getDefaultDates(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export default function AdminSalaryAllScreen() {
  const { staff: me } = useAuthStore();
  const { selectedOrganizationId } = useAdminOrgStore();
  const canUseAllOrganizations = me?.app_permissions?.super_admin === true || me?.role === 'admin';
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateStart, setDateStart] = useState(getDefaultDates().start);
  const [dateEnd, setDateEnd] = useState(getDefaultDates().end);
  const [detailPayment, setDetailPayment] = useState<PaymentRow | null>(null);
  const [pdfExportingStaffId, setPdfExportingStaffId] = useState<string | null>(null);
  const [mailSendingKey, setMailSendingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const orgId = canUseAllOrganizations ? selectedOrganizationId : me?.organization_id;
    const start = dateStart || '2020-01-01';
    const end = dateEnd || '2030-12-31';

    let query = supabase
      .from('salary_payments')
      .select('id, staff_id, period_month, period_year, amount, payment_date, payment_time, status, payment_type, bank_or_reference, description, staff:staff_id(full_name, department)')
      .gte('payment_date', start)
      .lte('payment_date', end)
      .order('payment_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1000);

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }
    if (orgId && orgId !== 'all') {
      query = query.eq('organization_id', orgId);
    }

    const { data, error } = await query;
    if (error) {
      setPayments([]);
    } else {
      setPayments((data ?? []) as PaymentRow[]);
    }
    setLoading(false);
  }, [canUseAllOrganizations, dateStart, dateEnd, me?.organization_id, selectedOrganizationId, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel('salary-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'salary_payments' }, () => {
        load();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const totalAmount = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const approvedTotal = payments.filter((p) => p.status === 'approved').reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const statusIcon = (s: string) =>
    s === 'approved' ? 'checkmark-circle' : s === 'rejected' ? 'close-circle' : 'time';
  const statusColor = (s: string) =>
    s === 'approved' ? adminTheme.colors.success : s === 'rejected' ? adminTheme.colors.error : adminTheme.colors.warning;
  const statusLabel = (s: string) =>
    s === 'approved' ? 'Onaylı' : s === 'rejected' ? 'Reddedilen' : 'Onay bekleyen';

  const paymentTypeLabel = (t: string | null | undefined) =>
    t === 'transfer' ? 'Havale' : t === 'cash' ? 'Nakit' : t === 'credit_card' ? 'Kredi kartı' : '—';

  const periodLabel = (p: PaymentRow) => `${MONTH_NAMES[p.period_month - 1]} ${p.period_year}`;

  const exportSingleSalaryPdf = useCallback(
    async (p: PaymentRow, mode: 'share' | 'mail' = 'share') => {
      if (!p.staff_id) return;
      if (mode === 'mail') setMailSendingKey(`staff:${p.staff_id}`);
      else setPdfExportingStaffId(p.staff_id);
      try {
        const list = [p];

        let logoHtml = '';
        try {
          const asset = Asset.fromModule(require('@/assets/valoria-splash-logo.png'));
          await asset.downloadAsync();
          if (asset.localUri) logoHtml = `<img src="${asset.localUri}" style="height:32px;margin-bottom:4px;" alt="Valoria" />`;
        } catch {}
        const personName = list[0]?.staff?.full_name ?? '—';
        const personDept = list[0]?.staff?.department ?? '';
        const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,sans-serif;font-size:10px;color:#1e293b;padding:0;line-height:1.4}
.wrap{max-width:800px;margin:0 auto;padding:24px 20px}
.header{display:flex;align-items:center;justify-content:space-between;padding-bottom:16px;border-bottom:3px solid #0d9488;margin-bottom:20px}
.headerLeft{display:flex;align-items:center;gap:16px}
.brand{font-size:22px;font-weight:800;color:#0f172a}
.brandSub{font-size:11px;color:#64748b;margin-top:2px}
.reportTitle{font-size:16px;font-weight:700;color:#0d9488}
.reportSub{font-size:12px;color:#64748b;margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:10px}
th,td{border:1px solid #cbd5e1;padding:8px 10px;text-align:left}
th{background:#0d9488;color:#fff;font-weight:700}
td{background:#fff}
tr:nth-child(even) td{background:#f8fafc}
.colDate{width:95px}
.colTime{width:50px}
.colPeriod{width:90px}
.colAmount{width:80px;text-align:right;font-weight:600}
.colStatus{width:80px}
.totals{margin-top:20px;padding:14px 16px;background:#f1f5f9;border:1px solid #e2e8f0;font-weight:700;font-size:11px}
.footer{margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:9px;color:#94a3b8;text-align:center}
</style></head><body>
<div class="wrap">
<div class="header">
  <div class="headerLeft">${logoHtml ? `<div>${logoHtml}</div>` : ''}<div><div class="brand">VALORİA HOTEL</div><div class="brandSub">Konaklama & Hizmetler</div></div></div>
  <div><div class="reportTitle">Aldığınız Maaşlar</div><div class="reportSub">${personName.replace(/</g, '&lt;')}${personDept ? ` · ${String(personDept).replace(/</g, '&lt;')}` : ''}</div><div class="reportSub" style="margin-top:6px">Oluşturulma: ${formatDateShort(new Date())}</div></div>
</div>
<table>
<tr><th class="colDate">Ödeme Tarihi</th><th class="colTime">Saat</th><th class="colPeriod">Dönem</th><th class="colAmount">Tutar</th><th class="colStatus">Durum</th></tr>
${list
  .map(
    (x) =>
      `<tr><td class="colDate">${formatDateShort(x.payment_date)}</td><td class="colTime">${formatTimeOnly(x.payment_time)}</td><td class="colPeriod">${periodLabel(x)}</td><td class="colAmount">${fmtMoney(Number(x.amount))}</td><td class="colStatus">${statusLabel(x.status)}</td></tr>`
  )
  .join('')}
</table>
<div class="totals">Toplam: ${fmtMoney(list.reduce((s, x) => s + Number(x.amount), 0))} · Kayıt: ${list.length}</div>
<div class="footer">VALORİA HOTEL · Bu rapor otomatik oluşturulmuştur.</div>
</div>
</body></html>`;
        const { uri } = await Print.printToFileAsync({ html });
        if (mode === 'mail') {
          await sendPdfToPrinterEmail({
            pdfUri: uri,
            subject: `Maaş Belgesi - ${personName}`,
            fileName: `maas-${p.id}.pdf`,
          });
          return Alert.alert('Gönderildi', 'Belge yazıcı e-posta adresine gönderildi.');
        }
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Aldığınız Maaşlar - ${personName}` });
      } catch (e) {
        console.warn('Staff salary PDF failed', e);
        if (mode === 'mail') Alert.alert('Hata', (e as Error)?.message ?? 'Belge gönderilemedi.');
      } finally {
        if (mode === 'mail') setMailSendingKey(null);
        else setPdfExportingStaffId(null);
      }
    },
    []
  );

  const exportPdf = useCallback(async (mode: 'share' | 'mail' = 'share') => {
    const sorted = [...payments].sort(
      (a, b) =>
        new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime() ||
        (a.payment_time || '').localeCompare(b.payment_time || '')
    );
    let logoHtml = '';
    try {
      const asset = Asset.fromModule(require('@/assets/valoria-splash-logo.png'));
      await asset.downloadAsync();
      if (asset.localUri) {
        logoHtml = `<img src="${asset.localUri}" style="height:32px;margin-bottom:4px;" alt="Valoria" />`;
      }
    } catch {}
    const periodLabelStr = `${dateStart} – ${dateEnd}`;
    const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,sans-serif;font-size:10px;color:#1e293b;padding:0;line-height:1.4}
.wrap{max-width:800px;margin:0 auto;padding:24px 20px}
.header{display:flex;align-items:center;justify-content:space-between;padding-bottom:16px;border-bottom:3px solid #0d9488;margin-bottom:20px}
.headerLeft{display:flex;align-items:center;gap:16px}
.logoWrap img{height:44px;display:block}
.brand{font-size:22px;font-weight:800;color:#0f172a}
.brandSub{font-size:11px;color:#64748b;margin-top:2px}
.reportTitle{font-size:14px;font-weight:700;color:#0d9488;text-align:right}
.reportMeta{font-size:9px;color:#64748b;margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:10px}
th,td{border:1px solid #cbd5e1;padding:8px 10px;text-align:left}
th{background:#0d9488;color:#fff;font-weight:700}
td{background:#fff}
tr:nth-child(even) td{background:#f8fafc}
.colDate{width:95px}
.colTime{width:50px}
.colPerson{width:120px}
.colPeriod{width:90px}
.colAmount{width:80px;text-align:right;font-weight:600}
.colStatus{width:80px}
.totals{display:flex;justify-content:space-between;align-items:center;margin-top:20px;padding:14px 16px;background:#f1f5f9;border:1px solid #e2e8f0;font-weight:700;font-size:11px}
.footer{margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:9px;color:#94a3b8;text-align:center}
</style></head><body>
<div class="wrap">
<div class="header">
  <div class="headerLeft">${logoHtml ? `<div class="logoWrap">${logoHtml}</div>` : ''}<div><div class="brand">VALORİA HOTEL</div><div class="brandSub">Konaklama & Hizmetler</div></div></div>
  <div><div class="reportTitle">Tüm Maaş Ödemeleri Raporu</div><div class="reportMeta">Dönem: ${periodLabelStr}<br>Oluşturulma: ${formatDateShort(new Date())}</div></div>
</div>
<table>
<tr><th class="colDate">Ödeme Tarihi</th><th class="colTime">Saat</th><th class="colPerson">Personel</th><th class="colPeriod">Dönem</th><th class="colAmount">Tutar</th><th class="colStatus">Durum</th></tr>
${sorted
  .map(
    (p) =>
      `<tr><td class="colDate">${formatDateShort(p.payment_date)}</td><td class="colTime">${formatTimeOnly(p.payment_time)}</td><td class="colPerson">${(p.staff?.full_name ?? '—').replace(/</g, '&lt;')}${p.staff?.department ? ` (${String(p.staff.department).replace(/</g, '&lt;')})` : ''}</td><td class="colPeriod">${periodLabel(p)}</td><td class="colAmount">${fmtMoney(Number(p.amount))}</td><td class="colStatus">${statusLabel(p.status)}</td></tr>`
  )
  .join('')}
</table>
<div class="totals"><span>Kayıt: ${payments.length}</span><span>Onaylı toplam: ${fmtMoney(approvedTotal)}</span><span>Genel toplam: ${fmtMoney(totalAmount)}</span></div>
<div class="footer">VALORİA HOTEL · Bu rapor otomatik oluşturulmuştur.</div>
</div>
</body></html>`;
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (mode === 'mail') {
        await sendPdfToPrinterEmail({
          pdfUri: uri,
          subject: `Tüm Maaş Ödemeleri ${dateStart} - ${dateEnd}`,
          fileName: `tum-maas-odemeleri-${dateStart}-${dateEnd}.pdf`,
        });
        return Alert.alert('Gönderildi', 'PDF yazıcı e-posta adresine gönderildi.');
      }
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Tüm maaş ödemeleri (PDF)' });
    } catch (e) {
      console.warn('PDF export failed', e);
      if (mode === 'mail') Alert.alert('Hata', (e as Error)?.message ?? 'Belge gönderilemedi.');
    }
  }, [payments, dateStart, dateEnd, totalAmount, approvedTotal]);

  const exportCsv = useCallback(() => {
    const lines = ['Ödeme Tarihi,Saat,Personel,Departman,Dönem,Tutar,Durum'];
    for (const p of payments) {
      lines.push(
        `"${p.payment_date}","${formatTimeOnly(p.payment_time)}","${(p.staff?.full_name ?? '').replace(/"/g, '""')}","${(p.staff?.department ?? '').replace(/"/g, '""')}","${periodLabel(p)}",${p.amount},"${statusLabel(p.status)}"`
      );
    }
    const csv = '\uFEFF' + lines.join('\n');
    if (Platform.OS === 'web') {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tum-odemeler-${dateStart}-${dateEnd}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      Share.share({ message: csv, title: 'Tüm ödemeler (CSV)' }).catch(() => {});
    }
  }, [payments, dateStart, dateEnd]);

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
          <Text style={styles.sectionTitle}>Tarih Aralığı (Ödeme Tarihi)</Text>
          <View style={styles.dateRow}>
            <View style={styles.dateInputWrap}>
              <Text style={styles.dateLabel}>Başlangıç</Text>
              <TextInput
                style={styles.dateInput}
                value={dateStart}
                onChangeText={setDateStart}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={adminTheme.colors.textMuted}
              />
            </View>
            <View style={styles.dateInputWrap}>
              <Text style={styles.dateLabel}>Bitiş</Text>
              <TextInput
                style={styles.dateInput}
                value={dateEnd}
                onChangeText={setDateEnd}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={adminTheme.colors.textMuted}
              />
            </View>
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Durum Filtresi</Text>
          <View style={styles.statusRow}>
            {STATUS_OPTIONS.map((opt) => {
              const active = statusFilter === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.statusChip, active && styles.statusChipActive]}
                  onPress={() => setStatusFilter(opt.value)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.statusChipText, active && styles.statusChipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity style={styles.applyBtn} onPress={load} activeOpacity={0.8}>
            <Ionicons name="search" size={20} color="#fff" />
            <Text style={styles.applyBtnText}>Filtrele</Text>
          </TouchableOpacity>
        </AdminCard>

        <AdminCard>
          <Text style={styles.summaryLiveLabel}>Güncel tutar (bu filtredeki tüm ödemeler)</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>Kayıt</Text>
              <Text style={styles.summaryValue}>{payments.length}</Text>
            </View>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>Toplam</Text>
              <Text style={[styles.summaryValue, styles.summaryTotal]}>{fmtMoney(totalAmount)}</Text>
            </View>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>Onaylı</Text>
              <Text style={[styles.summaryValue, { color: adminTheme.colors.success }]}>{fmtMoney(approvedTotal)}</Text>
            </View>
          </View>
        </AdminCard>

        <View style={styles.exportRow}>
          <TouchableOpacity style={styles.exportBtn} onPress={exportCsv} activeOpacity={0.8}>
            <Ionicons name="download-outline" size={20} color={adminTheme.colors.accent} />
            <Text style={styles.exportBtnText}>CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.exportBtn} onPress={exportPdf} activeOpacity={0.8}>
            <Ionicons name="document-text-outline" size={20} color={adminTheme.colors.accent} />
            <Text style={styles.exportBtnText}>PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.exportBtn}
            onPress={async () => {
              setMailSendingKey('all');
              await exportPdf('mail');
              setMailSendingKey(null);
            }}
            activeOpacity={0.8}
            disabled={mailSendingKey === 'all'}
          >
            {mailSendingKey === 'all' ? (
              <ActivityIndicator size="small" color={adminTheme.colors.accent} />
            ) : (
              <Ionicons name="mail-outline" size={20} color={adminTheme.colors.accent} />
            )}
            <Text style={styles.exportBtnText}>Yazıcı Mail</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.listTitle}>Tüm Ödemeler ({payments.length})</Text>

        {loading ? (
          <ActivityIndicator size="large" color={adminTheme.colors.accent} style={styles.loader} />
        ) : payments.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="cash-outline" size={48} color={adminTheme.colors.textMuted} />
            <Text style={styles.emptyText}>Bu aralıkta ödeme bulunamadı.</Text>
          </View>
        ) : (
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <Text style={[styles.tableCell, styles.thDate]}>Tarih</Text>
              <Text style={[styles.tableCell, styles.thTime]}>Saat</Text>
              <Text style={[styles.tableCell, styles.thName]}>Personel</Text>
              <Text style={[styles.tableCell, styles.thPeriod]}>Dönem</Text>
              <Text style={[styles.tableCell, styles.thAmount]}>Tutar</Text>
              <Text style={[styles.tableCell, styles.thStatus]}>Durum</Text>
              <Text style={[styles.tableCell, styles.thPdf]}>PDF</Text>
            </View>
            {payments.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={styles.tableRow}
                onPress={() => setDetailPayment(p)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tableCell, styles.thDate]}>{formatDateShort(p.payment_date)}</Text>
                <Text style={[styles.tableCell, styles.thTime]}>{formatTimeOnly(p.payment_time)}</Text>
                <Text style={[styles.tableCell, styles.thName]} numberOfLines={1}>
                  {p.staff?.full_name ?? '—'} {p.staff?.department ? `(${p.staff.department})` : ''}
                </Text>
                <Text style={[styles.tableCell, styles.thPeriod]}>{periodLabel(p)}</Text>
                <Text style={[styles.tableCell, styles.thAmount]}>{fmtMoney(Number(p.amount))}</Text>
                <View style={[styles.tableCell, styles.thStatus]}>
                  <Ionicons name={statusIcon(p.status) as any} size={18} color={statusColor(p.status)} />
                </View>
                <TouchableOpacity
                  style={[styles.tableCell, styles.thPdf]}
                  onPress={(ev) => { ev.stopPropagation(); exportSingleSalaryPdf(p); }}
                  disabled={pdfExportingStaffId === p.staff_id || mailSendingKey === `staff:${p.staff_id}`}
                >
                  {pdfExportingStaffId === p.staff_id ? (
                    <ActivityIndicator size="small" color={adminTheme.colors.accent} />
                  ) : (
                    <Ionicons name="document-text-outline" size={18} color={adminTheme.colors.accent} />
                  )}
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={!!detailPayment} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setDetailPayment(null)}>
          <Pressable style={styles.detailCard} onPress={(e) => e.stopPropagation()}>
            <ScrollView style={styles.detailScroll} showsVerticalScrollIndicator={false}>
              {detailPayment && (
                <>
                  <View style={styles.detailHeader}>
                    <Text style={styles.detailTitle}>Ödeme Detayı</Text>
                    <TouchableOpacity onPress={() => setDetailPayment(null)} hitSlop={12}>
                      <Ionicons name="close" size={24} color={adminTheme.colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.detailBody}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Ödeme tarihi</Text>
                      <Text style={styles.detailValue}>{formatDateShort(detailPayment.payment_date)} {formatTimeOnly(detailPayment.payment_time)}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Personel</Text>
                      <Text style={styles.detailValue}>{detailPayment.staff?.full_name ?? '—'} {detailPayment.staff?.department ? `(${detailPayment.staff.department})` : ''}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Dönem</Text>
                      <Text style={styles.detailValue}>{periodLabel(detailPayment)}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Tutar</Text>
                      <Text style={[styles.detailValue, styles.detailAmount]}>{fmtMoney(Number(detailPayment.amount))}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Ödeme tipi</Text>
                      <Text style={styles.detailValue}>{paymentTypeLabel(detailPayment.payment_type)}</Text>
                    </View>
                    {detailPayment.bank_or_reference ? (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Banka / Referans</Text>
                        <Text style={styles.detailValue}>{detailPayment.bank_or_reference}</Text>
                      </View>
                    ) : null}
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Durum</Text>
                      <View style={styles.detailStatusWrap}>
                        <Ionicons name={statusIcon(detailPayment.status) as any} size={18} color={statusColor(detailPayment.status)} />
                        <Text style={styles.detailValue}>{statusLabel(detailPayment.status)}</Text>
                      </View>
                    </View>
                    {detailPayment.description ? (
                      <View style={[styles.detailRow, styles.detailRowBlock]}>
                        <Text style={styles.detailLabel}>Açıklama</Text>
                        <Text style={[styles.detailValue, styles.detailDesc]}>{detailPayment.description}</Text>
                      </View>
                    ) : null}
                    <TouchableOpacity
                      style={styles.detailPdfBtn}
                      onPress={() => exportSingleSalaryPdf(detailPayment)}
                      disabled={pdfExportingStaffId === detailPayment.staff_id || mailSendingKey === `staff:${detailPayment.staff_id}`}
                    >
                      {pdfExportingStaffId === detailPayment.staff_id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="document-text-outline" size={20} color="#fff" />
                          <Text style={styles.detailPdfBtnText}>Aldığınız Maaşlar PDF</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.detailPdfBtn, { marginTop: 10, backgroundColor: adminTheme.colors.surfaceTertiary }]}
                      onPress={() => exportSingleSalaryPdf(detailPayment, 'mail')}
                      disabled={mailSendingKey === `staff:${detailPayment.staff_id}`}
                    >
                      {mailSendingKey === `staff:${detailPayment.staff_id}` ? (
                        <ActivityIndicator size="small" color={adminTheme.colors.accent} />
                      ) : (
                        <>
                          <Ionicons name="mail-outline" size={20} color={adminTheme.colors.accent} />
                          <Text style={[styles.detailPdfBtnText, { color: adminTheme.colors.accent }]}>Tek Belgeyi Mail Gönder</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.text },
  dateRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  dateInputWrap: { flex: 1 },
  dateLabel: { fontSize: 12, color: adminTheme.colors.textMuted, marginBottom: 4 },
  dateInput: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    backgroundColor: adminTheme.colors.surface,
    color: adminTheme.colors.text,
  },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  statusChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  statusChipActive: {
    backgroundColor: adminTheme.colors.primary,
    borderColor: adminTheme.colors.primary,
  },
  statusChipText: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.text },
  statusChipTextActive: { color: adminTheme.colors.surface },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: adminTheme.colors.primary,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  applyBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  summaryLiveLabel: { fontSize: 12, color: adminTheme.colors.textMuted, marginBottom: 10, fontWeight: '600' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  summaryCol: { flex: 1, minWidth: 70 },
  summaryLabel: { fontSize: 11, color: adminTheme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryValue: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text, marginTop: 2 },
  summaryTotal: { fontSize: 17, color: adminTheme.colors.primary },
  exportRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  exportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  exportBtnText: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.accent },
  listTitle: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.text, marginTop: 20, marginBottom: 12 },
  loader: { marginVertical: 24 },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 14, color: adminTheme.colors.textMuted, marginTop: 12 },
  table: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: adminTheme.colors.borderLight,
  },
  tableHeader: { backgroundColor: adminTheme.colors.surfaceTertiary },
  tableCell: { fontSize: 12 },
  thDate: { width: 80 },
  thTime: { width: 45 },
  thName: { flex: 1, maxWidth: 100 },
  thPeriod: { width: 85 },
  thAmount: { width: 80, fontWeight: '600' },
  thStatus: { width: 32 },
  thPdf: { width: 40 },
  detailPdfBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 20, paddingVertical: 14, backgroundColor: adminTheme.colors.accent, borderRadius: 10 },
  detailPdfBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  detailCard: {
    width: '96%',
    maxWidth: 480,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 16,
    padding: 24,
    maxHeight: '90%',
  },
  detailScroll: { maxHeight: '100%' },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 16, borderBottomWidth: 2, borderBottomColor: adminTheme.colors.borderLight },
  detailTitle: { fontSize: 22, fontWeight: '800', color: adminTheme.colors.text },
  detailBody: { gap: 16 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 },
  detailRowBlock: { flexDirection: 'column', alignItems: 'stretch' },
  detailLabel: { fontSize: 14, color: adminTheme.colors.textMuted, fontWeight: '600', minWidth: 90 },
  detailDesc: { textAlign: 'left', marginTop: 4 },
  detailValue: { fontSize: 16, color: adminTheme.colors.text, flex: 1, textAlign: 'right' },
  detailAmount: { fontSize: 20, fontWeight: '800', color: adminTheme.colors.primary },
  detailStatusWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'flex-end' },
});
