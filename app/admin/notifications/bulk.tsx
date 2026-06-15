import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { AdminOrganizationPicker } from '@/components/admin';
import { TemplateStaffRecipientPicker } from '@/components/admin/TemplateStaffRecipientPicker';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import {
  sendBulkToGuests,
  sendBulkToStaff,
} from '@/lib/notificationService';
import { publishStaffBoardAnnouncement } from '@/lib/staffBoard';
import type { BulkGuestTarget, BulkStaffTarget, BulkCategory } from '@/lib/notifications';

const GUEST_TARGETS: { value: BulkGuestTarget; label: string }[] = [
  { value: 'all_guests', label: 'Tüm misafirler' },
  { value: 'checkin_today', label: 'Sadece bugün giriş yapanlar' },
  { value: 'checkout_tomorrow', label: 'Sadece yarın çıkış yapacaklar' },
  { value: 'specific_rooms', label: 'Sadece belirli odalar' },
  { value: 'long_stay', label: 'Sadece 3+ gün kalanlar' },
];

const STAFF_TARGETS: { value: BulkStaffTarget; label: string }[] = [
  { value: 'all_staff', label: 'Tüm personel' },
  { value: 'housekeeping', label: 'Temizlik ekibi' },
  { value: 'technical', label: 'Teknik ekip' },
  { value: 'reception', label: 'Resepsiyon' },
  { value: 'security', label: 'Güvenlik' },
];

const CATEGORIES: { value: BulkCategory; label: string }[] = [
  { value: 'info', label: 'Bilgilendirme' },
  { value: 'warning', label: 'Uyarı' },
  { value: 'campaign', label: 'Kampanya' },
];

export default function BulkNotifyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    audience?: 'guest' | 'staff';
    category?: BulkCategory | string;
    title?: string;
    body?: string;
    excludeStaff?: string;
    guestTarget?: BulkGuestTarget | string;
    roomNumbers?: string;
  }>();
  const { staff } = useAuthStore();
  const { selectedOrganizationId } = useAdminOrgStore();
  const canUseAll = staff?.app_permissions?.super_admin === true || staff?.role === 'admin';
  const orgScopedForPicker =
    canUseAll && selectedOrganizationId !== 'all' ? selectedOrganizationId : staff?.organization_id ?? null;
  const [toStaff, setToStaff] = useState(false);
  const [guestTarget, setGuestTarget] = useState<BulkGuestTarget>('all_guests');
  const [staffTarget, setStaffTarget] = useState<BulkStaffTarget>('all_staff');
  const [category, setCategory] = useState<BulkCategory>('info');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [roomNumbers, setRoomNumbers] = useState('');
  const [excludedStaffIds, setExcludedStaffIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const toggleExcludedStaff = useCallback((staffId: string) => {
    setExcludedStaffIds((prev) =>
      prev.includes(staffId) ? prev.filter((id) => id !== staffId) : [...prev, staffId]
    );
  }, []);

  useEffect(() => {
    const audience = params.audience;
    const nextToStaff = audience === 'staff';
    setToStaff(nextToStaff);
    const c = params.category;
    if (c === 'info' || c === 'warning' || c === 'campaign') setCategory(c);
    const t = typeof params.title === 'string' ? params.title : '';
    const b = typeof params.body === 'string' ? params.body : '';
    if (t) setTitle(t);
    if (b) setBody(b);
    const excludeRaw = typeof params.excludeStaff === 'string' ? params.excludeStaff : '';
    if (excludeRaw) {
      setExcludedStaffIds(excludeRaw.split(',').map((s) => s.trim()).filter(Boolean));
    }
    const gt = params.guestTarget;
    const allowedGuest: BulkGuestTarget[] = [
      'all_guests',
      'checkin_today',
      'checkout_tomorrow',
      'specific_rooms',
      'long_stay',
    ];
    if (typeof gt === 'string' && allowedGuest.includes(gt as BulkGuestTarget)) {
      setGuestTarget(gt as BulkGuestTarget);
    }
    const rooms = typeof params.roomNumbers === 'string' ? params.roomNumbers : '';
    if (rooms) setRoomNumbers(rooms);
  }, [
    params.audience,
    params.category,
    params.title,
    params.body,
    params.excludeStaff,
    params.guestTarget,
    params.roomNumbers,
  ]);

  const handleSend = async () => {
    const canUseAll = staff?.app_permissions?.super_admin === true || staff?.role === 'admin';
    const organizationId = canUseAll ? selectedOrganizationId : staff?.organization_id;
    if (canUseAll && organizationId === 'all') {
      Alert.alert('Otel seçin', 'Toplu bildirim için hedef otel seçmelisiniz.');
      return;
    }
    if (!staff?.id) {
      Alert.alert('Hata', 'Oturum bulunamadı.');
      return;
    }
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!toStaff && !trimmedTitle) {
      Alert.alert('Uyarı', 'Başlık girin.');
      return;
    }
    if (toStaff && !trimmedBody) {
      Alert.alert('Uyarı', 'Personele mesaj gövdesi girin.');
      return;
    }
    if (!toStaff && !trimmedBody) {
      Alert.alert('Uyarı', 'Mesaj girin.');
      return;
    }

    setSending(true);
    try {
      if (toStaff) {
        const result = await sendBulkToStaff({
          target: staffTarget,
          organizationId: organizationId === 'all' ? null : organizationId ?? null,
          title: trimmedTitle || 'Toplu Duyuru',
          body: trimmedBody,
          createdByStaffId: staff.id,
          notificationType: 'staff_board_announcement',
          data: { screen: '/staff/board' },
          excludeStaffIds: staffTarget === 'all_staff' ? excludedStaffIds : undefined,
        });
        if (result.error) {
          Alert.alert('Hata', result.error);
        } else {
          const boardPriority =
            category === 'warning' ? 'high' : category === 'campaign' ? 'normal' : 'normal';
          await publishStaffBoardAnnouncement({
            title: trimmedTitle || 'Toplu Duyuru',
            content: trimmedBody,
            priority: boardPriority,
            createdByStaffId: staff.id,
            createdByType: staff.role === 'admin' ? 'admin' : 'staff',
            targetType: 'staff',
            organizationId: organizationId === 'all' ? null : organizationId ?? null,
            skipPush: true,
          });
          Alert.alert('Gönderildi', `${result.count} personele bildirim ve pano duyurusu gönderildi.`, [
            { text: 'Tamam', onPress: () => router.back() },
          ]);
        }
      } else {
        const roomList = guestTarget === 'specific_rooms'
          ? roomNumbers.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
          : undefined;
        const result = await sendBulkToGuests({
          target: guestTarget,
          roomNumbers: roomList,
          organizationId: organizationId === 'all' ? null : organizationId ?? null,
          title: trimmedTitle,
          body: trimmedBody,
          category,
          createdByStaffId: staff.id,
        });
        if (result.error) {
          Alert.alert('Hata', result.error);
        } else {
          Alert.alert('Gönderildi', `${result.count} misafire bildirim gönderildi.`, [
            { text: 'Tamam', onPress: () => router.back() },
          ]);
        }
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <AdminOrganizationPicker
        canUseAll={staff?.app_permissions?.super_admin === true || staff?.role === 'admin'}
        ownOrganizationId={staff?.organization_id}
      />
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Personele gönder</Text>
        <Switch value={toStaff} onValueChange={setToStaff} />
      </View>

      {!toStaff ? (
        <>
          <Text style={styles.label}>Kime gidecek?</Text>
          {GUEST_TARGETS.map((t) => (
            <TouchableOpacity
              key={t.value}
              style={[styles.radio, guestTarget === t.value && styles.radioActive]}
              onPress={() => setGuestTarget(t.value)}
            >
              <Text style={[styles.radioText, guestTarget === t.value && styles.radioTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
          {guestTarget === 'specific_rooms' && (
            <TextInput
              style={styles.input}
              placeholder="Oda numaraları (örn: 101, 102, 105)"
              value={roomNumbers}
              onChangeText={setRoomNumbers}
              autoCapitalize="none"
            />
          )}
          <Text style={styles.label}>Bildirim tipi</Text>
          <View style={styles.chipRow}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c.value}
                style={[styles.chip, category === c.value && styles.chipActive]}
                onPress={() => setCategory(c.value)}
              >
                <Text style={[styles.chipText, category === c.value && styles.chipTextActive]}>
                  {c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.label}>Başlık</Text>
          <TextInput
            style={styles.input}
            placeholder="Örn: Havuz Bakımı"
            value={title}
            onChangeText={setTitle}
          />
        </>
      ) : (
        <>
          <Text style={styles.label}>Kime gidecek?</Text>
          {STAFF_TARGETS.map((t) => (
            <TouchableOpacity
              key={t.value}
              style={[styles.radio, staffTarget === t.value && styles.radioActive]}
              onPress={() => setStaffTarget(t.value)}
            >
              <Text style={[styles.radioText, staffTarget === t.value && styles.radioTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
          {staffTarget === 'all_staff' ? (
            <TemplateStaffRecipientPicker
              organizationId={orgScopedForPicker}
              excludedStaffIds={excludedStaffIds}
              onToggleExclude={toggleExcludedStaff}
            />
          ) : null}
          <Text style={styles.label}>Başlık</Text>
          <TextInput
            style={styles.input}
            placeholder="Örn: Toplu Duyuru"
            value={title}
            onChangeText={setTitle}
          />
        </>
      )}

      <Text style={styles.label}>{toStaff ? 'Mesaj' : 'Mesaj'}</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder={
          toStaff
            ? 'Örn: Yarın saat 09:00\'da toplantı var. Herkesin katılımı zorunludur.'
            : 'Değerli misafirler, mesajınız...'
        }
        value={body}
        onChangeText={setBody}
        multiline
        numberOfLines={5}
      />

      {(title.trim() || (toStaff && body.trim())) && (
        <View style={styles.preview}>
          <Text style={styles.previewTitle}>Önizleme</Text>
          <View style={styles.previewBox}>
            <Text style={styles.previewHead}>{toStaff ? (title.trim() || 'Toplu Duyuru') : title.trim()}</Text>
            <Text style={styles.previewBody}>{body.trim() || '—'}</Text>
          </View>
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary]}
          onPress={handleSend}
          disabled={sending}
        >
          {sending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnPrimaryText}>Gönder</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={() => router.back()} disabled={sending}>
          <Text style={styles.btnSecondaryText}>İptal</Text>
        </TouchableOpacity>
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7fafc' },
  content: { padding: 20, paddingBottom: 40 },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingVertical: 8,
  },
  switchLabel: { fontSize: 16, color: '#2d3748' },
  label: { fontSize: 14, fontWeight: '600', color: '#4a5568', marginBottom: 8, marginTop: 16 },
  radio: {
    padding: 14,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  radioActive: { borderColor: '#b8860b', backgroundColor: '#fffbeb' },
  radioText: { fontSize: 15, color: '#2d3748' },
  radioTextActive: { fontWeight: '600', color: '#1a365d' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#edf2f7',
  },
  chipActive: { backgroundColor: '#b8860b' },
  chipText: { fontSize: 14, color: '#4a5568' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
  },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  preview: { marginTop: 24 },
  previewTitle: { fontSize: 14, fontWeight: '600', color: '#718096', marginBottom: 8 },
  previewBox: {
    backgroundColor: '#edf2f7',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  previewHead: { fontSize: 16, fontWeight: '600', color: '#1a202c', marginBottom: 8 },
  previewBody: { fontSize: 14, color: '#4a5568' },
  actions: { marginTop: 28, gap: 12 },
  btn: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  btnPrimary: { backgroundColor: '#b8860b', borderColor: '#b8860b' },
  btnPrimaryText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  btnSecondaryText: { color: '#4a5568', fontSize: 16 },
});
