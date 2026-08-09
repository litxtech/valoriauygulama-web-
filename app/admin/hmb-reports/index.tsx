import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { printToLocalPdfFile } from '@/lib/persistExpoPrintPdf';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { AdminCard } from '@/components/admin';
import { adminTheme } from '@/constants/adminTheme';
import {
  fetchHmbReportData,
  buildHmbReportHtml,
  type HmbReportFilters,
  type GuestFilterType,
  type HmbReportData,
} from '@/lib/hmbReport';
import { formatDateShort } from '@/lib/date';
import {
  loadHmbFormBranding,
  saveHmbFormBranding,
  DEFAULT_HMB_FORM_BRANDING,
  type HmbFormBranding,
} from '@/lib/hmbFormBranding';
import * as ImagePicker from 'expo-image-picker';
import { format, parseISO } from 'date-fns';
import { tr } from 'date-fns/locale';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type RoomRow = { id: string; room_number: string };

const GUEST_TYPE_OPTIONS: { value: GuestFilterType; label: string }[] = [
  { value: 'all', label: 'Tüm müşteriler' },
  { value: 'checked_in', label: 'Sadece check-in yapmış' },
  { value: 'checked_out', label: 'Sadece çıkış yapmış' },
  { value: 'active', label: 'Aktif konaklamalar' },
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

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatTrDayMonthYear(yyyyMmDd: string): string {
  try {
    return format(parseISO(yyyyMmDd), 'dd.MM.yyyy', { locale: tr });
  } catch {
    return yyyyMmDd;
  }
}

export default function HmbReportsScreen() {
  const insets = useSafeAreaInsets();
  const { staff } = useAuthStore();
  const [branding, setBranding] = useState<HmbFormBranding>({ ...DEFAULT_HMB_FORM_BRANDING });
  const [formListDate, setFormListDate] = useState(() => format(new Date(), 'dd.MM.yyyy', { locale: tr }));
  const [formSira, setFormSira] = useState('');
  const [formBlock, setFormBlock] = useState('');
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [startDate, setStartDate] = useState(() => getDefaultDates().start);
  const [endDate, setEndDate] = useState(() => getDefaultDates().end);
  const [guestType, setGuestType] = useState<GuestFilterType>('all');
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[] | null>(null);
  const [reportData, setReportData] = useState<HmbReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [recentReports, setRecentReports] = useState<
    { id: string; report_number: string; start_date: string; end_date: string; created_at: string; total_stays: number }[]
  >([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  useEffect(() => {
    supabase
      .from('rooms')
      .select('id, room_number')
      .order('room_number')
      .then(({ data }) => setRooms(data ?? []));
  }, []);

  useEffect(() => {
    loadHmbFormBranding().then((b) => setBranding(b));
  }, []);

  const pickSealOrLogo = async (field: 'logoDataUrl' | 'ministrySealDataUrl') => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('İzin gerekli', 'Galeriden görsel seçmek için izin verin.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.75,
      base64: true,
    });
    if (res.canceled || !res.assets[0]?.base64) return;
    const mime = res.assets[0].mimeType?.includes('png') ? 'image/png' : 'image/jpeg';
    const dataUrl = `data:${mime};base64,${res.assets[0].base64}`;
    setBranding((prev) => {
      const next = { ...prev, [field]: dataUrl };
      saveHmbFormBranding(next).catch(() => {});
      return next;
    });
  };

  const loadRecentReports = useCallback(async () => {
    setLoadingRecent(true);
    const { data } = await supabase
      .from('hmb_reports')
      .select('id, report_number, start_date, end_date, created_at, total_stays')
      .order('created_at', { ascending: false })
      .limit(10);
    setRecentReports(data ?? []);
    setLoadingRecent(false);
  }, []);

  useEffect(() => {
    loadRecentReports();
  }, [loadRecentReports]);

  const filters: HmbReportFilters = {
    startDate,
    endDate,
    roomIds: selectedRoomIds,
    guestType,
  };

  const runReport = async (override?: { startDate?: string; endDate?: string }) => {
    const f: HmbReportFilters = override
      ? {
          ...filters,
          startDate: override.startDate ?? filters.startDate,
          endDate: override.endDate ?? filters.endDate,
        }
      : filters;
    setLoading(true);
    setReportData(null);
    try {
      const data = await fetchHmbReportData(f);
      setReportData(data);
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Rapor yüklenemedi.');
    }
    setLoading(false);
  };

  const generatePdf = async () => {
    if (!reportData || !staff) return;
    setPdfLoading(true);
    try {
      const html = buildHmbReportHtml(reportData, filters, staff.full_name ?? 'Admin', branding, {
        listDate: formListDate,
        seri: branding.defaultSeri || 'A',
        sira: formSira,
        arrivalDate: formatTrDayMonthYear(filters.startDate),
        departureDate: formatTrDayMonthYear(filters.endDate),
        block: formBlock,
      });
      const { uri } = await printToLocalPdfFile({
        html,
        width: 595,
        height: 842,
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
      });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'HMB Raporu Kaydet',
        });
      } else {
        Alert.alert('PDF hazır', `Dosya: ${uri}`);
      }
      await supabase.from('hmb_reports').insert({
        report_number: reportData.reportNumber,
        report_type: 'custom',
        start_date: filters.startDate,
        end_date: filters.endDate,
        room_filter: filters.roomIds,
        guest_filter: { guestType: filters.guestType },
        total_stays: reportData.totalStays,
        total_guests: reportData.totalGuests,
        total_nights: reportData.totalNights,
        total_revenue_net: reportData.totalRevenueNet,
        total_vat: reportData.totalVat,
        total_accommodation_tax: reportData.totalAccommodationTax,
        created_by: staff.id,
      });
      loadRecentReports();
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'PDF oluşturulamadı.');
    }
    setPdfLoading(false);
  };

  const toggleRoom = (id: string) => {
    setSelectedRoomIds((prev) => {
      if (prev == null) return [id];
      const next = prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id];
      return next.length === 0 ? null : next;
    });
  };

  const useAllRooms = () => setSelectedRoomIds(null);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AdminCard>
        <Text style={styles.sectionTitle}>Hazine ve Maliye Bakanlığı Rapor Sistemi</Text>
        <Text style={styles.legalNote}>
          Bu rapor, Vergi Usul Kanunu 240. madde gereğince düzenlenen Günlük Müşteri Listesi formatında hazırlanmaktadır.
        </Text>
      </AdminCard>

      <AdminCard>
        <Text style={styles.sectionTitle}>Form ve işletme bilgileri (PDF üst kısım)</Text>
        <Text style={[styles.legalNote, { marginBottom: 12 }]}>
          Sol üst metinler, orta mühür (varsayılan vektör veya sizin PNG’niz), sağ üst tarih/seri/sıra alanları buradan düzenlenir. Matbaadaki
          mühürle birebir eşleşme için orta alana resmî mühür görselinizi yükleyin.
        </Text>
        <View style={styles.row}>
          <Text style={styles.label}>Ünvan / işletme adı</Text>
          <TextInput
            style={styles.input}
            value={branding.legalCompanyName}
            onChangeText={(t) => setBranding((b) => ({ ...b, legalCompanyName: t }))}
            placeholder="Örn: SEVCAN OTELCİLİK A.Ş."
            placeholderTextColor={adminTheme.colors.textMuted}
          />
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Faaliyet / alt satır (isteğe bağlı)</Text>
          <TextInput
            style={styles.input}
            value={branding.businessActivities}
            onChangeText={(t) => setBranding((b) => ({ ...b, businessActivities: t }))}
            placeholder="Kısa açıklama"
            placeholderTextColor={adminTheme.colors.textMuted}
          />
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Adres</Text>
          <TextInput
            style={styles.input}
            value={branding.address}
            onChangeText={(t) => setBranding((b) => ({ ...b, address: t }))}
            placeholder="Merkez adres"
            placeholderTextColor={adminTheme.colors.textMuted}
          />
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Telefon</Text>
          <TextInput
            style={styles.input}
            value={branding.phone}
            onChangeText={(t) => setBranding((b) => ({ ...b, phone: t }))}
            placeholder="Tel"
            placeholderTextColor={adminTheme.colors.textMuted}
          />
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Faks</Text>
          <TextInput
            style={styles.input}
            value={branding.fax}
            onChangeText={(t) => setBranding((b) => ({ ...b, fax: t }))}
            placeholder="İsteğe bağlı"
            placeholderTextColor={adminTheme.colors.textMuted}
          />
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>İl kodu (mühür altı)</Text>
          <TextInput
            style={styles.input}
            value={branding.provinceCode}
            onChangeText={(t) => setBranding((b) => ({ ...b, provinceCode: t }))}
            placeholder="34"
            placeholderTextColor={adminTheme.colors.textMuted}
          />
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Varsayılan SERİ</Text>
          <TextInput
            style={styles.input}
            value={branding.defaultSeri}
            onChangeText={(t) => setBranding((b) => ({ ...b, defaultSeri: t }))}
            placeholder="A"
            placeholderTextColor={adminTheme.colors.textMuted}
          />
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Form tarihi (sağ üst)</Text>
          <TextInput
            style={styles.input}
            value={formListDate}
            onChangeText={setFormListDate}
            placeholder="GG.AA.YYYY"
            placeholderTextColor={adminTheme.colors.textMuted}
          />
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>SIRA no</Text>
          <TextInput
            style={styles.input}
            value={formSira}
            onChangeText={setFormSira}
            placeholder="Boş bırakılabilir"
            placeholderTextColor={adminTheme.colors.textMuted}
          />
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>BLOK</Text>
          <TextInput
            style={styles.input}
            value={formBlock}
            onChangeText={setFormBlock}
            placeholder="Blok adı veya no"
            placeholderTextColor={adminTheme.colors.textMuted}
          />
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Matbaa / alt not (çok küçük punto)</Text>
          <TextInput
            style={styles.input}
            value={branding.footerPrinterLine}
            onChangeText={(t) => setBranding((b) => ({ ...b, footerPrinterLine: t }))}
            placeholder="İsteğe bağlı"
            placeholderTextColor={adminTheme.colors.textMuted}
          />
        </View>
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => pickSealOrLogo('logoDataUrl')}
            activeOpacity={0.85}
          >
            <Ionicons name="image-outline" size={20} color={adminTheme.colors.primary} />
            <Text style={styles.secondaryBtnText}>Sol logo yükle</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => pickSealOrLogo('ministrySealDataUrl')}
            activeOpacity={0.85}
          >
            <Ionicons name="ribbon-outline" size={20} color={adminTheme.colors.primary} />
            <Text style={styles.secondaryBtnText}>Maliye mührü (PNG)</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => {
              setBranding((prev) => {
                const next = { ...prev, logoDataUrl: null };
                saveHmbFormBranding(next).catch(() => {});
                return next;
              });
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.secondaryBtnText}>Logoyu kaldır</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => {
              setBranding((prev) => {
                const next = { ...prev, ministrySealDataUrl: null };
                saveHmbFormBranding(next).catch(() => {});
                return next;
              });
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.secondaryBtnText}>Mühürü varsayılana dön</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.primaryBtn, { marginTop: 12, width: '100%' }]}
          onPress={() => saveHmbFormBranding(branding)}
          activeOpacity={0.85}
        >
          <Ionicons name="save-outline" size={20} color="#fff" />
          <Text style={styles.primaryBtnText}>İşletme bilgilerini kaydet</Text>
        </TouchableOpacity>
      </AdminCard>

      <AdminCard>
        <Text style={styles.sectionTitle}>Rapor Filtreleri</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Başlangıç</Text>
          <TextInput
            style={styles.input}
            value={startDate}
            onChangeText={setStartDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={adminTheme.colors.textMuted}
          />
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Bitiş</Text>
          <TextInput
            style={styles.input}
            value={endDate}
            onChangeText={setEndDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={adminTheme.colors.textMuted}
          />
        </View>
        <Text style={styles.label}>Müşteri tipi</Text>
        <View style={styles.chipRow}>
          {GUEST_TYPE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.chip, guestType === opt.value && styles.chipActive]}
              onPress={() => setGuestType(opt.value)}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, guestType === opt.value && styles.chipTextActive]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[styles.label, { marginTop: 12 }]}>Oda seçimi</Text>
        <TouchableOpacity style={styles.chip} onPress={useAllRooms} activeOpacity={0.8}>
          <Text style={[styles.chipText, selectedRoomIds === null && styles.chipTextActive]}>
            Tüm odalar ({rooms.length})
          </Text>
        </TouchableOpacity>
        {rooms.length > 0 && (
          <View style={styles.roomChips}>
            {rooms.slice(0, 12).map((r) => (
              <TouchableOpacity
                key={r.id}
                style={[
                  styles.roomChip,
                  selectedRoomIds !== null && selectedRoomIds.includes(r.id) && styles.chipActive,
                ]}
                onPress={() => toggleRoom(r.id)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.roomChipText,
                    selectedRoomIds !== null && selectedRoomIds.includes(r.id) && styles.chipTextActive,
                  ]}
                >
                  {r.room_number}
                </Text>
              </TouchableOpacity>
            ))}
            {rooms.length > 12 && (
              <Text style={styles.roomChipHint}>+{rooms.length - 12} oda daha</Text>
            )}
          </View>
        )}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.btnDisabled]}
            onPress={runReport}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="document-text" size={20} color="#fff" />
                <Text style={styles.primaryBtnText}>Raporu hazırla</Text>
              </>
            )}
          </TouchableOpacity>
          {reportData && (
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => setPreviewVisible(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="eye" size={20} color={adminTheme.colors.primary} />
              <Text style={styles.secondaryBtnText}>Önizleme</Text>
            </TouchableOpacity>
          )}
        </View>
      </AdminCard>

      {reportData && (
        <AdminCard>
          <Text style={styles.sectionTitle}>Özet (Seçili dönem)</Text>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{reportData.totalStays}</Text>
              <Text style={styles.summaryLabel}>Konaklama</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{reportData.totalGuests}</Text>
              <Text style={styles.summaryLabel}>Müşteri</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{fmtMoney(reportData.totalRevenueNet + reportData.totalVat + reportData.totalAccommodationTax)} TL</Text>
              <Text style={styles.summaryLabel}>Toplam ciro</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{fmtMoney(reportData.totalVat)} TL</Text>
              <Text style={styles.summaryLabel}>KDV (%10)</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{fmtMoney(reportData.totalAccommodationTax)} TL</Text>
              <Text style={styles.summaryLabel}>Konaklama vergisi (%2)</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.pdfBtn, pdfLoading && styles.btnDisabled]}
            onPress={generatePdf}
            disabled={pdfLoading}
            activeOpacity={0.85}
          >
            {pdfLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="download" size={20} color="#fff" />
                <Text style={styles.primaryBtnText}>PDF indir</Text>
              </>
            )}
          </TouchableOpacity>
        </AdminCard>
      )}

      <AdminCard>
        <Text style={styles.sectionTitle}>Son hazırlanan raporlar</Text>
        {loadingRecent ? (
          <ActivityIndicator size="small" color={adminTheme.colors.primary} style={{ marginVertical: 16 }} />
        ) : recentReports.length === 0 ? (
          <Text style={styles.empty}>Henüz rapor yok.</Text>
        ) : (
          recentReports.map((r) => (
            <TouchableOpacity
              key={r.id}
              style={styles.reportRow}
              onPress={() => {
                setStartDate(r.start_date);
                setEndDate(r.end_date);
                runReport({ startDate: r.start_date, endDate: r.end_date });
              }}
              activeOpacity={0.7}
            >
              <View style={styles.reportRowLeft}>
                <Ionicons name="document" size={20} color={adminTheme.colors.textSecondary} />
                <View>
                  <Text style={styles.reportRowTitle}>{r.report_number}</Text>
                  <Text style={styles.reportRowMeta}>
                    {formatDateShort(r.start_date)} – {formatDateShort(r.end_date)} · {r.total_stays} kayıt
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={adminTheme.colors.textMuted} />
            </TouchableOpacity>
          ))
        )}
      </AdminCard>

      <Modal visible={previewVisible} animationType="slide" onRequestClose={() => setPreviewVisible(false)}>
        <View style={styles.modalWrap}>
          <View style={[styles.modalHeader, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
            <TouchableOpacity
              style={styles.modalBackBtn}
              onPress={() => setPreviewVisible(false)}
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Geri"
            >
              <Ionicons name="arrow-back" size={24} color={adminTheme.colors.text} />
              <Text style={styles.modalBackText}>Geri</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitleCenter} numberOfLines={2}>
              Önizleme · {formatDateShort(filters.startDate)} – {formatDateShort(filters.endDate)}
            </Text>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setPreviewVisible(false)}
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Kapat"
            >
              <Ionicons name="close" size={26} color={adminTheme.colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
            {reportData && (
              <>
                <View style={styles.previewBlock}>
                  <Text style={styles.previewHead}>GÜNLÜK MÜŞTERİ LİSTESİ</Text>
                  <Text style={styles.previewSub}>VUK Md. 240 · {formListDate}</Text>
                </View>
                <View style={styles.previewBlock}>
                  <Text style={styles.previewLabel}>İşletme (PDF sol üst)</Text>
                  <Text style={styles.previewText}>{branding.legalCompanyName}</Text>
                  {!!branding.businessActivities && (
                    <Text style={styles.previewText}>{branding.businessActivities}</Text>
                  )}
                  <Text style={styles.previewText}>{branding.address}</Text>
                  <Text style={styles.previewText}>
                    Tel: {branding.phone}
                    {branding.fax ? ` · Faks: ${branding.fax}` : ''}
                  </Text>
                </View>
                <View style={styles.previewBlock}>
                  <Text style={styles.previewLabel}>Müşteri listesi</Text>
                  {reportData.stays.map((s, i) => (
                    <View key={i} style={styles.stayRow}>
                      <Text style={styles.stayRoom}>Oda {s.room_number}</Text>
                      {s.guests.map((g, j) => (
                        <Text key={j} style={styles.stayGuest}>
                          {g.full_name} · {g.id_number ?? '—'} · Giriş: {formatDateShort(s.check_in_at)} · Çıkış:{' '}
                          {s.check_out_at ? formatDateShort(s.check_out_at) : '—'}
                        </Text>
                      ))}
                      <Text style={styles.stayAmount}>
                        {fmtMoney(s.total_net + s.vat + s.accommodation_tax)} TL ({s.nights} gece) · KDV:{' '}
                        {fmtMoney(s.vat)} TL · KV: {fmtMoney(s.accommodation_tax)} TL
                      </Text>
                    </View>
                  ))}
                </View>
                <View style={styles.previewBlock}>
                  <Text style={styles.previewLabel}>Özet</Text>
                  <Text style={styles.previewText}>Toplam konaklama: {reportData.totalStays}</Text>
                  <Text style={styles.previewText}>Toplam müşteri: {reportData.totalGuests}</Text>
                  <Text style={styles.previewText}>
                    Genel toplam: {fmtMoney(reportData.totalRevenueNet + reportData.totalVat + reportData.totalAccommodationTax)} TL
                  </Text>
                </View>
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.pdfBtn, pdfLoading && styles.btnDisabled]}
                    onPress={() => {
                      generatePdf();
                      setPreviewVisible(false);
                    }}
                    disabled={pdfLoading}
                  >
                    {pdfLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="download" size={20} color="#fff" />
                        <Text style={styles.primaryBtnText}>PDF indir</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 20, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: adminTheme.colors.text,
    marginBottom: 12,
  },
  legalNote: {
    fontSize: 13,
    color: adminTheme.colors.textSecondary,
    lineHeight: 20,
  },
  row: { marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.textSecondary, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: adminTheme.colors.text,
    ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: adminTheme.radius.full,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  chipActive: {
    backgroundColor: adminTheme.colors.primary,
    borderColor: adminTheme.colors.primary,
  },
  chipText: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.text },
  chipTextActive: { color: '#fff' },
  roomChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  roomChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: adminTheme.radius.sm,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  roomChipText: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.text },
  roomChipHint: { fontSize: 12, color: adminTheme.colors.textMuted, alignSelf: 'center', marginLeft: 4 },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 20, flexWrap: 'wrap' },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: adminTheme.colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: adminTheme.radius.md,
    minWidth: 160,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: adminTheme.radius.md,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  secondaryBtnText: { color: adminTheme.colors.primary, fontWeight: '600', fontSize: 15 },
  btnDisabled: { opacity: 0.7 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  summaryItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: adminTheme.colors.surfaceTertiary,
    padding: 14,
    borderRadius: adminTheme.radius.sm,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  summaryValue: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.text },
  summaryLabel: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 4 },
  pdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: adminTheme.colors.accent,
    paddingVertical: 14,
    borderRadius: adminTheme.radius.md,
    marginTop: 8,
  },
  empty: { fontSize: 14, color: adminTheme.colors.textMuted, paddingVertical: 16 },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.borderLight,
  },
  reportRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reportRowTitle: { fontSize: 15, fontWeight: '600', color: adminTheme.colors.text },
  reportRowMeta: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  modalWrap: { flex: 1, backgroundColor: adminTheme.colors.surface },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 14,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.border,
  },
  modalBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 88,
    paddingVertical: 4,
  },
  modalBackText: { fontSize: 17, fontWeight: '600', color: adminTheme.colors.text },
  modalTitleCenter: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: adminTheme.colors.text,
    textAlign: 'center',
  },
  modalCloseBtn: { minWidth: 44, alignItems: 'flex-end', paddingVertical: 4, justifyContent: 'center' },
  modalScroll: { flex: 1 },
  modalScrollContent: { padding: 20, paddingBottom: 40 },
  previewBlock: { marginBottom: 24 },
  previewHead: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.primary, textAlign: 'center' },
  previewSub: { fontSize: 13, color: adminTheme.colors.textSecondary, textAlign: 'center', marginTop: 4 },
  previewLabel: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.textSecondary, marginBottom: 8 },
  previewText: { fontSize: 14, color: adminTheme.colors.text, marginBottom: 4 },
  stayRow: {
    backgroundColor: adminTheme.colors.surfaceTertiary,
    padding: 12,
    borderRadius: adminTheme.radius.sm,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  stayRoom: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.text, marginBottom: 6 },
  stayGuest: { fontSize: 13, color: adminTheme.colors.text, marginBottom: 2 },
  stayAmount: { fontSize: 12, color: adminTheme.colors.textSecondary, marginTop: 4 },
  modalActions: { marginTop: 24 },
});
