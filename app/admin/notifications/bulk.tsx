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
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { AdminOrganizationPicker } from '@/components/admin';
import { TemplateStaffRecipientPicker } from '@/components/admin/TemplateStaffRecipientPicker';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import {
  sendBulkToGuests,
  sendBulkToStaff,
} from '@/lib/notificationService';
import {
  STAFF_NOTIFICATION_DESTINATIONS,
  buildStaffNotificationActionData,
  isDirectVideoUrl,
} from '@/lib/staffNotificationActions';
import { draftFromBulkForm, saveStaffIntroTemplate } from '@/lib/staffIntroNotificationTemplates';
import {
  isStaffIntroUploadedVideo,
  pickAndUploadStaffIntroVideo,
} from '@/lib/staffIntroNotificationVideo';
import { publishStaffBoardAnnouncement } from '@/lib/staffBoard';
import {
  draftToAnnouncementMediaPayload,
  emptyAnnouncementMediaDraft,
  type AnnouncementMediaDraft,
} from '@/lib/announcementMedia';
import { AnnouncementRichComposer } from '@/components/announcements/AnnouncementRichComposer';
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
    actionEnabled?: string;
    actionDestination?: string;
    actionLabel?: string;
    actionVideoUrl?: string;
    actionVideoTitle?: string;
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
  const [actionEnabled, setActionEnabled] = useState(false);
  const [actionDestinationId, setActionDestinationId] = useState<string | null>(null);
  const [actionLabel, setActionLabel] = useState('');
  const [actionVideoUrl, setActionVideoUrl] = useState('');
  const [actionVideoTitle, setActionVideoTitle] = useState('');
  const [mediaDraft, setMediaDraft] = useState<AnnouncementMediaDraft>(emptyAnnouncementMediaDraft());
  const [sending, setSending] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateSaveLabel, setTemplateSaveLabel] = useState('');
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoUploadStep, setVideoUploadStep] = useState('');

  const resolveOrganizationId = useCallback((): string | null => {
    const canUseAllLocal = staff?.app_permissions?.super_admin === true || staff?.role === 'admin';
    const organizationId = canUseAllLocal ? selectedOrganizationId : staff?.organization_id;
    if (!organizationId || organizationId === 'all') return null;
    return organizationId;
  }, [staff?.app_permissions?.super_admin, staff?.role, staff?.organization_id, selectedOrganizationId]);

  const handlePickIntroVideo = async () => {
    const organizationId = resolveOrganizationId();
    if (!organizationId) {
      Alert.alert('Otel seçin', 'Video yüklemek için üstten tek bir işletme seçin.');
      return;
    }
    setVideoUploading(true);
    setVideoUploadStep('Galeri açılıyor…');
    const result = await pickAndUploadStaffIntroVideo({
      organizationId,
      onProgress: setVideoUploadStep,
    });
    setVideoUploading(false);
    setVideoUploadStep('');
    if (result.cancelled) return;
    if (result.error) {
      Alert.alert('Yüklenemedi', result.error);
      return;
    }
    if (result.publicUrl) {
      setActionVideoUrl(result.publicUrl);
      if (!actionVideoTitle.trim()) setActionVideoTitle('Tanıtım videosu');
    }
  };

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

    const actionOn = params.actionEnabled === '1' || params.actionEnabled === 'true';
    if (actionOn) {
      setActionEnabled(true);
      const dest = typeof params.actionDestination === 'string' ? params.actionDestination.trim() : '';
      if (dest) setActionDestinationId(dest);
      if (typeof params.actionLabel === 'string' && params.actionLabel.trim()) {
        setActionLabel(params.actionLabel);
      }
      if (typeof params.actionVideoUrl === 'string' && params.actionVideoUrl.trim()) {
        setActionVideoUrl(params.actionVideoUrl);
      }
      if (typeof params.actionVideoTitle === 'string' && params.actionVideoTitle.trim()) {
        setActionVideoTitle(params.actionVideoTitle);
      }
    }
  }, [
    params.audience,
    params.category,
    params.title,
    params.body,
    params.excludeStaff,
    params.guestTarget,
    params.roomNumbers,
    params.actionEnabled,
    params.actionDestination,
    params.actionLabel,
    params.actionVideoUrl,
    params.actionVideoTitle,
  ]);

  const handleSaveTemplate = async () => {
    const canUseAll = staff?.app_permissions?.super_admin === true || staff?.role === 'admin';
    const organizationId = canUseAll ? selectedOrganizationId : staff?.organization_id;
    if (canUseAll && organizationId === 'all') {
      Alert.alert('Otel seçin', 'Şablon kaydetmek için üstten tek bir işletme seçin.');
      return;
    }
    if (!staff?.id || !organizationId || organizationId === 'all') {
      Alert.alert('Hata', 'Oturum veya işletme bulunamadı.');
      return;
    }
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedBody) {
      Alert.alert('Uyarı', 'Şablon için mesaj gövdesi girin.');
      return;
    }
    const label = templateSaveLabel.trim() || trimmedTitle || 'Personel eğitimi şablonu';
    setSavingTemplate(true);
    const result = await saveStaffIntroTemplate({
      organizationId,
      staffId: staff.id,
      draft: draftFromBulkForm({
        label,
        category,
        title: trimmedTitle || label,
        body: trimmedBody,
        actionEnabled,
        actionDestinationId,
        actionLabel,
        actionVideoUrl,
        actionVideoTitle,
      }),
    });
    setSavingTemplate(false);
    if (result.error) {
      Alert.alert('Kaydedilemedi', result.error);
      return;
    }
    setShowSaveTemplate(false);
    setTemplateSaveLabel('');
    Alert.alert('Kaydedildi', `«${label}» şablonu bu işletme için kaydedildi. Bildirim şablonları → Personel eğitimi sekmesinden kullanabilirsiniz.`);
  };

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
    if (toStaff && actionEnabled && !actionDestinationId && !actionVideoUrl.trim()) {
      Alert.alert('Uyarı', 'Ek aksiyon açıkken hedef ekran veya tanıtım videosu seçin.');
      return;
    }
    if (!toStaff && !trimmedBody) {
      Alert.alert('Uyarı', 'Mesaj girin.');
      return;
    }

    setSending(true);
    try {
      if (toStaff) {
        const actionPack = actionEnabled
          ? buildStaffNotificationActionData({
              destinationId: actionDestinationId,
              actionLabel: actionLabel.trim() || undefined,
              videoUrl: actionVideoUrl.trim() || undefined,
              videoTitle: actionVideoTitle.trim() || undefined,
              introTitle: trimmedTitle || 'Toplu Duyuru',
              introBody: trimmedBody,
            })
          : buildStaffNotificationActionData({
              introTitle: trimmedTitle || 'Toplu Duyuru',
              introBody: trimmedBody,
            });

        const result = await sendBulkToStaff({
          target: staffTarget,
          organizationId: organizationId === 'all' ? null : organizationId ?? null,
          title: trimmedTitle || 'Toplu Duyuru',
          body: trimmedBody,
          createdByStaffId: staff.id,
          notificationType: actionPack.notificationType,
          data: actionPack.data,
          excludeStaffIds: staffTarget === 'all_staff' ? excludedStaffIds : undefined,
        });
        if (result.error) {
          Alert.alert('Hata', result.error);
        } else {
          const boardPriority =
            category === 'warning' ? 'high' : category === 'campaign' ? 'normal' : 'normal';
          const mediaPayload = draftToAnnouncementMediaPayload({
            ...mediaDraft,
            videoUrl: actionEnabled ? actionVideoUrl : mediaDraft.videoUrl,
            videoTitle: actionEnabled ? actionVideoTitle : mediaDraft.videoTitle,
            destinationId: actionEnabled ? actionDestinationId : mediaDraft.destinationId,
            actionLabel: actionEnabled ? actionLabel : mediaDraft.actionLabel,
          });
          await publishStaffBoardAnnouncement({
            title: trimmedTitle || 'Toplu Duyuru',
            content: trimmedBody,
            priority: boardPriority,
            createdByStaffId: staff.id,
            createdByType: staff.role === 'admin' ? 'admin' : 'staff',
            targetType: 'staff',
            organizationId: organizationId === 'all' ? null : organizationId ?? null,
            skipPush: true,
            mediaPayload,
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
      {toStaff ? (
        <TouchableOpacity
          style={styles.composeLink}
          onPress={() => router.push('/admin/announcements/compose')}
          activeOpacity={0.88}
        >
          <Ionicons name="sparkles-outline" size={20} color="#7c3aed" />
          <View style={styles.composeLinkText}>
            <Text style={styles.composeLinkTitle}>Zengin duyuru oluştur</Text>
            <Text style={styles.composeLinkSub}>Görsel, video, web sitesi ve modül bağlantısı</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#a78bfa" />
        </TouchableOpacity>
      ) : null}
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

      {toStaff ? (
        <>
          <View style={styles.switchRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.switchLabel}>Ek aksiyon (modül / video)</Text>
              <Text style={styles.switchHint}>
                İsteğe bağlı: personel bildirime dokununca tanıtım videosu izleyebilir veya seçtiğiniz ekrana gidebilir.
              </Text>
            </View>
            <Switch value={actionEnabled} onValueChange={setActionEnabled} />
          </View>

          {actionEnabled ? (
            <>
              <Text style={styles.label}>Hedef ekran (opsiyonel)</Text>
              <Text style={styles.fieldHint}>
                Örn. otel kullanım kayıtları — personel bildirimde &quot;Modülü aç&quot; ile bu sekmeye gider.
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.destRow}>
                <TouchableOpacity
                  style={[styles.destChip, !actionDestinationId && styles.destChipActive]}
                  onPress={() => setActionDestinationId(null)}
                >
                  <Text style={[styles.destChipText, !actionDestinationId && styles.destChipTextActive]}>Yok</Text>
                </TouchableOpacity>
                {STAFF_NOTIFICATION_DESTINATIONS.map((dest) => (
                  <TouchableOpacity
                    key={dest.id}
                    style={[styles.destChip, actionDestinationId === dest.id && styles.destChipActive]}
                    onPress={() => setActionDestinationId(dest.id)}
                  >
                    <Text
                      style={[styles.destChipText, actionDestinationId === dest.id && styles.destChipTextActive]}
                      numberOfLines={1}
                    >
                      {dest.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.label}>Buton metni (opsiyonel)</Text>
              <TextInput
                style={styles.input}
                placeholder="Örn: Otel kullanım kayıtlarını aç"
                value={actionLabel}
                onChangeText={setActionLabel}
              />

              <Text style={styles.label}>Tanıtım videosu (opsiyonel)</Text>
              <Text style={styles.fieldHint}>
                Galeriden yükleyin veya YouTube, Vimeo, doğrudan .mp4 bağlantısı yapıştırın.
              </Text>

              <TouchableOpacity
                style={[styles.videoUploadBtn, videoUploading && styles.videoUploadBtnDisabled]}
                onPress={() => void handlePickIntroVideo()}
                disabled={videoUploading || sending || savingTemplate}
                activeOpacity={0.88}
              >
                {videoUploading ? (
                  <>
                    <ActivityIndicator color="#92400e" />
                    <Text style={styles.videoUploadBtnText}>{videoUploadStep || 'Yükleniyor…'}</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={20} color="#92400e" />
                    <Text style={styles.videoUploadBtnText}>Galeriden video yükle</Text>
                  </>
                )}
              </TouchableOpacity>

              {actionVideoUrl.trim() ? (
                <View style={styles.videoStatusRow}>
                  <View style={styles.videoStatusChip}>
                    <Ionicons
                      name={isStaffIntroUploadedVideo(actionVideoUrl) ? 'checkmark-circle' : 'link-outline'}
                      size={16}
                      color={isStaffIntroUploadedVideo(actionVideoUrl) ? '#15803d' : '#1d4ed8'}
                    />
                    <Text style={styles.videoStatusText} numberOfLines={1}>
                      {isStaffIntroUploadedVideo(actionVideoUrl)
                        ? 'Video yüklendi'
                        : isDirectVideoUrl(actionVideoUrl)
                          ? 'Video bağlantısı eklendi'
                          : 'Harici video bağlantısı'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.videoClearBtn}
                    onPress={() => setActionVideoUrl('')}
                    disabled={videoUploading}
                  >
                    <Text style={styles.videoClearBtnText}>Kaldır</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <Text style={styles.subLabel}>veya video bağlantısı</Text>
              <TextInput
                style={styles.input}
                placeholder="https://..."
                value={actionVideoUrl}
                onChangeText={setActionVideoUrl}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!videoUploading}
              />
              <Text style={styles.label}>Video başlığı (opsiyonel)</Text>
              <TextInput
                style={styles.input}
                placeholder="Örn: Kullanım kaydı nasıl girilir?"
                value={actionVideoTitle}
                onChangeText={setActionVideoTitle}
              />
              {actionEnabled && !actionDestinationId && !actionVideoUrl.trim() ? (
                <Text style={styles.warnText}>En az bir hedef ekran veya video URL girin.</Text>
              ) : null}
            </>
          ) : null}

          <AnnouncementRichComposer
            draft={mediaDraft}
            onChange={(patch) => setMediaDraft((prev) => ({ ...prev, ...patch }))}
            organizationId={orgScopedForPicker}
            disabled={sending || savingTemplate}
            sections={['images', 'website']}
          />
        </>
      ) : null}

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
        {toStaff ? (
          <TouchableOpacity
            style={[styles.btn, styles.btnOutline]}
            onPress={() => {
              setShowSaveTemplate((v) => !v);
              if (!templateSaveLabel && title.trim()) setTemplateSaveLabel(title.trim());
            }}
            disabled={sending || savingTemplate}
          >
            <Text style={styles.btnOutlineText}>
              {showSaveTemplate ? 'Şablon kaydını gizle' : 'Bu formu şablon olarak kaydet'}
            </Text>
          </TouchableOpacity>
        ) : null}

        {toStaff && showSaveTemplate ? (
          <View style={styles.saveTemplateBox}>
            <Text style={styles.label}>Şablon adı</Text>
            <TextInput
              style={styles.input}
              placeholder="Örn: Kullanım kaydı eğitimi"
              value={templateSaveLabel}
              onChangeText={setTemplateSaveLabel}
            />
            <TouchableOpacity
              style={[styles.btn, styles.btnSecondary]}
              onPress={() => void handleSaveTemplate()}
              disabled={savingTemplate}
            >
              {savingTemplate ? (
                <ActivityIndicator color="#4a5568" />
              ) : (
                <Text style={styles.btnSecondaryText}>Şablonu kaydet</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}

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
  composeLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f5f3ff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ddd6fe',
  },
  composeLinkText: { flex: 1 },
  composeLinkTitle: { fontSize: 14, fontWeight: '800', color: '#5b21b6' },
  composeLinkSub: { fontSize: 12, color: '#7c3aed', marginTop: 2 },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingVertical: 8,
  },
  switchLabel: { fontSize: 16, color: '#2d3748', fontWeight: '600' },
  switchHint: { fontSize: 12, color: '#718096', marginTop: 4, lineHeight: 17 },
  fieldHint: { fontSize: 12, color: '#718096', marginBottom: 8, lineHeight: 17 },
  destRow: { gap: 8, paddingBottom: 8 },
  destChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#edf2f7',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    maxWidth: 220,
  },
  destChipActive: { backgroundColor: '#fffbeb', borderColor: '#b8860b' },
  destChipText: { fontSize: 13, color: '#4a5568', fontWeight: '600' },
  destChipTextActive: { color: '#1a365d' },
  warnText: { fontSize: 13, color: '#b45309', marginTop: 8 },
  subLabel: { fontSize: 13, fontWeight: '600', color: '#718096', marginTop: 12, marginBottom: 8 },
  videoUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fcd34d',
    marginBottom: 10,
  },
  videoUploadBtnDisabled: { opacity: 0.75 },
  videoUploadBtnText: { fontSize: 15, fontWeight: '700', color: '#92400e', flexShrink: 1 },
  videoStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  videoStatusChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  videoStatusText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#166534' },
  videoClearBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  videoClearBtnText: { fontSize: 13, fontWeight: '700', color: '#64748b' },
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
  btnOutline: { borderColor: '#b8860b', backgroundColor: '#fffbeb' },
  btnOutlineText: { color: '#92400e', fontWeight: '700', fontSize: 15 },
  btnSecondary: { backgroundColor: '#edf2f7' },
  btnSecondaryText: { color: '#4a5568', fontWeight: '600', fontSize: 16 },
  saveTemplateBox: {
    gap: 8,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
});
