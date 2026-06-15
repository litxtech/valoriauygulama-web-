import { useState, useMemo } from 'react';
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
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { sendEmergencyToAllGuests } from '@/lib/notificationService';
import {
  emergencyNotificationCopy,
  emergencyOptionLabel,
  EMERGENCY_OPTION_TYPES,
  type EmergencyNotifType,
} from '@/lib/emergencyNotificationsI18n';
import { AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrgStore } from '@/stores/adminOrgStore';

export default function EmergencyNotifyScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { staff } = useAuthStore();
  const { selectedOrganizationId } = useAdminOrgStore();
  const [sending, setSending] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const previewLang = (i18n.language || 'tr').split('-')[0];

  const options = useMemo(
    () =>
      EMERGENCY_OPTION_TYPES.map((type) => ({
        type,
        label: emergencyOptionLabel(type, previewLang),
        preview: emergencyNotificationCopy(type, previewLang),
      })),
    [previewLang]
  );

  const handleSend = async (notificationType: EmergencyNotifType) => {
    if (!staff?.id) {
      Alert.alert(t('error'), t('loginRequired'));
      return;
    }
    const preview = emergencyNotificationCopy(notificationType, previewLang);
    const canUseAll = staff?.app_permissions?.super_admin === true || staff?.role === 'admin';
    const organizationId = canUseAll ? selectedOrganizationId : staff.organization_id;
    if (canUseAll && organizationId === 'all') {
      Alert.alert(t('error'), t('adminEmergencySelectHotel'));
      return;
    }
    Alert.alert(
      t('adminEmergencyConfirmTitle'),
      t('adminEmergencyConfirmBody', { title: preview.title }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('emergencySendYes'),
          style: 'destructive',
          onPress: async () => {
            setSending(true);
            setSelected(notificationType);
            const result = await sendEmergencyToAllGuests({
              notificationType,
              organizationId: organizationId === 'all' ? null : organizationId ?? null,
              createdByStaffId: staff.id,
            });
            setSending(false);
            setSelected(null);
            if (result.error) {
              Alert.alert(t('error'), result.error);
            } else {
              Alert.alert(
                t('adminEmergencyBulkSentTitle'),
                t('adminEmergencyBulkSentBody', { count: result.count }),
                () => router.back()
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
      <Text style={styles.warning}>{t('adminEmergencyWarning')}</Text>
      <Text style={styles.hint}>{t('adminEmergencyLangHint')}</Text>
      {options.map((opt) => {
        const busy = sending && selected === opt.type;
        return (
          <View key={opt.type} style={styles.card}>
            <Text style={styles.cardTitle}>{opt.label}</Text>
            <Text style={styles.cardPreviewLabel}>{t('adminEmergencyPreviewLabel')}</Text>
            <Text style={styles.cardBody}>{opt.preview.body}</Text>
            <TouchableOpacity
              style={[styles.btn, busy && styles.btnDisabled]}
              onPress={() => handleSend(opt.type)}
              disabled={sending}
            >
              {busy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.btnText}>{t('emergencySendBtn')}</Text>
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
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#feb2b2',
  },
  hint: {
    fontSize: 13,
    color: '#4a5568',
    marginBottom: 20,
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#fff',
    padding: 18,
    borderRadius: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTitle: { fontSize: 17, fontWeight: '600', color: '#1a202c', marginBottom: 6 },
  cardPreviewLabel: { fontSize: 12, color: '#718096', marginBottom: 4 },
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
