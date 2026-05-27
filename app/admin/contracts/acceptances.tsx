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
  filterValidUuids,
  resolveStaffOrganizationScope,
} from '@/lib/organizationScope';
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

function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  return name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Az önce';
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} sa önce`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} gün önce`;
  return new Date(dateStr).toLocaleDateString('tr-TR');
}

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
    const orgScoped = resolveStaffOrganizationScope({
      canUseAll: canUseAllOrganizations,
      selectedOrganizationId,
      ownOrganizationId: staff?.organization_id,
    });
    let listQuery = supabase
      .from('contract_acceptances')
      .select('id, token, room_id, contract_lang, accepted_at, assigned_staff_id, assigned_at, guest_id')
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

    const roomIds = filterValidUuids((list ?? []).map((r) => r.room_id));
    const staffIds = filterValidUuids((list ?? []).map((r) => r.assigned_staff_id));
    const guestIds = filterValidUuids((list ?? []).map((r) => r.guest_id));

    let roomNumbers: Record<string, string> = {};
    let staffNames: Record<string, string> = {};
    let guestNames: Record<string, string | null> = {};

    if (roomIds.length > 0) {
      const { data: rooms } = await supabase.from('rooms').select('id, room_number').in('id', roomIds);
      roomNumbers = (rooms ?? []).reduce((acc, r) => ({ ...acc, [r.id]: r.room_number }), {} as Record<string, string>);
    }
    if (staffIds.length > 0) {
      const { data: staffData } = await supabase.from('staff').select('id, full_name').in('id', staffIds);
      staffNames = (staffData ?? []).reduce((acc, s) => ({ ...acc, [s.id]: s.full_name ?? '—' }), {} as Record<string, string>);
    }
    if (guestIds.length > 0) {
      const { data: guestsData } = await supabase.from('guests').select('id, full_name').in('id', guestIds);
      guestNames = (guestsData ?? []).reduce((acc, g) => ({ ...acc, [g.id]: g.full_name }), {} as Record<string, string | null>);
    }

    setRows(
      (list ?? []).map((r) => ({
        ...r,
        room_number: r.room_id ? roomNumbers[r.room_id] ?? '—' : null,
        assigned_staff_name: r.assigned_staff_id ? staffNames[r.assigned_staff_id] ?? '—' : null,
        signer_name: r.guest_id ? guestNames[r.guest_id] ?? null : null,
      }))
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
      const orgScoped = resolveStaffOrganizationScope({
        canUseAll: canUseAllOrganizations,
        selectedOrganizationId,
        ownOrganizationId: staff?.organization_id,
      });
      if (orgScoped) staffQuery = staffQuery.eq('organization_id', orgScoped);
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
      Alert.alert('Bilgi', 'Bu onay kaydında misafir kaydı yok; sadece form doldurulup onaylanan sözleşmelerde PDF oluşturulabilir.');
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
      Alert.alert('Önizleme', 'Mobilde önizleme için "PDF indir" butonunu kullanın.');
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={adminTheme.colors.primary} />
        <Text style={styles.loadingText}>Sözleşmeler yükleniyor…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.orgPickerWrap}>
        <AdminOrganizationPicker canUseAll={canUseAllOrganizations} ownOrganizationId={staff?.organization_id} />
      </View>

      {loadError ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={18} color="#b91c1c" />
          <View style={{ flex: 1 }}>
            <Text style={styles.errorBannerText}>Liste yüklenemedi</Text>
            <Text style={styles.errorBannerSub}>{loadError}</Text>
          </View>
        </View>
      ) : null}

      {/* Quick actions header */}
      <View style={styles.headerSection}>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{rows.length}</Text>
            <Text style={styles.statLabel}>Toplam</Text>
          </View>
          <View style={[styles.statCard, styles.statCardSuccess]}>
            <Text style={[styles.statNumber, { color: '#059669' }]}>{rows.filter((r) => r.assigned_staff_id).length}</Text>
            <Text style={styles.statLabel}>Atanan</Text>
          </View>
          <View style={[styles.statCard, styles.statCardWarning]}>
            <Text style={[styles.statNumber, { color: '#d97706' }]}>{rows.filter((r) => !r.assigned_staff_id).length}</Text>
            <Text style={styles.statLabel}>Bekleyen</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.contactHubBtn}
          onPress={() => router.push('/admin/contracts/contact-directory')}
          activeOpacity={0.85}
        >
          <View style={styles.contactHubIcon}>
            <Ionicons name="people-outline" size={18} color="#fff" />
          </View>
          <Text style={styles.contactHubBtnText}>Misafir İletişim Rehberi</Text>
          <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[adminTheme.colors.primary]} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={48} color="#cbd5e1" />
            <Text style={styles.emptyText}>Henüz sözleşme onayı yok</Text>
          </View>
        }
        renderItem={({ item }) => {
          const hasStaff = !!item.assigned_staff_id;
          return (
            <TouchableOpacity style={styles.card} onPress={() => openDetailModal(item)} activeOpacity={0.88}>
              {/* Card header */}
              <View style={styles.cardHeader}>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarText}>{getInitials(item.signer_name)}</Text>
                </View>
                <View style={styles.cardHeaderInfo}>
                  <Text style={styles.cardName} numberOfLines={1}>{item.signer_name ?? 'İsimsiz'}</Text>
                  <Text style={styles.cardTime}>{timeAgo(item.accepted_at)}</Text>
                </View>
                <View style={[styles.statusBadge, hasStaff ? styles.statusBadgeAssigned : styles.statusBadgePending]}>
                  <View style={[styles.statusDot, hasStaff ? styles.statusDotAssigned : styles.statusDotPending]} />
                  <Text style={[styles.statusText, hasStaff ? styles.statusTextAssigned : styles.statusTextPending]}>
                    {hasStaff ? 'Atandı' : 'Bekliyor'}
                  </Text>
                </View>
              </View>

              {/* Card body */}
              <View style={styles.cardBody}>
                <View style={styles.infoRow}>
                  <View style={styles.infoItem}>
                    <Ionicons name="bed-outline" size={14} color="#64748b" />
                    <Text style={styles.infoText}>{item.room_number ?? '—'}</Text>
                  </View>
                  <View style={styles.infoItem}>
                    <Ionicons name="language-outline" size={14} color="#64748b" />
                    <Text style={styles.infoText}>{item.contract_lang.toUpperCase()}</Text>
                  </View>
                  {hasStaff && (
                    <View style={styles.infoItem}>
                      <Ionicons name="person-outline" size={14} color="#0369a1" />
                      <Text style={[styles.infoText, { color: '#0369a1' }]}>{item.assigned_staff_name}</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Card actions */}
              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={(e) => { e.stopPropagation(); openAssignModal(item); }}
                >
                  <Ionicons name="person-add-outline" size={16} color="#0369a1" />
                  <Text style={styles.actionBtnText}>{hasStaff ? 'Değiştir' : 'Ata'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={(e) => {
                    e.stopPropagation();
                    if (item.room_id) router.push({ pathname: '/admin/guests', params: { roomId: item.room_id, fromAcceptance: item.id } });
                    else router.push('/admin/guests');
                  }}
                >
                  <Ionicons name="home-outline" size={16} color="#475569" />
                  <Text style={styles.actionBtnText}>Oda</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, (!item.guest_id || pdfLoadingId === item.id) && styles.actionBtnDisabled]}
                  onPress={(e) => { e.stopPropagation(); downloadPdf(item); }}
                  disabled={pdfLoadingId !== null || !item.guest_id}
                >
                  {pdfLoadingId === item.id ? (
                    <ActivityIndicator size="small" color="#7c3aed" />
                  ) : (
                    <>
                      <Ionicons name="document-text-outline" size={16} color="#7c3aed" />
                      <Text style={[styles.actionBtnText, { color: '#7c3aed' }]}>PDF</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* Detail Modal */}
      <Modal visible={detailModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHandle} />
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              {detailTarget && (
                <>
                  {/* Header */}
                  <View style={styles.modalHeader}>
                    <View style={styles.modalAvatarLg}>
                      <Text style={styles.modalAvatarLgText}>{getInitials(detailTarget.signer_name)}</Text>
                    </View>
                    <Text style={styles.modalGuestName}>{detailTarget.signer_name ?? 'İsimsiz'}</Text>
                    <Text style={styles.modalGuestSub}>{new Date(detailTarget.accepted_at).toLocaleString('tr-TR')}</Text>
                  </View>

                  {/* Info cards */}
                  <View style={styles.infoCards}>
                    <View style={styles.infoCard}>
                      <Ionicons name="bed-outline" size={20} color="#0369a1" />
                      <Text style={styles.infoCardLabel}>Oda</Text>
                      <Text style={styles.infoCardValue}>{detailTarget.room_number ?? '—'}</Text>
                    </View>
                    <View style={styles.infoCard}>
                      <Ionicons name="language-outline" size={20} color="#0369a1" />
                      <Text style={styles.infoCardLabel}>Dil</Text>
                      <Text style={styles.infoCardValue}>{detailTarget.contract_lang.toUpperCase()}</Text>
                    </View>
                    <View style={styles.infoCard}>
                      <Ionicons name="person-outline" size={20} color="#0369a1" />
                      <Text style={styles.infoCardLabel}>Yetkili</Text>
                      <Text style={styles.infoCardValue} numberOfLines={1}>{detailTarget.assigned_staff_name ?? '—'}</Text>
                    </View>
                  </View>

                  {/* Guest details */}
                  {detailLoading && (
                    <View style={styles.detailLoadingWrap}>
                      <ActivityIndicator size="small" color={adminTheme.colors.primary} />
                      <Text style={styles.detailLoadingText}>Misafir bilgileri yükleniyor…</Text>
                    </View>
                  )}
                  {detailGuest && (
                    <View style={styles.sectionCard}>
                      <Text style={styles.sectionTitle}>Misafir Bilgileri</Text>
                      <View style={styles.detailRow}>
                        <Ionicons name="person-outline" size={16} color="#64748b" />
                        <Text style={styles.detailRowText}>{detailGuest.full_name}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Ionicons name="call-outline" size={16} color="#64748b" />
                        <Text style={styles.detailRowText}>{detailGuest.phone ?? '—'}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Ionicons name="mail-outline" size={16} color="#64748b" />
                        <Text style={styles.detailRowText}>{detailGuest.email ?? '—'}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Ionicons name="finger-print-outline" size={16} color="#64748b" />
                        <Text style={styles.detailRowText}>İmza: {detailGuest.signature_data ? 'Kayıtlı' : 'Yok'}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Ionicons name="document-outline" size={16} color="#64748b" />
                        <Text style={styles.detailRowText}>{detailGuest.contract_templates?.title ?? '—'}</Text>
                      </View>
                    </View>
                  )}

                  {!detailTarget.guest_id && !detailLoading && (
                    <View style={styles.noGuestBanner}>
                      <Ionicons name="information-circle-outline" size={18} color="#92400e" />
                      <Text style={styles.noGuestText}>Bu onayda misafir kaydı yok. PDF sadece form onaylanan sözleşmelerde oluşturulabilir.</Text>
                    </View>
                  )}

                  {/* Actions */}
                  <View style={styles.modalActions}>
                    {(detailGuest || previewHtml) && (
                      <TouchableOpacity style={styles.modalActionBtn} onPress={openPreviewWindow}>
                        <Ionicons name="eye-outline" size={18} color="#fff" />
                        <Text style={styles.modalActionBtnText}>Önizle / Yazdır</Text>
                      </TouchableOpacity>
                    )}
                    {detailTarget.guest_id && (
                      <TouchableOpacity
                        style={[styles.modalActionBtn, styles.modalActionBtnSecondary, pdfLoadingId === detailTarget.id && { opacity: 0.6 }]}
                        onPress={() => downloadPdf(detailTarget)}
                        disabled={pdfLoadingId !== null}
                      >
                        {pdfLoadingId === detailTarget.id ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="download-outline" size={18} color="#fff" />
                            <Text style={styles.modalActionBtnText}>PDF İndir</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[styles.modalActionBtn, styles.modalActionBtnOutline]}
                      onPress={() => openAssignModal(detailTarget)}
                    >
                      <Ionicons name="person-add-outline" size={18} color="#0369a1" />
                      <Text style={[styles.modalActionBtnText, { color: '#0369a1' }]}>
                        {detailTarget.assigned_staff_id ? 'Çalışan Değiştir' : 'Çalışan Ata'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </ScrollView>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setDetailModalVisible(false)}>
              <Text style={styles.closeBtnText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Assign Staff Modal */}
      <Modal visible={assignModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.assignSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHandle} />
            <Text style={styles.assignTitle}>Çalışan Ata</Text>
            {assignTarget && (
              <Text style={styles.assignSub}>
                {assignTarget.signer_name ?? 'İsimsiz'} · {new Date(assignTarget.accepted_at).toLocaleDateString('tr-TR')}
              </Text>
            )}
            {assignTarget?.assigned_staff_id && (
              <TouchableOpacity style={styles.clearAssignBtn} onPress={clearAssignment} disabled={assigning}>
                <Ionicons name="close-circle-outline" size={16} color="#dc2626" />
                <Text style={styles.clearAssignText}>Atamayı kaldır</Text>
              </TouchableOpacity>
            )}
            <FlatList
              data={staffList}
              keyExtractor={(s) => s.id}
              style={styles.staffList}
              contentContainerStyle={{ paddingBottom: 16 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.staffItem, assignTarget?.assigned_staff_id === item.id && styles.staffItemActive]}
                  onPress={() => assignStaff(item.id)}
                  disabled={assigning}
                >
                  <View style={styles.staffAvatar}>
                    <Text style={styles.staffAvatarText}>{getInitials(item.full_name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.staffName}>{item.full_name ?? item.id.slice(0, 8)}</Text>
                    {item.department ? <Text style={styles.staffDept}>{item.department}</Text> : null}
                  </View>
                  {assignTarget?.assigned_staff_id === item.id && (
                    <Ionicons name="checkmark-circle" size={20} color="#059669" />
                  )}
                </TouchableOpacity>
              )}
            />
            {assigning && <ActivityIndicator style={{ marginVertical: 8 }} size="small" color={adminTheme.colors.primary} />}
            <TouchableOpacity style={styles.closeBtn} onPress={() => !assigning && setAssignModalVisible(false)}>
              <Text style={styles.closeBtnText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: '#f8fafc' },
  loadingText: { fontSize: 14, color: '#64748b' },
  orgPickerWrap: { paddingHorizontal: 16, paddingTop: 10 },

  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fef2f2', padding: 14, marginHorizontal: 16, marginTop: 12, borderRadius: 12, borderWidth: 1, borderColor: '#fecaca' },
  errorBannerText: { fontSize: 14, color: '#b91c1c', fontWeight: '700' },
  errorBannerSub: { fontSize: 12, color: '#991b1b', marginTop: 2 },

  // Header & stats
  headerSection: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  statCardSuccess: { borderColor: '#a7f3d0', backgroundColor: '#f0fdf4' },
  statCardWarning: { borderColor: '#fed7aa', backgroundColor: '#fffbeb' },
  statNumber: { fontSize: 22, fontWeight: '800', color: '#1e293b' },
  statLabel: { fontSize: 11, fontWeight: '600', color: '#64748b', marginTop: 2, textTransform: 'uppercase' },

  contactHubBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  contactHubIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#0d9488', alignItems: 'center', justifyContent: 'center' },
  contactHubBtnText: { color: '#1e293b', fontWeight: '600', fontSize: 14, flex: 1 },

  // List
  list: { padding: 16, paddingBottom: 32 },
  emptyContainer: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyText: { fontSize: 15, color: '#94a3b8' },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, paddingBottom: 10, gap: 12 },
  avatarCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#e0f2fe', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '700', color: '#0369a1' },
  cardHeaderInfo: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  cardTime: { fontSize: 12, color: '#94a3b8', marginTop: 1 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12 },
  statusBadgeAssigned: { backgroundColor: '#dcfce7' },
  statusBadgePending: { backgroundColor: '#fef3c7' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusDotAssigned: { backgroundColor: '#059669' },
  statusDotPending: { backgroundColor: '#d97706' },
  statusText: { fontSize: 11, fontWeight: '700' },
  statusTextAssigned: { color: '#059669' },
  statusTextPending: { color: '#d97706' },

  cardBody: { paddingHorizontal: 14, paddingBottom: 10 },
  infoRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  infoText: { fontSize: 13, color: '#475569' },

  cardActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11 },
  actionBtnText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  actionBtnDisabled: { opacity: 0.5 },

  // Modal general
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#cbd5e1', alignSelf: 'center', marginTop: 10, marginBottom: 12 },

  // Detail modal
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%', paddingHorizontal: 20 },
  modalScroll: { flex: 1 },
  modalHeader: { alignItems: 'center', paddingVertical: 16 },
  modalAvatarLg: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#e0f2fe', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  modalAvatarLgText: { fontSize: 20, fontWeight: '700', color: '#0369a1' },
  modalGuestName: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  modalGuestSub: { fontSize: 13, color: '#94a3b8', marginTop: 3 },

  infoCards: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  infoCard: { flex: 1, backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#e2e8f0' },
  infoCardLabel: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  infoCardValue: { fontSize: 14, fontWeight: '700', color: '#0f172a' },

  detailLoadingWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', paddingVertical: 16 },
  detailLoadingText: { fontSize: 13, color: '#64748b' },

  sectionCard: { backgroundColor: '#f8fafc', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.3 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  detailRowText: { fontSize: 14, color: '#1e293b' },

  noGuestBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fffbeb', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#fde68a', marginBottom: 16 },
  noGuestText: { fontSize: 13, color: '#92400e', flex: 1 },

  modalActions: { gap: 10, marginTop: 8 },
  modalActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: '#0369a1' },
  modalActionBtnSecondary: { backgroundColor: '#1e293b' },
  modalActionBtnOutline: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#0369a1' },
  modalActionBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  closeBtn: { paddingVertical: 14, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#f1f5f9', marginTop: 8 },
  closeBtnText: { fontSize: 15, fontWeight: '600', color: '#64748b' },

  // Assign modal
  assignSheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '75%', paddingHorizontal: 20 },
  assignTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  assignSub: { fontSize: 13, color: '#94a3b8', marginBottom: 12 },
  clearAssignBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#fef2f2', marginBottom: 12 },
  clearAssignText: { fontSize: 13, color: '#dc2626', fontWeight: '600' },
  staffList: { flex: 1 },
  staffItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 10, marginBottom: 4 },
  staffItemActive: { backgroundColor: '#f0fdf4' },
  staffAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  staffAvatarText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  staffName: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  staffDept: { fontSize: 12, color: '#64748b', marginTop: 2 },
});
