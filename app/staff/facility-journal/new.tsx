import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
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
import { useNavigation, usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { AdminStackBackButton } from '@/lib/adminStackBack';
import { StaffStackBackButton } from '@/lib/staffStackBack';
import { FacilityJournalAccessGate } from '@/components/staff/FacilityJournalAccessGate';
import { useAuthStore } from '@/stores/authStore';
import { FacilityJournalViewerPicker } from '@/components/facilityJournal/FacilityJournalViewerPicker';
import {
  createFacilityJournalRecord,
  listFacilityJournalRecordTypes,
  seedDefaultFacilityJournalTypes,
  type FacilityJournalRecordTypeRow,
} from '@/lib/facilityJournal';
import {
  MAX_FACILITY_JOURNAL_MEDIA,
  facilityJournalMediaPickerCameraOptions,
  facilityJournalMediaPickerGalleryOptions,
  prepareFacilityJournalUploadUri,
  uploadFacilityJournalMediaBatch,
  type FacilityJournalMediaLabel,
} from '@/lib/facilityJournalMedia';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { resolveFeedPickedMediaUri } from '@/lib/feedPostMediaPicker';
import { buildEarlyVideoPreview } from '@/lib/chatVideoThumbnail';
import { FacilityJournalMediaPreview } from '@/components/facilityJournal/FacilityJournalMediaPreview';
import { theme } from '@/constants/theme';

type PendingMedia = {
  uri: string;
  type: 'image' | 'video';
  label: FacilityJournalMediaLabel;
  /** Video seçiminde yerel poster (liste önizlemesi). */
  posterUri?: string | null;
  /** Kaydet öncesi arka planda hazırlanan dosya (sıkıştırma burada biter). */
  preparedUri?: string;
  preparing?: boolean;
};

function FacilityJournalNewScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const pathname = usePathname();
  const staff = useAuthStore((s) => s.staff);
  const isAdminRoute = pathname?.startsWith('/admin') ?? false;
  const isAdmin = staff?.role === 'admin';
  const base = isAdminRoute ? '/admin/facility-journal' : '/staff/facility-journal';
  const orgId = staff?.organization_id;
  const staffId = staff?.id;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () =>
        isAdminRoute ? (
          <AdminStackBackButton accessibilityLabel="Geri" fallback={base as never} />
        ) : (
          <StaffStackBackButton accessibilityLabel="Geri" fallback={base as never} />
        ),
    });
  }, [navigation, isAdminRoute, base]);

  const [types, setTypes] = useState<FacilityJournalRecordTypeRow[]>([]);
  const [typeId, setTypeId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationDetail, setLocationDetail] = useState('');
  const [counterpartyName, setCounterpartyName] = useState('');
  const [recordDate, setRecordDate] = useState(new Date().toISOString().slice(0, 10));
  const [media, setMedia] = useState<PendingMedia[]>([]);
  const [viewerStaffIds, setViewerStaffIds] = useState<string[]>([]);
  const [viewerGuestIds, setViewerGuestIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [typesLoading, setTypesLoading] = useState(true);
  const [pickingMedia, setPickingMedia] = useState(false);
  const [uploadStep, setUploadStep] = useState<string | null>(null);

  const loadTypes = useCallback(async () => {
    if (!orgId || !staffId) return;
    setTypesLoading(true);
    try {
      let { data } = await listFacilityJournalRecordTypes(orgId, true);
      let rows = (data as FacilityJournalRecordTypeRow[]) ?? [];
      if (rows.length === 0 && isAdmin) {
        await seedDefaultFacilityJournalTypes(orgId, staffId);
        ({ data } = await listFacilityJournalRecordTypes(orgId, true));
        rows = (data as FacilityJournalRecordTypeRow[]) ?? [];
      }
      setTypes(rows);
      setTypeId((prev) => prev || rows[0]?.id || '');
    } finally {
      setTypesLoading(false);
    }
  }, [orgId, staffId, isAdmin]);

  useEffect(() => {
    void loadTypes();
  }, [loadTypes]);

  const pickMedia = useCallback(
    async (fromCamera: boolean) => {
      if (pickingMedia) return;
      if (media.length >= MAX_FACILITY_JOURNAL_MEDIA) {
        Alert.alert('Limit', `En fazla ${MAX_FACILITY_JOURNAL_MEDIA} medya ekleyebilirsiniz.`);
        return;
      }

      setPickingMedia(true);
      try {
        const granted = fromCamera
          ? await ensureCameraPermission({
              title: 'Kamera',
              message: 'Fotoğraf veya video çekmek için kamera izni gerekir.',
              settingsMessage: 'Ayarlardan kamera iznini açın.',
            })
          : await ensureMediaLibraryPermission({
              title: 'Galeri',
              message: 'Medya seçmek için galeri izni gerekir.',
              settingsMessage: 'Ayarlardan galeri iznini açın.',
            });
        if (!granted) return;

        const result = fromCamera
          ? await ImagePicker.launchCameraAsync(facilityJournalMediaPickerCameraOptions)
          : await ImagePicker.launchImageLibraryAsync({
              ...facilityJournalMediaPickerGalleryOptions,
              selectionLimit: MAX_FACILITY_JOURNAL_MEDIA - media.length,
            });

        if (result.canceled || !result.assets?.length) return;

        const added: PendingMedia[] = [];
        for (const asset of result.assets) {
          if (media.length + added.length >= MAX_FACILITY_JOURNAL_MEDIA) break;
          const resolved = await resolveFeedPickedMediaUri(asset);
          if (resolved.uri) {
            let posterUri: string | null = null;
            if (resolved.type === 'video') {
              const early = await buildEarlyVideoPreview(resolved.uri);
              posterUri = early.posterUri;
            }
            added.push({ uri: resolved.uri, type: resolved.type, label: 'general', posterUri });
          }
        }
        if (added.length) {
          setMedia((m) => [...m, ...added.map((a) => ({ ...a, preparing: true }))]);
          void (async () => {
            for (const item of added) {
              try {
                const preparedUri = await prepareFacilityJournalUploadUri(item.uri, item.type);
                setMedia((prev) =>
                  prev.map((x) =>
                    x.uri === item.uri ? { ...x, preparedUri, preparing: false } : x
                  )
                );
              } catch {
                setMedia((prev) =>
                  prev.map((x) => (x.uri === item.uri ? { ...x, preparing: false } : x))
                );
              }
            }
          })();
        }
      } catch (e) {
        Alert.alert('Hata', (e as Error)?.message ?? 'Kamera veya galeri açılamadı.');
      } finally {
        setPickingMedia(false);
      }
    },
    [media.length, pickingMedia]
  );

  const toggleViewerStaff = (id: string) => {
    setViewerStaffIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleViewerGuest = (id: string) => {
    setViewerGuestIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const submit = async () => {
    if (!orgId || !staffId) {
      Alert.alert('Hata', 'Oturum bulunamadı.');
      return;
    }
    if (!typeId) {
      Alert.alert('Hata', 'Kayıt tipi seçin. Yönetici kayıt tipleri ekranından tip ekleyebilir.');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Hata', 'Başlık zorunludur.');
      return;
    }
    if (!media.length) {
      Alert.alert('Hata', 'En az bir fotoğraf veya video ekleyin.');
      return;
    }

    setSaving(true);
    try {
      setUploadStep('Medya hazırlanıyor…');
      const uploadUris: string[] = [];
      for (let idx = 0; idx < media.length; idx++) {
        const m = media[idx];
        if (m.preparedUri) {
          uploadUris.push(m.preparedUri);
          continue;
        }
        uploadUris.push(
          await prepareFacilityJournalUploadUri(m.uri, m.type, (step) =>
            setUploadStep(`${idx + 1}/${media.length}: ${step}`)
          )
        );
      }

      setUploadStep('Medyalar yükleniyor…');

      const uploadResults = await uploadFacilityJournalMediaBatch({
        items: uploadUris.map((uri, i) => ({
          uri,
          kind: media[i].type,
          skipPrepare: true,
        })),
        organizationId: orgId,
        onProgress: (done, total, step) => setUploadStep(`${done}/${total} — ${step}`),
      });

      const uploaded = uploadResults.map((r, i) => ({
        storagePath: r.path,
        publicUrl: r.publicUrl,
        mediaType: media[i].type,
        label: media[i].label,
        sortOrder: i,
        thumbnailUrl: r.thumbnailUrl,
      }));

      setUploadStep('Kayıt kaydediliyor…');

      const { data, error } = await createFacilityJournalRecord(orgId, staffId, {
        typeId,
        title: title.trim(),
        description: description.trim() || null,
        locationDetail: locationDetail.trim() || null,
        counterpartyName: counterpartyName.trim() || null,
        recordDate,
        media: uploaded,
        viewerStaffIds,
        viewerGuestIds,
      });

      if (error || !data) throw new Error(error ?? 'Kayıt oluşturulamadı');

      Alert.alert('Kaydedildi', `Referans: ${data.reference_code}`, [
        { text: 'Tamam', onPress: () => router.replace(`${base}/${data.id}` as never) },
      ]);
    } catch (e) {
      const msg = (e as Error).message ?? 'Kayıt oluşturulamadı';
      const lower = msg.toLowerCase();
      Alert.alert(
        'Hata',
        lower.includes('zaman aşım')
          ? msg
          : lower.includes('okunamadı') || lower.includes('base64') || lower.includes('video')
            ? 'Video işlenemedi. Wi‑Fi ile tekrar deneyin veya uygulamayı yeniden başlatın.'
            : msg
      );
    } finally {
      setSaving(false);
      setUploadStep(null);
    }
  };

  if (!typesLoading && !types.length) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTypes}>
          {isAdmin
            ? 'Kayıt tipi yok. Önce kayıt tiplerini oluşturun.'
            : 'Kayıt tipi tanımlı değil. Yöneticinizden tip eklemesini isteyin.'}
        </Text>
        {isAdmin ? (
          <TouchableOpacity style={styles.linkBtn} onPress={() => router.push(`${base}/types` as never)}>
            <Text style={styles.linkBtnText}>Kayıt tipleri</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Kayıt tipi</Text>
        {typesLoading ? (
          <ActivityIndicator style={styles.typesLoader} color={theme.colors.primary} />
        ) : (
          <View style={styles.chipRow}>
            {types.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[styles.chip, typeId === t.id && styles.chipActive]}
                onPress={() => setTypeId(t.id)}
              >
                <Text style={[styles.chipText, typeId === t.id && styles.chipTextActive]}>{t.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={styles.label}>Başlık *</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Örn. 205 banyo yenileme" />

        <Text style={styles.label}>Açıklama</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={description}
          onChangeText={setDescription}
          multiline
          placeholder="Ne değişti, hangi malzeme kullanıldı…"
        />

        <Text style={styles.label}>Konum / oda</Text>
        <TextInput style={styles.input} value={locationDetail} onChangeText={setLocationDetail} placeholder="Oda 205, lobi…" />

        <Text style={styles.label}>İlgili kişi / taraf</Text>
        <TextInput
          style={styles.input}
          value={counterpartyName}
          onChangeText={setCounterpartyName}
          placeholder="Zimmet alan, emanet veren…"
        />

        <Text style={styles.label}>Tarih (YYYY-MM-DD)</Text>
        <TextInput style={styles.input} value={recordDate} onChangeText={setRecordDate} />

        <Text style={styles.label}>Fotoğraf / video *</Text>
        <View style={styles.mediaActions}>
          <TouchableOpacity
            style={[styles.mediaBtn, pickingMedia && styles.mediaBtnDisabled]}
            onPress={() => pickMedia(true)}
            disabled={pickingMedia}
          >
            {pickingMedia ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              <Ionicons name="camera-outline" size={20} color={theme.colors.primary} />
            )}
            <Text style={styles.mediaBtnText}>Kamera</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.mediaBtn, pickingMedia && styles.mediaBtnDisabled]}
            onPress={() => pickMedia(false)}
            disabled={pickingMedia}
          >
            {pickingMedia ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              <Ionicons name="images-outline" size={20} color={theme.colors.primary} />
            )}
            <Text style={styles.mediaBtnText}>Galeri</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mediaStrip}>
          {media.map((m, idx) => (
            <View key={`${m.uri}-${idx}`} style={styles.mediaThumb}>
              <FacilityJournalMediaPreview
                media={{
                  id: `pending-${idx}`,
                  record_id: 'pending',
                  public_url: m.uri,
                  media_type: m.type,
                  thumbnail_url: m.posterUri ?? null,
                  sort_order: idx,
                }}
                style={styles.mediaImg}
                recyclingKey={`pending-${m.uri}`}
                allowVideoFrameFallback={m.type === 'video' && !m.posterUri}
              />
              {m.type === 'video' ? (
                <View style={styles.videoPlayDot} pointerEvents="none">
                  <Ionicons name="play" size={14} color="#fff" />
                </View>
              ) : null}
              {m.preparing ? (
                <View style={styles.mediaPreparing}>
                  <ActivityIndicator size="small" color="#fff" />
                </View>
              ) : null}
              <TouchableOpacity style={styles.mediaRemove} onPress={() => setMedia((arr) => arr.filter((_, i) => i !== idx))}>
                <Ionicons name="close-circle" size={22} color="#dc2626" />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>

        <Text style={[styles.label, styles.mt]}>Kimler görebilsin? (isteğe bağlı)</Text>
        <Text style={styles.hint}>Seçmezseniz yalnızca siz ve yöneticiler görür.</Text>
        {orgId && staffId ? (
          <FacilityJournalViewerPicker
            organizationId={orgId}
            creatorStaffId={staffId}
            selectedStaffIds={viewerStaffIds}
            selectedGuestIds={viewerGuestIds}
            onToggleStaff={toggleViewerStaff}
            onToggleGuest={toggleViewerGuest}
          />
        ) : null}

        {uploadStep ? <Text style={styles.uploadStep}>{uploadStep}</Text> : null}

        <TouchableOpacity
          style={[styles.saveBtn, (saving || typesLoading) && styles.saveBtnDisabled]}
          onPress={submit}
          disabled={saving || typesLoading}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Kaydet</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function FacilityJournalNew() {
  return (
    <FacilityJournalAccessGate>
      <FacilityJournalNewScreen />
    </FacilityJournalAccessGate>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyTypes: { textAlign: 'center', color: theme.colors.textMuted, marginBottom: 16 },
  linkBtn: { padding: 12, backgroundColor: theme.colors.primary, borderRadius: 10 },
  linkBtnText: { color: '#fff', fontWeight: '600' },
  label: { fontSize: 14, fontWeight: '600', color: theme.colors.text, marginTop: 12, marginBottom: 6 },
  hint: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 8 },
  typesLoader: { marginVertical: 12, alignSelf: 'flex-start' },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: theme.colors.card,
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.card,
  },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: 14, color: theme.colors.text },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  mediaActions: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  mediaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  mediaBtnText: { color: theme.colors.primary, fontWeight: '600' },
  mediaBtnDisabled: { opacity: 0.6 },
  mediaStrip: { marginBottom: 8 },
  mediaThumb: { width: 88, height: 88, marginRight: 8, borderRadius: 8, overflow: 'hidden' },
  mediaImg: { width: '100%', height: '100%' },
  videoPlayDot: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(15,23,42,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaRemove: { position: 'absolute', top: 2, right: 2 },
  mediaPreparing: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  viewerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  viewerChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  viewerChipOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  viewerChipText: { fontSize: 13, color: theme.colors.text },
  viewerChipTextOn: { color: '#fff' },
  saveBtn: {
    marginTop: 24,
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  uploadStep: { marginTop: 16, fontSize: 14, color: theme.colors.textMuted, textAlign: 'center' },
});
