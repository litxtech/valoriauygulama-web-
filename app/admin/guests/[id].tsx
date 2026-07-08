import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { sendNotification } from '@/lib/notificationService';
import { GUEST_TYPES, guestMessageTemplate } from '@/lib/notifications';
import { shareContractPdf, exportContractPdf, type GuestForPdf } from '@/lib/contractPdf';
import { sendPdfToPrinterEmail } from '@/lib/printerEmail';
import { CachedImage } from '@/components/CachedImage';
import { computeStayAmounts, effectiveNightlyRate } from '@/lib/guestStayFinancials';
import { moveGuestToRoom, updateGuestStayFinancials } from '@/lib/guestStayRoomOps';
import { checkoutGuest } from '@/lib/occupancyCheckout';
import { invalidateOccupancyCache } from '@/lib/occupancyCache';
import { formatDateTime } from '@/lib/date';
import { adminTheme } from '@/constants/adminTheme';

type Guest = {
  id: string;
  full_name: string;
  id_number: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  room_id: string | null;
  rooms: { room_number: string } | null;
  check_in_at: string | null;
  check_out_at: string | null;
  signature_data: string | null;
  contract_lang: string | null;
  total_amount_net?: number | null;
  vat_amount?: number | null;
  accommodation_tax_amount?: number | null;
  nights_count?: number | null;
  photo_url?: string | null;
  created_at: string;
  family_member_tcs?: { full_name?: string | null; tc?: string | null }[] | null;
};

type RoomOption = { id: string; room_number: string; price_per_night?: number | null };

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Giriş bekliyor', color: '#a16207', bg: '#fef3c7' },
  checked_in: { label: 'Odada', color: '#166534', bg: '#dcfce7' },
  checked_out: { label: 'Çıkış yaptı', color: '#475569', bg: '#f1f5f9' },
};

function ActionBtn({
  label,
  icon,
  onPress,
  variant = 'primary',
  disabled,
  loading,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
}) {
  const v = variantStyles[variant];
  return (
    <TouchableOpacity
      style={[styles.actionBtn, v.btn, disabled && styles.btnDisabled]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.iconColor} />
      ) : (
        <>
          <Ionicons name={icon} size={18} color={v.iconColor} />
          <Text style={[styles.actionBtnText, { color: v.textColor }]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const variantStyles = {
  primary: { btn: { backgroundColor: '#16a34a' }, iconColor: '#fff', textColor: '#fff' },
  secondary: { btn: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe' }, iconColor: '#1d4ed8', textColor: '#1e3a8a' },
  danger: { btn: { backgroundColor: '#dc2626' }, iconColor: '#fff', textColor: '#fff' },
  ghost: { btn: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0' }, iconColor: '#475569', textColor: '#334155' },
} as const;

export default function GuestDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { staff } = useAuthStore();

  const [guest, setGuest] = useState<Guest | null>(null);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [printerLoading, setPrinterLoading] = useState(false);
  const [assignRoomId, setAssignRoomId] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const [nightsInput, setNightsInput] = useState('1');
  const [assigning, setAssigning] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [changeRoomVisible, setChangeRoomVisible] = useState(false);
  const [roomsForMove, setRoomsForMove] = useState<RoomOption[]>([]);
  const [selectedNewRoomId, setSelectedNewRoomId] = useState<string | null>(null);
  const [roomMoveBusy, setRoomMoveBusy] = useState(false);
  const [editPriceVisible, setEditPriceVisible] = useState(false);
  const [stayEditPrice, setStayEditPrice] = useState('');
  const [stayEditNights, setStayEditNights] = useState('');
  const [stayUpdateBusy, setStayUpdateBusy] = useState(false);

  const loadGuestAndRooms = useCallback(async () => {
    if (!id) return;
    const { data: g } = await supabase
      .from('guests')
      .select(
        'id, full_name, id_number, phone, email, status, room_id, check_in_at, check_out_at, signature_data, contract_lang, total_amount_net, vat_amount, accommodation_tax_amount, nights_count, photo_url, created_at, family_member_tcs, rooms(room_number)'
      )
      .eq('id', id)
      .is('deleted_at', null)
      .single();
    setGuest((g as Guest) ?? null);
    const { data: r } = await supabase
      .from('rooms')
      .select('id, room_number, price_per_night')
      .eq('status', 'available')
      .order('room_number');
    setRooms((r as RoomOption[]) ?? []);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    void loadGuestAndRooms().finally(() => setLoading(false));
  }, [id, loadGuestAndRooms]);

  useEffect(() => {
    if (!changeRoomVisible || !guest?.room_id) return;
    void supabase
      .from('rooms')
      .select('id, room_number, status, price_per_night')
      .or(`status.eq.available,id.eq.${guest.room_id}`)
      .order('room_number')
      .then(({ data }) => {
        setRoomsForMove((data as RoomOption[]) ?? []);
        setSelectedNewRoomId(null);
      });
  }, [changeRoomVisible, guest?.room_id]);

  const statusMeta = guest ? STATUS_META[guest.status] ?? STATUS_META.pending : STATUS_META.pending;

  const openAssignForRoom = (room: RoomOption) => {
    setAssignRoomId(room.id);
    setPriceInput(room.price_per_night != null ? String(room.price_per_night) : '');
    setNightsInput('1');
  };

  const confirmAssignRoom = async () => {
    if (!id || !assignRoomId) return;
    const price = priceInput.trim() ? parseFloat(priceInput.replace(',', '.')) : null;
    const nights = nightsInput.trim() ? parseInt(nightsInput, 10) : null;
    if (price == null || price < 0 || !nights || nights < 1) {
      Alert.alert('Eksik bilgi', 'Gece fiyatı ve en az 1 gece girin.');
      return;
    }
    const { totalNet, vatAmount, accommodationTaxAmount } = computeStayAmounts(price, nights);
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
    const msg = guestMessageTemplate(GUEST_TYPES.admin_assigned_room, { roomNumber: roomNumber ?? '' }, guest?.contract_lang);
    await sendNotification({
      guestId: id,
      title: msg.title,
      body: msg.body,
      notificationType: GUEST_TYPES.admin_assigned_room,
      category: 'guest',
      createdByStaffId: staff?.id,
    });
    setAssignRoomId(null);
    invalidateOccupancyCache();
    await loadGuestAndRooms();
    setAssigning(false);
    Alert.alert('Tamam', `Misafir oda ${roomNumber} olarak yerleştirildi.`);
  };

  const runCheckOut = () => {
    if (!id || !guest) return;
    Alert.alert('Çıkış yap', `${guest.full_name} odadan çıksın mı?`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Çıkış yap',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setCheckoutBusy(true);
            const res = await checkoutGuest(
              supabase,
              { id, full_name: guest.full_name, room_id: guest.room_id },
              staff?.id
            );
            setCheckoutBusy(false);
            if (res.error) Alert.alert('Hata', res.error.message);
            else {
              invalidateOccupancyCache();
              await loadGuestAndRooms();
            }
          })();
        },
      },
    ]);
  };

  const applyRoomChange = async () => {
    if (!id || !guest?.room_id || !selectedNewRoomId) {
      Alert.alert('Oda seçin', 'Yeni oda seçmeden devam edilemez.');
      return;
    }
    if (selectedNewRoomId === guest.room_id) {
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
    const tmpl = guestMessageTemplate(GUEST_TYPES.room_reassigned, { roomNumber: newNum }, guest?.contract_lang);
    await sendNotification({
      guestId: id,
      title: tmpl.title,
      body: tmpl.body,
      notificationType: GUEST_TYPES.room_reassigned,
      category: 'guest',
      createdByStaffId: staff?.id,
    });
    setChangeRoomVisible(false);
    invalidateOccupancyCache();
    await loadGuestAndRooms();
    setRoomMoveBusy(false);
    Alert.alert('Tamam', `Oda ${newNum} olarak güncellendi.`);
  };

  const applyStayUpdate = async () => {
    if (!id || !guest) return;
    const price = stayEditPrice.trim() ? parseFloat(stayEditPrice.replace(',', '.')) : null;
    const nights = stayEditNights.trim() ? parseInt(stayEditNights, 10) : null;
    if (price == null || price < 0 || !nights || nights < 1) {
      Alert.alert('Eksik bilgi', 'Gece fiyatı ve gece sayısı gerekli.');
      return;
    }
    setStayUpdateBusy(true);
    const { error } = await updateGuestStayFinancials(supabase, { guestId: id, pricePerNight: price, nights });
    setStayUpdateBusy(false);
    if (error) {
      Alert.alert('Hata', error.message);
      return;
    }
    setEditPriceVisible(false);
    invalidateOccupancyCache();
    await loadGuestAndRooms();
    Alert.alert('Tamam', 'Tutarlar güncellendi.');
  };

  const deleteGuestRecord = () => {
    if (!id || !guest) return;
    Alert.alert(
      'Misafir kaydını sil',
      `${guest.full_name} kaydı silinecek (soft delete). Odadaysa oda boşaltılır. Bu işlem geri alınamaz.`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setDeleteBusy(true);
              if (guest.room_id && guest.status === 'checked_in') {
                await supabase.from('rooms').update({ status: 'available' }).eq('id', guest.room_id);
              }
              const { error } = await supabase
                .from('guests')
                .update({
                  deleted_at: new Date().toISOString(),
                  status: 'checked_out',
                  room_id: null,
                })
                .eq('id', id);
              setDeleteBusy(false);
              if (error) {
                Alert.alert('Hata', error.message);
                return;
              }
              invalidateOccupancyCache();
              router.back();
            })();
          },
        },
      ]
    );
  };

  const stayPreview = useMemo(() => {
    const price = stayEditPrice.trim() ? parseFloat(stayEditPrice.replace(',', '.')) : null;
    const nights = stayEditNights.trim() ? parseInt(stayEditNights, 10) : null;
    if (price == null || price < 0 || !nights || nights < 1) return null;
    return computeStayAmounts(price, nights);
  }, [stayEditPrice, stayEditNights]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
      </View>
    );
  }

  if (!guest) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Misafir bulunamadı veya silinmiş.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backLinkText}>Geri dön</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.avatarWrap}>
            {guest.photo_url ? (
              <CachedImage uri={guest.photo_url} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <Text style={styles.avatarLetter}>{(guest.full_name || '?').charAt(0).toUpperCase()}</Text>
            )}
          </View>
          <View style={styles.heroBody}>
            <Text style={styles.name}>{guest.full_name}</Text>
            <View style={[styles.statusPill, { backgroundColor: statusMeta.bg }]}>
              <Text style={[styles.statusPillText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
            </View>
            {guest.rooms?.room_number ? (
              <Text style={styles.heroSub}>Oda {guest.rooms.room_number}</Text>
            ) : null}
            {guest.check_in_at ? (
              <Text style={styles.heroSub}>Giriş: {formatDateTime(guest.check_in_at)}</Text>
            ) : null}
          </View>
        </View>

        {/* Ana işlemler */}
        {guest.status === 'pending' && (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Oda ata</Text>
            <Text style={styles.blockHint}>Boş odaya dokunun, fiyat ve gece sayısını onaylayın.</Text>
            {rooms.length === 0 ? (
              <Text style={styles.emptyHint}>Müsait oda yok.</Text>
            ) : (
              <View style={styles.roomGrid}>
                {rooms.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    style={[styles.roomChip, assignRoomId === r.id && styles.roomChipActive]}
                    onPress={() => openAssignForRoom(r)}
                  >
                    <Text style={[styles.roomChipNum, assignRoomId === r.id && styles.roomChipNumActive]}>
                      {r.room_number}
                    </Text>
                    {r.price_per_night != null ? (
                      <Text style={styles.roomChipPrice}>₺{r.price_per_night}</Text>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {assignRoomId ? (
              <View style={styles.assignForm}>
                <Text style={styles.assignFormTitle}>
                  Oda {rooms.find((x) => x.id === assignRoomId)?.room_number} — konaklama bilgisi
                </Text>
                <View style={styles.inputRow}>
                  <View style={styles.inputHalf}>
                    <Text style={styles.inputLabel}>Gece fiyatı (₺)</Text>
                    <TextInput
                      style={styles.input}
                      value={priceInput}
                      onChangeText={setPriceInput}
                      keyboardType="decimal-pad"
                      placeholder="1500"
                    />
                  </View>
                  <View style={styles.inputHalf}>
                    <Text style={styles.inputLabel}>Gece</Text>
                    <TextInput
                      style={styles.input}
                      value={nightsInput}
                      onChangeText={setNightsInput}
                      keyboardType="number-pad"
                      placeholder="1"
                    />
                  </View>
                </View>
                <ActionBtn
                  label="Giriş yap ve odaya yerleştir"
                  icon="checkmark-circle-outline"
                  onPress={confirmAssignRoom}
                  loading={assigning}
                  disabled={assigning}
                />
              </View>
            ) : null}
          </View>
        )}

        {guest.status === 'checked_in' && guest.room_id && (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Hızlı işlemler</Text>
            <View style={styles.actionRow}>
              <ActionBtn label="Çıkış yap" icon="log-out-outline" onPress={runCheckOut} variant="danger" loading={checkoutBusy} />
            </View>
            <View style={styles.actionRow}>
              <ActionBtn
                label="Oda değiştir"
                icon="swap-horizontal-outline"
                onPress={() => setChangeRoomVisible(true)}
                variant="secondary"
              />
              <ActionBtn
                label="Fiyat düzenle"
                icon="cash-outline"
                onPress={() => {
                  const p = effectiveNightlyRate(guest.total_amount_net, guest.nights_count);
                  setStayEditPrice(p != null ? String(p) : '');
                  setStayEditNights(guest.nights_count ? String(guest.nights_count) : '1');
                  setEditPriceVisible(true);
                }}
                variant="ghost"
              />
            </View>
          </View>
        )}

        {/* Özet bilgi */}
        <View style={styles.infoGrid}>
          {guest.phone ? (
            <View style={styles.infoCell}>
              <Ionicons name="call-outline" size={16} color="#64748b" />
              <Text style={styles.infoLabel}>Telefon</Text>
              <Text style={styles.infoValue}>{guest.phone}</Text>
            </View>
          ) : null}
          {guest.email ? (
            <View style={styles.infoCell}>
              <Ionicons name="mail-outline" size={16} color="#64748b" />
              <Text style={styles.infoLabel}>E-posta</Text>
              <Text style={styles.infoValue} numberOfLines={1}>
                {guest.email}
              </Text>
            </View>
          ) : null}
          {guest.id_number ? (
            <View style={styles.infoCell}>
              <Ionicons name="card-outline" size={16} color="#64748b" />
              <Text style={styles.infoLabel}>Kimlik</Text>
              <Text style={styles.infoValue}>{guest.id_number}</Text>
            </View>
          ) : null}
          {Array.isArray(guest.family_member_tcs) && guest.family_member_tcs.length > 0 ? (
            <View style={styles.familyTcBlock}>
              <View style={styles.familyTcHeader}>
                <Ionicons name="people-outline" size={16} color="#64748b" />
                <Text style={styles.infoLabel}>Aile fertleri T.C.</Text>
              </View>
              {guest.family_member_tcs.map((m, i) => (
                <Text key={`fam-tc-${i}`} style={styles.infoValue}>
                  {(m.full_name ?? '').trim() || '—'} · {(m.tc ?? '').toString().replace(/\D/g, '') || '—'}
                </Text>
              ))}
            </View>
          ) : null}
          {guest.nights_count != null || guest.total_amount_net != null ? (
            <View style={styles.infoCell}>
              <Ionicons name="receipt-outline" size={16} color="#64748b" />
              <Text style={styles.infoLabel}>Konaklama</Text>
              <Text style={styles.infoValue}>
                {guest.nights_count ?? '—'} gece · ₺{Number(guest.total_amount_net ?? 0).toFixed(0)} net
              </Text>
            </View>
          ) : null}
        </View>

        {/* Sözleşme */}
        {guest.signature_data ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Sözleşme</Text>
            <View style={styles.actionRow}>
              <ActionBtn
                label="PDF paylaş"
                icon="document-outline"
                onPress={async () => {
                  setPdfLoading(true);
                  try {
                    await shareContractPdf(guest as GuestForPdf);
                  } catch (e) {
                    Alert.alert('Hata', (e as Error)?.message ?? 'PDF oluşturulamadı');
                  }
                  setPdfLoading(false);
                }}
                variant="secondary"
                loading={pdfLoading}
                disabled={pdfLoading || printerLoading}
              />
              <ActionBtn
                label="Yazıcı"
                icon="print-outline"
                onPress={async () => {
                  setPrinterLoading(true);
                  try {
                    const uri = await exportContractPdf(guest as GuestForPdf);
                    await sendPdfToPrinterEmail({
                      pdfUri: uri,
                      subject: `Sözleşme - ${guest.full_name}`,
                      fileName: `SOZLESME-${guest.full_name.replace(/\s+/g, '-')}.pdf`,
                    });
                    Alert.alert('Tamam', 'Yazıcıya gönderildi.');
                  } catch (e) {
                    Alert.alert('Hata', (e as Error)?.message ?? 'Gönderilemedi');
                  }
                  setPrinterLoading(false);
                }}
                variant="ghost"
                loading={printerLoading}
                disabled={pdfLoading || printerLoading}
              />
            </View>
          </View>
        ) : (
          <View style={styles.warnBox}>
            <Ionicons name="alert-circle-outline" size={18} color="#a16207" />
            <Text style={styles.warnText}>Sözleşme imzası henüz yok.</Text>
          </View>
        )}

        <TouchableOpacity style={styles.moreToggle} onPress={() => setShowMore((v) => !v)}>
          <Text style={styles.moreToggleText}>{showMore ? 'Daha az' : 'Diğer işlemler'}</Text>
          <Ionicons name={showMore ? 'chevron-up' : 'chevron-down'} size={18} color="#64748b" />
        </TouchableOpacity>

        {showMore ? (
          <ActionBtn
            label="Misafir kaydını sil"
            icon="trash-outline"
            onPress={deleteGuestRecord}
            variant="danger"
            loading={deleteBusy}
            disabled={deleteBusy}
          />
        ) : null}
      </ScrollView>

      {/* Oda değiştir modal */}
      <Modal visible={changeRoomVisible} transparent animationType="slide">
        <View style={styles.sheetOverlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.sheetTitle}>Oda değiştir</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {roomsForMove.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  style={[styles.sheetRow, selectedNewRoomId === r.id && styles.sheetRowOn]}
                  onPress={() => setSelectedNewRoomId(r.id)}
                >
                  <Text style={styles.sheetRowTitle}>
                    Oda {r.room_number}
                    {r.id === guest.room_id ? ' (şu an)' : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <ActionBtn label="Taşı" icon="checkmark" onPress={applyRoomChange} loading={roomMoveBusy} />
            <TouchableOpacity onPress={() => setChangeRoomVisible(false)} style={styles.sheetCancel}>
              <Text style={styles.sheetCancelText}>Vazgeç</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Fiyat düzenle */}
      <Modal visible={editPriceVisible} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalWrap}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => !stayUpdateBusy && setEditPriceVisible(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.sheetTitle}>Fiyat / gece güncelle</Text>
            <TextInput style={styles.input} value={stayEditPrice} onChangeText={setStayEditPrice} keyboardType="decimal-pad" placeholder="Gece fiyatı" />
            <TextInput style={styles.input} value={stayEditNights} onChangeText={setStayEditNights} keyboardType="number-pad" placeholder="Gece sayısı" />
            {stayPreview ? (
              <Text style={styles.preview}>
                Net ₺{stayPreview.totalNet.toFixed(0)} · KDV ₺{stayPreview.vatAmount.toFixed(0)}
              </Text>
            ) : null}
            <ActionBtn label="Kaydet" icon="save-outline" onPress={applyStayUpdate} loading={stayUpdateBusy} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f1f5f9' },
  container: { flex: 1 },
  content: { padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 15, color: '#64748b' },
  backLink: { marginTop: 16, padding: 12 },
  backLinkText: { color: '#2563eb', fontWeight: '700' },
  hero: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  avatarWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: 14,
  },
  avatarImg: { width: 64, height: 64 },
  avatarLetter: { fontSize: 28, fontWeight: '800', color: '#475569' },
  heroBody: { flex: 1, minWidth: 0 },
  name: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  statusPill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginTop: 6 },
  statusPillText: { fontSize: 12, fontWeight: '700' },
  heroSub: { fontSize: 13, color: '#64748b', marginTop: 4 },
  block: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  blockTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 4 },
  blockHint: { fontSize: 13, color: '#64748b', marginBottom: 12, lineHeight: 18 },
  emptyHint: { fontSize: 13, color: '#94a3b8', fontStyle: 'italic' },
  roomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roomChip: {
    minWidth: 72,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  roomChipActive: { borderColor: '#16a34a', backgroundColor: '#ecfdf5' },
  roomChipNum: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  roomChipNumActive: { color: '#166534' },
  roomChipPrice: { fontSize: 11, color: '#64748b', marginTop: 2 },
  assignForm: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  assignFormTitle: { fontSize: 14, fontWeight: '700', color: '#334155', marginBottom: 10 },
  inputRow: { flexDirection: 'row', gap: 10 },
  inputHalf: { flex: 1 },
  inputLabel: { fontSize: 12, fontWeight: '600', color: '#64748b', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    minHeight: 48,
  },
  actionPrimary: { backgroundColor: '#16a34a' },
  actionSecondary: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe' },
  actionDanger: { backgroundColor: '#dc2626' },
  actionGhost: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0' },
  actionBtnText: { fontSize: 14, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  infoCell: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 4,
  },
  infoLabel: { fontSize: 11, color: '#94a3b8', fontWeight: '600' },
  infoValue: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  familyTcBlock: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 4,
  },
  familyTcHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  warnBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fffbeb',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  warnText: { flex: 1, fontSize: 13, color: '#92400e' },
  moreToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  moreToggleText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 12 },
  sheetRow: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e2e8f0' },
  sheetRowOn: { backgroundColor: '#eff6ff' },
  sheetRowTitle: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  sheetCancel: { alignItems: 'center', padding: 14 },
  sheetCancelText: { fontSize: 15, color: '#64748b', fontWeight: '600' },
  modalWrap: { flex: 1, justifyContent: 'center', padding: 20 },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  preview: { fontSize: 13, color: '#475569', marginBottom: 10, backgroundColor: '#f8fafc', padding: 10, borderRadius: 8 },
});
