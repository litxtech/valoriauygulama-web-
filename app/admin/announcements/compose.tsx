import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { AdminOrganizationPicker } from '@/components/admin';
import { TemplateStaffRecipientPicker } from '@/components/admin/TemplateStaffRecipientPicker';
import { AnnouncementRichComposer } from '@/components/announcements/AnnouncementRichComposer';
import { sendBulkToStaff } from '@/lib/notificationService';
import { publishStaffBoardAnnouncement } from '@/lib/staffBoard';
import {
  buildBoardAnnouncementNotificationData,
  draftToAnnouncementMediaPayload,
  emptyAnnouncementMediaDraft,
  isValidWebsiteUrl,
  type AnnouncementMediaDraft,
} from '@/lib/announcementMedia';
import type { BulkStaffTarget } from '@/lib/notifications';

const STAFF_TARGETS: { value: BulkStaffTarget; label: string }[] = [
  { value: 'all_staff', label: 'Tüm personel' },
  { value: 'housekeeping', label: 'Temizlik ekibi' },
  { value: 'technical', label: 'Teknik ekip' },
  { value: 'reception', label: 'Resepsiyon' },
  { value: 'security', label: 'Güvenlik' },
];

const PRIORITIES = [
  { value: 'normal' as const, label: 'Normal' },
  { value: 'high' as const, label: 'Yüksek' },
  { value: 'urgent' as const, label: 'Acil' },
];

export default function AdminAnnouncementComposeScreen() {
  const router = useRouter();
  const { staff } = useAuthStore();
  const { selectedOrganizationId } = useAdminOrgStore();
  const canUseAll = staff?.app_permissions?.super_admin === true || staff?.role === 'admin';
  const orgScopedForPicker =
    canUseAll && selectedOrganizationId !== 'all' ? selectedOrganizationId : staff?.organization_id ?? null;

  const [staffTarget, setStaffTarget] = useState<BulkStaffTarget>('all_staff');
  const [excludedStaffIds, setExcludedStaffIds] = useState<string[]>([]);
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [mediaDraft, setMediaDraft] = useState<AnnouncementMediaDraft>(emptyAnnouncementMediaDraft());
  const [sending, setSending] = useState(false);

  const patchMedia = useCallback((patch: Partial<AnnouncementMediaDraft>) => {
    setMediaDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const toggleExcludedStaff = useCallback((staffId: string) => {
    setExcludedStaffIds((prev) =>
      prev.includes(staffId) ? prev.filter((id) => id !== staffId) : [...prev, staffId]
    );
  }, []);

  const handleSend = async () => {
    const organizationId = canUseAll ? selectedOrganizationId : staff?.organization_id;
    if (canUseAll && organizationId === 'all') {
      Alert.alert('Otel seçin', 'Duyuru göndermek için hedef otel seçmelisiniz.');
      return;
    }
    if (!staff?.id) {
      Alert.alert('Hata', 'Oturum bulunamadı.');
      return;
    }
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle) {
      Alert.alert('Uyarı', 'Başlık girin.');
      return;
    }
    if (!trimmedBody) {
      Alert.alert('Uyarı', 'Duyuru metnini girin.');
      return;
    }
    if (mediaDraft.websiteUrl.trim() && !isValidWebsiteUrl(mediaDraft.websiteUrl)) {
      Alert.alert('Uyarı', 'Geçerli bir web sitesi adresi girin.');
      return;
    }

    const mediaPayload = draftToAnnouncementMediaPayload(mediaDraft);

    setSending(true);
    try {
      const boardResult = await publishStaffBoardAnnouncement({
        title: trimmedTitle,
        content: trimmedBody,
        priority,
        createdByStaffId: staff.id,
        createdByType: staff.role === 'admin' ? 'admin' : 'staff',
        targetType: 'staff',
        organizationId: organizationId === 'all' ? null : organizationId ?? null,
        skipPush: true,
        mediaPayload,
      });

      if (boardResult.error) {
        Alert.alert('Hata', boardResult.error);
        return;
      }

      const notificationData = buildBoardAnnouncementNotificationData({
        announcementId: boardResult.id ?? '',
        title: trimmedTitle,
        body: trimmedBody,
        media: mediaPayload,
      });

      const pushResult = await sendBulkToStaff({
        target: staffTarget,
        organizationId: organizationId === 'all' ? null : organizationId ?? null,
        title: trimmedTitle,
        body: trimmedBody,
        createdByStaffId: staff.id,
        notificationType:
          typeof notificationData.notificationType === 'string'
            ? notificationData.notificationType
            : 'staff_board_announcement',
        data: notificationData,
        excludeStaffIds: staffTarget === 'all_staff' ? excludedStaffIds : undefined,
      });

      if (pushResult.error) {
        Alert.alert('Kısmi gönderim', `Pano duyurusu oluşturuldu ancak bildirim gönderilemedi: ${pushResult.error}`);
        return;
      }

      Alert.alert('Gönderildi', `${pushResult.count} personele zengin duyuru gönderildi.`, [
        { text: 'Tamam', onPress: () => router.back() },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View style={styles.hero}>
          <Ionicons name="megaphone" size={22} color="#7c3aed" />
          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>Zengin duyuru oluştur</Text>
            <Text style={styles.heroSub}>Görsel, video, web sitesi ve modül bağlantısı ekleyin.</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.trackLink} onPress={() => router.push('/admin/engagement')} activeOpacity={0.88}>
          <Ionicons name="analytics-outline" size={18} color="#4338ca" />
          <Text style={styles.trackLinkText}>Kim okudu? Takip ekranı</Text>
          <Ionicons name="chevron-forward" size={16} color="#818cf8" />
        </TouchableOpacity>

        <AdminOrganizationPicker canUseAll={canUseAll} ownOrganizationId={staff?.organization_id} />

        <Text style={styles.label}>Kime gidecek?</Text>
        {STAFF_TARGETS.map((t) => (
          <TouchableOpacity
            key={t.value}
            style={[styles.radio, staffTarget === t.value && styles.radioActive]}
            onPress={() => setStaffTarget(t.value)}
          >
            <Text style={[styles.radioText, staffTarget === t.value && styles.radioTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
        {staffTarget === 'all_staff' ? (
          <TemplateStaffRecipientPicker
            organizationId={orgScopedForPicker}
            excludedStaffIds={excludedStaffIds}
            onToggleExclude={toggleExcludedStaff}
          />
        ) : null}

        <Text style={styles.label}>Öncelik</Text>
        <View style={styles.chipRow}>
          {PRIORITIES.map((p) => (
            <TouchableOpacity
              key={p.value}
              style={[styles.chip, priority === p.value && styles.chipActive]}
              onPress={() => setPriority(p.value)}
            >
              <Text style={[styles.chipText, priority === p.value && styles.chipTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Başlık</Text>
        <TextInput
          style={styles.input}
          placeholder="Örn: Yeni prosedür duyurusu"
          value={title}
          onChangeText={setTitle}
          editable={!sending}
        />

        <Text style={styles.label}>Duyuru metni</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Personelin okuyacağı tam metin…"
          value={body}
          onChangeText={setBody}
          multiline
          numberOfLines={6}
          editable={!sending}
        />

        <AnnouncementRichComposer
          draft={mediaDraft}
          onChange={patchMedia}
          organizationId={orgScopedForPicker}
          disabled={sending}
        />

        <TouchableOpacity
          style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
          onPress={() => void handleSend()}
          disabled={sending}
          activeOpacity={0.88}
        >
          {sending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="paper-plane" size={18} color="#fff" />
              <Text style={styles.sendBtnText}>Duyuruyu gönder</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, paddingBottom: 40 },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f5f3ff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ddd6fe',
  },
  heroText: { flex: 1 },
  heroTitle: { fontSize: 16, fontWeight: '800', color: '#4c1d95' },
  heroSub: { marginTop: 3, fontSize: 12, color: '#6d28d9', lineHeight: 17 },
  trackLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#eef2ff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  trackLinkText: { flex: 1, fontSize: 13, fontWeight: '700', color: '#4338ca' },
  label: { fontSize: 13, fontWeight: '700', color: '#475569', marginTop: 12, marginBottom: 8 },
  radio: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  radioActive: { borderColor: '#7c3aed', backgroundColor: '#f5f3ff' },
  radioText: { fontSize: 14, color: '#64748b', fontWeight: '600' },
  radioTextActive: { color: '#5b21b6' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  chipActive: { borderColor: '#7c3aed', backgroundColor: '#ede9fe' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  chipTextActive: { color: '#5b21b6' },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    backgroundColor: '#fff',
    color: '#0f172a',
  },
  textArea: { minHeight: 120, textAlignVertical: 'top' },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    backgroundColor: '#7c3aed',
    borderRadius: 12,
    paddingVertical: 14,
  },
  sendBtnDisabled: { opacity: 0.7 },
  sendBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
