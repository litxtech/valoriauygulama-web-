import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { resolveFeedPickedMediaUri } from '@/lib/feedPostMediaPicker';
import { buildEarlyVideoPreview } from '@/lib/chatVideoThumbnail';
import {
  MAX_HOTEL_ISSUE_ARCHIVE_MEDIA,
  hotelIssueArchiveMediaCameraOptions,
  hotelIssueArchiveMediaGalleryOptions,
  uploadHotelIssueArchiveMediaBatch,
} from '@/lib/hotelIssueArchiveMedia';
import {
  createHotelIssueArchive,
  notifyHotelIssueArchiveCreated,
  HOTEL_ISSUE_ARCHIVE_CATEGORIES,
  type HotelIssueArchiveCategory,
} from '@/lib/hotelIssueArchive';

type PendingMedia = { uri: string; type: 'image' | 'video'; posterUri?: string | null };

function Section({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIconWrap}>
          <Ionicons name={icon} size={18} color={theme.colors.primary} />
        </View>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

export default function HotelIssueArchiveNew() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const orgId = staff?.organization_id;
  const staffId = staff?.id;

  const [category, setCategory] = useState<HotelIssueArchiveCategory>('risk');
  const [roomNumber, setRoomNumber] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [note, setNote] = useState('');
  const [media, setMedia] = useState<PendingMedia[]>([]);
  const [pickingMedia, setPickingMedia] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadStep, setUploadStep] = useState<string | null>(null);

  const pickMedia = useCallback(
    async (fromCamera: boolean) => {
      if (pickingMedia) return;
      if (media.length >= MAX_HOTEL_ISSUE_ARCHIVE_MEDIA) {
        Alert.alert('Limit', `En fazla ${MAX_HOTEL_ISSUE_ARCHIVE_MEDIA} medya ekleyebilirsiniz.`);
        return;
      }
      setPickingMedia(true);
      try {
        const granted = fromCamera
          ? await ensureCameraPermission({
              title: 'Kamera izni',
              message: 'Fotoğraf veya video çekmek için kamera izni gerekli.',
              settingsMessage: 'Kamera iznini ayarlardan açın.',
            })
          : await ensureMediaLibraryPermission({
              title: 'Galeri izni',
              message: 'Medya eklemek için galeri izni gerekli.',
              settingsMessage: 'Galeri iznini ayarlardan açın.',
            });
        if (!granted) return;

        const result = fromCamera
          ? await ImagePicker.launchCameraAsync(hotelIssueArchiveMediaCameraOptions)
          : await ImagePicker.launchImageLibraryAsync({
              ...hotelIssueArchiveMediaGalleryOptions,
              selectionLimit: MAX_HOTEL_ISSUE_ARCHIVE_MEDIA - media.length,
            });
        if (result.canceled || !result.assets?.length) return;

        const added: PendingMedia[] = [];
        for (const asset of result.assets) {
          if (media.length + added.length >= MAX_HOTEL_ISSUE_ARCHIVE_MEDIA) break;
          const resolved = await resolveFeedPickedMediaUri(asset);
          if (resolved.uri) {
            let posterUri: string | null = null;
            if (resolved.type === 'video') {
              const early = await buildEarlyVideoPreview(resolved.uri);
              posterUri = early.posterUri;
            }
            added.push({ uri: resolved.uri, type: resolved.type, posterUri });
          }
        }
        if (added.length) setMedia((m) => [...m, ...added]);
      } catch (e) {
        Alert.alert('Hata', (e as Error)?.message ?? 'Medya eklenemedi.');
      } finally {
        setPickingMedia(false);
      }
    },
    [media.length, pickingMedia]
  );

  const canSubmit = useMemo(
    () => note.trim().length > 0 && !!orgId && !!staffId && !saving,
    [note, orgId, staffId, saving]
  );

  const submit = async () => {
    if (!orgId || !staffId) {
      Alert.alert('Hata', 'Oturum bulunamadı. Lütfen tekrar giriş yapın.');
      return;
    }
    if (!note.trim()) {
      Alert.alert('Hata', 'Lütfen bir not yazın.');
      return;
    }

    setSaving(true);
    try {
      let uploaded: Array<{
        publicUrl: string;
        storagePath: string;
        mediaType: 'image' | 'video';
        thumbnailUrl: string | null;
        sortOrder: number;
      }> = [];

      if (media.length > 0) {
        setUploadStep('Medyalar yükleniyor…');
        const batch = await uploadHotelIssueArchiveMediaBatch({
          items: media.map((m) => ({ uri: m.uri, kind: m.type })),
          organizationId: orgId,
          onProgress: (done, total, step) => setUploadStep(`${done}/${total} · ${step}`),
        });
        uploaded = batch.map((u, i) => ({
          publicUrl: u.publicUrl,
          storagePath: u.path,
          mediaType: u.mediaType,
          thumbnailUrl: u.thumbnailUrl,
          sortOrder: i,
        }));
      }

      setUploadStep('Kayıt oluşturuluyor…');
      const { data, error } = await createHotelIssueArchive(orgId, staffId, {
        category,
        note,
        locationLabel,
        roomNumber,
        media: uploaded,
      });
      if (error || !data) throw new Error(error?.message ?? 'Kayıt oluşturulamadı');

      void notifyHotelIssueArchiveCreated({
        organizationId: orgId,
        createdByStaffId: staffId,
        creatorName: staff?.full_name,
        record: {
          id: data.id,
          record_no: data.record_no,
          category,
          note,
          location_label: locationLabel,
          room_number: roomNumber,
        },
      }).catch(() => {});

      Alert.alert('Kaydedildi', `Kayıt oluşturuldu${data.record_no ? ` (${data.record_no})` : ''}. Personele bildirim gitti.`, [
        { text: 'Tamam', onPress: () => router.replace(`/staff/hotel-issue-archive/${data.id}` as never) },
      ]);
    } catch (e) {
      Alert.alert('Hata', (e as Error).message ?? 'Kayıt oluşturulamadı');
    } finally {
      setSaving(false);
      setUploadStep(null);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="archive" size={28} color={theme.colors.primary} />
          </View>
          <Text style={styles.heroTitle}>Otel kaydı oluştur</Text>
          <Text style={styles.heroHint}>
            Sorun, risk, düzenleme veya herhangi bir durumu foto/video ile arşivleyin. Kaydettiğinizde diğer personele bildirim gider.
          </Text>
        </View>

        <Section title="Kayıt türü" subtitle="Ne tür bir durum?" icon="pricetag-outline">
          <View style={styles.chipGrid}>
            {HOTEL_ISSUE_ARCHIVE_CATEGORIES.map((c) => {
              const active = category === c.value;
              return (
                <TouchableOpacity
                  key={c.value}
                  style={[styles.catChip, active && { borderColor: c.color, backgroundColor: `${c.color}12` }]}
                  onPress={() => setCategory(c.value)}
                  activeOpacity={0.85}
                >
                  <Ionicons name={c.icon as never} size={16} color={active ? c.color : theme.colors.textSecondary} />
                  <Text style={[styles.catChipText, active && { color: c.color, fontWeight: '700' }]}>{c.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Section>

        <Section title="Konum" subtitle="Oda veya alan — isteğe bağlı" icon="location-outline">
          <TextInput
            style={styles.input}
            value={roomNumber}
            onChangeText={setRoomNumber}
            placeholder="Oda numarası (örn. 205)"
            placeholderTextColor={theme.colors.textMuted}
          />
          <TextInput
            style={[styles.input, styles.inputSpaced]}
            value={locationLabel}
            onChangeText={setLocationLabel}
            placeholder="Alan (örn. Depo, Lobi, Çamaşırhane)"
            placeholderTextColor={theme.colors.textMuted}
          />
        </Section>

        <Section title="Not" subtitle="Zorunlu — ne gördünüz / ne yaptınız?" icon="create-outline">
          <TextInput
            style={[styles.input, styles.multiline]}
            value={note}
            onChangeText={setNote}
            multiline
            textAlignVertical="top"
            placeholder="Örn. Banyo vanası sızıntı yapıyor / Depo düzenlendi, raflar etiketlendi…"
            placeholderTextColor={theme.colors.textMuted}
          />
        </Section>

        <Section
          title="Fotoğraf / video"
          subtitle={`İsteğe bağlı — en fazla ${MAX_HOTEL_ISSUE_ARCHIVE_MEDIA} medya, hızlı paralel yükleme`}
          icon="images-outline"
        >
          <View style={styles.mediaActions}>
            <TouchableOpacity
              style={[styles.mediaBtn, styles.mediaBtnPrimary, pickingMedia && styles.mediaBtnDisabled]}
              onPress={() => pickMedia(true)}
              disabled={pickingMedia}
              activeOpacity={0.85}
            >
              {pickingMedia ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="camera" size={20} color="#fff" />
              )}
              <Text style={styles.mediaBtnPrimaryText}>Kamera</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.mediaBtn, pickingMedia && styles.mediaBtnDisabled]}
              onPress={() => pickMedia(false)}
              disabled={pickingMedia}
              activeOpacity={0.85}
            >
              {pickingMedia ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <Ionicons name="images-outline" size={20} color={theme.colors.primary} />
              )}
              <Text style={styles.mediaBtnText}>Galeri</Text>
            </TouchableOpacity>
          </View>

          {media.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mediaStrip}>
              {media.map((m, idx) => (
                <View key={`${m.uri}-${idx}`} style={styles.mediaThumb}>
                  <Image source={{ uri: m.posterUri ?? m.uri }} style={styles.mediaImg} />
                  {m.type === 'video' ? (
                    <View style={styles.videoPlayDot} pointerEvents="none">
                      <Ionicons name="play" size={14} color="#fff" />
                    </View>
                  ) : null}
                  <TouchableOpacity
                    style={styles.mediaRemove}
                    onPress={() => setMedia((arr) => arr.filter((_, i) => i !== idx))}
                  >
                    <Ionicons name="close-circle" size={22} color="#dc2626" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.mediaEmpty}>
              <Ionicons name="cloud-upload-outline" size={26} color={theme.colors.textMuted} />
              <Text style={styles.mediaEmptyText}>Durumu fotoğraf veya video ile belgeleyin</Text>
            </View>
          )}
        </Section>

        {uploadStep ? (
          <View style={styles.uploadBanner}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={styles.uploadStepText}>{uploadStep}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.saveBtn, !canSubmit && styles.saveBtnDisabled]}
          onPress={submit}
          disabled={!canSubmit}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={22} color="#fff" />
              <Text style={styles.saveBtnText}>Kaydet ve bildir</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  scroll: { padding: 16, paddingBottom: 48 },
  hero: { alignItems: 'center', paddingVertical: 8, paddingHorizontal: 8, marginBottom: 8 },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: `${theme.colors.primary}18`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroTitle: { fontSize: 22, fontWeight: '800', color: theme.colors.text, textAlign: 'center' },
  heroHint: { marginTop: 8, fontSize: 14, lineHeight: 21, color: theme.colors.textMuted, textAlign: 'center', maxWidth: 340 },
  section: {
    backgroundColor: theme.colors.background,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  sectionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: `${theme.colors.primary}14`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderText: { flex: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  sectionSubtitle: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2, lineHeight: 18 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  catChipText: { fontSize: 12, color: theme.colors.textSecondary },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  inputSpaced: { marginTop: 10 },
  multiline: { minHeight: 96 },
  mediaActions: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  mediaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  mediaBtnPrimary: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  mediaBtnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  mediaBtnText: { color: theme.colors.primary, fontWeight: '700', fontSize: 15 },
  mediaBtnDisabled: { opacity: 0.6 },
  mediaStrip: { marginTop: 4 },
  mediaThumb: { width: 92, height: 92, marginRight: 10, borderRadius: 12, overflow: 'hidden', backgroundColor: theme.colors.backgroundSecondary },
  mediaImg: { width: '100%', height: '100%' },
  videoPlayDot: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaRemove: { position: 'absolute', top: 2, right: 2 },
  mediaEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  mediaEmptyText: { fontSize: 13, color: theme.colors.textMuted, textAlign: 'center', paddingHorizontal: 16 },
  uploadBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 12,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: `${theme.colors.primary}10`,
  },
  uploadStepText: { fontSize: 14, color: theme.colors.textSecondary },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    ...theme.shadows.md,
  },
  saveBtnDisabled: { opacity: 0.55 },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
