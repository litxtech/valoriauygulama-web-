import { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  PartnerField,
  PartnerGlassCard,
  PartnerHero,
  PartnerPrimaryButton,
  PartnerSectionTitle,
} from '@/components/breakfastPartner/PartnerUi';
import { usePartnerAuthStore } from '@/stores/partnerAuthStore';
import { partnerCreateCameraRequest } from '@/lib/breakfastPartnerCameraRequests';
import { todayIstanbulDate } from '@/lib/breakfastPartner';
import { partnerTheme } from '@/lib/breakfastPartnerTheme';

const REASON_PRESETS = [
  'Kahvaltı girişi doğrulama',
  'Misafir sayısı kontrolü',
  'Oda numarası teyidi',
  'Diğer',
] as const;

export default function PartnerCameraRequestNewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [requestDate, setRequestDate] = useState(todayIstanbulDate());
  const [timeStart, setTimeStart] = useState('08:00');
  const [timeEnd, setTimeEnd] = useState('');
  const [guestName, setGuestName] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [description, setDescription] = useState('');
  const [requestReason, setRequestReason] = useState(REASON_PRESETS[0]);
  const partner = usePartnerAuthStore((s) => s.partner);
  const [saving, setSaving] = useState(false);

  const effectiveReason = requestReason.trim();

  const submit = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requestDate.trim())) {
      Alert.alert('Hata', 'Tarih YYYY-MM-DD formatında olmalı (ör. 2026-06-21).');
      return;
    }
    if (!/^\d{1,2}:\d{2}$/.test(timeStart.trim())) {
      Alert.alert('Hata', 'Saat HH:MM formatında olmalı (ör. 08:15).');
      return;
    }
    if (timeEnd.trim() && !/^\d{1,2}:\d{2}$/.test(timeEnd.trim())) {
      Alert.alert('Hata', 'Bitiş saati HH:MM formatında olmalı.');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Hata', 'Açıklama zorunludur.');
      return;
    }
    if (!effectiveReason) {
      Alert.alert('Hata', 'Talep nedeni zorunludur.');
      return;
    }

    if (!partner?.isPortalActive) {
      Alert.alert('Hesap aktif değil', 'Kamera talebi oluşturmak için onaylı partner hesabı gerekir.');
      return;
    }

    setSaving(true);
    const { id, error } = await partnerCreateCameraRequest(
      {
        requestDate: requestDate.trim(),
        timeStart: timeStart.trim(),
        timeEnd: timeEnd.trim() || null,
        guestName: guestName.trim() || undefined,
        roomNumber: roomNumber.trim() || undefined,
        description: description.trim(),
        requestReason: effectiveReason,
      },
      {
        partnerUserId: partner.partnerUserId,
        partnerHotelId: partner.hotel.id,
        organizationId: partner.hotel.organization_id,
      }
    );
    setSaving(false);

    if (!id) {
      Alert.alert('Talep oluşturulamadı', error ?? 'Bilinmeyen hata');
      return;
    }
    Alert.alert('Talep oluşturuldu', 'Durum: BEKLİYOR. Sonuçlandığında bildirim alacaksınız.', [
      { text: 'Tamam', onPress: () => router.replace(`/partner/camera-requests/${id}`) },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <PartnerHero
        title="Kamera kaydı talebi"
        subtitle="Geçmiş kahvaltı kaydı için görüntü talep edin"
        onBack={() => router.back()}
      />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <PartnerGlassCard>
          <PartnerSectionTitle title="Talep bilgileri" />
          <PartnerField label="Tarih (YYYY-MM-DD)" value={requestDate} onChangeText={setRequestDate} placeholder="2026-06-21" />
          <PartnerField label="Saat (HH:MM)" value={timeStart} onChangeText={setTimeStart} placeholder="08:15" />
          <PartnerField
            label="Saat aralığı — bitiş (opsiyonel)"
            value={timeEnd}
            onChangeText={setTimeEnd}
            placeholder="09:00"
          />
          <PartnerField label="Misafir adı (opsiyonel)" value={guestName} onChangeText={setGuestName} />
          <PartnerField label="Oda numarası (opsiyonel)" value={roomNumber} onChangeText={setRoomNumber} keyboardType="number-pad" />
          <PartnerField label="Talep nedeni" value={requestReason} onChangeText={setRequestReason} placeholder={REASON_PRESETS[0]} />
          <PartnerField
            label="Açıklama"
            value={description}
            onChangeText={setDescription}
            multiline
            placeholder="201 numaralı oda misafirinin kahvaltıya giriş yaptığı kontrol edilmek isteniyor."
          />
        </PartnerGlassCard>
        <PartnerPrimaryButton label="Talebi gönder" loading={saving} onPress={() => void submit()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: partnerTheme.bg },
  scroll: { paddingHorizontal: 18, paddingTop: 8, gap: 14 },
});
