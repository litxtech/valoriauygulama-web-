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
  Modal,
  Pressable,
  Share,
  Platform,
  Alert,
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Asset } from 'expo-asset';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { sendNotification } from '@/lib/notificationService';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard, AdminOrganizationPicker } from '@/components/admin';
import { CachedImage } from '@/components/CachedImage';
import { formatDateShort } from '@/lib/date';
import { sendPdfToPrinterEmail } from '@/lib/printerEmail';
import { useAdminOrgStore } from '@/stores/adminOrgStore';

type ExpenseRow = {
  id: string;
  amount: number;
  description: string | null;
  receipt_image_url: string | null;
  status: string;
  expense_date: string;
  expense_time: string | null;
  created_at: string;
  staff_id: string;
  staff: { full_name: string | null; department: string | null } | null;
  category: { name: string } | null;
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
  { value: 'pending', label: 'Beklemede' },
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

export default function AdminExpensesAllScreen() {
  const { staff: me } = useAuthStore();
  const { selectedOrganizationId } = useAdminOrgStore();
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateStart, setDateStart] = useState(getDefaultDates().start);
  const [dateEnd, setDateEnd] = useState(getDefaultDates().end);
  const [receiptModal, setReceiptModal] = useState<string | null>(null);
  const [detailExpense, setDetailExpense] = useState<ExpenseRow | null>(null);
  const [pdfExportingStaffId, setPdfExportingStaffId] = useState<string | null>(null);
  const [mailSendingKey, setMailSendingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const canUseAll = me?.app_permissions?.super_admin === true || me?.role === 'admin';
    const orgId = canUseAll ? selectedOrganizationId : me?.organization_id;
    const start = dateStart || '2020-01-01';
    const end = dateEnd || '2030-12-31';

    let query = supabase
      .from('staff_expenses')
      .select('id, amount, description, receipt_image_url, status, expense_date, expense_time, created_at, staff_id, staff:staff_id(full_name, department), category:category_id(name)')
      .gte('expense_date', start)
      .lte('expense_date', end)
      .order('expense_date', { ascending: false })
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
      setExpenses([]);
    } else {
      setExpenses((data ?? []) as ExpenseRow[]);
    }
    setLoading(false);
  }, [dateStart, dateEnd, me?.app_permissions?.super_admin, me?.organization_id, selectedOrganizationId, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // Canlı güncelleme: staff_expenses değişince listeyi ve toplamları yenile
  useEffect(() => {
    const channel = supabase
      .channel('expenses-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_expenses' }, () => {
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

  // Güncel tutarlar – reddedilenler hariç, listedeki harcamalardan hesaplanır
  const nonRejected = expenses.filter((e) => e.status !== 'rejected');
  const totalAmount = nonRejected.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const approvedTotal = expenses.filter((e) => e.status === 'approved').reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const pendingTotal = expenses.filter((e) => e.status === 'pending').reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const statusIcon = (s: string) => (s === 'approved' ? 'checkmark-circle' : s === 'rejected' ? 'close-circle' : 'time');
  const statusColor = (s: string) =>
    s === 'approved' ? adminTheme.colors.success : s === 'rejected' ? adminTheme.colors.error : adminTheme.colors.warning;
  const statusLabel = (s: string) => (s === 'approved' ? 'Onaylı' : s === 'rejected' ? 'Reddedilen' : 'Beklemede');

  const getExpenseSummary = (e: ExpenseRow) =>
    `${fmtMoney(Number(e.amount))} · ${formatDateShort(e.expense_date)} · ${e.category?.name ?? '—'}`;

  const exportSingleExpensePdf = useCallback(
    async (e: ExpenseRow, mode: 'share' | 'mail' = 'share') => {
      if (!e.staff_id) return;
      if (mode === 'mail') setMailSendingKey(`staff:${e.staff_id}`);
      else setPdfExportingStaffId(e.staff_id);
      try {
        const list = [e];

        let logoHtml = '';
        try {
          const asset = Asset.fromModule(require('@/assets/valoria-splash-logo.png'));
          await asset.downloadAsync();
          if (asset.localUri) logoHtml = `<img src="${asset.localUri}" style="height:32px;margin-bottom:4px;" alt="Valoria" />`;
        } catch {}
        const personName = e.staff?.full_name ?? '—';
        const personDept = e.staff?.department ?? '';
        const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;font-size:10px;color:#1e293b;padding:0;line-height:1.4}
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
.colCat{width:95px}
.colAmount{width:75px;text-align:right;font-weight:600}
.colStatus{width:70px}
.colDesc{}
.totals{margin-top:20px;padding:14px 16px;background:#f1f5f9;border:1px solid #e2e8f0;font-weight:700;font-size:11px}
.footer{margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:9px;color:#94a3b8;text-align:center}
</style></head><body>
<div class="wrap">
<div class="header">
  <div class="headerLeft">${logoHtml ? `<div>${logoHtml}</div>` : ''}<div><div class="brand">VALORİA HOTEL</div><div class="brandSub">Konaklama & Hizmetler</div></div></div>
  <div><div class="reportTitle">Harcama Bildirimi</div><div class="reportSub">${personName.replace(/</g, '&lt;')}${personDept ? ` · ${String(personDept).replace(/</g, '&lt;')}` : ''}</div><div class="reportSub" style="margin-top:6px">Oluşturulma: ${formatDateShort(new Date())}</div></div>
</div>
<table>
<tr><th class="colDate">Tarih</th><th class="colTime">Saat</th><th class="colCat">Kategori</th><th class="colAmount">Tutar</th><th class="colStatus">Durum</th><th class="colDesc">Açıklama</th></tr>
${list.map((x) => `<tr><td class="colDate">${formatDateShort(x.expense_date)}</td><td class="colTime">${formatTimeOnly(x.expense_time)}</td><td class="colCat">${(x.category?.name ?? '—').replace(/</g, '&lt;')}</td><td class="colAmount">${fmtMoney(Number(x.amount))}</td><td class="colStatus">${statusLabel(x.status)}</td><td class="colDesc">${(x.description ?? '—').replace(/</g, '&lt;')}</td></tr>`).join('')}
</table>
<div class="totals">Toplam: ${fmtMoney(list.reduce((s, x) => s + Number(x.amount), 0))} · Kayıt: ${list.length}</div>
<div class="footer">VALORİA HOTEL · Bu rapor otomatik oluşturulmuştur.</div>
</div>
</body></html>`;
        const { uri } = await Print.printToFileAsync({ html });
        if (mode === 'mail') {
          await sendPdfToPrinterEmail({
            pdfUri: uri,
            subject: `Harcama Belgesi - ${personName}`,
            fileName: `harcama-${e.id}.pdf`,
          });
          Alert.alert('Gönderildi', 'Belge yazıcı e-posta adresine gönderildi.');
          return;
        }
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Harcama Bildirimi - ${personName}` });
      } catch (err) {
        console.warn('Staff expenses PDF failed', err);
        if (mode === 'mail') Alert.alert('Hata', (err as Error)?.message ?? 'Belge gönderilemedi.');
      } finally {
        if (mode === 'mail') setMailSendingKey(null);
        else setPdfExportingStaffId(null);
      }
    },
    []
  );

  const sendExpenseFeedbackToStaff = useCallback(
    async (e: ExpenseRow, reason: string) => {
      if (!e.staff_id) return;
      const body = `Girdiğiniz harcama: ${getExpenseSummary(e)} — ${reason}`;
      await sendNotification({
        staffId: e.staff_id,
        title: 'Harcama geri bildirimi',
        body,
        category: 'admin',
        data: { screen: '/staff/expenses' },
        createdByStaffId: me?.id ?? null,
      });
    },
    [me?.id]
  );

  const approveExpense = useCallback(
    async (e: ExpenseRow) => {
      if (!me?.id) return;
      const { error } = await supabase
        .from('staff_expenses')
        .update({
          status: 'approved',
          approved_by: me.id,
          approved_at: new Date().toISOString(),
          rejection_reason: null,
        })
        .eq('id', e.id);
      if (error) {
        Alert.alert('Hata', error.message);
        return;
      }
      if (e.staff_id) {
        await sendNotification({
          staffId: e.staff_id,
          title: 'Harcama onaylandı',
          body: `Girdiğiniz harcama onaylandı: ${getExpenseSummary(e)}`,
          category: 'admin',
          data: { screen: '/staff/expenses' },
          createdByStaffId: me.id,
        });
      }
      setDetailExpense(null);
      load();
    },
    [me?.id, load]
  );

  const rejectExpenseWithReason = useCallback(
    async (e: ExpenseRow, reason: string) => {
      if (!me?.id) return;
      const { error } = await supabase
        .from('staff_expenses')
        .update({
          status: 'rejected',
          approved_by: me.id,
          approved_at: new Date().toISOString(),
          rejection_reason: reason,
        })
        .eq('id', e.id);
      if (error) {
        Alert.alert('Hata', error.message);
        return;
      }
      await sendExpenseFeedbackToStaff(e, reason);
      load();
    },
    [me?.id, sendExpenseFeedbackToStaff, load]
  );

  const handleExpenseWrong = useCallback(
    async (e: ExpenseRow) => {
      setActingId(e.id);
      await rejectExpenseWithReason(e, 'Harcama yanlış.');
      setActingId(null);
      setDetailExpense(null);
      Alert.alert('Gönderildi', 'Harcama reddedildi ve personel bilgilendirildi.');
    },
    [rejectExpenseWithReason]
  );

  const handleDuplicateEntry = useCallback(
    async (e: ExpenseRow) => {
      setActingId(e.id);
      await rejectExpenseWithReason(e, 'Gereksiz tekrar giriş.');
      setActingId(null);
      setDetailExpense(null);
      Alert.alert('Gönderildi', 'Harcama reddedildi ve personel bilgilendirildi.');
    },
    [rejectExpenseWithReason]
  );

  const handleNotAccepted = useCallback(
    async (e: ExpenseRow) => {
      setActingId(e.id);
      await rejectExpenseWithReason(e, 'Kabul edilmedi.');
      setActingId(null);
      setDetailExpense(null);
      Alert.alert('Gönderildi', 'Harcama reddedildi ve personel bilgilendirildi.');
    },
    [rejectExpenseWithReason]
  );

  const handleDeleteExpense = useCallback(
    (e: ExpenseRow) => {
      Alert.alert('Harcamayı sil', `${getExpenseSummary(e)} — Bu harcamayı silmek istediğinize emin misiniz?`, [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            setActingId(e.id);
            const { error } = await supabase.from('staff_expenses').delete().eq('id', e.id);
            setActingId(null);
            if (error) {
              Alert.alert('Hata', error.message);
              return;
            }
            if (e.staff_id) {
              await sendNotification({
                staffId: e.staff_id,
                title: 'Harcama silindi',
                body: `Girdiğiniz harcama kaldırıldı: ${getExpenseSummary(e)}`,
                category: 'admin',
                data: { screen: '/staff/expenses' },
                createdByStaffId: me?.id ?? null,
              });
            }
            setDetailExpense(null);
            load();
            Alert.alert('Silindi', 'Harcama kaldırıldı.');
          },
        },
      ]);
    },
    [load, me?.id]
  );

  const exportCsv = useCallback(() => {
    const lines = ['Tarih,Saat,Personel,Departman,Kategori,Tutar,Açıklama,Durum,Kayıt Zamanı'];
    for (const e of expenses.filter((x) => x.status !== 'rejected')) {
      const statusTr = e.status === 'approved' ? 'Onaylı' : e.status === 'rejected' ? 'Reddedilen' : 'Beklemede';
      lines.push(
        `"${e.expense_date}","${formatTimeOnly(e.expense_time)}","${(e.staff?.full_name ?? '').replace(/"/g, '""')}","${(e.staff?.department ?? '').replace(/"/g, '""')}","${(e.category?.name ?? '').replace(/"/g, '""')}",${e.amount},"${(e.description ?? '').replace(/"/g, '""')}","${statusTr}","${e.created_at}"`
      );
    }
    const csv = '\uFEFF' + lines.join('\n');
    if (Platform.OS === 'web') {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tum-harcamalar-${dateStart}-${dateEnd}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      Share.share({ message: csv, title: 'Tüm harcamalar (CSV)' }).catch(() => {});
    }
  }, [expenses, dateStart, dateEnd]);

  const exportPdf = useCallback(async (mode: 'share' | 'mail' = 'share') => {
    const forPdf = expenses.filter((e) => e.status !== 'rejected');
    const sorted = [...forPdf].sort(
      (a, b) => new Date(a.expense_date).getTime() - new Date(b.expense_date).getTime() ||
        (a.expense_time || '').localeCompare(b.expense_time || '')
    );
    let logoHtml = '';
    try {
      const asset = Asset.fromModule(require('@/assets/valoria-splash-logo.png'));
      await asset.downloadAsync();
      if (asset.localUri) {
        logoHtml = `<img src="${asset.localUri}" style="height:32px;margin-bottom:4px;" alt="Valoria" />`;
      }
    } catch {
      // Logo yüklenemezse sadece metin kullan
    }
    const periodLabel = `${dateStart} – ${dateEnd}`;
    const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;font-size:10px;color:#1e293b;padding:0;line-height:1.4}
.wrap{max-width:800px;margin:0 auto;padding:24px 20px}
.header{display:flex;align-items:center;justify-content:space-between;padding-bottom:16px;border-bottom:3px solid #0d9488;margin-bottom:20px}
.headerLeft{display:flex;align-items:center;gap:16px}
.logoWrap img{height:44px;display:block}
.brandWrap{}
.brand{font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.5px}
.brandSub{font-size:11px;color:#64748b;margin-top:2px;font-weight:500}
.reportTitle{font-size:14px;font-weight:700;color:#0d9488;text-align:right}
.reportMeta{font-size:9px;color:#64748b;margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:10px}
th,td{border:1px solid #cbd5e1;padding:8px 10px;text-align:left}
th{background:#0d9488;color:#fff;font-weight:700;font-size:10px}
td{background:#fff}
tr:nth-child(even) td{background:#f8fafc}
.colDate{width:95px;min-width:95px}
.colTime{width:50px;min-width:50px}
.colPerson{width:110px}
.colCat{width:95px}
.colAmount{width:75px;text-align:right;font-weight:600}
.colStatus{width:70px}
.colDesc{}
.totals{display:flex;justify-content:space-between;align-items:center;margin-top:20px;padding:14px 16px;background:#f1f5f9;border:1px solid #e2e8f0;font-weight:700;font-size:11px}
.footer{margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:9px;color:#94a3b8;text-align:center}
</style></head><body>
<div class="wrap">
<div class="header">
  <div class="headerLeft">${logoHtml ? `<div class="logoWrap">${logoHtml}</div>` : ''}<div class="brandWrap"><div class="brand">VALORİA HOTEL</div><div class="brandSub">Konaklama & Hizmetler</div></div></div>
  <div><div class="reportTitle">Tüm Harcamalar Raporu</div><div class="reportMeta">Dönem: ${periodLabel}<br>Oluşturulma: ${formatDateShort(new Date())}</div></div>
</div>
<table>
<tr><th class="colDate">Tarih</th><th class="colTime">Saat</th><th class="colPerson">Personel</th><th class="colCat">Kategori</th><th class="colAmount">Tutar</th><th class="colStatus">Durum</th><th class="colDesc">Açıklama</th></tr>
${sorted.map((e) => `<tr><td class="colDate">${formatDateShort(e.expense_date)}</td><td class="colTime">${formatTimeOnly(e.expense_time)}</td><td class="colPerson">${(e.staff?.full_name ?? '—').replace(/</g, '&lt;')}</td><td class="colCat">${(e.category?.name ?? '—').replace(/</g, '&lt;')}</td><td class="colAmount">${fmtMoney(Number(e.amount))}</td><td class="colStatus">${statusLabel(e.status)}</td><td class="colDesc">${(e.description ?? '—').replace(/</g, '&lt;')}</td></tr>`).join('')}
</table>
<div class="totals"><span>Kayıt: ${forPdf.length}</span><span>Onaylı toplam: ${fmtMoney(approvedTotal)}</span><span>Genel toplam: ${fmtMoney(totalAmount)}</span></div>
<div class="footer">VALORİA HOTEL · Bu rapor otomatik oluşturulmuştur.</div>
</div>
</body></html>`;
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (mode === 'mail') {
        await sendPdfToPrinterEmail({
          pdfUri: uri,
          subject: `Tüm Harcamalar Raporu ${dateStart} - ${dateEnd}`,
          fileName: `tum-harcamalar-${dateStart}-${dateEnd}.pdf`,
        });
        Alert.alert('Gönderildi', 'PDF yazıcı e-posta adresine gönderildi.');
        return;
      }
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Tüm harcamalar (PDF)' });
    } catch (e) {
      console.warn('PDF export failed', e);
      if (mode === 'mail') Alert.alert('Hata', (e as Error)?.message ?? 'Belge gönderilemedi.');
    }
  }, [expenses, dateStart, dateEnd, totalAmount, approvedTotal]);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <AdminOrganizationPicker
          canUseAll={me?.app_permissions?.super_admin === true || me?.role === 'admin'}
          ownOrganizationId={me?.organization_id}
        />
        <AdminCard>
          <Text style={styles.sectionTitle}>Tarih Aralığı</Text>
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
          <Text style={styles.summaryLiveLabel}>Güncel tutar (bu filtredeki tüm harcamalar)</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>Kayıt</Text>
              <Text style={styles.summaryValue}>{expenses.length}</Text>
            </View>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>Toplam</Text>
              <Text style={[styles.summaryValue, styles.summaryTotal]}>{fmtMoney(totalAmount)}</Text>
            </View>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>Onaylı</Text>
              <Text style={[styles.summaryValue, { color: adminTheme.colors.success }]}>{fmtMoney(approvedTotal)}</Text>
            </View>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>Beklemede</Text>
              <Text style={[styles.summaryValue, { color: adminTheme.colors.warning }]}>{fmtMoney(pendingTotal)}</Text>
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

        <Text style={styles.listTitle}>Tüm Harcamalar ({expenses.length})</Text>

        {loading ? (
          <ActivityIndicator size="large" color={adminTheme.colors.accent} style={styles.loader} />
        ) : expenses.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={48} color={adminTheme.colors.textMuted} />
            <Text style={styles.emptyText}>Bu aralıkta harcama bulunamadı.</Text>
          </View>
        ) : (
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <Text style={[styles.tableCell, styles.thDate]}>Tarih</Text>
              <Text style={[styles.tableCell, styles.thTime]}>Saat</Text>
              <Text style={[styles.tableCell, styles.thName]}>Personel</Text>
              <Text style={[styles.tableCell, styles.thCat]}>Kategori</Text>
              <Text style={[styles.tableCell, styles.thAmount]}>Tutar</Text>
              <Text style={[styles.tableCell, styles.thStatus]}>Durum</Text>
              <Text style={[styles.tableCell, styles.thReceipt]}>Fiş</Text>
              <Text style={[styles.tableCell, styles.thPdf]}>PDF</Text>
            </View>
            {expenses.map((e) => (
              <TouchableOpacity
                key={e.id}
                style={styles.tableRow}
                onPress={() => setDetailExpense(e)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tableCell, styles.thDate]}>{formatDateShort(e.expense_date)}</Text>
                <Text style={[styles.tableCell, styles.thTime]}>{formatTimeOnly(e.expense_time)}</Text>
                <Text style={[styles.tableCell, styles.thName]} numberOfLines={1}>
                  {e.staff?.full_name ?? '—'}
                </Text>
                <Text style={[styles.tableCell, styles.thCat]} numberOfLines={1}>
                  {e.category?.name ?? '—'}
                </Text>
                <Text style={[styles.tableCell, styles.thAmount]}>{fmtMoney(Number(e.amount))}</Text>
                <View style={[styles.tableCell, styles.thStatus]}>
                  <Ionicons name={statusIcon(e.status) as any} size={18} color={statusColor(e.status)} />
                </View>
                {e.receipt_image_url ? (
                  <TouchableOpacity
                    style={[styles.tableCell, styles.thReceipt]}
                    onPress={(ev) => { ev.stopPropagation(); setReceiptModal(e.receipt_image_url!); }}
                  >
                    <Ionicons name="image" size={18} color={adminTheme.colors.accent} />
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.tableCell, styles.thReceipt]} />
                )}
                <TouchableOpacity
                  style={[styles.tableCell, styles.thPdf]}
                  onPress={(ev) => { ev.stopPropagation(); exportSingleExpensePdf(e); }}
                  disabled={pdfExportingStaffId === e.staff_id || mailSendingKey === `staff:${e.staff_id}`}
                >
                  {pdfExportingStaffId === e.staff_id ? (
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

      <Modal visible={!!detailExpense} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setDetailExpense(null)}>
          <Pressable style={styles.detailCard} onPress={(e) => e.stopPropagation()}>
            <ScrollView style={styles.detailScroll} showsVerticalScrollIndicator={false}>
            {detailExpense && (
              <>
                <View style={styles.detailHeader}>
                  <Text style={styles.detailTitle}>Harcama Detayı</Text>
                  <TouchableOpacity onPress={() => setDetailExpense(null)} hitSlop={12}>
                    <Ionicons name="close" size={24} color={adminTheme.colors.textMuted} />
                  </TouchableOpacity>
                </View>
                <View style={styles.detailBody}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Tarih</Text>
                    <Text style={styles.detailValue}>{formatDateShort(detailExpense.expense_date)} {formatTimeOnly(detailExpense.expense_time)}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Personel</Text>
                    <Text style={styles.detailValue}>{detailExpense.staff?.full_name ?? '—'} {detailExpense.staff?.department ? `(${detailExpense.staff.department})` : ''}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Kategori</Text>
                    <Text style={styles.detailValue}>{detailExpense.category?.name ?? '—'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Tutar</Text>
                    <Text style={[styles.detailValue, styles.detailAmount]}>{fmtMoney(Number(detailExpense.amount))}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Durum</Text>
                    <View style={styles.detailStatusWrap}>
                      <Ionicons name={statusIcon(detailExpense.status) as any} size={18} color={statusColor(detailExpense.status)} />
                      <Text style={styles.detailValue}>{statusLabel(detailExpense.status)}</Text>
                    </View>
                  </View>
                  {detailExpense.description ? (
                    <View style={[styles.detailRow, styles.detailRowBlock]}>
                      <Text style={styles.detailLabel}>Açıklama</Text>
                      <Text style={[styles.detailValue, styles.detailDesc]}>{detailExpense.description}</Text>
                    </View>
                  ) : null}
                  {detailExpense.receipt_image_url ? (
                    <TouchableOpacity
                      style={styles.detailReceiptBtn}
                      onPress={() => { setDetailExpense(null); setReceiptModal(detailExpense.receipt_image_url); }}
                    >
                      <Ionicons name="image-outline" size={20} color={adminTheme.colors.accent} />
                      <Text style={styles.detailReceiptText}>Fiş görüntüle</Text>
                    </TouchableOpacity>
                  ) : null}
                    <TouchableOpacity
                      style={styles.detailPdfBtn}
                      onPress={() => exportSingleExpensePdf(detailExpense)}
                      disabled={pdfExportingStaffId === detailExpense.staff_id || mailSendingKey === `staff:${detailExpense.staff_id}`}
                    >
                      {pdfExportingStaffId === detailExpense.staff_id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="document-text-outline" size={20} color="#fff" />
                          <Text style={styles.detailPdfBtnText}>Harcama Bildirimi PDF</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.detailPdfBtn, { marginTop: 10, backgroundColor: adminTheme.colors.surfaceTertiary }]}
                      onPress={() => exportSingleExpensePdf(detailExpense, 'mail')}
                      disabled={mailSendingKey === `staff:${detailExpense.staff_id}`}
                    >
                      {mailSendingKey === `staff:${detailExpense.staff_id}` ? (
                        <ActivityIndicator size="small" color={adminTheme.colors.accent} />
                      ) : (
                        <>
                          <Ionicons name="mail-outline" size={20} color={adminTheme.colors.accent} />
                    <Text style={[styles.detailPdfBtnText, { color: adminTheme.colors.accent }]}>Tek Belgeyi Mail Gönder</Text>
                        </>
                      )}
                    </TouchableOpacity>

                  <View style={styles.detailActionsSection}>
                    {detailExpense.status === 'pending' && (
                      <TouchableOpacity
                        style={[styles.detailActionBtn, styles.detailActionBtnApprove]}
                        onPress={async () => {
                          setActingId(detailExpense.id);
                          try {
                            await approveExpense(detailExpense);
                            Alert.alert('Onaylandı', 'Harcama onaylandı.');
                          } finally {
                            setActingId(null);
                          }
                        }}
                        disabled={actingId === detailExpense.id}
                      >
                        {actingId === detailExpense.id ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="checkmark-circle" size={20} color="#fff" />
                            <Text style={styles.detailActionBtnText}>Onayla</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                    <Text style={styles.detailActionsLabel}>Geri bildirim gönder</Text>
                    <View style={styles.detailActionRow}>
                      <TouchableOpacity
                        style={[styles.detailActionBtn, styles.detailActionBtnWarn]}
                        onPress={() => handleExpenseWrong(detailExpense)}
                        disabled={actingId === detailExpense.id}
                      >
                        {actingId === detailExpense.id ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.detailActionBtnText}>Harcama yanlış</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.detailActionBtn, styles.detailActionBtnWarn]}
                        onPress={() => handleDuplicateEntry(detailExpense)}
                        disabled={actingId === detailExpense.id}
                      >
                        <Text style={styles.detailActionBtnText}>Gereksiz tekrar giriş</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.detailActionBtn, styles.detailActionBtnWarn]}
                        onPress={() => handleNotAccepted(detailExpense)}
                        disabled={actingId === detailExpense.id}
                      >
                        <Text style={styles.detailActionBtnText}>Kabul edilmedi</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      style={[styles.detailActionBtn, styles.detailActionBtnDanger]}
                      onPress={() => handleDeleteExpense(detailExpense)}
                      disabled={actingId === detailExpense.id}
                    >
                      <Ionicons name="trash-outline" size={18} color="#fff" />
                      <Text style={styles.detailActionBtnText}>Harcama sil</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!receiptModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setReceiptModal(null)}>
          <View style={styles.modalContent}>
            {receiptModal ? (
              <CachedImage uri={receiptModal} style={styles.modalImage} contentFit="contain" />
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
  detailReceiptBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 16, paddingVertical: 14, backgroundColor: adminTheme.colors.surfaceTertiary, borderRadius: 10 },
  detailReceiptText: { fontSize: 16, fontWeight: '600', color: adminTheme.colors.accent },
  detailActionsSection: { marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: adminTheme.colors.borderLight },
  detailActionsLabel: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.textMuted, marginBottom: 10, textTransform: 'uppercase' },
  detailActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  detailActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  detailActionBtnApprove: { backgroundColor: adminTheme.colors.success, marginBottom: 12 },
  detailActionBtnWarn: { backgroundColor: adminTheme.colors.warning },
  detailActionBtnDanger: { backgroundColor: adminTheme.colors.error },
  detailActionBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  listTitle: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.text, marginTop: 20, marginBottom: 12 },
  loader: { marginVertical: 24 },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 14, color: adminTheme.colors.textMuted, marginTop: 12 },
  table: { backgroundColor: adminTheme.colors.surface, borderRadius: 8, borderWidth: 1, borderColor: adminTheme.colors.border, overflow: 'hidden' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: adminTheme.colors.borderLight },
  tableHeader: { backgroundColor: adminTheme.colors.surfaceTertiary },
  tableCell: { fontSize: 12 },
  thDate: { width: 72 },
  thTime: { width: 48 },
  thName: { flex: 1, maxWidth: 90 },
  thCat: { flex: 1, maxWidth: 80 },
  thAmount: { width: 72, fontWeight: '600' },
  thStatus: { width: 32 },
  thReceipt: { width: 36 },
  thPdf: { width: 40 },
  detailPdfBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 16, paddingVertical: 14, backgroundColor: adminTheme.colors.accent, borderRadius: 10 },
  detailPdfBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', maxHeight: '85%', alignItems: 'center' },
  modalImage: { width: '100%', height: 400, borderRadius: 8 },
  modalClose: { marginTop: 16, paddingVertical: 10, paddingHorizontal: 24, backgroundColor: adminTheme.colors.surface },
  modalCloseText: { fontSize: 16, fontWeight: '600', color: adminTheme.colors.text },
});
