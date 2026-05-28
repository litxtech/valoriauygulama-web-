/**
 * Tüm sözleşmeler ekranı – Admin ve Staff (tum_sozlesmeler yetkisi) tarafından kullanılır.
 * Günlük/Haftalık/Aylık/Senelik filtre, takvim doluluk noktaları, liste & tek misafir yazdırma.
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Modal,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { AdminOrganizationPicker } from '@/components/admin';
import {
  filterValidUuids,
  isValidUuid,
  resolveAdminListOrganizationId,
  resolveStaffOrganizationScope,
} from '@/lib/organizationScope';
import {
  shareContractPdf,
  buildContractHtml,
  fetchContractPdfAppearance,
  openContractPrintWindow,
  type GuestForPdf,
} from '@/lib/contractPdf';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

type Row = {
  id: string;
  token: string;
  room_id: string | null;
  contract_lang: string;
  accepted_at: string;
  assigned_staff_id: string | null;
  assigned_at: string | null;
  guest_id: string | null;
  room_number?: string | null;
  assigned_staff_name?: string | null;
  signer_name?: string | null;
  signer_phone?: string | null;
};

type PeriodKey = 'daily' | 'weekly' | 'monthly' | 'yearly';
const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'daily', label: 'Günlük' },
  { key: 'weekly', label: 'Haftalık' },
  { key: 'monthly', label: 'Aylık' },
  { key: 'yearly', label: 'Senelik' },
];

function toWhatsAppPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length < 10) return null;
  const withCountry = cleaned.startsWith('90') ? cleaned : `90${cleaned.replace(/^0/, '')}`;
  return withCountry;
}

function localDateToYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDateRange(period: PeriodKey, referenceDate: Date): { from: string; to: string } {
  const d = new Date(referenceDate);
  if (isNaN(d.getTime())) {
    const fallback = localDateToYMD(new Date());
    return { from: fallback, to: fallback };
  }
  d.setHours(12, 0, 0, 0);
  switch (period) {
    case 'daily':
      return { from: localDateToYMD(d), to: localDateToYMD(d) };
    case 'weekly': {
      const day = d.getDay();
      const monday = new Date(d);
      monday.setDate(d.getDate() - ((day + 6) % 7));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { from: localDateToYMD(monday), to: localDateToYMD(sunday) };
    }
    case 'monthly': {
      const first = new Date(d.getFullYear(), d.getMonth(), 1);
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      return { from: localDateToYMD(first), to: localDateToYMD(last) };
    }
    case 'yearly': {
      return { from: `${d.getFullYear()}-01-01`, to: `${d.getFullYear()}-12-31` };
    }
  }
}

function getMonthDays(year: number, month: number): Date[] {
  const days: Date[] = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function buildListPrintHtml(rows: Row[], periodLabel: string, dateRange: string): string {
  const tableRows = rows.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${r.signer_name ?? '—'}</td>
      <td>${r.room_number ?? '—'}</td>
      <td>${new Date(r.accepted_at).toLocaleString('tr-TR')}</td>
      <td>${r.signer_phone ?? '—'}</td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body { font-family: system-ui, -apple-system, sans-serif; padding: 20px; color: #1a202c; }
  h1 { font-size: 18px; margin: 0 0 4px 0; color: #1a365d; }
  .sub { font-size: 13px; color: #64748b; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { background: #f1f5f9; padding: 10px 8px; text-align: left; font-weight: 700; border-bottom: 2px solid #e2e8f0; }
  td { padding: 9px 8px; border-bottom: 1px solid #e2e8f0; }
  tr:nth-child(even) td { background: #f8fafc; }
  .footer { margin-top: 20px; font-size: 11px; color: #94a3b8; text-align: center; }
  @media print {
    body { padding: 0; }
    @page { size: A4 landscape; margin: 10mm; }
  }
</style></head><body>
  <h1>Valoria Hotel – Sözleşme Listesi (${periodLabel})</h1>
  <div class="sub">${dateRange} · Toplam: ${rows.length} kayıt · Yazdırma: ${new Date().toLocaleString('tr-TR')}</div>
  <table>
    <thead><tr><th>#</th><th>Misafir</th><th>Oda</th><th>Onay Tarihi</th><th>Telefon</th></tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
  <div class="footer">Bu liste Valoria Hotel dijital yönetim sistemi tarafından oluşturulmuştur.</div>
</body></html>`;
}

function buildSingleGuestPrintHtml(row: Row): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body { font-family: system-ui, -apple-system, sans-serif; padding: 24px; color: #1a202c; }
  h1 { font-size: 18px; margin: 0 0 16px 0; color: #1a365d; }
  .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; max-width: 500px; }
  .row { margin-bottom: 8px; font-size: 14px; }
  .label { font-weight: 700; color: #475569; }
  .footer { margin-top: 24px; font-size: 11px; color: #94a3b8; }
  @media print { body { padding: 0; } @page { size: A4; margin: 15mm; } }
</style></head><body>
  <h1>Valoria Hotel – Misafir Sözleşme Bilgisi</h1>
  <div class="card">
    <div class="row"><span class="label">Misafir:</span> ${row.signer_name ?? '—'}</div>
    <div class="row"><span class="label">Oda:</span> ${row.room_number ?? '—'}</div>
    <div class="row"><span class="label">Onay Tarihi:</span> ${new Date(row.accepted_at).toLocaleString('tr-TR')}</div>
    <div class="row"><span class="label">Telefon:</span> ${row.signer_phone ?? '—'}</div>
    <div class="row"><span class="label">Dil:</span> ${row.contract_lang.toUpperCase()}</div>
    <div class="row"><span class="label">Yetkili:</span> ${row.assigned_staff_name ?? '—'}</div>
  </div>
  <div class="footer">Valoria Hotel dijital yönetim sistemi · ${new Date().toLocaleString('tr-TR')}</div>
</body></html>`;
}

export function AllContractsScreen() {
  const { staff } = useAuthStore();
  const { selectedOrganizationId } = useAdminOrgStore();
  const canUseAllOrganizations = staff?.app_permissions?.super_admin === true || staff?.role === 'admin';
  const today = new Date();
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>('daily');
  const [referenceDate, setReferenceDate] = useState(today);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [detailTarget, setDetailTarget] = useState<Row | null>(null);
  const [detailGuest, setDetailGuest] = useState<GuestForPdf | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(today.getMonth());
  const [calendarYear, setCalendarYear] = useState(today.getFullYear());
  const [occupancyDates, setOccupancyDates] = useState<Set<string>>(new Set());
  const [listPrinting, setListPrinting] = useState(false);

  const { dateFrom, dateTo } = useMemo(
    () => getDateRange(selectedPeriod, referenceDate),
    [selectedPeriod, referenceDate]
  );

  const periodLabel = useMemo(() => {
    const opt = PERIOD_OPTIONS.find((p) => p.key === selectedPeriod);
    return opt?.label ?? '';
  }, [selectedPeriod]);

  const dateRangeDisplay = useMemo(() => {
    if (dateFrom === dateTo) return new Date(dateFrom + 'T00:00:00').toLocaleDateString('tr-TR');
    return `${new Date(dateFrom + 'T00:00:00').toLocaleDateString('tr-TR')} – ${new Date(dateTo + 'T00:00:00').toLocaleDateString('tr-TR')}`;
  }, [dateFrom, dateTo]);

  const load = useCallback(async () => {
    const fromIso = `${dateFrom}T00:00:00.000Z`;
    const toIso = `${dateTo}T23:59:59.999Z`;
    const orgScoped = resolveAdminListOrganizationId({
      canUseAll: canUseAllOrganizations,
      selectedOrganizationId,
      ownOrganizationId: staff?.organization_id,
      fallbackOrganizationId: null,
    });

    let listQuery = supabase
      .from('contract_acceptances')
      .select('id, token, room_id, contract_lang, accepted_at, assigned_staff_id, assigned_at, guest_id')
      .gte('accepted_at', fromIso)
      .lte('accepted_at', toIso)
      .order('accepted_at', { ascending: false })
      .limit(500);
    if (orgScoped && isValidUuid(orgScoped)) listQuery = listQuery.eq('organization_id', orgScoped);

    const { data: list, error } = await listQuery;

    if (error) {
      setRows([]);
      setLoadError(error.message);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setLoadError(null);

    const roomIds = filterValidUuids([...new Set((list ?? []).map((r) => r.room_id))]);
    const staffIds = filterValidUuids([...new Set((list ?? []).map((r) => r.assigned_staff_id))]);
    const guestIds = filterValidUuids([...new Set((list ?? []).map((r) => r.guest_id))]);

    let roomNumbers: Record<string, string> = {};
    let staffNames: Record<string, string> = {};
    let guestById: Record<string, { full_name: string | null; phone: string | null }> = {};

    const [roomsResult, staffResult, guestsResult] = await Promise.all([
      roomIds.length > 0
        ? supabase.from('rooms').select('id, room_number').in('id', roomIds)
        : Promise.resolve({ data: [] as { id: string; room_number: string }[] }),
      staffIds.length > 0
        ? supabase.from('staff').select('id, full_name').in('id', staffIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
      guestIds.length > 0
        ? supabase.from('guests').select('id, full_name, phone').in('id', guestIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string | null; phone: string | null }[] }),
    ]);
    roomNumbers = {};
    for (const r of roomsResult.data ?? []) {
      roomNumbers[r.id] = r.room_number;
    }
    staffNames = {};
    for (const s of staffResult.data ?? []) {
      staffNames[s.id] = s.full_name ?? '—';
    }
    guestById = {};
    for (const g of guestsResult.data ?? []) {
      guestById[g.id] = { full_name: g.full_name, phone: g.phone };
    }

    setRows(
      (list ?? []).map((r) => {
        const guestObj = r.guest_id && isValidUuid(r.guest_id) ? guestById[r.guest_id] : undefined;
        return {
          ...r,
          room_number: r.room_id && isValidUuid(r.room_id) ? roomNumbers[r.room_id] ?? '—' : null,
          assigned_staff_name:
            r.assigned_staff_id && isValidUuid(r.assigned_staff_id)
              ? staffNames[r.assigned_staff_id] ?? '—'
              : null,
          signer_name: guestObj?.full_name ?? null,
          signer_phone: guestObj?.phone ?? null,
        };
      })
    );
  }, [canUseAllOrganizations, dateFrom, dateTo, selectedOrganizationId, staff?.organization_id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const loadOccupancyForMonth = useCallback(async (year: number, month: number) => {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const fromIso = `${localDateToYMD(first)}T00:00:00.000Z`;
    const toIso = `${localDateToYMD(last)}T23:59:59.999Z`;
    const orgScoped = resolveAdminListOrganizationId({
      canUseAll: canUseAllOrganizations,
      selectedOrganizationId,
      ownOrganizationId: staff?.organization_id,
      fallbackOrganizationId: null,
    });
    let occupancyQuery = supabase
      .from('contract_acceptances')
      .select('accepted_at')
      .gte('accepted_at', fromIso)
      .lte('accepted_at', toIso);
    if (orgScoped && isValidUuid(orgScoped)) occupancyQuery = occupancyQuery.eq('organization_id', orgScoped);
    const { data } = await occupancyQuery;
    const dates = new Set<string>();
    (data ?? []).forEach((r) => {
      dates.add(r.accepted_at.slice(0, 10));
    });
    setOccupancyDates(dates);
  }, [canUseAllOrganizations, selectedOrganizationId, staff?.organization_id]);

  useEffect(() => {
    loadOccupancyForMonth(calendarYear, calendarMonth);
  }, [calendarYear, calendarMonth, loadOccupancyForMonth]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const selectPeriod = (key: PeriodKey) => {
    setSelectedPeriod(key);
    setReferenceDate(new Date());
  };

  const navigatePeriod = (direction: -1 | 1) => {
    const d = new Date(referenceDate);
    switch (selectedPeriod) {
      case 'daily':
        d.setDate(d.getDate() + direction);
        break;
      case 'weekly':
        d.setDate(d.getDate() + direction * 7);
        break;
      case 'monthly':
        d.setMonth(d.getMonth() + direction);
        break;
      case 'yearly':
        d.setFullYear(d.getFullYear() + direction);
        break;
    }
    setReferenceDate(d);
  };

  const selectCalendarDay = (day: Date) => {
    setReferenceDate(day);
    setCalendarVisible(false);
  };

  const loadGuestForPdf = async (guestId: string): Promise<GuestForPdf | null> => {
    if (!isValidUuid(guestId)) return null;
    const { data: guest, error } = await supabase
      .from('guests')
      .select('full_name, phone, email, id_number, verified_at, created_at, signature_data, rooms(room_number), contract_templates(title, content), total_amount_net, nights_count, vat_amount, accommodation_tax_amount, payment_method, reservation_channel')
      .eq('id', guestId)
      .single();
    if (error || !guest) return null;
    return {
      ...guest,
      rooms: Array.isArray(guest.rooms) ? (guest.rooms[0] ?? null) : guest.rooms,
      contract_templates: Array.isArray(guest.contract_templates) ? (guest.contract_templates[0] ?? null) : guest.contract_templates,
    } as GuestForPdf;
  };

  const downloadPdf = async (item: Row) => {
    if (!item.guest_id || !isValidUuid(item.guest_id)) {
      Alert.alert('Bilgi', 'Bu onayda misafir kaydı yok; PDF yalnızca form doldurulup onaylanan sözleşmelerde oluşturulabilir.');
      return;
    }
    setPdfLoadingId(item.id);
    try {
      const forPdf = await loadGuestForPdf(item.guest_id);
      if (!forPdf) throw new Error('Misafir bulunamadı.');
      await shareContractPdf(forPdf);
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'PDF oluşturulamadı.');
    } finally {
      setPdfLoadingId(null);
    }
  };

  const printList = async () => {
    if (rows.length === 0) {
      Alert.alert('Bilgi', 'Yazdırılacak kayıt yok.');
      return;
    }
    setListPrinting(true);
    try {
      const html = buildListPrintHtml(rows, periodLabel, dateRangeDisplay);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const w = window.open('', '_blank', 'noopener');
        if (w) {
          w.document.write(html);
          w.document.close();
          w.focus();
          setTimeout(() => w.print(), 300);
        }
      } else {
        const { uri } = await Print.printToFileAsync({ html, width: 842, height: 595 });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Liste Yazdır' });
        } else {
          await Print.printAsync({ uri });
        }
      }
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Liste yazdırılamadı.');
    } finally {
      setListPrinting(false);
    }
  };

  const printSingleGuest = async (item: Row) => {
    try {
      const html = buildSingleGuestPrintHtml(item);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const w = window.open('', '_blank', 'noopener');
        if (w) {
          w.document.write(html);
          w.document.close();
          w.focus();
          setTimeout(() => w.print(), 300);
        }
      } else {
        const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Misafir Yazdır' });
        } else {
          await Print.printAsync({ uri });
        }
      }
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Yazdırılamadı.');
    }
  };

  const openDetailModal = async (item: Row) => {
    setDetailTarget(item);
    setDetailModalVisible(true);
    setDetailGuest(null);
    setPreviewHtml(null);
    if (!item.guest_id || !isValidUuid(item.guest_id)) {
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    try {
      const [guest, appearance] = await Promise.all([loadGuestForPdf(item.guest_id), fetchContractPdfAppearance()]);
      setDetailGuest(guest ?? null);
      if (guest) setPreviewHtml(buildContractHtml(guest, appearance));
    } finally {
      setDetailLoading(false);
    }
  };

  const openPreviewWindow = () => {
    if (Platform.OS === 'web') {
      if (detailGuest) void openContractPrintWindow(detailGuest);
      else if (previewHtml && typeof window !== 'undefined') {
        const w = window.open('', '_blank', 'noopener');
        if (w) {
          w.document.write(previewHtml);
          w.document.close();
          w.focus();
          setTimeout(() => w.print(), 300);
        }
      }
    } else if (detailGuest) {
      shareContractPdf(detailGuest).catch((e) => Alert.alert('Hata', (e as Error)?.message ?? 'Önizleme açılamadı.'));
    } else {
      Alert.alert('Önizleme', 'PDF paylaşım menüsünden WhatsApp ile gönderebilirsiniz.');
    }
  };

  const openPhone = (phone: string | null | undefined) => {
    if (!phone) {
      Alert.alert('Bilgi', 'Telefon numarası kayıtlı değil.');
      return;
    }
    const tel = phone.replace(/\D/g, '');
    Linking.openURL(`tel:${tel}`).catch(() => Alert.alert('Hata', 'Arama açılamadı.'));
  };

  const openWhatsApp = (phone: string | null | undefined) => {
    const waPhone = toWhatsAppPhone(phone);
    if (!waPhone) {
      Alert.alert('Bilgi', 'Geçerli telefon numarası kayıtlı değil.');
      return;
    }
    Linking.openURL(`https://wa.me/${waPhone}`).catch(() => Alert.alert('Hata', 'WhatsApp açılamadı.'));
  };

  const sharePdfToWhatsApp = async (item: Row) => {
    if (!item.guest_id || !isValidUuid(item.guest_id)) {
      Alert.alert('Bilgi', 'Bu onayda misafir kaydı yok.');
      return;
    }
    setPdfLoadingId(item.id);
    try {
      const forPdf = await loadGuestForPdf(item.guest_id);
      if (!forPdf) throw new Error('Misafir bulunamadı.');
      await shareContractPdf(forPdf);
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'PDF paylaşılamadı.');
    } finally {
      setPdfLoadingId(null);
    }
  };

  const calendarDays = useMemo(() => getMonthDays(calendarYear, calendarMonth), [calendarYear, calendarMonth]);
  const firstDayOffset = useMemo(() => {
    const d = new Date(calendarYear, calendarMonth, 1).getDay();
    return (d + 6) % 7; // Monday = 0
  }, [calendarYear, calendarMonth]);

  const MONTH_NAMES = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const DAY_LABELS = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];

  return (
    <View style={styles.container}>
      <View style={styles.orgPickerWrap}>
        <AdminOrganizationPicker
          canUseAll={canUseAllOrganizations}
          ownOrganizationId={staff?.organization_id}
        />
      </View>
      {loadError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>Liste yüklenemedi: {loadError}</Text>
        </View>
      ) : null}

      {/* Period filter chips */}
      <View style={styles.periodRow}>
        {PERIOD_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.key}
            style={[styles.periodChip, selectedPeriod === opt.key && styles.periodChipActive]}
            onPress={() => selectPeriod(opt.key)}
          >
            <Text style={[styles.periodChipText, selectedPeriod === opt.key && styles.periodChipTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Navigation & date display */}
      <View style={styles.navRow}>
        <TouchableOpacity style={styles.navBtn} onPress={() => navigatePeriod(-1)}>
          <Ionicons name="chevron-back" size={20} color="#475569" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.dateDisplay} onPress={() => setCalendarVisible(true)}>
          <Ionicons name="calendar-outline" size={16} color="#0369a1" />
          <Text style={styles.dateDisplayText}>{dateRangeDisplay}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBtn} onPress={() => navigatePeriod(1)}>
          <Ionicons name="chevron-forward" size={20} color="#475569" />
        </TouchableOpacity>
      </View>

      {/* Actions row */}
      <View style={styles.actionsRow}>
        <Text style={styles.resultCount}>{rows.length} kayıt</Text>
        <TouchableOpacity
          style={[styles.printListBtn, listPrinting && { opacity: 0.6 }]}
          onPress={printList}
          disabled={listPrinting}
        >
          {listPrinting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="print-outline" size={16} color="#fff" />
              <Text style={styles.printListBtnText}>Listeyi Yazdır</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={[styles.list, loading && styles.listLoading]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[adminTheme.colors.primary]} />}
        ListHeaderComponent={
          loading ? (
            <View style={styles.listLoadingBanner}>
              <ActivityIndicator size="small" color={adminTheme.colors.primary} />
              <Text style={styles.listLoadingText}>Liste yükleniyor…</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          loading ? null : <Text style={styles.emptyText}>Bu tarih aralığında kayıt yok.</Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => openDetailModal(item)} activeOpacity={0.85}>
            <View style={styles.cardRow}>
              <Text style={styles.name}>{item.signer_name ?? '—'}</Text>
              <Text style={styles.date}>{new Date(item.accepted_at).toLocaleString('tr-TR')}</Text>
            </View>
            <View style={styles.cardMeta}>
              <Text style={styles.meta}>Oda: {item.room_number ?? '—'} · Dil: {item.contract_lang.toUpperCase()}</Text>
            </View>
            <View style={styles.contactRow}>
              <TouchableOpacity
                style={styles.contactBtn}
                onPress={(e) => { e.stopPropagation(); openPhone(item.signer_phone); }}
              >
                <Ionicons name="call-outline" size={18} color="#0f766e" />
                <Text style={styles.contactBtnText}>Telefon</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.contactBtn, styles.whatsappBtn]}
                onPress={(e) => { e.stopPropagation(); openWhatsApp(item.signer_phone); }}
              >
                <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
                <Text style={[styles.contactBtnText, styles.whatsappText]}>WhatsApp</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.contactBtn, styles.printSingleBtn]}
                onPress={(e) => { e.stopPropagation(); printSingleGuest(item); }}
              >
                <Ionicons name="print-outline" size={18} color="#7c3aed" />
                <Text style={[styles.contactBtnText, { color: '#7c3aed' }]}>Yazdır</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.contactBtn, (pdfLoadingId === item.id || !item.guest_id || !isValidUuid(item.guest_id)) && styles.contactBtnDisabled]}
                onPress={(e) => { e.stopPropagation(); sharePdfToWhatsApp(item); }}
                disabled={pdfLoadingId !== null || !item.guest_id || !isValidUuid(item.guest_id)}
              >
                {pdfLoadingId === item.id ? (
                  <ActivityIndicator size="small" color="#0369a1" />
                ) : (
                  <>
                    <Ionicons name="document-outline" size={18} color="#0369a1" />
                    <Text style={[styles.contactBtnText, { color: '#0369a1' }]}>PDF</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
      />

      {/* Detail modal */}
      <Modal visible={detailModalVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setDetailModalVisible(false)}>
          <View style={[styles.modalContent, styles.detailModalContent]} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Sözleşme detayı</Text>
            {detailTarget && (
              <ScrollView style={styles.detailScroll} showsVerticalScrollIndicator>
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Onay bilgisi</Text>
                  <Text style={styles.detailLine}>İsim: {detailTarget.signer_name ?? '—'}</Text>
                  <Text style={styles.detailLine}>Tarih: {new Date(detailTarget.accepted_at).toLocaleString('tr-TR')}</Text>
                  <Text style={styles.detailLine}>Oda: {detailTarget.room_number ?? '—'}</Text>
                  <Text style={styles.detailLine}>Dil: {detailTarget.contract_lang.toUpperCase()}</Text>
                  <Text style={styles.detailLine}>Yetkili çalışan: {detailTarget.assigned_staff_name ?? '—'}</Text>
                </View>
                {detailGuest && (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>İletişim</Text>
                    <Text style={styles.detailLine}>Telefon: {detailGuest.phone ?? '—'}</Text>
                    <Text style={styles.detailLine}>E-posta: {detailGuest.email ?? '—'}</Text>
                    <View style={styles.detailContactBtns}>
                      <TouchableOpacity style={styles.modalContactBtn} onPress={() => openPhone(detailGuest.phone)}>
                        <Ionicons name="call-outline" size={20} color="#0f766e" />
                        <Text style={styles.modalContactBtnText}>Telefon</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.modalContactBtn, styles.modalWhatsappBtn]} onPress={() => openWhatsApp(detailGuest.phone)}>
                        <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
                        <Text style={[styles.modalContactBtnText, { color: '#25D366' }]}>WhatsApp</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
                {detailLoading && <ActivityIndicator size="small" color={adminTheme.colors.primary} style={{ marginVertical: 8 }} />}
                {(!detailTarget.guest_id || !isValidUuid(detailTarget.guest_id)) && (
                  <Text style={styles.detailHint}>Bu onayda misafir kaydı yok; PDF yalnızca form doldurulup onaylanan sözleşmelerde oluşturulabilir.</Text>
                )}
                <View style={styles.detailActions}>
                  {(detailGuest || previewHtml) && (
                    <TouchableOpacity style={styles.previewBtn} onPress={openPreviewWindow}>
                      <Text style={styles.previewBtnText}>Sözleşmeyi önizle / yazdır</Text>
                    </TouchableOpacity>
                  )}
                  {detailTarget.guest_id && isValidUuid(detailTarget.guest_id) && (
                    <TouchableOpacity
                      style={[styles.pdfBtn, pdfLoadingId === detailTarget.id && styles.pdfBtnDisabled]}
                      onPress={() => sharePdfToWhatsApp(detailTarget)}
                      disabled={pdfLoadingId !== null}
                    >
                      {pdfLoadingId === detailTarget.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.pdfBtnText}>PDF indir / WhatsApp ile paylaş</Text>
                      )}
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.printDetailBtn} onPress={() => printSingleGuest(detailTarget)}>
                    <Ionicons name="print-outline" size={16} color="#fff" />
                    <Text style={styles.printDetailBtnText}>Bu misafiri yazdır</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
            <TouchableOpacity style={styles.modalClose} onPress={() => setDetailModalVisible(false)}>
              <Text style={styles.modalCloseText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Calendar modal */}
      <Modal visible={calendarVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setCalendarVisible(false)}>
          <View style={styles.calendarModal} onStartShouldSetResponder={() => true}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity onPress={() => {
                if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear(calendarYear - 1); }
                else setCalendarMonth(calendarMonth - 1);
              }}>
                <Ionicons name="chevron-back" size={22} color="#475569" />
              </TouchableOpacity>
              <Text style={styles.calendarTitle}>{MONTH_NAMES[calendarMonth]} {calendarYear}</Text>
              <TouchableOpacity onPress={() => {
                if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear(calendarYear + 1); }
                else setCalendarMonth(calendarMonth + 1);
              }}>
                <Ionicons name="chevron-forward" size={22} color="#475569" />
              </TouchableOpacity>
            </View>
            <View style={styles.calendarDayLabels}>
              {DAY_LABELS.map((l) => (
                <Text key={l} style={styles.calendarDayLabel}>{l}</Text>
              ))}
            </View>
            <View style={styles.calendarGrid}>
              {Array.from({ length: firstDayOffset }).map((_, i) => (
                <View key={`blank-${i}`} style={styles.calendarCell} />
              ))}
              {calendarDays.map((day) => {
                const iso = localDateToYMD(day);
                const hasOccupancy = occupancyDates.has(iso);
                const isToday = iso === localDateToYMD(today);
                const isSelected = iso === localDateToYMD(referenceDate);
                return (
                  <TouchableOpacity
                    key={iso}
                    style={[styles.calendarCell, isSelected && styles.calendarCellSelected, isToday && styles.calendarCellToday]}
                    onPress={() => selectCalendarDay(day)}
                  >
                    <Text style={[styles.calendarCellText, isSelected && styles.calendarCellTextSelected]}>{day.getDate()}</Text>
                    {hasOccupancy && <View style={styles.occupancyDot} />}
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.calendarLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.occupancyDot, { position: 'relative', marginRight: 6 }]} />
                <Text style={styles.legendText}>Sözleşme var</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.modalClose} onPress={() => setCalendarVisible(false)}>
              <Text style={styles.modalCloseText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7fafc' },
  orgPickerWrap: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  periodRow: { flexDirection: 'row', padding: 12, paddingBottom: 6, gap: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  periodChip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  periodChipActive: { backgroundColor: '#0369a1', borderColor: '#0369a1' },
  periodChipText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  periodChipTextActive: { color: '#fff' },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#fff', gap: 12 },
  navBtn: { padding: 8, borderRadius: 8, backgroundColor: '#f1f5f9' },
  dateDisplay: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe' },
  dateDisplayText: { fontSize: 14, fontWeight: '600', color: '#0369a1' },
  actionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#f0f9ff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  resultCount: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  printListBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#7c3aed' },
  printListBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  list: { padding: 16, paddingBottom: 32 },
  listLoading: { flexGrow: 1 },
  listLoadingBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 28, marginBottom: 8 },
  listLoadingText: { fontSize: 14, color: '#64748b' },
  emptyText: { padding: 24, textAlign: 'center', color: '#64748b', fontSize: 14 },
  card: { backgroundColor: '#fff', padding: 14, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  name: { fontSize: 16, fontWeight: '700', color: '#1e293b', flex: 1 },
  date: { fontSize: 12, color: '#64748b' },
  cardMeta: { marginBottom: 10 },
  meta: { fontSize: 12, color: '#64748b' },
  contactRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  contactBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 10, backgroundColor: '#f0fdf4', borderRadius: 8 },
  contactBtnDisabled: { opacity: 0.6 },
  contactBtnText: { fontSize: 12, fontWeight: '600', color: '#0f766e' },
  whatsappBtn: { backgroundColor: '#dcfce7' },
  whatsappText: { color: '#25D366' },
  printSingleBtn: { backgroundColor: '#f5f3ff' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalContent: { backgroundColor: '#fff', borderRadius: 16, maxHeight: '80%', padding: 16 },
  detailModalContent: { maxHeight: '90%' },
  detailScroll: { maxHeight: 400 },
  detailSection: { marginBottom: 16 },
  detailLabel: { fontSize: 12, fontWeight: '700', color: '#64748b', marginBottom: 6, textTransform: 'uppercase' },
  detailLine: { fontSize: 14, color: '#1e293b', marginBottom: 4 },
  detailHint: { fontSize: 13, color: '#64748b', fontStyle: 'italic', marginVertical: 12 },
  detailContactBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalContactBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: '#f0fdf4', borderRadius: 10 },
  modalContactBtnText: { fontSize: 14, fontWeight: '600', color: '#0f766e' },
  modalWhatsappBtn: { backgroundColor: '#dcfce7' },
  detailActions: { flexDirection: 'row', gap: 10, marginTop: 16, flexWrap: 'wrap' },
  previewBtn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#0369a1' },
  previewBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  pdfBtn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#2d3748', minWidth: 56 },
  pdfBtnDisabled: { opacity: 0.6 },
  pdfBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  printDetailBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#7c3aed' },
  printDetailBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1e293b', marginBottom: 12 },
  modalClose: { marginTop: 12, paddingVertical: 12, alignItems: 'center' },
  modalCloseText: { fontSize: 15, fontWeight: '600', color: '#64748b' },
  errorBanner: { backgroundColor: '#fef2f2', padding: 12, marginHorizontal: 16, marginTop: 12, borderRadius: 8, borderWidth: 1, borderColor: '#fecaca' },
  errorBannerText: { fontSize: 14, color: '#b91c1c', fontWeight: '600' },
  // Calendar
  calendarModal: { backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  calendarTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  calendarDayLabels: { flexDirection: 'row', marginBottom: 8 },
  calendarDayLabel: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700', color: '#64748b' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarCell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  calendarCellSelected: { backgroundColor: '#0369a1', borderRadius: 20 },
  calendarCellToday: { borderWidth: 2, borderColor: '#0369a1', borderRadius: 20 },
  calendarCellText: { fontSize: 14, color: '#1e293b', fontWeight: '500' },
  calendarCellTextSelected: { color: '#fff', fontWeight: '700' },
  occupancyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e', position: 'absolute', bottom: 4 },
  calendarLegend: { flexDirection: 'row', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#e2e8f0', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendText: { fontSize: 12, color: '#64748b' },
});
