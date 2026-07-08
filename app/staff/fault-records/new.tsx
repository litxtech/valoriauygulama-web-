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
  MAX_FAULT_RECORD_MEDIA,
  faultRecordMediaCameraOptions,
  faultRecordMediaGalleryOptions,
  uploadFaultRecordMedia,
} from '@/lib/faultRecordMedia';
import {
  createFaultRecord,
  notifyFaultRecordCreated,
  FAULT_RECORD_CATEGORIES,
  FAULT_RECORD_STATUSES,
  type FaultRecordCategory,
  type FaultRecordStatus,
} from '@/lib/faultRecords';

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

export default function FaultRecordNew() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const orgId = staff?.organization_id;
  const staffId = staff?.id;

  const [category, setCategory] = useState<FaultRecordCategory>('electrical');
  const [roomNumber, setRoomNumber] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [faultDescription, setFaultDescription] = useState('');
  const [workDone, setWorkDone] = useState('');
  const [materialsUsed, setMaterialsUsed] = useState('');
  const [resultNote, setResultNote] = useState('');
  const [resolvedByName, setResolvedByName] = useState(staff?.full_name ?? '');
  const [status, setStatus] = useState<FaultRecordStatus>('resolved');
  const [media, setMedia] = useState<PendingMedia[]>([]);
  const [pickingMedia, setPickingMedia] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadStep, setUploadStep] = useState<string | null>(null);

  const pickMedia = useCallback(
    async (fromCamera: boolean) => {
      if (pickingMedia) return;
      if (media.length >= MAX_FAULT_RECORD_MEDIA) {
        Alert.alert('Limit', `En fazla ${MAX_FAULT_RECORD_MEDIA} medya ekleyebilirsiniz.`);
        return;
      }
      setPickingMedia(true);
      try {
        const granted = fromCamera
          ? await ensureCameraPermission({
              title: 'Kamera izni',
              message: 'Arıza fotoğrafı/videosu çekmek için kamera izni gerekli.',
              settingsMessage: 'Kamera iznini ayarlardan açın.',
            })
          : await ensureMediaLibraryPermission({
              title: 'Galeri izni',
              message: 'Arıza medyası eklemek için galeri izni gerekli.',
              settingsMessage: 'Galeri iznini ayarlardan açın.',
            });
        if (!granted) return;

        const result = fromCamera
          ? await ImagePicker.launchCameraAsync(faultRecordMediaCameraOptions)
          : await ImagePicker.launchImageLibraryAsync({
              ...faultRecordMediaGalleryOptions,
              selectionLimit: MAX_FAULT_RECORD_MEDIA - media.length,
            });
        if (result.canceled || !result.assets?.length) return;

        const added: PendingMedia[] = [];
        for (const asset of result.assets) {
          if (media.length + added.length >= MAX_FAULT_RECORD_MEDIA) break;
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
    () => faultDescription.trim().length > 0 && !!orgId && !!staffId && !saving,
    [faultDescription, orgId, staffId, saving]
  );

  const submit = async () => {
    if (!orgId || !staffId) {
      Alert.alert('Hata', 'Oturum bulunamadı. Lütfen tekrar giriş yapın.');
      return;
    }
    if (!faultDescription.trim()) {
      Alert.alert('Hata', 'Lütfen arızanın ne olduğunu yazın.');
      return;
    }

    setSaving(true);
    try {
      const uploaded: Array<{
        publicUrl: string;
        storagePath: string;
        mediaType: 'image' | 'video';
        thumbnailUrl: string | null;
        sortOrder: number;
      }> = [];
      for (let i = 0; i < media.length; i++) {
        const m = media[i];
        setUploadStep(`Medya yükleniyor ${i + 1}/${media.length}…`);
        const res = await uploadFaultRecordMedia({
          uri: m.uri,
          kind: m.type,
          organizationId: orgId,
          onProgress: (step) => setUploadStep(`${i + 1}/${media.length}: ${step}`),
        });
        uploaded.push({
          publicUrl: res.publicUrl,
          storagePath: res.path,
          mediaType: res.mediaType,
          thumbnailUrl: res.thumbnailUrl,
          sortOrder: i,
        });
      }

      setUploadStep('Kayıt oluşturuluyor…');
      const { data, error } = await createFaultRecord(orgId, staffId, {
        roomNumber,
        locationLabel,
        category,
        faultDescription,
        workDone,
        materialsUsed,
        resultNote,
        resolvedByName,
        status,
        media: uploaded,
      });
      if (error || !data) throw new Error(error?.message ?? 'Kayıt oluşturulamadı');

      void notifyFaultRecordCreated({
        organizationId: orgId,
        createdByStaffId: staffId,
        record: {
          id: data.id,
          record_no: data.record_no,
          room_number: roomNumber,
          location_label: locationLabel,
          category,
          fault_description: faultDescription,
          status,
          resolved_by_name: resolvedByName,
        },
      }).catch(() => {});

      Alert.alert('Kaydedildi', `Arıza kaydı oluşturuldu${data.record_no ? ` (${data.record_no})` : ''}.`, [
        { text: 'Tamam', onPress: () => router.replace(`/staff/fault-records/${data.id}` as never) },
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
            <Ionicons name="construct" size={28} color={theme.colors.primary} />
          </View>
          <Text style={styles.heroTitle}>Arıza kaydı oluştur</Text>
          <Text style={styles.heroHint}>
            Giderdiğiniz arızayı; hangi oda, ne arızası, ne yaptığınız, kullandığınız malzeme ve sonucu ile kaydedin.
          </Text>
        </View>

        <Section title="Arıza türü" subtitle="Kategori seçin" icon="pricetag-outline">
          <View style={styles.chipGrid}>
            {FAULT_RECORD_CATEGORIES.map((c) => {
              const active = category === c.value;
              return (
                <TouchableOpacity
                  key={c.value}
                  style={[styles.catChip, active && styles.catChipActive]}
                  onPress={() => setCategory(c.value)}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name={c.icon as never}
                    size={16}
                    color={active ? theme.colors.primary : theme.colors.textSecondary}
                  />
                  <Text style={[styles.catChipText, active && styles.catChipTextActive]}>{c.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Section>

        <Section title="Konum" subtitle="Hangi oda veya alan" icon="location-outline">
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
            placeholder="Alan / açıklama (örn. Lobi, çamaşırhane) — isteğe bağlı"
            placeholderTextColor={theme.colors.textMuted}
          />
        </Section>

        <Section title="Arıza nedir?" subtitle="Zorunlu — sorunu açıklayın" icon="alert-circle-outline">
          <TextInput
            style={[styles.input, styles.multiline]}
            value={faultDescription}
            onChangeText={setFaultDescription}
            multiline
            textAlignVertical="top"
            placeholder="Örn. Banyo lavabosu su akıtıyor / priz çalışmıyor…"
            placeholderTextColor={theme.colors.textMuted}
          />
        </Section>

        <Section title="Ne yapıldı?" subtitle="Yapılan işlem / müdahale" icon="hammer-outline">
          <TextInput
            style={[styles.input, styles.multiline]}
            value={workDone}
            onChangeText={setWorkDone}
            multiline
            textAlignVertical="top"
            placeholder="Örn. Sifon contası değiştirildi, bağlantılar sıkıldı…"
            placeholderTextColor={theme.colors.textMuted}
          />
        </Section>

        <Section title="Arızayı gideren personel" subtitle="Arızaya bakan kişinin adı" icon="person-outline">
          <TextInput
            style={styles.input}
            value={resolvedByName}
            onChangeText={setResolvedByName}
            placeholder="Örn. Ahmet Yılmaz"
            placeholderTextColor={theme.colors.textMuted}
          />
        </Section>

        <Section
          title="Fotoğraf / video"
          subtitle={`İsteğe bağlı — en fazla ${MAX_FAULT_RECORD_MEDIA} medya`}
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
              <Text style={styles.mediaEmptyText}>Arızanın öncesi/sonrası fotoğraf veya videosunu ekleyin</Text>
            </View>
          )}
        </Section>

        <Section title="Kullanılan malzeme" subtitle="Harcanan parça / malzemeler" icon="cube-outline">
          <TextInput
            style={[styles.input, styles.multiline]}
            value={materialsUsed}
            onChangeText={setMaterialsUsed}
            multiline
            textAlignVertical="top"
            placeholder="Örn. 1 adet sifon contası, 2 metre kablo, silikon…"
            placeholderTextColor={theme.colors.textMuted}
          />
        </Section>

        <Section title="Sonuç" subtitle="Durum ve sonuç notu" icon="checkmark-done-outline">
          <View style={styles.statusRow}>
            {FAULT_RECORD_STATUSES.map((s) => {
              const active = status === s.value;
              return (
                <TouchableOpacity
                  key={s.value}
                  style={[
                    styles.statusChip,
                    active && { backgroundColor: `${s.color}18`, borderColor: s.color },
                  ]}
                  onPress={() => setStatus(s.value)}
                  activeOpacity={0.85}
                >
                  <View style={[styles.statusDot, { backgroundColor: s.color }]} />
                  <Text style={[styles.statusChipText, active && { color: s.color, fontWeight: '700' }]}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput
            style={[styles.input, styles.multiline, styles.inputSpaced]}
            value={resultNote}
            onChangeText={setResultNote}
            multiline
            textAlignVertical="top"
            placeholder="Sonuç açıklaması (örn. Sorun giderildi, test edildi / parça beklendiği için tamamlanamadı)…"
            placeholderTextColor={theme.colors.textMuted}
          />
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
              <Text style={styles.saveBtnText}>Kaydet</Text>
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
  catChipActive: { borderColor: theme.colors.primary, backgroundColor: `${theme.colors.primary}12` },
  catChipText: { fontSize: 13, color: theme.colors.textSecondary },
  catChipTextActive: { color: theme.colors.primary, fontWeight: '700' },
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
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusChipText: { fontSize: 14, color: theme.colors.textSecondary },
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
