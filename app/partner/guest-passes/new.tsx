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
  PartnerChip,
  PartnerField,
  PartnerGlassCard,
  PartnerHero,
  PartnerPrimaryButton,
  PartnerSectionTitle,
} from '@/components/breakfastPartner/PartnerUi';
import { usePartnerAuthStore } from '@/stores/partnerAuthStore';
import { createBreakfastGuestPass } from '@/lib/breakfastGuestPass';
import { todayIstanbulDate, tomorrowIstanbulDate, formatPartnerDateTurkish } from '@/lib/breakfastPartner';
import { partnerTheme } from '@/lib/breakfastPartnerTheme';

export default function PartnerGuestPassNewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const partner = usePartnerAuthStore((s) => s.partner);
  const todayIso = todayIstanbulDate();
  const tomorrowIso = tomorrowIstanbulDate();
  const [recordDate, setRecordDate] = useState(todayIso);
  const [guestName, setGuestName] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!guestName.trim()) {
      Alert.alert('Hata', 'Misafir adı zorunludur.');
      return;
    }
    if (!partner?.isPortalActive) {
      Alert.alert('Hesap aktif değil', 'QR oluşturmak için onaylı partner hesabı gerekir.');
      return;
    }

    setSaving(true);
    const result = await createBreakfastGuestPass({
      guestName: guestName.trim(),
      roomNumber: roomNumber.trim() || undefined,
      recordDate,
    });
    setSaving(false);

    if ('error' in result) {
      Alert.alert('Oluşturulamadı', result.error);
      return;
    }

    Alert.alert(
      'QR oluşturuldu',
      `${result.pass.guestName} için kahvaltı QR hazır. Misafiriniz resepsiyonda okutabilir.`,
      [{ text: 'QR göster', onPress: () => router.replace(`/partner/guest-passes/${result.pass.id}`) }]
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <PartnerHero
          title="Yeni misafir QR"
          subtitle="Kişiye özel kahvaltı bileti — resepsiyon okutunca onaylanır"
          onBack={() => router.back()}
        />

        <View style={styles.content}>
          <PartnerGlassCard>
            <PartnerSectionTitle
              icon="calendar-outline"
              title="Kahvaltı tarihi"
              hint="Bugün veya yarın seçilebilir"
            />
            <View style={styles.chipRow}>
              <PartnerChip
                label={`Bugün · ${formatPartnerDateTurkish(todayIso, { weekday: false })}`}
                active={recordDate === todayIso}
                onPress={() => setRecordDate(todayIso)}
              />
              <PartnerChip
                label={`Yarın · ${formatPartnerDateTurkish(tomorrowIso, { weekday: false })}`}
                active={recordDate === tomorrowIso}
                onPress={() => setRecordDate(tomorrowIso)}
              />
            </View>

            <PartnerField
              label="Misafir adı soyadı"
              value={guestName}
              onChangeText={setGuestName}
              placeholder="Örn. Ayşe Yılmaz"
              autoCapitalize="words"
            />

            <PartnerField
              label="Oda numarası (isteğe bağlı)"
              value={roomNumber}
              onChangeText={setRoomNumber}
              placeholder="Örn. 204"
              keyboardType="number-pad"
            />

            <PartnerPrimaryButton label="QR oluştur" onPress={() => void submit()} loading={saving} />
          </PartnerGlassCard>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: partnerTheme.bg },
  content: { paddingHorizontal: 18, paddingTop: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
});
