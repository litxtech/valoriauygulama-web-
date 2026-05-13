import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { sendNotification } from '@/lib/notificationService';
import { GUEST_TYPES, GUEST_MESSAGE_TEMPLATES } from '@/lib/notifications';
import { shareContractPdf, type GuestForPdf } from '@/lib/contractPdf';
import { CachedImage } from '@/components/CachedImage';
import { getAuthProviderLabel } from '@/lib/updateGuestLoginInfo';
import { computeStayAmounts, effectiveNightlyRate } from '@/lib/guestStayFinancials';
import { moveGuestToRoom, updateGuestStayFinancials } from '@/lib/guestStayRoomOps';

type ContractTemplate = { title: string; content: string } | null;
type Guest = {
  id: string;
  full_name: string;
  id_number: string | null;
  id_type: string | null;
  phone: string | null;
  email: string | null;
  nationality: string | null;
  status: string;
  room_id: string | null;
  rooms: { room_number: string } | null;
  created_at: string;
  verified_at: string | null;
  admin_notes: string | null;
  signature_data: string | null;
  contract_lang: string;
  contract_templates: ContractTemplate;
  total_amount_net?: number | null;
  vat_amount?: number | null;
  accommodation_tax_amount?: number | null;
  nights_count?: number | null;
  photo_url?: string | null;
  last_login_platform?: string | null;
  last_login_at?: string | null;
  auth_provider?: string | null;
  auth_user_created_at?: string | null;
  is_guest_app_account?: boolean;
};

function formatPlatform(p: string | null | undefined): string {
  if (!p) return '';
  const m: Record<string, string> = { android: 'Android', ios: 'iOS', web: 'Web' };
  return m[p] ?? p;
}

export default function GuestDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { staff } = useAuthStore();
  const [guest, setGuest] = useState<Guest | null>(null);
  const [rooms, setRooms] = useState<{ id: string; room_number: string; price_per_night?: number | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [assignRoomId, setAssignRoomId] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const [nightsInput, setNightsInput] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [editStayVisible, setEditStayVisible] = useState(false);
  const [changeRoomVisible, setChangeRoomVisible] = useState(false);
  const [roomsForMove, setRoomsForMove] = useState<{ id: string; room_number: string; status: string; price_per_night?: number | null }[]>([]);
  const [selectedNewRoomId, setSelectedNewRoomId] = useState<string | null>(null);
  const [stayEditPrice, setStayEditPrice] = useState('');
  const [stayEditNights, setStayEditNights] = useState('');
  const [stayUpdateBusy, setStayUpdateBusy] = useState(false);
  const [roomMoveBusy, setRoomMoveBusy] = useState(false);

  const loadGuestAndRooms = useCallback(async () => {
    if (!id) return;
    const { data: g } = await supabase
      .from('guests')
      .select('*, rooms(room_number), contract_templates(title, content)')
      .eq('id', id)
      .single();
    setGuest(g ?? null);
    const { data: r } = await supabase.from('rooms').select('id, room_number, price_per_night').eq('status', 'available');
    setRooms(r ?? []);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      await loadGuestAndRooms();
      setLoading(false);
    })();
  }, [id, loadGuestAndRooms]);

  useEffect(() => {
    if (!changeRoomVisible || !guest?.room_id) return;
    (async () => {
      const { data } = await supabase
        .from('rooms')
        .select('id, room_number, status, price_per_night')
        .or(`status.eq.available,id.eq.${guest.room_id}`)
        .order('room_number');
      setRoomsForMove(data ?? []);
      setSelectedNewRoomId(null);
    })();
  }, [changeRoomVisible, guest?.room_id]);

  const exportPdf = async () => {
    if (!guest) return;
    setPdfLoading(true);
    try {
      await shareContractPdf(guest as GuestForPdf);
    } catch (e) {
      const msg = (e as Error)?.message ?? 'PDF oluşturulamadı.';
      if (msg.startsWith('PDF hazır:')) Alert.alert('PDF hazır', msg);
      else Alert.alert('Hata', msg);
    }
    setPdfLoading(false);
  };

  const openAssignModal = (roomId: string) => {
    setAssignRoomId(roomId);
    setPriceInput('');
    setNightsInput('');
    setAssignModalVisible(true);
  };

  const confirmAssignRoom = async () => {
    if (!id || !assignRoomId) return;
    const price = priceInput.trim() ? parseFloat(priceInput.replace(',', '.')) : null;
    const nights = nightsInput.trim() ? parseInt(nightsInput, 10) : null;
    if (price == null || price < 0 || !nights || nights < 1) {
      Alert.alert('Hata', 'Geçerli bir fiyat ve en az 1 gün girin. Maliye raporu için zorunludur.');
      return;
    }
    const totalNet = price * nights;
    const { vatAmount, accommodationTaxAmount } = computeStayAmounts(price, nights);
    setAssigning(true);
    const roomNumber = rooms.find((r) => r.id === assignRoomId)?.room_number;
    const { error } = await supabase
      .from('guests')
      .update({
        room_id: assignRoomId,
        status: 'checked_in',
        check_in_at: new Date().toISOString(),
        total_amount_net: totalNet,
        vat_amount: vatAmount,
        accommodation_tax_amount: accommodationTaxAmount,
        nights_count: nights,
      })
      .eq('id', id);
    if (error) {
      Alert.alert('Hata', error.message);
      setAssigning(false);
      return;
    }
    await supabase.from('rooms').update({ status: 'occupied' }).eq('id', assignRoomId);
    await supabase.from('contract_acceptances').update({ room_id: assignRoomId }).eq('guest_id', id);
    setGuest((prev) =>
      prev
        ? {
            ...prev,
            room_id: assignRoomId,
            status: 'checked_in',
            rooms: roomNumber ? { room_number: roomNumber } : prev?.rooms ?? null,
            total_amount_net: totalNet,
            vat_amount: vatAmount,
            accommodation_tax_amount: accommodationTaxAmount,
            nights_count: nights,
          }
        : null
    );
    const msg = GUEST_MESSAGE_TEMPLATES[GUEST_TYPES.admin_assigned_room]({ roomNumber: roomNumber ?? '' });
    await sendNotification({
      guestId: id,
      title: msg.title,
      body: msg.body,
      notificationType: GUEST_TYPES.admin_assigned_room,
      category: 'guest',
      createdByStaffId: staff?.id ?? undefined,
    });
    setAssignModalVisible(false);
    setAssignRoomId(null);
    setPriceInput('');
    setNightsInput('');
    setAssigning(false);
  };

  const checkOut = () => {
    if (!id || !guest?.room_id) return;
    Alert.alert('Check-out', `${guest.full_name} odadan çıksın mı? Oda müsait görünür; misafir çıkış bildirimi gider.`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Check-out',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setCheckoutBusy(true);
            const rid = guest.room_id;
            const { error } = await supabase
              .from('guests')
              .update({ status: 'checked_out', check_out_at: new Date().toISOString(), room_id: null })
              .eq('id', id);
            if (error) {
              Alert.alert('Hata', error.message);
              setCheckoutBusy(false);
              return;
            }
            if (rid) await supabase.from('rooms').update({ status: 'available' }).eq('id', rid);
            setGuest((prev) =>
              prev ? { ...prev, status: 'checked_out', room_id: null, rooms: null } : null
            );
            const msg = GUEST_MESSAGE_TEMPLATES[GUEST_TYPES.checkout_done]({});
            await sendNotification({
              guestId: id,
              title: msg.title,
              body: msg.body,
              notificationType: GUEST_TYPES.checkout_done,
              category: 'guest',
              createdByStaffId: staff?.id ?? undefined,
            });
            await loadGuestAndRooms();
            setCheckoutBusy(false);
          })();
        },
      },
    ]);
  };

  const openEditStayModal = () => {
    if (!guest) return;
    const p = effectiveNightlyRate(guest.total_amount_net, guest.nights_count);
    setStayEditPrice(p != null ? String(p) : '');
    setStayEditNights(guest.nights_count != null && guest.nights_count > 0 ? String(guest.nights_count) : '');
    setEditStayVisible(true);
  };

  const applyStayUpdate = async () => {
    if (!id || !guest) return;
    const price = stayEditPrice.trim() ? parseFloat(stayEditPrice.replace(',', '.')) : null;
    const nights = stayEditNights.trim() ? parseInt(stayEditNights, 10) : null;
    if (price == null || price < 0 || !nights || nights < 1) {
      Alert.alert('Hata', 'Geçerli gece fiyatı ve en az 1 gece girin.');
      return;
    }
    setStayUpdateBusy(true);
    const { totalNet, vatAmount, accommodationTaxAmount } = computeStayAmounts(price, nights);
    const { error } = await updateGuestStayFinancials(supabase, {
      guestId: id,
      pricePerNight: price,
      nights,
    });
    if (error) {
      Alert.alert('Hata', error.message);
      setStayUpdateBusy(false);
      return;
    }
    setGuest((prev) =>
      prev
        ? {
            ...prev,
            total_amount_net: totalNet,
            vat_amount: vatAmount,
            accommodation_tax_amount: accommodationTaxAmount,
            nights_count: nights,
          }
        : null
    );
    const summary = `${nights} gece · net ₺${totalNet.toFixed(0)} (KDV ₺${vatAmount.toFixed(0)}, konaklama vergisi ₺${accommodationTaxAmount.toFixed(0)})`;
    const tmpl = GUEST_MESSAGE_TEMPLATES[GUEST_TYPES.stay_financial_updated]({ summary });
    await sendNotification({
      guestId: id,
      title: tmpl.title,
      body: tmpl.body,
      notificationType: GUEST_TYPES.stay_financial_updated,
      category: 'guest',
      createdByStaffId: staff?.id ?? undefined,
    });
    setEditStayVisible(false);
    await loadGuestAndRooms();
    setStayUpdateBusy(false);
    Alert.alert('Tamam', 'Konaklama tutarları güncellendi; misafire bildirim gönderildi.');
  };

  const applyRoomChange = async () => {
    if (!id || !guest?.room_id || !selectedNewRoomId) {
      Alert.alert('Uyarı', 'Yeni oda seçin.');
      return;
    }
    if (selectedNewRoomId === guest.room_id) {
      Alert.alert('Bilgi', 'Misafir zaten bu odada.');
      setChangeRoomVisible(false);
      return;
    }
    setRoomMoveBusy(true);
    const { error } = await moveGuestToRoom(supabase, {
      guestId: id,
      oldRoomId: guest.room_id,
      newRoomId: selectedNewRoomId,
    });
    if (error) {
      Alert.alert('Hata', error.message);
      setRoomMoveBusy(false);
      return;
    }
    const newNum = roomsForMove.find((r) => r.id === selectedNewRoomId)?.room_number ?? '';
    const tmpl = GUEST_MESSAGE_TEMPLATES[GUEST_TYPES.room_reassigned]({ roomNumber: newNum });
    await sendNotification({
      guestId: id,
      title: tmpl.title,
      body: tmpl.body,
      notificationType: GUEST_TYPES.room_reassigned,
      category: 'guest',
      createdByStaffId: staff?.id ?? undefined,
    });
    setChangeRoomVisible(false);
    setSelectedNewRoomId(null);
    await loadGuestAndRooms();
    setRoomMoveBusy(false);
    Alert.alert('Tamam', `Misafir oda ${newNum} olarak güncellendi.`);
  };

  const stayPreview = (() => {
    const price = stayEditPrice.trim() ? parseFloat(stayEditPrice.replace(',', '.')) : null;
    const nights = stayEditNights.trim() ? parseInt(stayEditNights, 10) : null;
    if (price == null || price < 0 || !nights || nights < 1) return null;
    const { totalNet, vatAmount, accommodationTaxAmount } = computeStayAmounts(price, nights);
    return { totalNet, vatAmount, accommodationTaxAmount, nights };
  })();

  if (loading || !guest) return <Text style={styles.loading}>Yükleniyor...</Text>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View style={styles.avatarWrap}>
          {guest.photo_url ? (
            <CachedImage uri={guest.photo_url} style={styles.avatarImg} contentFit="cover" />
          ) : (
            <Text style={styles.avatarLetter}>{(guest.full_name || '?').charAt(0).toUpperCase()}</Text>
          )}
        </View>
        <Text style={styles.name}>{guest.full_name}</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.label}>Durum</Text>
        <Text style={styles.value}>{guest.status}</Text>
      </View>
      {guest.phone && (
        <View style={styles.section}>
          <Text style={styles.label}>Telefon</Text>
          <Text style={styles.value}>{guest.phone}</Text>
        </View>
      )}
      {guest.email && (
        <View style={styles.section}>
          <Text style={styles.label}>E-posta</Text>
          <Text style={styles.value}>{guest.email}</Text>
        </View>
      )}
      {guest.id_number && (
        <View style={styles.section}>
          <Text style={styles.label}>Kimlik No</Text>
          <Text style={styles.value}>{guest.id_number}</Text>
        </View>
      )}
      {guest.rooms?.room_number && (
        <View style={styles.section}>
          <Text style={styles.label}>Oda</Text>
          <Text style={styles.value}>{guest.rooms.room_number}</Text>
        </View>
      )}
      {(guest.total_amount_net != null || guest.nights_count != null) && (
        <View style={styles.section}>
          <Text style={styles.label}>Konaklama (Maliye)</Text>
          <Text style={styles.value}>
            {guest.nights_count != null ? `${guest.nights_count} gece` : ''}
            {guest.nights_count != null && guest.total_amount_net != null ? ' · ' : ''}
            {guest.total_amount_net != null ? `₺${Number(guest.total_amount_net).toFixed(2)} (net)` : ''}
          </Text>
          {guest.vat_amount != null && guest.accommodation_tax_amount != null ? (
            <Text style={styles.maliyeSub}>
              KDV %10: ₺{Number(guest.vat_amount).toFixed(2)} · Konaklama vergisi %2: ₺
              {Number(guest.accommodation_tax_amount).toFixed(2)}
            </Text>
          ) : null}
          {guest.total_amount_net != null &&
          guest.nights_count != null &&
          guest.nights_count > 0 &&
          effectiveNightlyRate(guest.total_amount_net, guest.nights_count) != null ? (
            <Text style={styles.maliyeSub}>
              Hesaplanan gece başı: ₺{effectiveNightlyRate(guest.total_amount_net, guest.nights_count)?.toFixed(2)}
            </Text>
          ) : null}
        </View>
      )}
      {guest.status === 'checked_in' && guest.room_id && (
        <View style={styles.section}>
          <Text style={styles.label}>Konaklama yönetimi (check-in sonrası)</Text>
          <Text style={styles.manageHint}>
            Fiyat veya gece sayısı düzeltmesi Maliye satırlarını yeniden hesaplar. Oda değişiminde eski oda müsait, yeni oda dolu
            olur; sözleşme onayı ve uygulama anahtarı yeni odaya bağlanır.
          </Text>
          <TouchableOpacity style={styles.secondaryActionBtn} onPress={openEditStayModal} activeOpacity={0.85}>
            <Text style={styles.secondaryActionText}>Fiyat / gece sayısı güncelle</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryActionBtn, styles.secondaryActionBtnMargin]}
            onPress={() => setChangeRoomVisible(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.secondaryActionText}>Oda değiştir</Text>
          </TouchableOpacity>
        </View>
      )}
      {(guest.last_login_platform || guest.auth_provider || guest.last_login_at || guest.auth_user_created_at) && (
        <View style={styles.section}>
          <Text style={styles.label}>Giriş / Cihaz</Text>
          <Text style={styles.value}>
            {[formatPlatform(guest.last_login_platform), getAuthProviderLabel(guest.auth_provider ?? undefined)].filter(Boolean).join(' · ')}
            {guest.last_login_at && `\nSon giriş: ${new Date(guest.last_login_at).toLocaleString('tr-TR')}`}
            {guest.auth_user_created_at && `\nAuth kayıt: ${new Date(guest.auth_user_created_at).toLocaleString('tr-TR')}`}
          </Text>
        </View>
      )}
      {guest.admin_notes && (
        <View style={styles.section}>
          <Text style={styles.label}>Notlar</Text>
          <Text style={styles.value}>{guest.admin_notes}</Text>
        </View>
      )}
      {guest.signature_data && (
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.pdfBtn, pdfLoading && styles.pdfBtnDisabled]}
            onPress={exportPdf}
            disabled={pdfLoading}
          >
            {pdfLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.pdfBtnText}>Sözleşmeyi PDF Olarak Kaydet</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
      {guest.status === 'pending' && rooms.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.label}>Oda Ata (fiyat ve gün Maliye raporuna işlenir)</Text>
          {rooms.map((r) => (
            <TouchableOpacity key={r.id} style={styles.roomBtn} onPress={() => openAssignModal(r.id)}>
              <Text style={styles.roomBtnText}>Oda {r.room_number}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Modal visible={assignModalVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => !assigning && setAssignModalVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalContentWrap}
          >
            <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
              <Text style={styles.modalTitle}>Oda ata – Maliye bilgileri</Text>
              {assignRoomId && (
                <Text style={styles.modalSub}>
                  Oda: {rooms.find((r) => r.id === assignRoomId)?.room_number ?? '—'}
                </Text>
              )}
              <Text style={styles.inputLabel}>Gece başı fiyat (₺)</Text>
              <TextInput
                style={styles.input}
                value={priceInput}
                onChangeText={setPriceInput}
                keyboardType="decimal-pad"
                placeholder="Örn. 1500"
              />
              <Text style={styles.inputLabel}>Kaç gün kalacak?</Text>
              <TextInput
                style={styles.input}
                value={nightsInput}
                onChangeText={setNightsInput}
                keyboardType="number-pad"
                placeholder="Örn. 3"
              />
              <Text style={styles.inputHint}>
                Toplam net, KDV (%10) ve konaklama vergisi (%2) otomatik hesaplanıp Maliye raporuna işlenir.
              </Text>
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.confirmAssignBtn, assigning && styles.btnDisabled]}
                  onPress={confirmAssignRoom}
                  disabled={assigning}
                >
                  {assigning ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.confirmAssignText}>Odaya yerleştir</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalCloseBtn} onPress={() => !assigning && setAssignModalVisible(false)}>
                  <Text style={styles.modalCloseBtnText}>İptal</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>

      <Modal visible={editStayVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => !stayUpdateBusy && setEditStayVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalContentWrap}
          >
            <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
              <Text style={styles.modalTitle}>Konaklama tutarlarını güncelle</Text>
              <Text style={styles.modalSub}>
                Check-in tarihi değişmez. Net tutar, KDV ve konaklama vergisi yeniden hesaplanır.
              </Text>
              <Text style={styles.inputLabel}>Gece başı fiyat (₺)</Text>
              <TextInput
                style={styles.input}
                value={stayEditPrice}
                onChangeText={setStayEditPrice}
                keyboardType="decimal-pad"
                placeholder="Örn. 1500"
              />
              <Text style={styles.inputLabel}>Gece sayısı</Text>
              <TextInput
                style={styles.input}
                value={stayEditNights}
                onChangeText={setStayEditNights}
                keyboardType="number-pad"
                placeholder="Örn. 3"
              />
              {stayPreview ? (
                <Text style={styles.previewBox}>
                  Önizleme — Net: ₺{stayPreview.totalNet.toFixed(2)} · KDV: ₺{stayPreview.vatAmount.toFixed(2)} · Konaklama
                  vergisi: ₺{stayPreview.accommodationTaxAmount.toFixed(2)}
                </Text>
              ) : null}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.confirmAssignBtn, stayUpdateBusy && styles.btnDisabled]}
                  onPress={applyStayUpdate}
                  disabled={stayUpdateBusy}
                >
                  {stayUpdateBusy ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.confirmAssignText}>Kaydet ve misafire bildir</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalCloseBtn} onPress={() => !stayUpdateBusy && setEditStayVisible(false)}>
                  <Text style={styles.modalCloseBtnText}>İptal</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>

      <Modal visible={changeRoomVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => !roomMoveBusy && setChangeRoomVisible(false)}
        >
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Oda değiştir</Text>
            <Text style={styles.modalSub}>Müsait odalar ve mevcut oda listelenir. Misafire bildirim gider.</Text>
            <ScrollView style={styles.roomPickList} keyboardShouldPersistTaps="handled">
              {roomsForMove.map((r) => {
                const isCurrent = r.id === guest.room_id;
                const selected = selectedNewRoomId === r.id;
                return (
                  <TouchableOpacity
                    key={r.id}
                    style={[
                      styles.roomPickRow,
                      selected && styles.roomPickRowSelected,
                      isCurrent && styles.roomPickRowCurrent,
                    ]}
                    onPress={() => setSelectedNewRoomId(r.id)}
                    disabled={roomMoveBusy}
                  >
                    <Text style={styles.roomPickTitle}>
                      Oda {r.room_number}
                      {isCurrent ? ' (şu an)' : ''}
                    </Text>
                    <Text style={styles.roomPickMeta}>
                      {r.status === 'occupied' && isCurrent ? 'Mevcut' : r.status}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.confirmAssignBtn, roomMoveBusy && styles.btnDisabled]}
                onPress={applyRoomChange}
                disabled={roomMoveBusy}
              >
                {roomMoveBusy ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.confirmAssignText}>Taşı ve bildir</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => !roomMoveBusy && setChangeRoomVisible(false)}>
                <Text style={styles.modalCloseBtnText}>İptal</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
      {guest.status === 'checked_in' && guest.room_id && (
        <TouchableOpacity
          style={[styles.checkOutBtn, checkoutBusy && styles.btnDisabled]}
          onPress={checkOut}
          disabled={checkoutBusy}
        >
          <Text style={styles.checkOutBtnText}>{checkoutBusy ? 'İşleniyor…' : 'Check-out'}</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7fafc' },
  content: { padding: 24 },
  loading: { padding: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  avatarWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    overflow: 'hidden',
  },
  avatarImg: { width: 56, height: 56, borderRadius: 28 },
  avatarLetter: { fontSize: 24, fontWeight: '700', color: '#4a5568' },
  name: { fontSize: 22, fontWeight: '700', color: '#1a202c', flex: 1 },
  section: { marginBottom: 20 },
  label: { fontSize: 12, color: '#718096', marginBottom: 4 },
  value: { fontSize: 16, color: '#1a202c' },
  roomBtn: { marginTop: 8, padding: 12, backgroundColor: '#1a365d', borderRadius: 8, alignSelf: 'flex-start' },
  roomBtnText: { color: '#fff', fontWeight: '600' },
  pdfBtn: { marginTop: 8, padding: 16, backgroundColor: '#2d3748', borderRadius: 12, alignItems: 'center' },
  pdfBtnDisabled: { opacity: 0.7 },
  pdfBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  checkOutBtn: { marginTop: 24, padding: 16, backgroundColor: '#e53e3e', borderRadius: 12, alignItems: 'center' },
  checkOutBtnText: { color: '#fff', fontWeight: '600' },
  maliyeSub: { fontSize: 13, color: '#64748b', marginTop: 8, lineHeight: 18 },
  manageHint: { fontSize: 13, color: '#64748b', lineHeight: 19, marginBottom: 12 },
  secondaryActionBtn: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#edf2f7',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
  },
  secondaryActionBtnMargin: { marginTop: 10 },
  secondaryActionText: { fontSize: 15, fontWeight: '700', color: '#1e3a5f' },
  previewBox: {
    fontSize: 13,
    color: '#334155',
    backgroundColor: '#f1f5f9',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    lineHeight: 19,
  },
  roomPickList: { maxHeight: 280, marginBottom: 8 },
  roomPickRow: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
    borderRadius: 8,
    marginBottom: 6,
    backgroundColor: '#f8fafc',
  },
  roomPickRowSelected: { backgroundColor: '#dbeafe', borderWidth: 1, borderColor: '#3b82f6' },
  roomPickRowCurrent: { borderLeftWidth: 4, borderLeftColor: '#1a365d' },
  roomPickTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  roomPickMeta: { fontSize: 12, color: '#64748b', marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalContentWrap: { maxWidth: 400, width: '100%', alignSelf: 'center' },
  modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1a202c', marginBottom: 4 },
  modalSub: { fontSize: 14, color: '#718096', marginBottom: 16 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#4a5568', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 12, fontSize: 16, marginBottom: 12 },
  inputHint: { fontSize: 12, color: '#718096', marginBottom: 16 },
  modalActions: { gap: 10 },
  confirmAssignBtn: { padding: 14, backgroundColor: '#1a365d', borderRadius: 12, alignItems: 'center' },
  btnDisabled: { opacity: 0.7 },
  confirmAssignText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  modalCloseBtn: { padding: 12, alignItems: 'center' },
  modalCloseBtnText: { fontSize: 15, color: '#64748b', fontWeight: '600' },
});
