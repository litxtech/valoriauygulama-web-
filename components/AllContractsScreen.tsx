/**
 * Tüm sözleşmeler ekranı – Admin ve Staff (tum_sozlesmeler yetkisi) tarafından kullanılır.
 */
import { useEffect, useState, useCallback } from 'react';
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
  TextInput,
  Platform,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import {
  shareContractPdf,
  buildContractHtml,
  fetchContractPdfAppearance,
  openContractPrintWindow,
  type GuestForPdf,
} from '@/lib/contractPdf';

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

function toWhatsAppPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length < 10) return null;
  const withCountry = cleaned.startsWith('90') ? cleaned : `90${cleaned.replace(/^0/, '')}`;
  return withCountry;
}

export function AllContractsScreen() {
  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setDate(defaultFrom.getDate() - 30);
  const [dateFrom, setDateFrom] = useState(defaultFrom.toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(today.toISOString().slice(0, 10));
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

  const load = useCallback(async () => {
    const fromIso = `${dateFrom}T00:00:00.000Z`;
    const toEnd = new Date(dateTo);
    toEnd.setHours(23, 59, 59, 999);
    const toIso = toEnd.toISOString();

    const { data: list, error } = await supabase
      .from('contract_acceptances')
      .select('id, token, room_id, contract_lang, accepted_at, assigned_staff_id, assigned_at, guest_id, guests(full_name, phone)')
      .gte('accepted_at', fromIso)
      .lte('accepted_at', toIso)
      .order('accepted_at', { ascending: false })
      .limit(500);

    if (error) {
      setRows([]);
      setLoadError(error.message);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setLoadError(null);

    const roomIds = [...new Set((list ?? []).map((r) => r.room_id).filter(Boolean))] as string[];
    const staffIds = [...new Set((list ?? []).map((r) => r.assigned_staff_id).filter(Boolean))] as string[];

    let roomNumbers: Record<string, string> = {};
    let staffNames: Record<string, string> = {};

    const [roomsResult, staffResult] = await Promise.all([
      roomIds.length > 0
        ? supabase.from('rooms').select('id, room_number').in('id', roomIds)
        : Promise.resolve({ data: [] as { id: string; room_number: string }[] }),
      staffIds.length > 0
        ? supabase.from('staff').select('id, full_name').in('id', staffIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    ]);
    roomNumbers = (roomsResult.data ?? []).reduce(
      (acc, r) => ({ ...acc, [r.id]: r.room_number }),
      {} as Record<string, string>
    );
    staffNames = (staffResult.data ?? []).reduce(
      (acc, s) => ({ ...acc, [s.id]: s.full_name ?? '—' }),
      {} as Record<string, string>
    );

    setRows(
      (list ?? []).map((r) => {
        const guests = r.guests as { full_name: string | null; phone: string | null } | { full_name: string | null; phone: string | null }[] | null;
        const guestObj = Array.isArray(guests) ? guests[0] : guests;
        return {
          ...r,
          room_number: r.room_id ? roomNumbers[r.room_id] ?? '—' : null,
          assigned_staff_name: r.assigned_staff_id ? staffNames[r.assigned_staff_id] ?? '—' : null,
          signer_name: guestObj?.full_name ?? null,
          signer_phone: guestObj?.phone ?? null,
        };
      })
    );
  }, [dateFrom, dateTo]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const loadGuestForPdf = async (guestId: string): Promise<GuestForPdf | null> => {
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
    if (!item.guest_id) {
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

  const openDetailModal = async (item: Row) => {
    setDetailTarget(item);
    setDetailModalVisible(true);
    setDetailGuest(null);
    setPreviewHtml(null);
    if (!item.guest_id) {
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
    const url = `tel:${tel}`;
    Linking.openURL(url).catch(() => Alert.alert('Hata', 'Arama açılamadı.'));
  };

  const openWhatsApp = (phone: string | null | undefined) => {
    const waPhone = toWhatsAppPhone(phone);
    if (!waPhone) {
      Alert.alert('Bilgi', 'Geçerli telefon numarası kayıtlı değil. WhatsApp için 0 ile başlayan veya 90 ile başlayan numara gerekir.');
      return;
    }
    const url = `https://wa.me/${waPhone}`;
    Linking.openURL(url).catch(() => Alert.alert('Hata', 'WhatsApp açılamadı.'));
  };

  const sharePdfToWhatsApp = async (item: Row) => {
    if (!item.guest_id) {
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

  return (
    <View style={styles.container}>
      {loadError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>Liste yüklenemedi: {loadError}</Text>
        </View>
      ) : null}
      <View style={styles.filterRow}>
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>Başlangıç</Text>
          <TextInput
            style={styles.dateInput}
            value={dateFrom}
            onChangeText={setDateFrom}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#94a3b8"
          />
        </View>
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>Bitiş</Text>
          <TextInput
            style={styles.dateInput}
            value={dateTo}
            onChangeText={setDateTo}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#94a3b8"
          />
        </View>
        <TouchableOpacity style={styles.filterBtn} onPress={() => load()}>
          <Ionicons name="search" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>
        Tarih aralığına göre sözleşme onayları. Kartlara tıklayarak detay ve onaylanan sözleşmeyi görüntüleyin. Telefon ve WhatsApp ile iletişim kurun.
      </Text>
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
                style={[styles.contactBtn, (pdfLoadingId === item.id || !item.guest_id) && styles.contactBtnDisabled]}
                onPress={(e) => { e.stopPropagation(); sharePdfToWhatsApp(item); }}
                disabled={pdfLoadingId !== null}
              >
                {pdfLoadingId === item.id ? (
                  <ActivityIndicator size="small" color="#0369a1" />
                ) : (
                  <>
                    <Ionicons name="document-outline" size={18} color="#0369a1" />
                    <Text style={[styles.contactBtnText, { color: '#0369a1' }]}>PDF Gönder</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
      />

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
                {!detailTarget.guest_id && (
                  <Text style={styles.detailHint}>Bu onayda misafir kaydı yok; PDF yalnızca form doldurulup onaylanan sözleşmelerde oluşturulabilir.</Text>
                )}
                <View style={styles.detailActions}>
                  {(detailGuest || previewHtml) && (
                    <TouchableOpacity style={styles.previewBtn} onPress={openPreviewWindow}>
                      <Text style={styles.previewBtnText}>Sözleşmeyi önizle / yazdır</Text>
                    </TouchableOpacity>
                  )}
                  {detailTarget.guest_id && (
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
                </View>
              </ScrollView>
            )}
            <TouchableOpacity style={styles.modalClose} onPress={() => setDetailModalVisible(false)}>
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
  filterRow: { flexDirection: 'row', padding: 12, gap: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', alignItems: 'flex-end' },
  filterGroup: { flex: 1 },
  filterLabel: { fontSize: 11, color: '#64748b', marginBottom: 4 },
  dateInput: { backgroundColor: '#f1f5f9', borderRadius: 8, padding: 10, fontSize: 14, color: '#1e293b' },
  filterBtn: { backgroundColor: adminTheme.colors.primary, padding: 12, borderRadius: 8, justifyContent: 'center' },
  hint: { padding: 12, paddingHorizontal: 16, fontSize: 12, color: '#64748b', backgroundColor: '#f0f9ff' },
  list: { padding: 16, paddingBottom: 32 },
  listLoading: { flexGrow: 1 },
  listLoadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 28,
    marginBottom: 8,
  },
  listLoadingText: { fontSize: 14, color: '#64748b' },
  emptyText: { padding: 24, textAlign: 'center', color: '#64748b', fontSize: 14 },
  card: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  name: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  date: { fontSize: 12, color: '#64748b' },
  cardMeta: { marginBottom: 10 },
  meta: { fontSize: 12, color: '#64748b' },
  contactRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  contactBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#f0fdf4', borderRadius: 8 },
  contactBtnDisabled: { opacity: 0.6 },
  contactBtnText: { fontSize: 13, fontWeight: '600', color: '#0f766e' },
  whatsappBtn: { backgroundColor: '#dcfce7' },
  whatsappText: { color: '#25D366' },
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
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1e293b', marginBottom: 12 },
  modalClose: { marginTop: 12, paddingVertical: 12, alignItems: 'center' },
  modalCloseText: { fontSize: 15, fontWeight: '600', color: '#64748b' },
  errorBanner: { backgroundColor: '#fef2f2', padding: 12, marginHorizontal: 16, marginTop: 12, borderRadius: 8, borderWidth: 1, borderColor: '#fecaca' },
  errorBannerText: { fontSize: 14, color: '#b91c1c', fontWeight: '600' },
});
