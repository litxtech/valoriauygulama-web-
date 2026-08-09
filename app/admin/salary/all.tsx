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
import { LinearGradient } from 'expo-linear-gradient';
import { printToLocalPdfFile } from '@/lib/persistExpoPrintPdf';
import * as Sharing from 'expo-sharing';
import { Asset } from 'expo-asset';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminOrganizationPicker } from '@/components/admin';
import { formatDateShort } from '@/lib/date';
import { sendPdfToPrinterEmail } from '@/lib/printerEmail';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { AdminStackBackButton } from '@/lib/adminStackBack';
import { counterpartyInitials, resolveCounterpartyTypeMeta } from '@/lib/financeCounterpartyUi';

const HERO_GRAD = ['#0f172a', '#1e3a5f'] as const;

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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { staff: me } = useAuthStore();
  const { selectedOrganizationId } = useAdminOrgStore();
  const canUseAllOrganizations = me?.app_permissions?.super_admin === true || me?.role === 'admin';
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [dateStart, setDateStart] = useState(getDefaultDates().start);
  const [dateEnd, setDateEnd] = useState(getDefaultDates().end);
  const [detailPayment, setDetailPayment] = useState<PaymentRow | null>(null);
  const [pdfExportingStaffId, setPdfExportingStaffId] = useState<string | null>(null);
  const [mailSendingKey, setMailSendingKey] = useState<string | null>(null);
  const staffMeta = resolveCounterpartyTypeMeta('staff');

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
        const { uri } = await printToLocalPdfFile({ html });
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
      const { uri } = await printToLocalPdfFile({ html });
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

  const visiblePayments = payments.filter((p) => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    if (!q) return true;
    const name = (p.staff?.full_name ?? '').toLocaleLowerCase('tr-TR');
    const dept = (p.staff?.department ?? '').toLocaleLowerCase('tr-TR');
    return name.includes(q) || dept.includes(q);
  });
  const visibleTotal = visiblePayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const visibleApproved = visiblePayments
    .filter((p) => p.status === 'approved')
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);

  return (
    <View style={styles.container}>
      <LinearGradient colors={[...HERO_GRAD]} style={[styles.heroBar, { paddingTop: insets.top + 8 }]}>
        <AdminStackBackButton tintColor="#fff" fallback="/admin/salary" />
        <View style={styles.heroTitleWrap}>
          <Text style={styles.heroTitle} numberOfLines={1}>
            Tüm maaş ödemeleri
          </Text>
          <Text style={styles.heroSub} numberOfLines={1}>
            Filtrele · dışa aktar · detay
          </Text>
        </View>
        <TouchableOpacity
          style={styles.heroIconBtn}
          onPress={() => router.push('/admin/salary/pay')}
          accessibilityLabel="Maaş öde"
        >
          <Ionicons name="wallet-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.searchCard}>
          <Ionicons name="search" size={18} color={adminTheme.colors.accent} />
          <TextInput
            style={styles.searchInput}
            placeholder="Personel ara…"
            placeholderTextColor={adminTheme.colors.textMuted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 ? (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={adminTheme.colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        <AdminOrganizationPicker
          canUseAll={canUseAllOrganizations}
          ownOrganizationId={me?.organization_id}
        />

        <View style={styles.filterCard}>
          <Text style={styles.sectionTitle}>Tarih aralığı</Text>
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

          <Text style={[styles.sectionTitle, { marginTop: 14 }]}>Durum</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            keyboardShouldPersistTaps="handled"
          >
            {STATUS_OPTIONS.map((opt) => {
              const active = statusFilter === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.filterChip, active && styles.filterChipOn]}
                  onPress={() => setStatusFilter(opt.value)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextOn]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity style={styles.applyBtn} onPress={load} activeOpacity={0.8}>
            <Ionicons name="search" size={18} color="#fff" />
            <Text style={styles.applyBtnText}>Filtrele</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statPill}>
            <Text style={styles.statPillNum}>{visiblePayments.length}</Text>
            <Text style={styles.statPillLbl}>Kayıt</Text>
          </View>
          <View style={[styles.statPill, styles.statPillExpense]}>
            <Text style={[styles.statPillNum, styles.statPillNumExpense]} numberOfLines={1}>
              {fmtMoney(visibleTotal)}
            </Text>
            <Text style={styles.statPillLbl}>Toplam</Text>
          </View>
          <View style={[styles.statPill, styles.statPillPaid]}>
            <Text style={[styles.statPillNum, styles.statPillNumPaid]} numberOfLines={1}>
              {fmtMoney(visibleApproved)}
            </Text>
            <Text style={styles.statPillLbl}>Onaylı</Text>
          </View>
        </View>

        <View style={styles.exportRow}>
          <TouchableOpacity style={styles.exportBtn} onPress={exportCsv} activeOpacity={0.8}>
            <Ionicons name="download-outline" size={18} color={adminTheme.colors.accent} />
            <Text style={styles.exportBtnText}>CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.exportBtn} onPress={() => void exportPdf()} activeOpacity={0.8}>
            <Ionicons name="document-text-outline" size={18} color={adminTheme.colors.accent} />
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
              <Ionicons name="mail-outline" size={18} color={adminTheme.colors.accent} />
            )}
            <Text style={styles.exportBtnText}>Mail</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.listTitle}>Ödemeler ({visiblePayments.length})</Text>

        {loading ? (
          <ActivityIndicator size="large" color={adminTheme.colors.accent} style={styles.loader} />
        ) : visiblePayments.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="cash-outline" size={36} color={adminTheme.colors.accent} />
            </View>
            <Text style={styles.emptyTitle}>Ödeme bulunamadı</Text>
            <Text style={styles.emptySub}>Bu aralıkta kayıt yok veya arama sonucu boş.</Text>
          </View>
        ) : (
          <View style={styles.cardList}>
            {visiblePayments.map((p) => {
              const name = p.staff?.full_name ?? '—';
              return (
                <TouchableOpacity
                  key={p.id}
                  style={styles.payCard}
                  onPress={() => setDetailPayment(p)}
                  activeOpacity={0.88}
                >
                  <View style={[styles.avatar, { backgroundColor: staffMeta.bg }]}>
                    <Text style={[styles.avatarText, { color: staffMeta.color }]}>
                      {counterpartyInitials(name)}
                    </Text>
                  </View>
                  <View style={styles.payBody}>
                    <Text style={styles.payName} numberOfLines={1}>
                      {name}
                    </Text>
                    <View style={styles.typeRow}>
                      <Ionicons name={staffMeta.icon} size={12} color={staffMeta.color} />
                      <Text style={[styles.payDept, { color: staffMeta.color }]}>
                        {p.staff?.department?.trim() || staffMeta.label}
                      </Text>
                    </View>
                    <Text style={styles.payMeta}>
                      {formatDateShort(p.payment_date)} · {formatTimeOnly(p.payment_time)} ·{' '}
                      {periodLabel(p)}
                    </Text>
                    <View style={styles.statusInline}>
                      <Ionicons
                        name={statusIcon(p.status) as any}
                        size={14}
                        color={statusColor(p.status)}
                      />
                      <Text style={[styles.statusInlineText, { color: statusColor(p.status) }]}>
                        {statusLabel(p.status)}
                      </Text>
                    </View>
                    <Text style={styles.payAmount}>{fmtMoney(Number(p.amount))}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.pdfBtn}
                    onPress={(ev) => {
                      ev?.stopPropagation?.();
                      void exportSingleSalaryPdf(p);
                    }}
                    disabled={
                      pdfExportingStaffId === p.staff_id ||
                      mailSendingKey === `staff:${p.staff_id}`
                    }
                    hitSlop={8}
                  >
                    {pdfExportingStaffId === p.staff_id ? (
                      <ActivityIndicator size="small" color="#b91c1c" />
                    ) : (
                      <Ionicons name="document-text-outline" size={18} color="#b91c1c" />
                    )}
                  </TouchableOpacity>
                  <Ionicons name="chevron-forward" size={20} color={adminTheme.colors.textMuted} />
                </TouchableOpacity>
              );
            })}
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
                      <Text style={styles.detailValue}>
                        {formatDateShort(detailPayment.payment_date)}{' '}
                        {formatTimeOnly(detailPayment.payment_time)}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Personel</Text>
                      <Text style={styles.detailValue}>
                        {detailPayment.staff?.full_name ?? '—'}
                        {detailPayment.staff?.department
                          ? ` (${detailPayment.staff.department})`
                          : ''}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Dönem</Text>
                      <Text style={styles.detailValue}>{periodLabel(detailPayment)}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Tutar</Text>
                      <Text style={[styles.detailValue, styles.detailAmount]}>
                        {fmtMoney(Number(detailPayment.amount))}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Ödeme tipi</Text>
                      <Text style={styles.detailValue}>
                        {paymentTypeLabel(detailPayment.payment_type)}
                      </Text>
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
                        <Ionicons
                          name={statusIcon(detailPayment.status) as any}
                          size={18}
                          color={statusColor(detailPayment.status)}
                        />
                        <Text style={styles.detailValue}>{statusLabel(detailPayment.status)}</Text>
                      </View>
                    </View>
                    {detailPayment.description ? (
                      <View style={[styles.detailRow, styles.detailRowBlock]}>
                        <Text style={styles.detailLabel}>Açıklama</Text>
                        <Text style={[styles.detailValue, styles.detailDesc]}>
                          {detailPayment.description}
                        </Text>
                      </View>
                    ) : null}
                    <TouchableOpacity
                      style={styles.detailPdfBtn}
                      onPress={() => void exportSingleSalaryPdf(detailPayment)}
                      disabled={
                        pdfExportingStaffId === detailPayment.staff_id ||
                        mailSendingKey === `staff:${detailPayment.staff_id}`
                      }
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
                      style={[
                        styles.detailPdfBtn,
                        { marginTop: 10, backgroundColor: adminTheme.colors.surfaceTertiary },
                      ]}
                      onPress={() => void exportSingleSalaryPdf(detailPayment, 'mail')}
                      disabled={mailSendingKey === `staff:${detailPayment.staff_id}`}
                    >
                      {mailSendingKey === `staff:${detailPayment.staff_id}` ? (
                        <ActivityIndicator size="small" color={adminTheme.colors.accent} />
                      ) : (
                        <>
                          <Ionicons name="mail-outline" size={20} color={adminTheme.colors.accent} />
                          <Text style={[styles.detailPdfBtnText, { color: adminTheme.colors.accent }]}>
                            Tek Belgeyi Mail Gönder
                          </Text>
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
  heroBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingBottom: 10,
  },
  heroIconBtn: { padding: 8 },
  heroTitleWrap: { flex: 1, marginHorizontal: 4 },
  heroTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  heroSub: { fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 2 },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    ...adminTheme.shadow.sm,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 10, color: adminTheme.colors.text },
  filterCard: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: adminTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  dateRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  dateInputWrap: { flex: 1 },
  dateLabel: { fontSize: 12, color: adminTheme.colors.textMuted, marginBottom: 4 },
  dateInput: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    color: adminTheme.colors.text,
  },
  chipRow: { gap: 8, paddingVertical: 8 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  filterChipOn: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  filterChipText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textMuted },
  filterChipTextOn: { color: '#fff' },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  applyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  statPill: {
    flex: 1,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  statPillExpense: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  statPillPaid: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  statPillNum: { fontSize: 12, fontWeight: '800', color: adminTheme.colors.text },
  statPillNumExpense: { color: '#dc2626' },
  statPillNumPaid: { color: '#16a34a' },
  statPillLbl: { fontSize: 10, color: adminTheme.colors.textMuted, fontWeight: '600', marginTop: 2 },
  exportRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  exportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  exportBtnText: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.accent },
  listTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: adminTheme.colors.textMuted,
    marginTop: 8,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  loader: { marginVertical: 24 },
  emptyCard: {
    alignItems: 'center',
    marginTop: 12,
    padding: 24,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff7ed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: adminTheme.colors.text },
  emptySub: {
    fontSize: 13,
    color: adminTheme.colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
  },
  cardList: { gap: 0 },
  payCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 14, fontWeight: '800' },
  payBody: { flex: 1, minWidth: 0 },
  payName: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  typeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 4 },
  payDept: { fontSize: 12, fontWeight: '600' },
  payMeta: { fontSize: 12, color: adminTheme.colors.textSecondary, marginTop: 4 },
  statusInline: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  statusInlineText: { fontSize: 12, fontWeight: '700' },
  payAmount: { fontSize: 13, fontWeight: '800', color: '#dc2626', marginTop: 4 },
  pdfBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  detailPdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 20,
    paddingVertical: 14,
    backgroundColor: '#dc2626',
    borderRadius: 12,
  },
  detailPdfBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'flex-end',
  },
  detailCard: {
    width: '100%',
    backgroundColor: adminTheme.colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    maxHeight: '88%',
  },
  detailScroll: { maxHeight: '100%' },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: adminTheme.colors.border,
  },
  detailTitle: { fontSize: 18, fontWeight: '800', color: adminTheme.colors.text },
  detailBody: { gap: 14, paddingBottom: 24 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
  },
  detailRowBlock: { flexDirection: 'column', alignItems: 'stretch' },
  detailLabel: {
    fontSize: 13,
    color: adminTheme.colors.textMuted,
    fontWeight: '600',
    minWidth: 90,
  },
  detailDesc: { textAlign: 'left', marginTop: 4 },
  detailValue: { fontSize: 15, color: adminTheme.colors.text, flex: 1, textAlign: 'right' },
  detailAmount: { fontSize: 18, fontWeight: '800', color: '#dc2626' },
  detailStatusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    justifyContent: 'flex-end',
  },
});
