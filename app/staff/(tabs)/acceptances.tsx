import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  TextInput,
  KeyboardAvoidingView,
  Platform,
  AppState,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { shareContractPdf, type GuestForPdf } from '@/lib/contractPdf';
import { computeStayAmounts } from '@/lib/guestStayFinancials';
import { sendNotification } from '@/lib/notificationService';
import { GUEST_TYPES, GUEST_MESSAGE_TEMPLATES } from '@/lib/notifications';

type RoomRow = { id: string; room_number: string; floor: number | null; status: string; price_per_night?: number | null };

type AcceptanceRow = {
  id: string;
  token: string;
  room_id: string | null;
  contract_lang: string;
  accepted_at: string;
  guest_id: string | null;
  room_number?: string | null;
  signer_name?: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  available: 'Müsait',
  occupied: 'Dolu',
  cleaning: 'Temizlik',
  maintenance: 'Bakım',
  out_of_order: 'Kullanılmıyor',
};

function formatTry(n: number): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 }).format(n);
}

export default function StaffAcceptancesScreen() {
  const staffId = useAuthStore((s) => s.staff?.id);
  const [rows, setRows] = useState<AcceptanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [roomModalVisible, setRoomModalVisible] = useState(false);
  const [assignTarget, setAssignTarget] = useState<AcceptanceRow | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const [nightsInput, setNightsInput] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);

  const stayPreview = useMemo(() => {
    if (!selectedRoomId) return null;
    const raw = priceInput.replace(/\s/g, '').replace(',', '.');
    const price = raw === '' ? NaN : parseFloat(raw);
    const nightsRaw = nightsInput.trim();
    const nights = nightsRaw === '' ? NaN : parseInt(nightsRaw, 10);
    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(nights) || nights < 1) return null;
    const { totalNet, vatAmount, accommodationTaxAmount } = computeStayAmounts(price, nights);
    const grandTotal = Math.round((totalNet + vatAmount + accommodationTaxAmount) * 100) / 100;
    return { totalNet, vatAmount, accommodationTaxAmount, grandTotal };
  }, [selectedRoomId, priceInput, nightsInput]);

  const load = useCallback(async () => {
    if (!staffId) return;
    const { data: list } = await supabase
      .from('contract_acceptances')
      .select('id, token, room_id, contract_lang, accepted_at, guest_id, guests(full_name)')
      .eq('assigned_staff_id', staffId)
      .order('accepted_at', { ascending: false })
      .limit(100);

    const roomIds = (list ?? []).map((r) => r.room_id).filter(Boolean) as string[];
    let roomNumbers: Record<string, string> = {};
    if (roomIds.length > 0) {
      const { data: roomsData } = await supabase.from('rooms').select('id, room_number').in('id', roomIds);
      roomNumbers = (roomsData ?? []).reduce((acc, r) => ({ ...acc, [r.id]: r.room_number }), {} as Record<string, string>);
    }

    setRows(
      (list ?? []).map((r) => {
        const guests = r.guests as { full_name: string | null } | { full_name: string | null }[] | null;
        const guestObj = Array.isArray(guests) ? guests[0] : guests;
        return {
          ...r,
          room_number: r.room_id ? roomNumbers[r.room_id] ?? '—' : null,
          signer_name: guestObj?.full_name ?? null,
        };
      })
    );
  }, [staffId]);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!staffId) return;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`contract_acceptances_assigned_${staffId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contract_acceptances',
          filter: `assigned_staff_id=eq.${staffId}`,
        },
        () => {
          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(() => {
            debounce = null;
            loadRef.current();
          }, 250);
        }
      )
      .subscribe();
    return () => {
      if (debounce) clearTimeout(debounce);
      supabase.removeChannel(channel);
    };
  }, [staffId]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && staffId) loadRef.current();
    });
    return () => sub.remove();
  }, [staffId]);

  useFocusEffect(
    useCallback(() => {
      if (!staffId) return;
      let cancelled = false;
      void (async () => {
        await load();
        if (!cancelled) setLoading(false);
      })();
      return () => {
        cancelled = true;
      };
    }, [staffId, load])
  );

  useEffect(() => {
    if (roomModalVisible) {
      supabase
        .from('rooms')
        .select('id, room_number, floor, status, price_per_night')
        .order('room_number')
        .then(({ data }) => setRooms(data ?? []));
    }
  }, [roomModalVisible]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const openRoomModal = (item: AcceptanceRow) => {
    setAssignTarget(item);
    setSelectedRoomId(null);
    setPriceInput('');
    setNightsInput('');
    setRoomModalVisible(true);
  };

  const selectRoomForAssign = (roomId: string) => {
    setSelectedRoomId(roomId);
    /** Liste fiyatı bilgi amaçlıdır; tutar yalnızca yetkili tarafından elle girilir (otomatik doldurulmaz). */
    setPriceInput('');
    setNightsInput('');
  };

  const confirmAssignRoom = async () => {
    if (!assignTarget) return;
    const roomId = selectedRoomId;
    if (!roomId) {
      Alert.alert('Uyarı', 'Önce bir oda seçin.');
      return;
    }
    const price = priceInput.trim() ? parseFloat(priceInput.replace(',', '.')) : null;
    const nights = nightsInput.trim() ? parseInt(nightsInput, 10) : null;
    if (price == null || price < 0 || !nights || nights < 1) {
      Alert.alert('Hata', 'Geçerli bir fiyat ve en az 1 gün girin. Maliye raporu için zorunludur.');
      return;
    }
    const totalNet = price * nights;
    const { vatAmount, accommodationTaxAmount } = computeStayAmounts(price, nights);
    setAssigning(true);
    try {
      const { error: errAcceptance } = await supabase
        .from('contract_acceptances')
        .update({ room_id: roomId })
        .eq('id', assignTarget.id);
      if (errAcceptance) throw errAcceptance;
      if (assignTarget.guest_id) {
        const { error: syncAcc } = await supabase
          .from('contract_acceptances')
          .update({ room_id: roomId })
          .eq('guest_id', assignTarget.guest_id);
        if (syncAcc) throw syncAcc;
      }

      if (assignTarget.guest_id) {
        const { error: errGuest } = await supabase
          .from('guests')
          .update({
            room_id: roomId,
            status: 'checked_in',
            check_in_at: new Date().toISOString(),
            total_amount_net: totalNet,
            vat_amount: vatAmount,
            accommodation_tax_amount: accommodationTaxAmount,
            nights_count: nights,
          })
          .eq('id', assignTarget.guest_id);
        if (errGuest) throw errGuest;
        await supabase.from('rooms').update({ status: 'occupied' }).eq('id', roomId);
        const roomNumber = rooms.find((r) => r.id === roomId)?.room_number;
        const msg = GUEST_MESSAGE_TEMPLATES[GUEST_TYPES.admin_assigned_room]({ roomNumber: roomNumber ?? '' });
        await sendNotification({
          guestId: assignTarget.guest_id,
          title: msg.title,
          body: msg.body,
          notificationType: GUEST_TYPES.admin_assigned_room,
          category: 'guest',
          createdByStaffId: staffId ?? undefined,
        });
      }
      setRoomModalVisible(false);
      setAssignTarget(null);
      setSelectedRoomId(null);
      setPriceInput('');
      setNightsInput('');
      await load();
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Oda atanamadı.');
    }
    setAssigning(false);
  };

  const assignRoom = async (roomId: string) => {
    selectRoomForAssign(roomId);
  };

  const clearRoom = async () => {
    if (!assignTarget) return;
    Alert.alert(
      'Oda atamasını kaldır',
      'Misafir beklemede durumuna döner; maliye satırları ve check-in sıfırlanır. Emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Kaldır',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setAssigning(true);
              try {
                const { error } = await supabase
                  .from('contract_acceptances')
                  .update({ room_id: null })
                  .eq('id', assignTarget.id);
                if (error) throw error;
                if (assignTarget.guest_id) {
                  await supabase.from('contract_acceptances').update({ room_id: null }).eq('guest_id', assignTarget.guest_id);
                }
                if (assignTarget.guest_id && assignTarget.room_id) {
                  await supabase
                    .from('guests')
                    .update({
                      room_id: null,
                      status: 'pending',
                      check_in_at: null,
                      total_amount_net: null,
                      vat_amount: null,
                      accommodation_tax_amount: null,
                      nights_count: null,
                    })
                    .eq('id', assignTarget.guest_id);
                  await supabase.from('rooms').update({ status: 'available' }).eq('id', assignTarget.room_id);
                }
                setRoomModalVisible(false);
                setAssignTarget(null);
                setSelectedRoomId(null);
                setPriceInput('');
                setNightsInput('');
                await load();
              } catch (e) {
                Alert.alert('Hata', (e as Error)?.message ?? 'Oda kaldırılamadı.');
              }
              setAssigning(false);
            })();
          },
        },
      ]
    );
  };

  const downloadPdf = async (item: AcceptanceRow) => {
    if (!item.guest_id) {
      Alert.alert('Bilgi', 'Bu onay kaydında imzalayan misafir bilgisi yok; PDF oluşturulamaz.');
      return;
    }
    setPdfLoadingId(item.id);
    try {
      const { data: guest, error } = await supabase
        .from('guests')
        .select('full_name, phone, email, id_number, verified_at, created_at, signature_data, rooms(room_number), contract_templates(title, content), total_amount_net, nights_count, vat_amount, accommodation_tax_amount')
        .eq('id', item.guest_id)
        .single();
      if (error || !guest) throw new Error(error?.message ?? 'Misafir bulunamadı.');
      const forPdf: GuestForPdf = {
        ...guest,
        rooms: Array.isArray(guest.rooms) ? (guest.rooms[0] ?? null) : guest.rooms,
        contract_templates: Array.isArray(guest.contract_templates) ? (guest.contract_templates[0] ?? null) : guest.contract_templates,
      };
      await shareContractPdf(forPdf);
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'PDF oluşturulamadı.');
    } finally {
      setPdfLoadingId(null);
    }
  };

  if (!staffId) return null;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerCard}>
        <Ionicons name="document-text" size={28} color={theme.colors.primary} />
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>Sözleşme onayları – Oda ataması</Text>
          <Text style={styles.headerSub}>Size atanan onaylara oda atayın. Misafir check-in sürecini tamamlar.</Text>
        </View>
      </View>

      {rows.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="folder-open-outline" size={48} color={theme.colors.textMuted} />
          <Text style={styles.emptyTitle}>Size atanmış onay yok</Text>
          <Text style={styles.emptySub}>Admin panelinden size sözleşme onayı atandığında burada listelenecektir.</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.tokenBadge}>
                  <Text style={styles.tokenText}>{item.token.slice(0, 12)}…</Text>
                </View>
                <Text style={styles.date}>{new Date(item.accepted_at).toLocaleString('tr-TR')}</Text>
              </View>
              {item.signer_name ? (
                <View style={styles.signerRow}>
                  <Ionicons name="create-outline" size={14} color="#0f766e" />
                  <Text style={styles.signerText}>İmzalayan: {item.signer_name}</Text>
                </View>
              ) : null}
              <View style={styles.roomRow}>
                <Text style={styles.roomLabel}>Oda:</Text>
                <Text style={styles.roomValue}>{item.room_number ?? '— Atanmadı'}</Text>
              </View>
              <Text style={styles.meta}>Dil: {item.contract_lang.toUpperCase()}</Text>
              <View style={styles.cardActions}>
                <TouchableOpacity style={styles.assignRoomBtn} onPress={() => openRoomModal(item)}>
                  <Ionicons name="bed-outline" size={18} color="#fff" />
                  <Text style={styles.assignRoomBtnText}>{item.room_id ? 'Oda değiştir' : 'Oda ata'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pdfBtn, (pdfLoadingId === item.id || !item.guest_id) && styles.pdfBtnDisabled]}
                  onPress={() => downloadPdf(item)}
                  disabled={pdfLoadingId !== null}
                >
                  {pdfLoadingId === item.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="document-text-outline" size={18} color="#fff" />
                      <Text style={styles.pdfBtnText}>PDF</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      <Modal visible={roomModalVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => !assigning && setRoomModalVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalContentWrap}
          >
            <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
              <Text style={styles.modalTitle}>Oda seçin – Fiyat ve gün (Maliye)</Text>
              {assignTarget && (
                <Text style={styles.modalSub}>
                  Onay: {assignTarget.token.slice(0, 12)}… · {new Date(assignTarget.accepted_at).toLocaleString('tr-TR')}
                </Text>
              )}
              <TouchableOpacity style={styles.clearRoomBtn} onPress={() => clearRoom()} disabled={assigning}>
                <Text style={styles.clearRoomText}>Oda atamasını kaldır</Text>
              </TouchableOpacity>
              <FlatList
                data={rooms}
                keyExtractor={(r) => r.id}
                style={styles.roomList}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.roomItem, selectedRoomId === item.id && styles.roomItemSelected]}
                    onPress={() => selectRoomForAssign(item.id)}
                    disabled={assigning}
                  >
                    <Text style={styles.roomItemNum}>Oda {item.room_number}</Text>
                    {item.floor != null && (
                      <Text style={styles.roomItemFloor}>Kat {item.floor}</Text>
                    )}
                    <View style={[styles.roomStatusBadge, { backgroundColor: item.status === 'available' ? theme.colors.success : theme.colors.textMuted }]}>
                      <Text style={styles.roomStatusText}>{STATUS_LABELS[item.status] ?? item.status}</Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
              {selectedRoomId && (
                <View style={styles.priceForm}>
                  <Text style={styles.priceManualHint}>
                    Oda kartındaki liste fiyatı buraya otomatik yazılmaz. Konaklama bedelini siz girin.
                  </Text>
                  <Text style={styles.priceFormLabel}>Gece başı fiyat (₺)</Text>
                  <TextInput
                    style={styles.priceInput}
                    value={priceInput}
                    onChangeText={setPriceInput}
                    keyboardType="decimal-pad"
                    placeholder="Örn. 1500"
                  />
                  <Text style={styles.priceFormLabel}>Kaç gün kalacak?</Text>
                  <TextInput
                    style={styles.priceInput}
                    value={nightsInput}
                    onChangeText={setNightsInput}
                    keyboardType="number-pad"
                    placeholder="Örn. 3"
                  />
                  {stayPreview && (
                    <View style={styles.liveAmountCard}>
                      <Text style={styles.liveAmountTitle}>Maliye özeti (canlı)</Text>
                      <View style={styles.liveAmountRow}>
                        <Text style={styles.liveAmountLabel}>Net konaklama</Text>
                        <Text style={styles.liveAmountValue}>{formatTry(stayPreview.totalNet)}</Text>
                      </View>
                      <View style={styles.liveAmountRow}>
                        <Text style={styles.liveAmountLabel}>KDV</Text>
                        <Text style={styles.liveAmountValue}>{formatTry(stayPreview.vatAmount)}</Text>
                      </View>
                      <View style={styles.liveAmountRow}>
                        <Text style={styles.liveAmountLabel}>Konaklama vergisi</Text>
                        <Text style={styles.liveAmountValue}>{formatTry(stayPreview.accommodationTaxAmount)}</Text>
                      </View>
                      <View style={[styles.liveAmountRow, styles.liveAmountRowTotal]}>
                        <Text style={styles.liveAmountLabelTotal}>Genel toplam (net + vergiler)</Text>
                        <Text style={styles.liveAmountValueTotal}>{formatTry(stayPreview.grandTotal)}</Text>
                      </View>
                    </View>
                  )}
                  <TouchableOpacity
                    style={[styles.confirmAssignBtn, assigning && styles.confirmAssignBtnDisabled]}
                    onPress={confirmAssignRoom}
                    disabled={assigning}
                  >
                    {assigning ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.confirmAssignBtnText}>Odaya yerleştir</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
              {assigning && !selectedRoomId && (
                <ActivityIndicator style={styles.modalSpinner} size="small" color={theme.colors.primary} />
              )}
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => !assigning && setRoomModalVisible(false)}
              >
                <Text style={styles.modalCloseText}>Kapat</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.backgroundSecondary },
  loadingText: { marginTop: 8, fontSize: 14, color: theme.colors.textMuted },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  headerTextWrap: { flex: 1, marginLeft: 12 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: theme.colors.text },
  headerSub: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 4 },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: theme.colors.text, marginTop: 12 },
  emptySub: { fontSize: 14, color: theme.colors.textMuted, marginTop: 8, textAlign: 'center' },
  list: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: theme.colors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  tokenBadge: { backgroundColor: theme.colors.backgroundSecondary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  tokenText: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  date: { fontSize: 12, color: theme.colors.textMuted },
  signerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  signerText: { fontSize: 13, color: '#0f766e', fontWeight: '600' },
  roomRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  roomLabel: { fontSize: 14, color: theme.colors.textSecondary, marginRight: 6 },
  roomValue: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  meta: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 12 },
  cardActions: { flexDirection: 'row', gap: 10 },
  assignRoomBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
  },
  assignRoomBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  pdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#2d3748',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  pdfBtnDisabled: { opacity: 0.6 },
  pdfBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContentWrap: { maxWidth: 400, width: '100%', alignSelf: 'center', maxHeight: '85%' },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    maxHeight: '85%',
    padding: 16,
  },
  roomItemSelected: { backgroundColor: theme.colors.primary + '20', borderWidth: 2, borderColor: theme.colors.primary, borderRadius: 8 },
  priceForm: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.border },
  priceManualHint: { fontSize: 12, color: theme.colors.textSecondary, lineHeight: 17, marginBottom: 10 },
  priceFormLabel: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: 6 },
  priceInput: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, padding: 12, fontSize: 16, marginBottom: 12 },
  liveAmountCard: {
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  liveAmountTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.text, marginBottom: 10 },
  liveAmountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  liveAmountLabel: { fontSize: 13, color: theme.colors.textSecondary },
  liveAmountValue: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  liveAmountRowTotal: { marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.colors.border, marginBottom: 0 },
  liveAmountLabelTotal: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  liveAmountValueTotal: { fontSize: 15, fontWeight: '800', color: theme.colors.primary },
  confirmAssignBtn: { padding: 14, backgroundColor: theme.colors.primary, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  confirmAssignBtnDisabled: { opacity: 0.7 },
  confirmAssignBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 4 },
  modalSub: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 12 },
  clearRoomBtn: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 10, marginBottom: 12 },
  clearRoomText: { fontSize: 13, color: theme.colors.error },
  roomList: { maxHeight: 280 },
  roomItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  roomItemNum: { fontSize: 16, fontWeight: '600', color: theme.colors.text, minWidth: 90 },
  roomItemFloor: { fontSize: 13, color: theme.colors.textMuted, marginRight: 8 },
  roomStatusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  roomStatusText: { fontSize: 11, fontWeight: '600', color: '#fff' },
  modalSpinner: { marginVertical: 8 },
  modalClose: { marginTop: 12, paddingVertical: 12, alignItems: 'center' },
  modalCloseText: { fontSize: 15, fontWeight: '600', color: theme.colors.textMuted },
});
