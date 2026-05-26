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
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { Platform } from 'react-native';
import { adminTheme } from '@/constants/adminTheme';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { AdminOrganizationPicker } from '@/components/admin';
import {
  shareContractPdf,
  buildContractHtml,
  fetchContractPdfAppearance,
  openContractPrintWindow,
  type GuestForPdf,
} from '@/lib/contractPdf';

type StaffRow = { id: string; full_name: string | null; department: string | null };

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
};

export default function ContractAcceptances() {
  const router = useRouter();
  const { staff } = useAuthStore();
  const { selectedOrganizationId } = useAdminOrgStore();
  const canUseAllOrganizations = staff?.app_permissions?.super_admin === true || staff?.role === 'admin';
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [assignTarget, setAssignTarget] = useState<Row | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [detailTarget, setDetailTarget] = useState<Row | null>(null);
  const [detailGuest, setDetailGuest] = useState<GuestForPdf | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const load = useCallback(async () => {
    const orgId = canUseAllOrganizations ? selectedOrganizationId : staff?.organization_id;
    const orgScoped = orgId && orgId !== 'all' ? orgId : null;
    let listQuery = supabase
      .from('contract_acceptances')
      .select('id, token, room_id, contract_lang, accepted_at, assigned_staff_id, assigned_at, guest_id, guests(full_name)')
      .order('accepted_at', { ascending: false })
      .limit(200);
    if (orgScoped) listQuery = listQuery.eq('organization_id', orgScoped);
    const { data: list, error } = await listQuery;

    if (error) {
      setRows([]);
      setLoadError(error.message);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setLoadError(null);

    const roomIds = (list ?? []).map((r) => r.room_id).filter(Boolean) as string[];
    const staffIds = (list ?? []).map((r) => r.assigned_staff_id).filter(Boolean) as string[];

    let roomNumbers: Record<string, string> = {};
    let staffNames: Record<string, string> = {};

    if (roomIds.length > 0) {
      const { data: rooms } = await supabase.from('rooms').select('id, room_number').in('id', roomIds);
      roomNumbers = (rooms ?? []).reduce((acc, r) => ({ ...acc, [r.id]: r.room_number }), {} as Record<string, string>);
    }
    if (staffIds.length > 0) {
      const { data: staff } = await supabase.from('staff').select('id, full_name').in('id', staffIds);
      staffNames = (staff ?? []).reduce((acc, s) => ({ ...acc, [s.id]: s.full_name ?? '—' }), {} as Record<string, string>);
    }

    setRows(
      (list ?? []).map((r) => {
        const guests = r.guests as { full_name: string | null } | { full_name: string | null }[] | null;
        const guestObj = Array.isArray(guests) ? guests[0] : guests;
        return {
          ...r,
          room_number: r.room_id ? roomNumbers[r.room_id] ?? '—' : null,
          assigned_staff_name: r.assigned_staff_id ? staffNames[r.assigned_staff_id] ?? '—' : null,
          signer_name: guestObj?.full_name ?? null,
        };
      })
    );
  }, [canUseAllOrganizations, selectedOrganizationId, staff?.organization_id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (assignModalVisible) {
      let staffQuery = supabase
        .from('staff')
        .select('id, full_name, department')
        .eq('is_active', true)
        .order('full_name');
      const orgId = canUseAllOrganizations ? selectedOrganizationId : staff?.organization_id;
      if (orgId && orgId !== 'all') staffQuery = staffQuery.eq('organization_id', orgId);
      staffQuery.then(({ data }) => setStaffList(data ?? []));
    }
  }, [assignModalVisible, canUseAllOrganizations, selectedOrganizationId, staff?.organization_id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const openAssignModal = (item: Row) => {
    setAssignTarget(item);
    setAssignModalVisible(true);
  };

  const assignStaff = async (staffId: string) => {
    if (!assignTarget) return;
    setAssigning(true);
    try {
      const { error } = await supabase
        .from('contract_acceptances')
        .update({ assigned_staff_id: staffId, assigned_at: new Date().toISOString() })
        .eq('id', assignTarget.id);
      if (error) throw error;
      setAssignModalVisible(false);
      setAssignTarget(null);
      await load();
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Çalışan atanamadı.');
    }
    setAssigning(false);
  };

  const clearAssignment = async () => {
    if (!assignTarget) return;
    setAssigning(true);
    try {
      const { error } = await supabase
        .from('contract_acceptances')
        .update({ assigned_staff_id: null, assigned_at: null })
        .eq('id', assignTarget.id);
      if (error) throw error;
      setAssignModalVisible(false);
      setAssignTarget(null);
      await load();
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Atama kaldırılamadı.');
    }
    setAssigning(false);
  };

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
      Alert.alert('Bilgi', 'Bu onay kaydında imzalayan misafir (guest) kaydı yok; sadece misafir formu doldurulup onaylanan sözleşmelerde PDF oluşturulabilir.');
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
      Alert.alert('Önizleme', 'Mobilde önizleme için "PDF indir" butonunu kullanın; PDF paylaşım menüsünden açılabilir.');
    }
  };

  if (loading) return <Text style={styles.loading}>Yükleniyor...</Text>;

  return (
    <View style={styles.container}>
      <View style={styles.orgPickerWrap}>
        <AdminOrganizationPicker canUseAll={canUseAllOrganizations} ownOrganizationId={staff?.organization_id} />
      </View>
      {loadError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>Liste yüklenemedi: {loadError}</Text>
          <Text style={styles.errorBannerSub}>Admin yetkisi ve RLS (contract_acceptances) kontrol edin.</Text>
        </View>
      ) : null}
      <TouchableOpacity
        style={styles.contactHubBtn}
        onPress={() => router.push('/admin/contracts/contact-directory')}
        activeOpacity={0.85}
      >
        <Ionicons name="call-outline" size={18} color="#fff" />
        <Text style={styles.contactHubBtnText}>Telefon / WhatsApp / e-posta rehberi</Text>
        <Ionicons name="chevron-forward" size={18} color="#fff" />
      </TouchableOpacity>
      <Text style={styles.hint}>
        Sözleşme onayı yapan misafirler (önizlemede imzalayan ismi). Çalışan atayın; yetkili çalışan sadece kendine atanan onayları personel uygulamasında görür ve oda atar. Sözleşmeyi PDF olarak indirebilirsiniz.
      </Text>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[adminTheme.colors.primary]} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.room}>Oda: {item.room_number ?? '—'}</Text>
              <Text style={styles.date}>{new Date(item.accepted_at).toLocaleString('tr-TR')}</Text>
            </View>
            {item.signer_name ? (
              <View style={styles.signerRow}>
                <Ionicons name="create-outline" size={14} color="#0f766e" />
                <Text style={styles.signerText}>İmzalayan: {item.signer_name}</Text>
              </View>
            ) : null}
            {item.assigned_staff_name ? (
              <View style={styles.assignedRow}>
                <Ionicons name="person" size={14} color={adminTheme.colors.primary} />
                <Text style={styles.assignedText}>Yetkili çalışan: {item.assigned_staff_name}</Text>
              </View>
            ) : (
              <Text style={styles.unassignedText}>Çalışan atanmadı</Text>
            )}
            <Text style={styles.meta}>Dil: {item.contract_lang.toUpperCase()} · Token: {item.token.slice(0, 8)}…</Text>
            <View style={styles.actions}>
              <TouchableOpacity style={styles.detailBtn} onPress={() => openDetailModal(item)}>
                <Text style={styles.detailBtnText}>Detay</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.assignStaffBtn} onPress={() => openAssignModal(item)}>
                <Text style={styles.assignStaffBtnText}>{item.assigned_staff_id ? 'Çalışan değiştir' : 'Çalışan ata'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.guestBtn}
                onPress={() => {
                  if (item.room_id) router.push({ pathname: '/admin/guests', params: { roomId: item.room_id, fromAcceptance: item.id } });
                  else router.push('/admin/guests');
                }}
              >
                <Text style={styles.guestBtnText}>Misafir / Oda</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pdfBtn, (pdfLoadingId === item.id || !item.guest_id) && styles.pdfBtnDisabled]}
                onPress={() => downloadPdf(item)}
                disabled={pdfLoadingId !== null}
              >
                {pdfLoadingId === item.id ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.pdfBtnText}>PDF</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      <Modal visible={detailModalVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setDetailModalVisible(false)}>
          <View style={[styles.modalContent, styles.detailModalContent]} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Detaylı kontrol – Sözleşme onayı</Text>
            {detailTarget && (
              <ScrollView style={styles.detailScroll} showsVerticalScrollIndicator>
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Onay bilgisi</Text>
                  <Text style={styles.detailLine}>Tarih: {new Date(detailTarget.accepted_at).toLocaleString('tr-TR')}</Text>
                  <Text style={styles.detailLine}>Token: {detailTarget.token}</Text>
                  <Text style={styles.detailLine}>Oda: {detailTarget.room_number ?? '—'}</Text>
                  <Text style={styles.detailLine}>Dil: {detailTarget.contract_lang.toUpperCase()}</Text>
                  <Text style={styles.detailLine}>İmzalayan (önizleme): {detailTarget.signer_name ?? '—'}</Text>
                  <Text style={styles.detailLine}>Yetkili çalışan: {detailTarget.assigned_staff_name ?? '—'}</Text>
                  <Text style={styles.detailLine}>Misafir kaydı (guest_id): {detailTarget.guest_id ? 'Var' : 'Yok'}</Text>
                </View>
                {detailLoading && <ActivityIndicator size="small" color={adminTheme.colors.primary} style={{ marginVertical: 8 }} />}
                {detailGuest && (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>Misafir (PDF için)</Text>
                    <Text style={styles.detailLine}>Ad: {detailGuest.full_name}</Text>
                    <Text style={styles.detailLine}>Telefon: {detailGuest.phone ?? '—'}</Text>
                    <Text style={styles.detailLine}>E-posta: {detailGuest.email ?? '—'}</Text>
                    <Text style={styles.detailLine}>İmza kaydı: {detailGuest.signature_data ? 'Var' : 'Yok'}</Text>
                    <Text style={styles.detailLine}>Şablon: {detailGuest.contract_templates?.title ?? '—'}</Text>
                  </View>
                )}
                {!detailTarget.guest_id && (
                  <Text style={styles.detailHint}>Bu onayda misafir (guest) kaydı yok; PDF yalnızca form doldurulup onaylanan sözleşmelerde oluşturulabilir.</Text>
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
                      onPress={() => { downloadPdf(detailTarget); }}
                      disabled={pdfLoadingId !== null}
                    >
                      {pdfLoadingId === detailTarget.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.pdfBtnText}>PDF indir</Text>
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

      <Modal visible={assignModalVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => !assigning && setAssignModalVisible(false)}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Çalışan ata</Text>
            {assignTarget && (
              <Text style={styles.modalSub}>Sözleşme onayı: {assignTarget.token.slice(0, 12)}… · {new Date(assignTarget.accepted_at).toLocaleString('tr-TR')}</Text>
            )}
            <TouchableOpacity style={styles.clearAssignBtn} onPress={() => clearAssignment()} disabled={assigning}>
              <Text style={styles.clearAssignText}>Atamayı kaldır</Text>
            </TouchableOpacity>
            <FlatList
              data={staffList}
              keyExtractor={(s) => s.id}
              style={styles.staffList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.staffItem}
                  onPress={() => assignStaff(item.id)}
                  disabled={assigning}
                >
                  <Text style={styles.staffName}>{item.full_name ?? item.id.slice(0, 8)}</Text>
                  {item.department ? <Text style={styles.staffDept}>{item.department}</Text> : null}
                </TouchableOpacity>
              )}
            />
            {assigning && <ActivityIndicator style={styles.modalSpinner} size="small" color={adminTheme.colors.primary} />}
            <TouchableOpacity style={styles.modalClose} onPress={() => !assigning && setAssignModalVisible(false)}>
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
  orgPickerWrap: { paddingHorizontal: 16, paddingTop: 8 },
  contactHubBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#0d9488',
  },
  contactHubBtnText: { color: '#fff', fontWeight: '700', fontSize: 14, flex: 1 },
  hint: {
    padding: 12,
    paddingHorizontal: 16,
    fontSize: 12,
    color: '#64748b',
    backgroundColor: '#f0f9ff',
  },
  loading: { padding: 24, fontSize: 14, color: '#64748b' },
  list: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  room: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  date: { fontSize: 12, color: '#64748b' },
  signerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  signerText: { fontSize: 13, color: '#0f766e', fontWeight: '600' },
  assignedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  assignedText: { fontSize: 13, color: '#0369a1', fontWeight: '600' },
  unassignedText: { fontSize: 12, color: '#94a3b8', fontStyle: 'italic', marginBottom: 4 },
  meta: { fontSize: 12, color: '#64748b', marginBottom: 10 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  detailBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#0f766e',
    justifyContent: 'center',
  },
  detailBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  assignStaffBtn: {
    flex: 1,
    minWidth: 100,
    backgroundColor: '#0369a1',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  assignStaffBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  guestBtn: {
    flex: 1,
    minWidth: 100,
    backgroundColor: '#1a365d',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  guestBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  pdfBtn: {
    backgroundColor: '#2d3748',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    justifyContent: 'center',
    minWidth: 56,
  },
  pdfBtnDisabled: { opacity: 0.6 },
  pdfBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    maxHeight: '80%',
    padding: 16,
  },
  detailModalContent: { maxHeight: '90%' },
  detailScroll: { maxHeight: 400 },
  detailSection: { marginBottom: 16 },
  detailLabel: { fontSize: 12, fontWeight: '700', color: '#64748b', marginBottom: 6, textTransform: 'uppercase' },
  detailLine: { fontSize: 14, color: '#1e293b', marginBottom: 4 },
  detailHint: { fontSize: 13, color: '#64748b', fontStyle: 'italic', marginVertical: 12 },
  detailActions: { flexDirection: 'row', gap: 10, marginTop: 16, flexWrap: 'wrap' },
  previewBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#0369a1',
  },
  previewBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1e293b', marginBottom: 4 },
  modalSub: { fontSize: 12, color: '#64748b', marginBottom: 12 },
  clearAssignBtn: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 10, marginBottom: 12 },
  clearAssignText: { fontSize: 13, color: '#dc2626' },
  staffList: { maxHeight: 280 },
  staffItem: { paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  staffName: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  staffDept: { fontSize: 12, color: '#64748b', marginTop: 2 },
  modalSpinner: { marginVertical: 8 },
  modalClose: { marginTop: 12, paddingVertical: 12, alignItems: 'center' },
  modalCloseText: { fontSize: 15, fontWeight: '600', color: '#64748b' },
  errorBanner: { backgroundColor: '#fef2f2', padding: 12, marginHorizontal: 16, marginTop: 12, borderRadius: 8, borderWidth: 1, borderColor: '#fecaca' },
  errorBannerText: { fontSize: 14, color: '#b91c1c', fontWeight: '600' },
  errorBannerSub: { fontSize: 12, color: '#991b1b', marginTop: 4 },
});
