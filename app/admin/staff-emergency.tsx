import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AdminOrganizationPicker } from '@/components/admin';
import { adminTheme as T } from '@/constants/adminTheme';
import { useAdminOrganizationQueryScope } from '@/hooks/useAdminOrganizationQueryScope';
import { useAuthStore } from '@/stores/authStore';
import {
  buildStaffEmergencyConfirmBody,
  listEmergencyLocations,
  notifyStaffEmergency,
  type EmergencyLocation,
} from '@/lib/staffEmergency';

export default function AdminStaffEmergencyScreen() {
  const router = useRouter();
  const { staff } = useAuthStore();
  const { orgScoped, canQuery } = useAdminOrganizationQueryScope();
  const [locations, setLocations] = useState<EmergencyLocation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const selectedLocation = useMemo(
    () => locations.find((item) => item.id === selectedId) ?? null,
    [locations, selectedId]
  );

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listEmergencyLocations(true);
    setLoading(false);
    if (res.error) {
      Alert.alert('Hata', res.error);
      return;
    }
    setLocations(res.data);
    if (res.data.length > 0) {
      setSelectedId((prev) => prev ?? res.data[0]?.id ?? null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const onSend = () => {
    if (!staff?.id) {
      Alert.alert('Hata', 'Oturum bulunamadı.');
      return;
    }
    if (!canQuery || !orgScoped) {
      Alert.alert('İşletme seçin', 'Alarm göndermek için üstten bir işletme seçmelisiniz.');
      return;
    }
    if (!selectedLocation) {
      Alert.alert('Toplanma alanı seçin', 'Önce bir toplanma alanı seçin veya lokasyon ekleyin.');
      return;
    }
    const confirmBody = buildStaffEmergencyConfirmBody({
      location: selectedLocation.name,
      note,
      withoutNote: (location) =>
        `"${location}" toplanma alanı tüm personele acil bildirim olarak gidecek. Emin misiniz?`,
      withNote: (location, noteText) =>
        `"${location}" toplanma alanı tüm personele acil bildirim olarak gidecek.\n\nNot: ${noteText}\n\nEmin misiniz?`,
    });
    Alert.alert('Personel alarmı gönder', confirmBody, [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Gönder',
          style: 'destructive',
          onPress: async () => {
            setSending(true);
            const res = await notifyStaffEmergency({
              locationName: selectedLocation.name,
              note,
              createdByStaffId: staff.id,
              createdByName: staff.full_name,
              organizationId: orgScoped,
            });
            setSending(false);
            if (res.error) {
              Alert.alert('Hata', res.error);
              return;
            }
            Alert.alert(
              'Gönderildi',
              `${res.count} personele toplanma alarmı iletildi.`,
              [{ text: 'Tamam' }]
            );
            setNote('');
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AdminOrganizationPicker />

      <View style={styles.hero}>
        <Ionicons name="warning" size={28} color="#dc2626" />
        <Text style={styles.heroTitle}>Personel Toplanma Alarmı</Text>
        <Text style={styles.heroSub}>
          Seçilen toplanma alanı tüm personele push + uygulama içi acil bildirim olarak gider. Ses
          ayarları «Bildirim Sesleri → Acil durum» ile yönetilir.
        </Text>
      </View>

      <Text style={styles.label}>Toplanma alanı</Text>
      {locations.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>
            Henüz toplanma alanı yok. Lokasyon ekleyip tekrar deneyin.
          </Text>
          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() => router.push('/admin/emergency-locations')}
          >
            <Text style={styles.linkBtnText}>Lokasyonları yönet</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.chipsWrap}>
          {locations.map((item) => {
            const active = item.id === selectedId;
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setSelectedId(item.id)}
                disabled={sending}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <TouchableOpacity
        style={styles.manageLink}
        onPress={() => router.push('/admin/emergency-locations')}
      >
        <Ionicons name="settings-outline" size={16} color={T.colors.accent} />
        <Text style={styles.manageLinkText}>Toplanma alanlarını düzenle</Text>
      </TouchableOpacity>

      <Text style={styles.label}>Ek not (isteğe bağlı)</Text>
      <TextInput
        style={styles.noteInput}
        value={note}
        onChangeText={setNote}
        placeholder="Örn: Yangın tatbikatı — asansör kullanmayın"
        placeholderTextColor={T.colors.textMuted}
        multiline
        editable={!sending}
      />

      <TouchableOpacity
        style={[styles.sendBtn, (sending || loading || !selectedLocation || !canQuery) && styles.sendBtnDisabled]}
        onPress={onSend}
        disabled={sending || loading || !selectedLocation || !canQuery}
      >
        <Ionicons name="megaphone-outline" size={20} color="#fff" />
        <Text style={styles.sendBtnText}>
          {sending ? 'Gönderiliyor…' : 'Personele Toplanma Alarmı Gönder'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.colors.surfaceSecondary },
  content: { padding: T.spacing.lg, paddingBottom: 40 },
  hero: {
    backgroundColor: '#fff5f5',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
    padding: 16,
    marginBottom: 20,
    gap: 8,
  },
  heroTitle: { fontSize: 18, fontWeight: '800', color: '#991b1b' },
  heroSub: { fontSize: 13, color: '#7f1d1d', lineHeight: 19 },
  label: { fontSize: 14, fontWeight: '700', color: T.colors.text, marginBottom: 10 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: {
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: 10,
    backgroundColor: T.colors.surface,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  chipActive: { borderColor: '#dc2626', backgroundColor: '#fef2f2' },
  chipText: { color: T.colors.text, fontWeight: '600', fontSize: 14 },
  chipTextActive: { color: '#dc2626' },
  manageLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 18,
    alignSelf: 'flex-start',
  },
  manageLinkText: { color: T.colors.accent, fontWeight: '600', fontSize: 13 },
  noteInput: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: 12,
    backgroundColor: T.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
    color: T.colors.text,
    marginBottom: 20,
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#dc2626',
    borderRadius: 12,
    paddingVertical: 16,
  },
  sendBtnDisabled: { opacity: 0.55 },
  sendBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  emptyBox: {
    backgroundColor: T.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.colors.border,
    padding: 16,
    marginBottom: 12,
  },
  emptyText: { color: T.colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 12 },
  linkBtn: {
    alignSelf: 'flex-start',
    backgroundColor: T.colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  linkBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
