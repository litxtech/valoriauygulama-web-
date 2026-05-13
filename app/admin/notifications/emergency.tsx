import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { sendEmergencyToAllGuests } from '@/lib/notificationService';
import { EMERGENCY_TYPES, EMERGENCY_MESSAGES } from '@/lib/notifications';
import { AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrgStore } from '@/stores/adminOrgStore';

const EMERGENCY_OPTIONS = [
  { type: EMERGENCY_TYPES.fire_drill, label: 'Yangın Tatbikatı' },
  { type: EMERGENCY_TYPES.water_outage, label: 'Su Kesintisi' },
  { type: EMERGENCY_TYPES.power_outage, label: 'Elektrik Kesintisi' },
  { type: EMERGENCY_TYPES.emergency_evacuate, label: 'Acil Tahliye' },
];

export default function EmergencyNotifyScreen() {
  const router = useRouter();
  const { staff } = useAuthStore();
  const { selectedOrganizationId } = useAdminOrgStore();
  const [sending, setSending] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const handleSend = async (notificationType: string) => {
    if (!staff?.id) {
      Alert.alert('Hata', 'Oturum bulunamadı.');
      return;
    }
    const msg = EMERGENCY_MESSAGES[notificationType];
    if (!msg) return;
    const canUseAll = staff?.app_permissions?.super_admin === true || staff?.role === 'admin';
    const organizationId = canUseAll ? selectedOrganizationId : staff.organization_id;
    if (canUseAll && organizationId === 'all') {
      Alert.alert('Otel seçin', 'Acil bildirim için hedef otel seçmelisiniz.');
      return;
    }
    Alert.alert(
      'Acil Bildirim Gönder',
      `"${msg.title}" tüm giriş yapmış misafirlere gönderilecek. Emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Gönder',
          style: 'destructive',
          onPress: async () => {
            setSending(true);
            setSelected(notificationType);
            const result = await sendEmergencyToAllGuests({
              notificationType,
              title: msg.title,
              body: msg.body,
              organizationId: organizationId === 'all' ? null : organizationId ?? null,
              createdByStaffId: staff.id,
            });
            setSending(false);
            setSelected(null);
            if (result.error) {
              Alert.alert('Hata', result.error);
            } else {
              Alert.alert('Gönderildi', `${result.count} misafire acil bildirim iletildi.`, () =>
                router.back()
              );
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AdminOrganizationPicker
        canUseAll={staff?.app_permissions?.super_admin === true || staff?.role === 'admin'}
        ownOrganizationId={staff?.organization_id}
      />
      <Text style={styles.warning}>
        🚨 Bu bildirimler tüm check-in yapmış misafirlere gider ve kapatılamaz.
      </Text>
      {EMERGENCY_OPTIONS.map((opt) => {
        const msg = EMERGENCY_MESSAGES[opt.type];
        const busy = sending && selected === opt.type;
        return (
          <View key={opt.type} style={styles.card}>
            <Text style={styles.cardTitle}>{opt.label}</Text>
            <Text style={styles.cardBody}>{msg?.body ?? ''}</Text>
            <TouchableOpacity
              style={[styles.btn, busy && styles.btnDisabled]}
              onPress={() => handleSend(opt.type)}
              disabled={sending}
            >
              {busy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.btnText}>Gönder</Text>
              )}
            </TouchableOpacity>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7fafc' },
  content: { padding: 20, paddingBottom: 40 },
  warning: {
    fontSize: 14,
    color: '#c53030',
    backgroundColor: '#fff5f5',
    padding: 14,
    borderRadius: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#feb2b2',
  },
  card: {
    backgroundColor: '#fff',
    padding: 18,
    borderRadius: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTitle: { fontSize: 17, fontWeight: '600', color: '#1a202c', marginBottom: 8 },
  cardBody: { fontSize: 14, color: '#4a5568', marginBottom: 14 },
  btn: {
    backgroundColor: '#e53e3e',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: '#fff', fontWeight: '600' },
});
