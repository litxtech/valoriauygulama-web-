import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Platform, Modal, TextInput, KeyboardAvoidingView, FlatList, Pressable, Dimensions } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { DesignableQR, FramedQR, type QRDesign, type QRCodeRef, type QRFrameStyle, QR_FRAME_LABELS } from '@/components/DesignableQR';
import { FIXED_CONTRACT_QR_URL } from '@/constants/contractQr';
import { useAuthStore } from '@/stores/authStore';
import { sendNotification } from '@/lib/notificationService';
import { GUEST_TYPES, guestMessageTemplate } from '@/lib/notifications';
import { computeStayAmounts, effectiveNightlyRate } from '@/lib/guestStayFinancials';
import { moveGuestToRoom, updateGuestStayFinancials } from '@/lib/guestStayRoomOps';

type Room = {
  id: string;
  room_number: string;
  floor: number | null;
  status: string;
  view_type: string | null;
  area_sqm: number | null;
  bed_type: string | null;
  price_per_night: number | null;
};

type Template = {
  id: string;
  use_logo: boolean;
  background_color: string;
  foreground_color: string;
  shape: 'square' | 'rounded' | 'dots' | 'circle';
  logo_size_ratio: number;
};
type SettingsRow = {
  template_id: string | null;
  use_logo_override: boolean | null;
  background_color_override: string | null;
  foreground_color_override: string | null;
  shape_override: string | null;
  template: Template | null;
};

function resolveRoomDesign(settings: SettingsRow | null): QRDesign | null {
  if (!settings?.template) return null;
  const t = settings.template;
  return {
    useLogo: settings.use_logo_override ?? t.use_logo,
    backgroundColor: settings.background_color_override ?? t.background_color,
    foregroundColor: settings.foreground_color_override ?? t.foreground_color,
    shape: (settings.shape_override as QRDesign['shape']) ?? t.shape,
    logoSizeRatio: Number(t.logo_size_ratio) || 0.24,
  };
}

type QrType = 'checkin' | 'contract';

type CurrentGuest = {
  id: string;
  full_name: string;
  contract_lang?: string | null;
  total_amount_net?: number | null;
  nights_count?: number | null;
  vat_amount?: number | null;
  accommodation_tax_amount?: number | null;
};
type PendingAcceptance = { id: string; guest_id: string; accepted_at: string; signer_name: string | null };

const FRAME_OPTIONS: QRFrameStyle[] = ['minimal', 'bordered', 'modern', 'elegant'];

const defaultDesign: QRDesign = {
  useLogo: true,
  backgroundColor: '#FFFFFF',
  foregroundColor: '#000000',
  shape: 'square',
  logoSizeRatio: 0.22,
};

const contractDefaultDesign: QRDesign = {
  useLogo: true,
  backgroundColor: '#FFFFFF',
  foregroundColor: '#1a365d',
  shape: 'rounded',
  logoSizeRatio: 0.22,
};

export default function RoomDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { staff } = useAuthStore();
  const [room, setRoom] = useState<Room | null>(null);
  const [currentGuest, setCurrentGuest] = useState<CurrentGuest | null>(null);
  const [qrValue, setQrValue] = useState<string>('');
  const [contractQrValue, setContractQrValue] = useState<string>('');
  const [roomDesign, setRoomDesign] = useState<QRDesign | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkinQrRef, setCheckinQrRef] = useState<QRCodeRef>(null);
  const [contractQrRef, setContractQrRef] = useState<QRCodeRef>(null);
  const [qrDownloading, setQrDownloading] = useState<'checkin' | 'contract' | null>(null);
  const [qrDrawerVisible, setQrDrawerVisible] = useState(false);
  const [selectedQrType, setSelectedQrType] = useState<QrType | null>(null);
  const [selectedFrame, setSelectedFrame] = useState<QRFrameStyle>('modern');
  const [whoNextModalVisible, setWhoNextModalVisible] = useState(false);
  const [pendingAcceptances, setPendingAcceptances] = useState<PendingAcceptance[]>([]);
  const [assignFormVisible, setAssignFormVisible] = useState(false);
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const [nightsInput, setNightsInput] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [contractRoomPreviews, setContractRoomPreviews] = useState<{ signer_name: string; accepted_at: string }[]>([]);
  const [editStayVisible, setEditStayVisible] = useState(false);
  const [changeRoomVisible, setChangeRoomVisible] = useState(false);
  const [roomsForMove, setRoomsForMove] = useState<{ id: string; room_number: string; status: string }[]>([]);
  const [selectedNewRoomId, setSelectedNewRoomId] = useState<string | null>(null);
  const [stayEditPrice, setStayEditPrice] = useState('');
  const [stayEditNights, setStayEditNights] = useState('');

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase.from('rooms').select('*').eq('id', id).single();
      setRoom(data ?? null);
      if (data?.status === 'occupied') {
        const { data: guest } = await supabase
          .from('guests')
          .select('id, full_name, contract_lang, total_amount_net, nights_count, vat_amount, accommodation_tax_amount')
          .eq('room_id', id)
          .eq('status', 'checked_in')
          .maybeSingle();
        setCurrentGuest(guest ?? null);
      } else {
        setCurrentGuest(null);
      }
      const { data: appSettings } = await supabase.from('app_settings').select('key, value').in('key', ['checkin_qr_base_url', 'contract_qr_base_url']);
      const settingsMap: Record<string, string> = {};
      (appSettings ?? []).forEach((r: { key: string; value: unknown }) => {
        const v = r.value;
        if (v != null && String(v).trim()) settingsMap[r.key] = String(v).trim();
      });
      const checkinBaseRaw = settingsMap.checkin_qr_base_url || process.env.EXPO_PUBLIC_APP_URL || '';
      const checkinBase = checkinBaseRaw.trim() || 'valoria://';

      const { data: qr } = await supabase.from('room_qr_codes').select('token').eq('room_id', id).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (qr?.token) {
        const isAppScheme = checkinBase === 'valoria://' || checkinBase === 'valoria' || checkinBase.startsWith('valoria://');
        setQrValue(isAppScheme ? `valoria://guest?token=${encodeURIComponent(qr.token)}` : `${checkinBase.replace(/\/$/, '')}/guest?token=${encodeURIComponent(qr.token)}`);
        setContractQrValue(FIXED_CONTRACT_QR_URL);
      }

      const { data: settings } = await supabase
        .from('qr_design_settings')
        .select('template_id, use_logo_override, background_color_override, foreground_color_override, shape_override')
        .eq('scope', 'room')
        .single();
      if (settings?.template_id) {
        const { data: template } = await supabase
          .from('qr_design_templates')
          .select('id, use_logo, background_color, foreground_color, shape, logo_size_ratio')
          .eq('id', settings.template_id)
          .single();
        setRoomDesign(resolveRoomDesign(settings ? { ...settings, template: template ?? null } : null));
      } else {
        setRoomDesign(null);
      }
      setLoading(false);
    })();
  }, [id]);

  useEffect(() => {
    if (!id || !room || room.status !== 'available') {
      setContractRoomPreviews([]);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('contract_acceptances')
        .select('accepted_at, guests(full_name, status, room_id)')
        .eq('room_id', id)
        .not('guest_id', 'is', null)
        .order('accepted_at', { ascending: false })
        .limit(20);
      const out: { signer_name: string; accepted_at: string }[] = [];
      for (const r of data ?? []) {
        const g = Array.isArray(r.guests) ? r.guests[0] : r.guests;
        if (g && g.status === 'pending' && !g.room_id) {
          out.push({
            signer_name: (g.full_name && String(g.full_name).trim()) || 'Misafir',
            accepted_at: r.accepted_at,
          });
        }
      }
      setContractRoomPreviews(out);
    })();
  }, [id, room?.id, room?.status]);

  const downloadQrAsImage = useCallback(async (ref: QRCodeRef, label: string) => {
    if (!ref?.toDataURL) {
      if (Platform.OS === 'web') Alert.alert('Bilgi', 'Web\'de QR indirmek için sağ tıklayıp "Resmi farklı kaydet" kullanın.');
      return;
    }
    ref.toDataURL(async (data: string) => {
      try {
        const base64 = data.startsWith('data:') ? data.replace(/^data:image\/\w+;base64,/, '') : data;
        const filename = `valoria-qr-${label}-${Date.now()}.png`;
        const path = `${FileSystem.cacheDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) await Sharing.shareAsync(path, { mimeType: 'image/png', dialogTitle: `QR Kod – ${label}` });
        else Alert.alert('Kaydedildi', path);
      } catch (e) {
        Alert.alert('Hata', (e as Error)?.message ?? 'QR indirilemedi.');
      }
      setQrDownloading(null);
    });
  }, []);

  const startDownloadQr = (which: 'checkin' | 'contract') => {
    const ref = which === 'checkin' ? checkinQrRef : contractQrRef;
    if (!ref?.toDataURL) {
      if (Platform.OS === 'web') Alert.alert('Bilgi', 'Web\'de QR indirmek için QR görseline sağ tıklayıp "Resmi farklı kaydet" kullanın.');
      return;
    }
    setQrDownloading(which);
    downloadQrAsImage(ref, which === 'checkin' ? 'checkin' : 'sozlesme');
  };

  const refreshQR = async () => {
    if (!id) return;
    const { data, error } = await supabase.rpc('generate_room_qr_token', { p_room_id: id });
    if (error) {
      Alert.alert('Hata', error.message);
      return;
    }
    const { data: appSettings } = await supabase.from('app_settings').select('key, value').in('key', ['checkin_qr_base_url', 'contract_qr_base_url']);
    const settingsMap: Record<string, string> = {};
    (appSettings ?? []).forEach((r: { key: string; value: unknown }) => {
      const v = r.value;
      if (v != null && String(v).trim()) settingsMap[r.key] = String(v).trim();
    });
    const checkinBaseRaw = settingsMap.checkin_qr_base_url || process.env.EXPO_PUBLIC_APP_URL || '';
    const checkinBase = checkinBaseRaw.trim() || 'valoria://';
    const isAppScheme = checkinBase === 'valoria://' || checkinBase === 'valoria' || checkinBase.startsWith('valoria://');
    setQrValue(isAppScheme ? `valoria://guest?token=${encodeURIComponent(String(data))}` : `${checkinBase.replace(/\/$/, '')}/guest?token=${encodeURIComponent(String(data))}`);
    setContractQrValue(FIXED_CONTRACT_QR_URL);
  };

  const loadPendingAcceptances = useCallback(async () => {
    const { data: list } = await supabase
      .from('contract_acceptances')
      .select('id, guest_id, accepted_at, guests(full_name)')
      .not('guest_id', 'is', null)
      .order('accepted_at', { ascending: false })
      .limit(50);
    const withGuest = (list ?? []).filter((r: { guests?: { full_name: string } | { full_name: string }[] | null }) => {
      const g = Array.isArray(r.guests) ? r.guests[0] : r.guests;
      return g != null;
    });
    const guestIds = withGuest.map((r: { guest_id: string }) => r.guest_id);
    if (guestIds.length === 0) {
      setPendingAcceptances([]);
      return;
    }
    const { data: guests } = await supabase.from('guests').select('id, status, room_id').in('id', guestIds);
    const pendingIds = new Set((guests ?? []).filter((g) => g.status === 'pending' && !g.room_id).map((g) => g.id));
    setPendingAcceptances(
      withGuest
        .filter((r: { guest_id: string }) => pendingIds.has(r.guest_id))
        .map((r: { id: string; guest_id: string; accepted_at: string; guests: { full_name: string } | { full_name: string }[] }) => {
          const g = Array.isArray(r.guests) ? r.guests[0] : r.guests;
          return { id: r.id, guest_id: r.guest_id, accepted_at: r.accepted_at, signer_name: g?.full_name ?? null };
        })
    );
  }, []);

  useEffect(() => {
    if (!changeRoomVisible || !id || !currentGuest?.id) return;
    (async () => {
      const { data } = await supabase
        .from('rooms')
        .select('id, room_number, status')
        .or(`status.eq.available,id.eq.${id}`)
        .order('room_number');
      setRoomsForMove(data ?? []);
      setSelectedNewRoomId(null);
    })();
  }, [changeRoomVisible, id, currentGuest?.id]);

  const handleCheckOut = () => {
    if (!currentGuest || !id) return;
    Alert.alert('Odadan çık', `${currentGuest.full_name} çıkış yapılsın mı?`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Çıkış yap',
        style: 'destructive',
        onPress: async () => {
          setActionLoading(true);
          const { error } = await supabase
            .from('guests')
            .update({ status: 'checked_out', check_out_at: new Date().toISOString(), room_id: null })
            .eq('id', currentGuest.id);
          if (error) {
            Alert.alert('Hata', error.message);
            setActionLoading(false);
            return;
          }
          await supabase.from('rooms').update({ status: 'available' }).eq('id', id);
          const done = guestMessageTemplate(GUEST_TYPES.checkout_done, {}, currentGuest.contract_lang);
          await sendNotification({
            guestId: currentGuest.id,
            title: done.title,
            body: done.body,
            notificationType: GUEST_TYPES.checkout_done,
            category: 'guest',
            createdByStaffId: staff?.id ?? undefined,
          });
          setCurrentGuest(null);
          setRoom((prev) => (prev ? { ...prev, status: 'available' } : null));
          setActionLoading(false);
          await loadPendingAcceptances();
          setWhoNextModalVisible(true);
        },
      },
    ]);
  };

  const openAssignForm = (guestId: string) => {
    setSelectedGuestId(guestId);
    setPriceInput(room?.price_per_night ? String(room.price_per_night) : '');
    setNightsInput('');
    setAssignFormVisible(true);
  };

  const confirmAssignToRoom = async () => {
    if (!id || !selectedGuestId) return;
    const price = priceInput.trim() ? parseFloat(priceInput.replace(',', '.')) : null;
    const nights = nightsInput.trim() ? parseInt(nightsInput, 10) : null;
    if (price == null || price < 0 || !nights || nights < 1) {
      Alert.alert('Hata', 'Geçerli bir fiyat ve en az 1 gün girin.');
      return;
    }
    const totalNet = price * nights;
    const { vatAmount, accommodationTaxAmount } = computeStayAmounts(price, nights);
    setActionLoading(true);
    const { error } = await supabase
      .from('guests')
      .update({
        room_id: id,
        status: 'checked_in',
        check_in_at: new Date().toISOString(),
        total_amount_net: totalNet,
        vat_amount: vatAmount,
        accommodation_tax_amount: accommodationTaxAmount,
        nights_count: nights,
      })
      .eq('id', selectedGuestId);
    if (error) {
      Alert.alert('Hata', error.message);
      setActionLoading(false);
      return;
    }
    await supabase.from('rooms').update({ status: 'occupied' }).eq('id', id);
    const { data: newGuest } = await supabase
      .from('guests')
      .select('id, full_name, contract_lang, total_amount_net, nights_count, vat_amount, accommodation_tax_amount')
      .eq('id', selectedGuestId)
      .single();
    setCurrentGuest(newGuest ?? null);
    setRoom((prev) => (prev ? { ...prev, status: 'occupied' } : null));
    if (newGuest) {
      const msg = guestMessageTemplate(
        GUEST_TYPES.admin_assigned_room,
        { roomNumber: room?.room_number ?? '' },
        newGuest.contract_lang
      );
      await sendNotification({
        guestId: newGuest.id,
        title: msg.title,
        body: msg.body,
        notificationType: GUEST_TYPES.admin_assigned_room,
        category: 'guest',
        createdByStaffId: staff?.id ?? undefined,
      });
    }
    await supabase.from('contract_acceptances').update({ room_id: id }).eq('guest_id', selectedGuestId);
    setWhoNextModalVisible(false);
    setAssignFormVisible(false);
    setSelectedGuestId(null);
    setPriceInput('');
    setNightsInput('');
    setActionLoading(false);
  };

  const openEditGuestStay = () => {
    if (!currentGuest) return;
    const p = effectiveNightlyRate(currentGuest.total_amount_net, currentGuest.nights_count);
    setStayEditPrice(p != null ? String(p) : '');
    setStayEditNights(
      currentGuest.nights_count != null && currentGuest.nights_count > 0 ? String(currentGuest.nights_count) : ''
    );
    setEditStayVisible(true);
  };

  const applyGuestStayUpdate = async () => {
    if (!currentGuest?.id) return;
    const price = stayEditPrice.trim() ? parseFloat(stayEditPrice.replace(',', '.')) : null;
    const nights = stayEditNights.trim() ? parseInt(stayEditNights, 10) : null;
    if (price == null || price < 0 || !nights || nights < 1) {
      Alert.alert('Hata', 'Geçerli gece fiyatı ve en az 1 gece girin.');
      return;
    }
    setActionLoading(true);
    const { totalNet, vatAmount, accommodationTaxAmount } = computeStayAmounts(price, nights);
    const { error } = await updateGuestStayFinancials(supabase, {
      guestId: currentGuest.id,
      pricePerNight: price,
      nights,
    });
    if (error) {
      Alert.alert('Hata', error.message);
      setActionLoading(false);
      return;
    }
    setCurrentGuest((prev) =>
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
    const summary = `${nights} gece · net ₺${totalNet.toFixed(0)}`;
    const tmpl = guestMessageTemplate(GUEST_TYPES.stay_financial_updated, { summary }, currentGuest?.contract_lang);
    await sendNotification({
      guestId: currentGuest.id,
      title: tmpl.title,
      body: tmpl.body,
      notificationType: GUEST_TYPES.stay_financial_updated,
      category: 'guest',
      createdByStaffId: staff?.id ?? undefined,
    });
    setEditStayVisible(false);
    setActionLoading(false);
    Alert.alert('Tamam', 'Konaklama tutarları güncellendi.');
  };

  const applyGuestRoomChange = async () => {
    if (!currentGuest?.id || !id || !selectedNewRoomId) {
      Alert.alert('Uyarı', 'Yeni oda seçin.');
      return;
    }
    if (selectedNewRoomId === id) {
      Alert.alert('Bilgi', 'Misafir zaten bu odada.');
      setChangeRoomVisible(false);
      return;
    }
    setActionLoading(true);
    const { error } = await moveGuestToRoom(supabase, {
      guestId: currentGuest.id,
      oldRoomId: id,
      newRoomId: selectedNewRoomId,
    });
    if (error) {
      Alert.alert('Hata', error.message);
      setActionLoading(false);
      return;
    }
    const newNum = roomsForMove.find((r) => r.id === selectedNewRoomId)?.room_number ?? '';
    const tmpl = guestMessageTemplate(GUEST_TYPES.room_reassigned, { roomNumber: newNum }, currentGuest?.contract_lang);
    await sendNotification({
      guestId: currentGuest.id,
      title: tmpl.title,
      body: tmpl.body,
      notificationType: GUEST_TYPES.room_reassigned,
      category: 'guest',
      createdByStaffId: staff?.id ?? undefined,
    });
    setChangeRoomVisible(false);
    setSelectedNewRoomId(null);
    setCurrentGuest(null);
    setRoom((prev) => (prev ? { ...prev, status: 'available' } : null));
    setActionLoading(false);
    Alert.alert('Tamam', `Misafir oda ${newNum} olarak taşındı. Bu oda müsait.`);
  };

  const stayPreviewRoom = (() => {
    const price = stayEditPrice.trim() ? parseFloat(stayEditPrice.replace(',', '.')) : null;
    const nights = stayEditNights.trim() ? parseInt(stayEditNights, 10) : null;
    if (price == null || price < 0 || !nights || nights < 1) return null;
    return computeStayAmounts(price, nights);
  })();

  if (loading || !room) return <Text style={styles.loading}>Yükleniyor...</Text>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Oda {room.room_number}</Text>
      <View style={styles.section}>
        <Text style={styles.label}>Durum</Text>
        <Text style={styles.value}>{room.status}</Text>
      </View>
      {room.status === 'available' && contractRoomPreviews.length > 0 && (
        <View style={styles.previewBanner}>
          <Text style={styles.previewBannerTitle}>Sözleşme onayı — check-in bekleniyor</Text>
          <Text style={styles.previewBannerSub}>
            Aşağıdaki isimler bu odaya önizleme olarak bağlı; henüz odada değiller. Onaylar ekranından check-in tamamlanabilir.
          </Text>
          {contractRoomPreviews.map((p, i) => (
            <Text key={`${p.accepted_at}-${i}`} style={styles.previewBannerLine}>
              • {p.signer_name} · {new Date(p.accepted_at).toLocaleString('tr-TR')}
            </Text>
          ))}
        </View>
      )}
      {room.status === 'occupied' && currentGuest && (
        <View style={styles.section}>
          <Text style={styles.label}>Konaklayan</Text>
          <Text style={styles.value}>{currentGuest.full_name}</Text>
          {(currentGuest.total_amount_net != null || currentGuest.nights_count != null) && (
            <>
              <Text style={styles.guestMaliyeLine}>
                {currentGuest.nights_count != null ? `${currentGuest.nights_count} gece` : ''}
                {currentGuest.nights_count != null && currentGuest.total_amount_net != null ? ' · ' : ''}
                {currentGuest.total_amount_net != null ? `Net ₺${Number(currentGuest.total_amount_net).toFixed(2)}` : ''}
              </Text>
              {currentGuest.vat_amount != null && currentGuest.accommodation_tax_amount != null ? (
                <Text style={styles.guestMaliyeSub}>
                  KDV: ₺{Number(currentGuest.vat_amount).toFixed(2)} · Konaklama vergisi: ₺
                  {Number(currentGuest.accommodation_tax_amount).toFixed(2)}
                </Text>
              ) : null}
            </>
          )}
          <Text style={styles.manageHintRoom}>
            Konaklama tutarı veya oda değişikliği (misafiri başka odaya taşıma) buradan yapılır. Taşıma sonrası bu oda müsait olur.
          </Text>
          <TouchableOpacity
            style={styles.stayManageBtn}
            onPress={openEditGuestStay}
            disabled={actionLoading}
            activeOpacity={0.85}
          >
            <Text style={styles.stayManageBtnText}>Fiyat / gece güncelle</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.stayManageBtn, styles.stayManageBtnAlt]}
            onPress={() => setChangeRoomVisible(true)}
            disabled={actionLoading}
            activeOpacity={0.85}
          >
            <Text style={styles.stayManageBtnTextAlt}>Misafiri başka odaya taşı</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.checkOutRoomBtn} onPress={handleCheckOut} disabled={actionLoading}>
            <Text style={styles.checkOutRoomBtnText}>Odadan çık (check-out)</Text>
          </TouchableOpacity>
        </View>
      )}
      {room.floor != null && (
        <View style={styles.section}>
          <Text style={styles.label}>Kat</Text>
          <Text style={styles.value}>{room.floor}</Text>
        </View>
      )}
      {room.view_type && (
        <View style={styles.section}>
          <Text style={styles.label}>Manzara</Text>
          <Text style={styles.value}>{room.view_type}</Text>
        </View>
      )}
      {room.bed_type && (
        <View style={styles.section}>
          <Text style={styles.label}>Yatak</Text>
          <Text style={styles.value}>{room.bed_type}</Text>
        </View>
      )}
      {room.price_per_night != null && (
        <View style={styles.section}>
          <Text style={styles.label}>Gece fiyatı</Text>
          <Text style={styles.value}>₺{room.price_per_night}</Text>
        </View>
      )}
      <View style={styles.section}>
        <Text style={styles.label}>QR Kodlar</Text>
        {!qrValue && !contractQrValue ? (
          <TouchableOpacity style={styles.qrBtn} onPress={refreshQR}>
            <Text style={styles.qrBtnText}>QR Kod Oluştur</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity style={styles.qrDrawerBtn} onPress={() => setQrDrawerVisible(true)}>
              <Text style={styles.qrDrawerBtnText}>
                {selectedQrType
                  ? (selectedQrType === 'checkin' ? 'Check-in QR' : 'Sözleşme QR') + ` • ${QR_FRAME_LABELS[selectedFrame]}`
                  : 'QR Kod Seçin'}
              </Text>
              <Text style={styles.qrDrawerBtnHint}>Tıklayın – çekmeceden tür ve çerçeve seçin</Text>
            </TouchableOpacity>

            {selectedQrType && (
              <View style={styles.qrWrap}>
                {selectedQrType === 'checkin' && qrValue ? (
                  <FramedQR
                    value={qrValue}
                    size={180}
                    design={roomDesign ?? defaultDesign}
                    frame={selectedFrame}
                    getRef={setCheckinQrRef}
                  />
                ) : selectedQrType === 'contract' && contractQrValue ? (
                  <FramedQR
                    value={contractQrValue}
                    size={180}
                    design={roomDesign ?? contractDefaultDesign}
                    frame={selectedFrame}
                    getRef={setContractQrRef}
                  />
                ) : null}
                {selectedQrType === 'checkin' && (
                  <Text style={styles.qrRoom}>Valoria Hotel • Oda {room.room_number}</Text>
                )}
                {selectedQrType === 'contract' && (
                  <Text style={styles.qrRoom}>Kurallar/Sözleşme • Oda {room.room_number}</Text>
                )}
                <View style={styles.qrActions}>
                  {selectedQrType === 'checkin' && (
                    <TouchableOpacity style={styles.qrBtn} onPress={refreshQR}>
                      <Text style={styles.qrBtnText}>QR Yenile</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.qrDownloadBtn, qrDownloading !== null && styles.qrBtnDisabled]}
                    onPress={() => selectedQrType && startDownloadQr(selectedQrType)}
                    disabled={qrDownloading !== null}
                  >
                    <Text style={styles.qrBtnText}>QR İndir</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        )}
      </View>

      <Modal visible={whoNextModalVisible} transparent animationType="slide" onRequestClose={() => setWhoNextModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalDismiss} onPress={() => !actionLoading && setWhoNextModalVisible(false)} />
          <View style={[styles.modalContentWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={styles.modalScrollContent}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Kimi koymak istersin?</Text>
                  <Text style={styles.modalSub}>Sözleşme onayı yapmış, henüz oda atanmamış misafirler:</Text>
                  {pendingAcceptances.length === 0 ? (
                    <Text style={styles.emptyList}>Listelenecek misafir yok. Yeni sözleşme onayı geldiğinde burada görünür.</Text>
                  ) : (
                    <View style={styles.acceptanceList}>
                      {pendingAcceptances.map((item) => (
                        <TouchableOpacity
                          key={item.guest_id}
                          style={styles.acceptanceItem}
                          onPress={() => {
                            setWhoNextModalVisible(false);
                            openAssignForm(item.guest_id);
                          }}
                        >
                          <Text style={styles.acceptanceName}>{item.signer_name ?? 'Misafir'}</Text>
                          <Text style={styles.acceptanceDate}>{new Date(item.accepted_at).toLocaleString('tr-TR')}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setWhoNextModalVisible(false)}>
                    <Text style={styles.modalCloseBtnText}>Kapat</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={assignFormVisible} transparent animationType="slide" onRequestClose={() => !actionLoading && setAssignFormVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.modalDismiss} onPress={() => !actionLoading && setAssignFormVisible(false)} />
          <View style={[styles.modalContentWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={styles.modalScrollContent}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Odaya yerleştir – Maliye bilgileri</Text>
                  <Text style={styles.modalSub}>Oda {room?.room_number}</Text>
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
                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={[styles.confirmAssignBtn, actionLoading && styles.btnDisabled]}
                      onPress={confirmAssignToRoom}
                      disabled={actionLoading}
                    >
                      {actionLoading ? (
                        <Text style={styles.confirmAssignText}>Kaydediliyor...</Text>
                      ) : (
                        <Text style={styles.confirmAssignText}>Yerleştir</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.modalCloseBtn} onPress={() => !actionLoading && setAssignFormVisible(false)}>
                      <Text style={styles.modalCloseBtnText}>İptal</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={editStayVisible} transparent animationType="slide" onRequestClose={() => !actionLoading && setEditStayVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.modalDismiss} onPress={() => !actionLoading && setEditStayVisible(false)} />
          <View style={[styles.modalContentWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
                <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Konaklama tutarları</Text>
                  <Text style={styles.modalSub}>Check-in tarihi değişmez. Misafire bildirim gider.</Text>
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
                  {stayPreviewRoom ? (
                    <Text style={styles.previewCalc}>
                      Net ₺{stayPreviewRoom.totalNet.toFixed(2)} · KDV ₺{stayPreviewRoom.vatAmount.toFixed(2)} · Konaklama vergisi ₺
                      {stayPreviewRoom.accommodationTaxAmount.toFixed(2)}
                    </Text>
                  ) : null}
                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={[styles.confirmAssignBtn, actionLoading && styles.btnDisabled]}
                      onPress={applyGuestStayUpdate}
                      disabled={actionLoading}
                    >
                      <Text style={styles.confirmAssignText}>{actionLoading ? 'Kaydediliyor…' : 'Kaydet'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.modalCloseBtn} onPress={() => !actionLoading && setEditStayVisible(false)}>
                      <Text style={styles.modalCloseBtnText}>İptal</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={changeRoomVisible} transparent animationType="slide" onRequestClose={() => !actionLoading && setChangeRoomVisible(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalDismiss} onPress={() => !actionLoading && setChangeRoomVisible(false)} />
          <View style={[styles.modalContentWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
                <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Misafiri taşı</Text>
                  <Text style={styles.modalSub}>Hedef oda müsait olmalı. Bu oda (şu an dolu) boşalır.</Text>
                  <View style={styles.roomMoveList}>
                    {roomsForMove.map((r) => {
                      const isHere = r.id === id;
                      const sel = selectedNewRoomId === r.id;
                      return (
                        <TouchableOpacity
                          key={r.id}
                          style={[styles.roomMoveRow, sel && styles.roomMoveRowSel, isHere && styles.roomMoveRowHere]}
                          onPress={() => !isHere && setSelectedNewRoomId(r.id)}
                          disabled={actionLoading || isHere}
                        >
                          <Text style={styles.roomMoveTitle}>
                            Oda {r.room_number}
                            {isHere ? ' (burası — kaynak)' : ''}
                          </Text>
                          <Text style={styles.roomMoveMeta}>{r.status}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={[styles.confirmAssignBtn, actionLoading && styles.btnDisabled]}
                      onPress={applyGuestRoomChange}
                      disabled={actionLoading}
                    >
                      <Text style={styles.confirmAssignText}>{actionLoading ? 'Taşınıyor…' : 'Taşı'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.modalCloseBtn} onPress={() => !actionLoading && setChangeRoomVisible(false)}>
                      <Text style={styles.modalCloseBtnText}>İptal</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={qrDrawerVisible} transparent animationType="slide">
        <TouchableOpacity style={styles.drawerOverlay} activeOpacity={1} onPress={() => setQrDrawerVisible(false)}>
          <View style={[styles.drawer, { paddingBottom: insets.bottom + 24 }]} onStartShouldSetResponder={() => true}>
            <Text style={styles.drawerTitle}>QR Kod Seçin</Text>
            <Text style={styles.drawerLabel}>QR türü</Text>
            <View style={styles.drawerRow}>
              <TouchableOpacity
                style={[styles.drawerChip, selectedQrType === 'checkin' && styles.drawerChipActive]}
                onPress={() => setSelectedQrType('checkin')}
              >
                <Text style={[styles.drawerChipText, selectedQrType === 'checkin' && styles.drawerChipTextActive]}>Check-in QR</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.drawerChip, selectedQrType === 'contract' && styles.drawerChipActive]}
                onPress={() => setSelectedQrType('contract')}
              >
                <Text style={[styles.drawerChipText, selectedQrType === 'contract' && styles.drawerChipTextActive]}>Sözleşme QR</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.drawerLabel}>Çerçeve</Text>
            <View style={styles.drawerRow}>
              {FRAME_OPTIONS.map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.drawerChipSmall, selectedFrame === f && styles.drawerChipActive]}
                  onPress={() => setSelectedFrame(f)}
                >
                  <Text style={[styles.drawerChipText, selectedFrame === f && styles.drawerChipTextActive]}>{QR_FRAME_LABELS[f]}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={styles.drawerDoneBtn}
              onPress={() => {
                setQrDrawerVisible(false);
                if (!selectedQrType && qrValue) setSelectedQrType('checkin');
                if (!selectedQrType && contractQrValue) setSelectedQrType('contract');
              }}
            >
              <Text style={styles.drawerDoneText}>Tamam</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7fafc' },
  content: { padding: 24 },
  loading: { padding: 24 },
  title: { fontSize: 22, fontWeight: '700', color: '#1a202c', marginBottom: 24 },
  section: { marginBottom: 20 },
  previewBanner: {
    backgroundColor: '#ebf8ff',
    borderWidth: 1,
    borderColor: '#bee3f8',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  previewBannerTitle: { fontSize: 15, fontWeight: '700', color: '#2c5282', marginBottom: 6 },
  previewBannerSub: { fontSize: 13, color: '#4a5568', lineHeight: 19, marginBottom: 8 },
  previewBannerLine: { fontSize: 14, color: '#1a365d', fontWeight: '600', marginTop: 4 },
  label: { fontSize: 12, color: '#718096', marginBottom: 4 },
  value: { fontSize: 16, color: '#1a202c', fontWeight: '500' },
  qrWrap: { alignItems: 'center', marginTop: 12 },
  qrRoom: { marginTop: 8, fontSize: 16, fontWeight: '600', color: '#1a202c' },
  qrActions: { flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' },
  qrBtn: { padding: 12, backgroundColor: '#ed8936', borderRadius: 8 },
  qrDownloadBtn: { padding: 12, backgroundColor: '#2d3748', borderRadius: 8 },
  qrBtnDisabled: { opacity: 0.7 },
  qrBtnText: { color: '#fff', fontWeight: '600' },
  qrDrawerBtn: {
    padding: 16,
    backgroundColor: '#edf2f7',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  qrDrawerBtnText: { fontSize: 16, fontWeight: '700', color: '#1a365d' },
  qrDrawerBtnHint: { fontSize: 12, color: '#718096', marginTop: 4 },
  drawerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  drawer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
  },
  drawerTitle: { fontSize: 18, fontWeight: '700', color: '#1a202c', marginBottom: 20 },
  drawerLabel: { fontSize: 13, fontWeight: '600', color: '#4a5568', marginBottom: 8, marginTop: 12 },
  drawerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  drawerChip: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
  },
  drawerChipSmall: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#e2e8f0',
  },
  drawerChipActive: { backgroundColor: '#1a365d' },
  drawerChipText: { fontSize: 14, color: '#2d3748', fontWeight: '600' },
  drawerChipTextActive: { color: '#fff' },
  drawerDoneBtn: { marginTop: 24, padding: 16, backgroundColor: '#1a365d', borderRadius: 12, alignItems: 'center' },
  drawerDoneText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  checkOutRoomBtn: { marginTop: 12, padding: 14, backgroundColor: '#e53e3e', borderRadius: 12, alignItems: 'center' },
  checkOutRoomBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  guestMaliyeLine: { fontSize: 15, color: '#1a202c', fontWeight: '600', marginTop: 8 },
  guestMaliyeSub: { fontSize: 13, color: '#64748b', marginTop: 4 },
  manageHintRoom: { fontSize: 13, color: '#64748b', lineHeight: 19, marginTop: 12, marginBottom: 8 },
  stayManageBtn: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#1a365d',
    alignItems: 'center',
  },
  stayManageBtnAlt: { backgroundColor: '#fff', borderWidth: 2, borderColor: '#1a365d' },
  stayManageBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  stayManageBtnTextAlt: { color: '#1a365d', fontWeight: '700', fontSize: 15 },
  previewCalc: {
    fontSize: 13,
    color: '#334155',
    backgroundColor: '#f1f5f9',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  roomMoveList: { maxHeight: 280, marginVertical: 8 },
  roomMoveRow: {
    padding: 12,
    marginBottom: 8,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  roomMoveRowSel: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  roomMoveRowHere: { opacity: 0.55 },
  roomMoveTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  roomMoveMeta: { fontSize: 12, color: '#64748b', marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalDismiss: { ...StyleSheet.absoluteFillObject },
  modalContentWrap: { width: '100%', maxHeight: Dimensions.get('window').height * 0.88 },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: Dimensions.get('window').height * 0.88,
    overflow: 'hidden',
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e2e8f0',
    marginTop: 10,
    marginBottom: 8,
  },
  modalScroll: { flexGrow: 0, flexShrink: 1 },
  modalScrollContent: { paddingHorizontal: 20, paddingBottom: 12 },
  modalContent: { paddingTop: 4 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1a202c', marginBottom: 4 },
  modalSub: { fontSize: 14, color: '#718096', marginBottom: 16 },
  emptyList: { fontSize: 14, color: '#64748b', marginBottom: 16 },
  acceptanceList: { marginBottom: 12 },
  acceptanceItem: { paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  acceptanceName: { fontSize: 16, fontWeight: '600', color: '#1a202c' },
  acceptanceDate: { fontSize: 12, color: '#718096', marginTop: 4 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#4a5568', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 12, fontSize: 16, marginBottom: 12 },
  modalActions: { gap: 10 },
  confirmAssignBtn: { padding: 14, backgroundColor: '#1a365d', borderRadius: 12, alignItems: 'center' },
  btnDisabled: { opacity: 0.7 },
  confirmAssignText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  modalCloseBtn: { padding: 12, alignItems: 'center' },
  modalCloseBtnText: { fontSize: 15, color: '#64748b', fontWeight: '600' },
});
