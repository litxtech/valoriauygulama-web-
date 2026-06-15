import { memo, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
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
import { ExpenseReceiptThumbnail } from '@/components/expenses/ExpenseReceiptThumbnail';
import { expenseReceiptPreviewModalStyle } from '@/lib/expenseReceiptPreviewStyles';
import { formatDateShort } from '@/lib/date';
import { sendPdfToPrinterEmail } from '@/lib/printerEmail';
import { confirmBulkApproval, pickExpenseRejectReason } from '@/lib/adminExpenseRejectReasons';
import { shareStaffExpenseWhatsApp } from '@/lib/staffExpenseShare';
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

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const STATUS_OPTIONS: { value: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'all', label: 'Tümü', icon: 'layers-outline' },
  { value: 'approved', label: 'Onaylı', icon: 'checkmark-circle-outline' },
  { value: 'pending', label: 'Beklemede', icon: 'time-outline' },
  { value: 'rejected', label: 'Reddedilen', icon: 'close-circle-outline' },
];

const PERIOD_PRESETS = [
  { id: 'this_month', label: 'Bu ay' },
  { id: 'last_month', label: 'Geçen ay' },
  { id: 'last_7', label: 'Son 7 gün' },
  { id: 'last_30', label: 'Son 30 gün' },
] as const;

type PeriodPresetId = (typeof PERIOD_PRESETS)[number]['id'];

function getDefaultDates(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: toIsoDate(start), end: toIsoDate(end) };
}

function getPeriodDates(id: PeriodPresetId): { start: string; end: string } {
  const now = new Date();
  if (id === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: toIsoDate(start), end: toIsoDate(end) };
  }
  if (id === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: toIsoDate(start), end: toIsoDate(end) };
  }
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - (id === 'last_7' ? 6 : 29));
  return { start: toIsoDate(start), end: toIsoDate(end) };
}

function formatPeriodLabel(start: string, end: string): string {
  if (!start || !end) return 'Tarih seçin';
  return `${formatDateShort(start)} – ${formatDateShort(end)}`;
}

function statusIcon(s: string) {
  return s === 'approved' ? 'checkmark-circle' : s === 'rejected' ? 'close-circle' : 'time';
}

function statusColor(s: string) {
  return s === 'approved' ? adminTheme.colors.success : s === 'rejected' ? adminTheme.colors.error : adminTheme.colors.warning;
}

function statusLabel(s: string) {
  return s === 'approved' ? 'Onaylı' : s === 'rejected' ? 'Reddedilen' : 'Beklemede';
}

function statusBg(s: string) {
  return s === 'approved' ? adminTheme.colors.successLight : s === 'rejected' ? adminTheme.colors.errorLight : adminTheme.colors.warningLight;
}

function StatTile({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string;
  color?: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.statTile}>
      <View style={[styles.statIconWrap, { backgroundColor: (color ?? adminTheme.colors.accent) + '18' }]}>
        <Ionicons name={icon} size={18} color={color ?? adminTheme.colors.accent} />
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <View style={[styles.statusBadge, { backgroundColor: statusBg(status) }]}>
      <Ionicons name={statusIcon(status) as keyof typeof Ionicons.glyphMap} size={13} color={statusColor(status)} />
      <Text style={[styles.statusBadgeText, { color: statusColor(status) }]}>{statusLabel(status)}</Text>
    </View>
  );
}

const ExpenseListCard = memo(function ExpenseListCard({
  expense,
  selected,
  showSelect,
  onToggleSelect,
  onPress,
  onReceipt,
  onPdf,
  onWhatsApp,
  pdfLoading,
  whatsappLoading,
}: {
  expense: ExpenseRow;
  selected?: boolean;
  showSelect?: boolean;
  onToggleSelect?: () => void;
  onPress: () => void;
  onReceipt: () => void;
  onPdf: () => void;
  onWhatsApp: () => void;
  pdfLoading: boolean;
  whatsappLoading: boolean;
}) {
  const staffInitial = (expense.staff?.full_name ?? '?').charAt(0).toUpperCase();
  const stripeColor = statusColor(expense.status);

  return (
    <TouchableOpacity
      style={[styles.expenseCard, selected && styles.expenseCardSelected]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[styles.statusStripe, { backgroundColor: stripeColor }]} />

      <View style={styles.expenseCardInner}>
        {showSelect ? (
          <TouchableOpacity
            style={styles.cardSelectBtn}
            onPress={(ev) => {
              ev.stopPropagation();
              onToggleSelect?.();
            }}
            hitSlop={8}
          >
            <Ionicons
              name={selected ? 'checkbox' : 'square-outline'}
              size={22}
              color={selected ? adminTheme.colors.accent : adminTheme.colors.textMuted}
            />
          </TouchableOpacity>
        ) : null}

        <View style={styles.expenseCardBody}>
          <View style={styles.expenseCardHeader}>
            <Text style={styles.expenseAmount}>{fmtMoney(Number(expense.amount))}</Text>
            <StatusBadge status={expense.status} />
          </View>

          <View style={styles.staffRow}>
            <View style={styles.staffAvatar}>
              <Text style={styles.staffAvatarText}>{staffInitial}</Text>
            </View>
            <View style={styles.staffInfo}>
              <Text style={styles.staffName} numberOfLines={1}>
                {expense.staff?.full_name ?? '—'}
              </Text>
              {expense.staff?.department ? (
                <Text style={styles.staffDept} numberOfLines={1}>
                  {expense.staff.department}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.expenseMetaRow}>
            <View style={styles.metaChip}>
              <Ionicons name="calendar-outline" size={13} color={adminTheme.colors.textMuted} />
              <Text style={styles.metaChipText}>
                {formatDateShort(expense.expense_date)} · {formatTimeOnly(expense.expense_time)}
              </Text>
            </View>
            <View style={styles.categoryPill}>
              <Ionicons name="pricetag-outline" size={12} color={adminTheme.colors.textSecondary} />
              <Text style={styles.categoryPillText} numberOfLines={1}>
                {expense.category?.name ?? 'Kategori yok'}
              </Text>
            </View>
          </View>

          {expense.description ? (
            <Text style={styles.expenseDesc} numberOfLines={2}>
              {expense.description}
            </Text>
          ) : null}

          {expense.receipt_image_url ? (
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={(ev) => {
                ev.stopPropagation();
                onReceipt();
              }}
              style={styles.expenseReceiptPreview}
            >
              <ExpenseReceiptThumbnail uri={expense.receipt_image_url} />
            </TouchableOpacity>
          ) : null}

          <View style={styles.expenseCardFooter}>
            <View style={styles.cardActions}>
              <TouchableOpacity
                style={styles.cardActionBtn}
                onPress={(ev) => {
                  ev.stopPropagation();
                  onWhatsApp();
                }}
                disabled={whatsappLoading}
                hitSlop={8}
                accessibilityLabel="WhatsApp ile paylaş"
              >
                {whatsappLoading ? (
                  <ActivityIndicator size="small" color="#25D366" />
                ) : (
                  <Ionicons name="logo-whatsapp" size={17} color="#25D366" />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cardActionBtn}
                onPress={(ev) => {
                  ev.stopPropagation();
                  onPdf();
                }}
                disabled={pdfLoading}
                hitSlop={8}
                accessibilityLabel="PDF oluştur"
              >
                {pdfLoading ? (
                  <ActivityIndicator size="small" color={adminTheme.colors.accent} />
                ) : (
                  <Ionicons name="document-text-outline" size={17} color={adminTheme.colors.accent} />
                )}
              </TouchableOpacity>
            </View>
            <Ionicons name="chevron-forward" size={18} color={adminTheme.colors.textMuted} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});

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
  const [activePreset, setActivePreset] = useState<PeriodPresetId | null>('this_month');
  const [searchQuery, setSearchQuery] = useState('');
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [receiptModal, setReceiptModal] = useState<string | null>(null);
  const [detailExpense, setDetailExpense] = useState<ExpenseRow | null>(null);
  const [pdfExportingStaffId, setPdfExportingStaffId] = useState<string | null>(null);
  const [mailSendingKey, setMailSendingKey] = useState<string | null>(null);
  const [whatsappSharingKey, setWhatsappSharingKey] = useState<string | null>(null);
  const [selectedPendingIds, setSelectedPendingIds] = useState<Set<string>>(() => new Set());
  const [bulkActing, setBulkActing] = useState(false);
  const hasLoadedOnceRef = useRef(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? hasLoadedOnceRef.current;
    if (!silent) setLoading(true);
    const canUseAll = me?.app_permissions?.super_admin === true || me?.role === 'admin';
    const orgId = canUseAll ? selectedOrganizationId : me?.organization_id;
    const start = dateStart || '2020-01-01';
    const end = dateEnd || '2030-12-31';

    let query = supabase
      .from('staff_expenses')
      .select(
        'id, amount, description, receipt_image_url, status, expense_date, expense_time, created_at, staff_id, staff:staff_id(full_name, department), category:category_id(name)'
      )
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
    hasLoadedOnceRef.current = true;
    setLoading(false);
  }, [dateStart, dateEnd, me?.app_permissions?.super_admin, me?.organization_id, selectedOrganizationId, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel('expenses-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_expenses' }, () => {
        void load({ silent: true });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load({ silent: true }).finally(() => setRefreshing(false));
  }, [load]);

  const { totalAmount, approvedTotal, pendingTotal, pendingCount } = useMemo(() => {
    let approved = 0;
    let pending = 0;
    let pendingN = 0;
    let total = 0;
    for (const e of expenses) {
      const amt = Number(e.amount) || 0;
      if (e.status === 'approved') approved += amt;
      else if (e.status === 'pending') {
        pending += amt;
        pendingN += 1;
      }
      if (e.status !== 'rejected') total += amt;
    }
    return { totalAmount: total, approvedTotal: approved, pendingTotal: pending, pendingCount: pendingN };
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return expenses;
    return expenses.filter((e) => {
      const haystack = [
        e.staff?.full_name,
        e.staff?.department,
        e.category?.name,
        e.description,
        fmtMoney(Number(e.amount)),
        statusLabel(e.status),
        formatDateShort(e.expense_date),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [expenses, searchQuery]);

  const pendingInList = useMemo(
    () => filteredExpenses.filter((e) => e.status === 'pending'),
    [filteredExpenses]
  );

  const pendingSelectedRows = useMemo(
    () => pendingInList.filter((e) => selectedPendingIds.has(e.id)),
    [pendingInList, selectedPendingIds]
  );

  const getExpenseSummary = (e: ExpenseRow) =>
    `${fmtMoney(Number(e.amount))} · ${formatDateShort(e.expense_date)} · ${e.category?.name ?? '—'}`;

  const applyPreset = (id: PeriodPresetId) => {
    const { start, end } = getPeriodDates(id);
    setActivePreset(id);
    setDateStart(start);
    setDateEnd(end);
  };

  const shareExpenseWhatsApp = useCallback(async (e: ExpenseRow) => {
    setWhatsappSharingKey(e.id);
    try {
      await shareStaffExpenseWhatsApp(e);
    } catch (err) {
      Alert.alert('Hata', (err as Error)?.message ?? 'WhatsApp paylaşımı tamamlanamadı.');
    } finally {
      setWhatsappSharingKey(null);
    }
  }, []);

  const exportSingleExpensePdf = useCallback(async (e: ExpenseRow, mode: 'share' | 'mail' = 'share') => {
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
  }, []);

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

  const bulkApproveRows = async (rows: ExpenseRow[]) => {
    if (!me?.id || !rows.length) return;
    setBulkActing(true);
    let ok = 0;
    for (const e of rows) {
      const { error } = await supabase
        .from('staff_expenses')
        .update({
          status: 'approved',
          approved_by: me.id,
          approved_at: new Date().toISOString(),
          rejection_reason: null,
        })
        .eq('id', e.id);
      if (!error) {
        ok++;
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
      }
    }
    setDetailExpense(null);
    setBulkActing(false);
    setSelectedPendingIds(new Set());
    await load();
    Alert.alert('Tamam', `${ok} harcama onaylandı.`);
  };

  const bulkRejectRows = async (rows: ExpenseRow[], reason: string) => {
    if (!rows.length || !me?.id) return;
    setBulkActing(true);
    let ok = 0;
    for (const e of rows) {
      const { error } = await supabase
        .from('staff_expenses')
        .update({
          status: 'rejected',
          approved_by: me.id,
          approved_at: new Date().toISOString(),
          rejection_reason: reason,
        })
        .eq('id', e.id);
      if (!error) {
        ok++;
        await sendExpenseFeedbackToStaff(e, reason);
      }
    }
    setDetailExpense(null);
    setBulkActing(false);
    setSelectedPendingIds(new Set());
    await load();
    Alert.alert('Tamam', `${ok} harcama reddedildi.`);
  };

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

  const exportPdf = useCallback(
    async (mode: 'share' | 'mail' = 'share') => {
      const forPdf = expenses.filter((e) => e.status !== 'rejected');
      const sorted = [...forPdf].sort(
        (a, b) =>
          new Date(a.expense_date).getTime() - new Date(b.expense_date).getTime() ||
          (a.expense_time || '').localeCompare(b.expense_time || '')
      );
      let logoHtml = '';
      try {
        const asset = Asset.fromModule(require('@/assets/valoria-splash-logo.png'));
        await asset.downloadAsync();
        if (asset.localUri) {
          logoHtml = `<img src="${asset.localUri}" style="height:32px;margin-bottom:4px;" alt="Valoria" />`;
        }
      } catch {}
      const periodLabel = `${dateStart} – ${dateEnd}`;
      const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;font-size:10px;color:#1e293b;padding:0;line-height:1.4}
.wrap{max-width:800px;margin:0 auto;padding:24px 20px}
.header{display:flex;align-items:center;justify-content:space-between;padding-bottom:16px;border-bottom:3px solid #0d9488;margin-bottom:20px}
.headerLeft{display:flex;align-items:center;gap:16px}
.logoWrap img{height:44px;display:block}
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
.totals{display:flex;justify-content:space-between;align-items:center;margin-top:20px;padding:14px 16px;background:#f1f5f9;border:1px solid #e2e8f0;font-weight:700;font-size:11px}
.footer{margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:9px;color:#94a3b8;text-align:center}
</style></head><body>
<div class="wrap">
<div class="header">
  <div class="headerLeft">${logoHtml ? `<div class="logoWrap">${logoHtml}</div>` : ''}<div><div class="brand">VALORİA HOTEL</div><div class="brandSub">Konaklama & Hizmetler</div></div></div>
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
    },
    [expenses, dateStart, dateEnd, totalAmount, approvedTotal]
  );

  const togglePendingSelection = useCallback((id: string) => {
    setSelectedPendingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const renderExpenseItem = useCallback(
    ({ item: e }: { item: ExpenseRow }) => (
      <ExpenseListCard
        expense={e}
        showSelect={e.status === 'pending'}
        selected={selectedPendingIds.has(e.id)}
        onToggleSelect={() => togglePendingSelection(e.id)}
        onPress={() => setDetailExpense(e)}
        onReceipt={() => setReceiptModal(e.receipt_image_url!)}
        onPdf={() => exportSingleExpensePdf(e)}
        onWhatsApp={() => void shareExpenseWhatsApp(e)}
        pdfLoading={pdfExportingStaffId === e.staff_id || mailSendingKey === `staff:${e.staff_id}`}
        whatsappLoading={whatsappSharingKey === e.id}
      />
    ),
    [
      exportSingleExpensePdf,
      mailSendingKey,
      pdfExportingStaffId,
      selectedPendingIds,
      shareExpenseWhatsApp,
      togglePendingSelection,
      whatsappSharingKey,
    ]
  );

  const listHeader = (
    <>
        <AdminOrganizationPicker
          canUseAll={me?.app_permissions?.super_admin === true || me?.role === 'admin'}
          ownOrganizationId={me?.organization_id}
        />

        <AdminCard style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View>
              <Text style={styles.heroEyebrow}>Seçili dönem özeti</Text>
              <Text style={styles.heroPeriod}>{formatPeriodLabel(dateStart, dateEnd)}</Text>
            </View>
            <View style={styles.heroTotalWrap}>
              <Text style={styles.heroTotalLabel}>Toplam</Text>
              <Text style={styles.heroTotalValue}>{fmtMoney(totalAmount)}</Text>
            </View>
          </View>
          <Text style={styles.heroHint}>Reddedilenler hariç · Onaylı + beklemedeki harcamalar</Text>
          <View style={styles.statGrid}>
            <StatTile label="Onaylı" value={fmtMoney(approvedTotal)} color={adminTheme.colors.success} icon="checkmark-circle-outline" />
            <StatTile label="Beklemede" value={fmtMoney(pendingTotal)} color={adminTheme.colors.warning} icon="time-outline" />
            <StatTile label="Kayıt" value={String(expenses.length)} icon="receipt-outline" />
            <StatTile
              label="Onay bekleyen"
              value={String(pendingCount)}
              color={pendingCount > 0 ? adminTheme.colors.warning : adminTheme.colors.textSecondary}
              icon="alert-circle-outline"
            />
          </View>
        </AdminCard>

        <AdminCard style={styles.filterCard}>
          <TouchableOpacity style={styles.filterHeader} onPress={() => setFiltersExpanded((v) => !v)} activeOpacity={0.8}>
            <View style={styles.filterHeaderLeft}>
              <Ionicons name="options-outline" size={20} color={adminTheme.colors.accent} />
              <View>
                <Text style={styles.filterTitle}>Filtreler</Text>
                <Text style={styles.filterSubtitle}>
                  {statusFilter === 'all' ? 'Tüm durumlar' : statusLabel(statusFilter)} · {formatPeriodLabel(dateStart, dateEnd)}
                </Text>
              </View>
            </View>
            <Ionicons name={filtersExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={adminTheme.colors.textMuted} />
          </TouchableOpacity>

          {filtersExpanded ? (
            <View style={styles.filterBody}>
              <Text style={styles.filterSectionLabel}>Hızlı dönem</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {PERIOD_PRESETS.map((p) => {
                  const active = activePreset === p.id;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => applyPreset(p.id)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={styles.filterSectionLabel}>Tarih aralığı</Text>
              <View style={styles.dateRow}>
                <View style={styles.dateInputWrap}>
                  <Text style={styles.dateLabel}>Başlangıç</Text>
                  <View style={styles.dateInputBox}>
                    <Ionicons name="calendar-outline" size={16} color={adminTheme.colors.textMuted} />
                    <TextInput
                      style={styles.dateInput}
                      value={dateStart}
                      onChangeText={(v) => {
                        setActivePreset(null);
                        setDateStart(v);
                      }}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={adminTheme.colors.textMuted}
                    />
                  </View>
                </View>
                <View style={styles.dateInputWrap}>
                  <Text style={styles.dateLabel}>Bitiş</Text>
                  <View style={styles.dateInputBox}>
                    <Ionicons name="calendar-outline" size={16} color={adminTheme.colors.textMuted} />
                    <TextInput
                      style={styles.dateInput}
                      value={dateEnd}
                      onChangeText={(v) => {
                        setActivePreset(null);
                        setDateEnd(v);
                      }}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={adminTheme.colors.textMuted}
                    />
                  </View>
                </View>
              </View>

              <Text style={styles.filterSectionLabel}>Durum</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {STATUS_OPTIONS.map((opt) => {
                  const active = statusFilter === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setStatusFilter(opt.value)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name={opt.icon} size={14} color={active ? '#fff' : adminTheme.colors.textSecondary} />
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <TouchableOpacity style={styles.applyBtn} onPress={() => void load({ silent: true })} activeOpacity={0.85}>
                <Ionicons name="search" size={18} color="#fff" />
                <Text style={styles.applyBtnText}>Listeyi güncelle</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </AdminCard>

        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color={adminTheme.colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Personel, kategori veya açıklama ara…"
            placeholderTextColor={adminTheme.colors.textMuted}
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={adminTheme.colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.exportRow}>
          <TouchableOpacity style={styles.exportBtn} onPress={exportCsv} activeOpacity={0.8}>
            <Ionicons name="download-outline" size={18} color={adminTheme.colors.accent} />
            <Text style={styles.exportBtnText}>CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.exportBtn} onPress={() => exportPdf()} activeOpacity={0.8}>
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

        <View style={styles.listHeader}>
          <View>
            <Text style={styles.listTitle}>Harcamalar</Text>
            <Text style={styles.listSubtitle}>Dönem içindeki tüm kayıtlar</Text>
          </View>
          <View style={styles.listCountBadge}>
            <Text style={styles.listCount}>
              {searchQuery.trim() ? `${filteredExpenses.length} / ${expenses.length}` : expenses.length}
            </Text>
          </View>
        </View>

        {pendingInList.length > 0 ? (
          <View style={styles.bulkRow}>
            <TouchableOpacity
              style={styles.bulkBtn}
              onPress={() => setSelectedPendingIds(new Set(pendingInList.map((e) => e.id)))}
              disabled={bulkActing}
            >
              <Text style={styles.bulkBtnText}>Tümünü seç ({pendingInList.length})</Text>
            </TouchableOpacity>
            {selectedPendingIds.size > 0 ? (
              <TouchableOpacity style={styles.bulkBtnMuted} onPress={() => setSelectedPendingIds(new Set())}>
                <Text style={styles.bulkBtnMutedText}>Seçimi kaldır</Text>
              </TouchableOpacity>
            ) : null}
            {selectedPendingIds.size > 0 ? (
              <>
                <TouchableOpacity
                  style={[styles.bulkBtn, styles.bulkBtnOk]}
                  onPress={() =>
                    confirmBulkApproval(pendingSelectedRows.length, () => void bulkApproveRows(pendingSelectedRows))
                  }
                  disabled={bulkActing}
                >
                  <Text style={styles.bulkBtnTextLight}>Seçilenleri onayla</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.bulkBtn, styles.bulkBtnNo]}
                  onPress={() =>
                    pickExpenseRejectReason(
                      (reason) => void bulkRejectRows(pendingSelectedRows, reason),
                      'Seçilenleri reddet'
                    )
                  }
                  disabled={bulkActing}
                >
                  <Text style={styles.bulkBtnTextLight}>Reddet</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.bulkBtn, styles.bulkBtnOk]}
                  onPress={() =>
                    confirmBulkApproval(pendingInList.length, () => void bulkApproveRows(pendingInList), 'Tümünü onayla')
                  }
                  disabled={bulkActing}
                >
                  <Text style={styles.bulkBtnTextLight}>Tümünü onayla</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.bulkBtn, styles.bulkBtnNo]}
                  onPress={() =>
                    pickExpenseRejectReason(
                      (reason) => void bulkRejectRows(pendingInList, reason),
                      'Tümünü reddet'
                    )
                  }
                  disabled={bulkActing}
                >
                  <Text style={styles.bulkBtnTextLight}>Tümünü reddet</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : null}
    </>
  );

  const listEmpty = loading ? (
    <ActivityIndicator size="large" color={adminTheme.colors.accent} style={styles.loader} />
  ) : (
    <View style={styles.empty}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name="receipt-outline" size={40} color={adminTheme.colors.textMuted} />
      </View>
      <Text style={styles.emptyTitle}>
        {searchQuery.trim() ? 'Arama sonucu bulunamadı' : 'Bu aralıkta harcama yok'}
      </Text>
      <Text style={styles.emptyText}>
        {searchQuery.trim()
          ? 'Farklı bir anahtar kelime deneyin veya filtreleri genişletin.'
          : 'Tarih aralığını veya durum filtresini değiştirerek tekrar deneyin.'}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredExpenses}
        keyExtractor={(e) => e.id}
        renderItem={renderExpenseItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={styles.cardSeparator} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={adminTheme.colors.accent} />}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
      />

      <Modal visible={!!detailExpense} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setDetailExpense(null)}>
          <Pressable style={styles.detailCard} onPress={(ev) => ev.stopPropagation()}>
            <ScrollView style={styles.detailScroll} showsVerticalScrollIndicator={false}>
              {detailExpense ? (
                <>
                  <View style={styles.detailHeader}>
                    <Text style={styles.detailTitle}>Harcama detayı</Text>
                    <TouchableOpacity onPress={() => setDetailExpense(null)} hitSlop={12}>
                      <Ionicons name="close" size={24} color={adminTheme.colors.textMuted} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.detailHero}>
                    <Text style={styles.detailHeroAmount}>{fmtMoney(Number(detailExpense.amount))}</Text>
                    <StatusBadge status={detailExpense.status} />
                  </View>

                  <View style={styles.detailInfoGrid}>
                    <View style={styles.detailInfoItem}>
                      <Ionicons name="calendar-outline" size={18} color={adminTheme.colors.accent} />
                      <View style={styles.detailInfoText}>
                        <Text style={styles.detailInfoLabel}>Tarih & saat</Text>
                        <Text style={styles.detailInfoValue}>
                          {formatDateShort(detailExpense.expense_date)} · {formatTimeOnly(detailExpense.expense_time)}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.detailInfoItem}>
                      <Ionicons name="person-outline" size={18} color={adminTheme.colors.accent} />
                      <View style={styles.detailInfoText}>
                        <Text style={styles.detailInfoLabel}>Personel</Text>
                        <Text style={styles.detailInfoValue}>
                          {detailExpense.staff?.full_name ?? '—'}
                          {detailExpense.staff?.department ? ` · ${detailExpense.staff.department}` : ''}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.detailInfoItem}>
                      <Ionicons name="pricetag-outline" size={18} color={adminTheme.colors.accent} />
                      <View style={styles.detailInfoText}>
                        <Text style={styles.detailInfoLabel}>Kategori</Text>
                        <Text style={styles.detailInfoValue}>{detailExpense.category?.name ?? '—'}</Text>
                      </View>
                    </View>
                    {detailExpense.description ? (
                      <View style={[styles.detailInfoItem, styles.detailInfoItemBlock]}>
                        <Ionicons name="document-text-outline" size={18} color={adminTheme.colors.accent} />
                        <View style={styles.detailInfoText}>
                          <Text style={styles.detailInfoLabel}>Açıklama</Text>
                          <Text style={styles.detailInfoValue}>{detailExpense.description}</Text>
                        </View>
                      </View>
                    ) : null}
                  </View>

                  {detailExpense.receipt_image_url ? (
                    <ExpenseReceiptThumbnail
                      uri={detailExpense.receipt_image_url}
                      onPress={() => {
                        setDetailExpense(null);
                        setReceiptModal(detailExpense.receipt_image_url);
                      }}
                      style={styles.detailReceiptPreview}
                    />
                  ) : null}

                  <View style={styles.detailDocRow}>
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
                          <Text style={styles.detailPdfBtnText}>PDF oluştur</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.detailPdfBtnSecondary}
                      onPress={() => exportSingleExpensePdf(detailExpense, 'mail')}
                      disabled={mailSendingKey === `staff:${detailExpense.staff_id}`}
                    >
                      {mailSendingKey === `staff:${detailExpense.staff_id}` ? (
                        <ActivityIndicator size="small" color={adminTheme.colors.accent} />
                      ) : (
                        <>
                          <Ionicons name="mail-outline" size={20} color={adminTheme.colors.accent} />
                          <Text style={styles.detailPdfBtnSecondaryText}>Mail gönder</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={styles.detailWhatsAppBtn}
                    onPress={() => void shareExpenseWhatsApp(detailExpense)}
                    disabled={whatsappSharingKey === detailExpense.id}
                    activeOpacity={0.88}
                  >
                    {whatsappSharingKey === detailExpense.id ? (
                      <ActivityIndicator size="small" color="#25D366" />
                    ) : (
                      <>
                        <Ionicons name="logo-whatsapp" size={22} color="#25D366" />
                        <Text style={styles.detailWhatsAppBtnText}>WhatsApp ile paylaş</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <View style={styles.detailActionsSection}>
                    {detailExpense.status === 'pending' ? (
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
                    ) : null}

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
                          <Text style={styles.detailActionBtnText}>Yanlış giriş</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.detailActionBtn, styles.detailActionBtnWarn]}
                        onPress={() => handleDuplicateEntry(detailExpense)}
                        disabled={actingId === detailExpense.id}
                      >
                        <Text style={styles.detailActionBtnText}>Tekrar giriş</Text>
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
                      <Text style={styles.detailActionBtnText}>Harcamayı sil</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

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
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  heroCard: { borderColor: adminTheme.colors.accent, borderWidth: 1 },
  heroHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  heroEyebrow: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  heroPeriod: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text, marginTop: 2 },
  heroTotalWrap: { alignItems: 'flex-end' },
  heroTotalLabel: { fontSize: 11, color: adminTheme.colors.textMuted, fontWeight: '600' },
  heroTotalValue: { fontSize: 22, fontWeight: '800', color: adminTheme.colors.accent, marginTop: 2 },
  heroHint: { fontSize: 12, color: adminTheme.colors.textSecondary, lineHeight: 18, marginBottom: 14 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statTile: {
    flex: 1,
    minWidth: '46%',
    backgroundColor: adminTheme.colors.surfaceTertiary,
    borderRadius: adminTheme.radius.md,
    padding: 12,
  },
  statIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statLabel: { fontSize: 11, color: adminTheme.colors.textMuted, fontWeight: '600' },
  statValue: { fontSize: 15, fontWeight: '800', color: adminTheme.colors.text, marginTop: 2 },
  filterCard: { padding: 0, overflow: 'hidden' },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: adminTheme.spacing.xl,
  },
  filterHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  filterTitle: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  filterSubtitle: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  filterBody: { paddingHorizontal: adminTheme.spacing.xl, paddingBottom: adminTheme.spacing.xl, gap: 10 },
  filterSectionLabel: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textSecondary, marginTop: 4 },
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: adminTheme.radius.full,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  chipActive: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.text },
  chipTextActive: { color: '#fff' },
  dateRow: { flexDirection: 'row', gap: 12 },
  dateInputWrap: { flex: 1 },
  dateLabel: { fontSize: 12, color: adminTheme.colors.textMuted, marginBottom: 6 },
  dateInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.sm,
    paddingHorizontal: 12,
    backgroundColor: adminTheme.colors.surface,
  },
  dateInput: { flex: 1, paddingVertical: 11, fontSize: 14, color: adminTheme.colors.text },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: adminTheme.colors.primary,
    paddingVertical: 12,
    borderRadius: adminTheme.radius.sm,
    marginTop: 8,
  },
  applyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: adminTheme.radius.md,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15, color: adminTheme.colors.text, paddingVertical: 0 },
  exportRow: { flexDirection: 'row', gap: 10 },
  exportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: adminTheme.radius.sm,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  exportBtnText: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.accent },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, marginBottom: 2 },
  listTitle: { fontSize: 17, fontWeight: '800', color: adminTheme.colors.text },
  listSubtitle: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  listCountBadge: {
    minWidth: 36,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: adminTheme.radius.full,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    alignItems: 'center',
  },
  listCount: { fontSize: 14, fontWeight: '800', color: adminTheme.colors.accent },
  loader: { marginVertical: 32 },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.text, textAlign: 'center' },
  emptyText: { fontSize: 14, color: adminTheme.colors.textMuted, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  cardList: { gap: 8 },
  cardSeparator: { height: 8 },
  bulkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4, alignItems: 'center' },
  bulkBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  bulkBtnMuted: { paddingHorizontal: 10, paddingVertical: 8 },
  bulkBtnMutedText: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.textMuted },
  bulkBtnText: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.accent },
  bulkBtnOk: { backgroundColor: adminTheme.colors.success, borderColor: adminTheme.colors.success },
  bulkBtnNo: { backgroundColor: adminTheme.colors.error, borderColor: adminTheme.colors.error },
  bulkBtnTextLight: { fontSize: 13, fontWeight: '700', color: '#fff' },
  expenseCard: {
    flexDirection: 'row',
    backgroundColor: adminTheme.colors.surface,
    borderRadius: adminTheme.radius.lg,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    overflow: 'hidden',
    ...adminTheme.shadow.sm,
  },
  expenseCardSelected: {
    borderColor: adminTheme.colors.accent,
    backgroundColor: 'rgba(180,83,9,0.04)',
  },
  statusStripe: { width: 4 },
  expenseCardInner: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', padding: 14, gap: 10, minWidth: 0 },
  cardSelectBtn: { paddingTop: 2 },
  expenseCardBody: { flex: 1, minWidth: 0 },
  expenseCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 },
  staffRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  staffAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: adminTheme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffAvatarText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  staffInfo: { flex: 1, minWidth: 0 },
  staffName: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.text },
  staffDept: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 1 },
  expenseAmount: { fontSize: 18, fontWeight: '800', color: adminTheme.colors.text, letterSpacing: -0.3 },
  expenseMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaChipText: { fontSize: 12, color: adminTheme.colors.textMuted, fontWeight: '600' },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '100%',
    backgroundColor: adminTheme.colors.surfaceTertiary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: adminTheme.radius.full,
  },
  categoryPillText: { fontSize: 12, color: adminTheme.colors.textSecondary, fontWeight: '600', flexShrink: 1 },
  expenseDesc: { fontSize: 13, color: adminTheme.colors.textMuted, marginTop: 6, lineHeight: 18 },
  expenseReceiptPreview: { marginTop: 10, alignSelf: 'flex-start' },
  expenseCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: adminTheme.colors.borderLight,
  },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: adminTheme.radius.full },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardActionBtn: { padding: 6 },
  detailCard: {
    width: '96%',
    maxWidth: 480,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: adminTheme.radius.lg,
    padding: 24,
    maxHeight: '90%',
  },
  detailScroll: { maxHeight: '100%' },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  detailTitle: { fontSize: 20, fontWeight: '800', color: adminTheme.colors.text },
  detailHero: {
    alignItems: 'center',
    paddingVertical: 16,
    marginBottom: 16,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    borderRadius: adminTheme.radius.md,
    gap: 10,
  },
  detailHeroAmount: { fontSize: 28, fontWeight: '800', color: adminTheme.colors.accent },
  detailInfoGrid: { gap: 14 },
  detailInfoItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  detailInfoItemBlock: { alignItems: 'flex-start' },
  detailInfoText: { flex: 1 },
  detailInfoLabel: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.textMuted },
  detailInfoValue: { fontSize: 15, color: adminTheme.colors.text, marginTop: 2, lineHeight: 21 },
  detailReceiptPreview: { marginTop: 12, alignSelf: 'flex-start' },
  detailDocRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  detailPdfBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    backgroundColor: adminTheme.colors.accent,
    borderRadius: adminTheme.radius.sm,
  },
  detailPdfBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  detailPdfBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    borderRadius: adminTheme.radius.sm,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  detailPdfBtnSecondaryText: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.accent },
  detailWhatsAppBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 10,
    paddingVertical: 13,
    backgroundColor: '#f0fdf4',
    borderRadius: adminTheme.radius.sm,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  detailWhatsAppBtnText: { fontSize: 14, fontWeight: '700', color: '#15803d' },
  detailActionsSection: { marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: adminTheme.colors.borderLight },
  detailActionsLabel: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textMuted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  detailActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  detailActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 14, borderRadius: adminTheme.radius.sm },
  detailActionBtnApprove: { backgroundColor: adminTheme.colors.success, marginBottom: 12 },
  detailActionBtnWarn: { backgroundColor: adminTheme.colors.warning },
  detailActionBtnDanger: { backgroundColor: adminTheme.colors.error },
  detailActionBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', maxWidth: 340, alignItems: 'center' },
  modalClose: { marginTop: 16, paddingVertical: 10, paddingHorizontal: 24, backgroundColor: adminTheme.colors.surface, borderRadius: adminTheme.radius.sm },
  modalCloseText: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.text },
});
