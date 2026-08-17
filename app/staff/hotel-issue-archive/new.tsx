import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '@/constants/theme';
import { PressableScale } from '@/components/premium/PressableScale';
import { HotelIssueArchiveSection } from '@/components/hotelIssueArchive/HotelIssueArchiveSection';
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

const ACCENT = '#7c3aed';

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

  const activeCat = HOTEL_ISSUE_ARCHIVE_CATEGORIES.find((c) => c.value === category);

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
        <LinearGradient
          colors={['#1e1b4b', '#312e81', '#4c1d95']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroIcon}>
            <Ionicons name="camera" size={24} color="#c4b5fd" />
          </View>
          <Text style={styles.heroTitle}>Yeni kayıt</Text>
          <Text style={styles.heroHint}>
            Sorun, risk veya düzenlemeyi foto/video ile arşivleyin — personele anında bildirim gider.
          </Text>
        </LinearGradient>

        <HotelIssueArchiveSection title="Kayıt türü" subtitle="Ne tür bir durum?" icon="pricetag-outline" accent={activeCat?.color ?? ACCENT}>
          <View style={styles.catGrid}>
            {HOTEL_ISSUE_ARCHIVE_CATEGORIES.map((c) => {
              const active = category === c.value;
              return (
                <PressableScale
                  key={c.value}
                  style={[styles.catTile, active && { borderColor: c.color, backgroundColor: `${c.color}10` }]}
                  onPress={() => setCategory(c.value)}
                >
                  <View style={[styles.catIconWrap, { backgroundColor: `${c.color}${active ? '22' : '12'}` }]}>
                    <Ionicons name={c.icon as never} size={18} color={c.color} />
                  </View>
                  <Text style={[styles.catLabel, active && { color: c.color, fontWeight: '800' }]} numberOfLines={2}>
                    {c.label}
                  </Text>
                  {active ? <View style={[styles.catActiveDot, { backgroundColor: c.color }]} /> : null}
                </PressableScale>
              );
            })}
          </View>
        </HotelIssueArchiveSection>

        <HotelIssueArchiveSection title="Konum" subtitle="Oda veya alan — isteğe bağlı" icon="location-outline" accent={ACCENT}>
          <View style={styles.inputRow}>
            <Ionicons name="bed-outline" size={18} color={theme.colors.textMuted} />
            <TextInput
              style={styles.inputInner}
              value={roomNumber}
              onChangeText={setRoomNumber}
              placeholder="Oda numarası"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="number-pad"
            />
          </View>
          <View style={[styles.inputRow, styles.inputRowSpaced]}>
            <Ionicons name="business-outline" size={18} color={theme.colors.textMuted} />
            <TextInput
              style={styles.inputInner}
              value={locationLabel}
              onChangeText={setLocationLabel}
              placeholder="Depo, lobi, çamaşırhane…"
              placeholderTextColor={theme.colors.textMuted}
            />
          </View>
        </HotelIssueArchiveSection>

        <HotelIssueArchiveSection title="Not" subtitle="Zorunlu — ne gördünüz / ne yaptınız?" icon="create-outline" accent={ACCENT}>
          <TextInput
            style={styles.noteInput}
            value={note}
            onChangeText={setNote}
            multiline
            textAlignVertical="top"
            placeholder="Örn. Banyo vanası sızıntı yapıyor / Depo düzenlendi…"
            placeholderTextColor={theme.colors.textMuted}
          />
          <Text style={styles.charHint}>{note.trim().length} karakter</Text>
        </HotelIssueArchiveSection>

        <HotelIssueArchiveSection
          title="Fotoğraf / video"
          subtitle={`En fazla ${MAX_HOTEL_ISSUE_ARCHIVE_MEDIA} medya · paralel hızlı yükleme`}
          icon="images-outline"
          accent={ACCENT}
        >
          <View style={styles.mediaActions}>
            <PressableScale
              style={[styles.mediaBtn, styles.mediaBtnPrimary, pickingMedia && styles.mediaBtnDisabled]}
              onPress={() => pickMedia(true)}
              disabled={pickingMedia}
            >
              {pickingMedia ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="camera" size={22} color="#fff" />
              )}
              <Text style={styles.mediaBtnPrimaryText}>Kamera</Text>
            </PressableScale>
            <PressableScale
              style={[styles.mediaBtn, pickingMedia && styles.mediaBtnDisabled]}
              onPress={() => pickMedia(false)}
              disabled={pickingMedia}
            >
              <Ionicons name="images-outline" size={22} color={ACCENT} />
              <Text style={styles.mediaBtnText}>Galeri</Text>
            </PressableScale>
          </View>

          {media.length > 0 ? (
            <View style={styles.mediaGrid}>
              {media.map((m, idx) => (
                <View key={`${m.uri}-${idx}`} style={styles.mediaTile}>
                  <Image source={{ uri: m.posterUri ?? m.uri }} style={styles.mediaImg} />
                  {m.type === 'video' ? (
                    <View style={styles.videoBadge}>
                      <Ionicons name="play" size={12} color="#fff" />
                    </View>
                  ) : null}
                  <PressableScale style={styles.mediaRemove} onPress={() => setMedia((arr) => arr.filter((_, i) => i !== idx))}>
                    <Ionicons name="close" size={14} color="#fff" />
                  </PressableScale>
                </View>
              ))}
              {media.length < MAX_HOTEL_ISSUE_ARCHIVE_MEDIA ? (
                <PressableScale style={styles.mediaAddTile} onPress={() => pickMedia(true)} disabled={pickingMedia}>
                  <Ionicons name="add" size={28} color={ACCENT} />
                </PressableScale>
              ) : null}
            </View>
          ) : (
            <PressableScale style={styles.mediaEmpty} onPress={() => pickMedia(true)} disabled={pickingMedia}>
              <Ionicons name="cloud-upload-outline" size={32} color={ACCENT} />
              <Text style={styles.mediaEmptyTitle}>Medya ekle</Text>
              <Text style={styles.mediaEmptyHint}>Dokunarak kamera açın veya galeriden seçin</Text>
            </PressableScale>
          )}
        </HotelIssueArchiveSection>

        {uploadStep ? (
          <View style={styles.uploadBanner}>
            <ActivityIndicator size="small" color={ACCENT} />
            <Text style={styles.uploadStepText}>{uploadStep}</Text>
          </View>
        ) : null}

        <PressableScale style={[styles.saveBtnWrap, !canSubmit && styles.saveBtnDisabled]} onPress={submit} disabled={!canSubmit}>
          <LinearGradient
            colors={canSubmit ? ['#6d28d9', '#7c3aed', '#8b5cf6'] : ['#94a3b8', '#94a3b8']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.saveBtn}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="notifications" size={20} color="#fff" />
                <Text style={styles.saveBtnText}>Kaydet ve personele bildir</Text>
              </>
            )}
          </LinearGradient>
        </PressableScale>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  scroll: { padding: 16, paddingBottom: 48 },
  hero: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 14,
    alignItems: 'center',
    overflow: 'hidden',
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(196,181,253,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  heroHint: { marginTop: 8, fontSize: 14, lineHeight: 21, color: '#c4b5fd', textAlign: 'center', maxWidth: 300 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catTile: {
    width: '48%',
    flexGrow: 1,
    minWidth: '46%',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: theme.colors.borderLight,
    padding: 12,
    backgroundColor: theme.colors.backgroundSecondary,
    position: 'relative',
  },
  catIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  catLabel: { fontSize: 12, color: theme.colors.textSecondary, lineHeight: 16, fontWeight: '600' },
  catActiveDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  inputRowSpaced: { marginTop: 10 },
  inputInner: { flex: 1, fontSize: 16, color: theme.colors.text, paddingVertical: 10 },
  noteInput: {
    minHeight: 110,
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    padding: 14,
    fontSize: 16,
    color: theme.colors.text,
    lineHeight: 22,
  },
  charHint: { marginTop: 6, fontSize: 11, color: theme.colors.textMuted, textAlign: 'right' },
  mediaActions: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  mediaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  mediaBtnPrimary: { backgroundColor: ACCENT, borderColor: ACCENT },
  mediaBtnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  mediaBtnText: { color: ACCENT, fontWeight: '800', fontSize: 15 },
  mediaBtnDisabled: { opacity: 0.6 },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mediaTile: { width: '31%', aspectRatio: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: theme.colors.backgroundSecondary },
  mediaImg: { width: '100%', height: '100%' },
  videoBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(15,23,42,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(220,38,38,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaAddTile: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: `${ACCENT}55`,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${ACCENT}08`,
  },
  mediaEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: `${ACCENT}44`,
    backgroundColor: `${ACCENT}06`,
  },
  mediaEmptyTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  mediaEmptyHint: { fontSize: 12, color: theme.colors.textMuted, textAlign: 'center', paddingHorizontal: 16 },
  uploadBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 12,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: `${ACCENT}10`,
  },
  uploadStepText: { fontSize: 14, color: theme.colors.textSecondary },
  saveBtnWrap: { marginTop: 4, borderRadius: 16, overflow: 'hidden', ...theme.shadows.md },
  saveBtnDisabled: { opacity: 0.55 },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
