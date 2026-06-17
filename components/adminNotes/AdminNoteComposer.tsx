import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '@/stores/authStore';
import {
  ADMIN_NOTE_TAG_LABELS,
  createAdminQuickNote,
  type AdminNoteTag,
} from '@/lib/adminQuickNotes';
import {
  adminNotesMediaPickerCameraOptions,
  adminNotesMediaPickerGalleryOptions,
  prepareAdminNoteUploadUri,
  uploadAdminNoteMediaBatch,
} from '@/lib/adminQuickNotesMedia';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { resolveFeedPickedMediaUri } from '@/lib/feedPostMediaPicker';
import { buildEarlyVideoPreview } from '@/lib/chatVideoThumbnail';
import { CachedImage } from '@/components/CachedImage';
import { PressableScale } from '@/components/premium/PressableScale';
import { theme } from '@/constants/theme';

type PendingMedia = {
  uri: string;
  type: 'image' | 'video';
  posterUri?: string | null;
  preparedUri?: string;
  preparing?: boolean;
};

const TAGS: AdminNoteTag[] = ['general', 'room', 'staff', 'guest', 'urgent'];

type Props = {
  onSaved: (noteId: string, noteNumber: string) => void;
  onCancel?: () => void;
};

export function AdminNoteComposer({ onSaved, onCancel }: Props) {
  const staff = useAuthStore((s) => s.staff);
  const [body, setBody] = useState('');
  const [title, setTitle] = useState('');
  const [tag, setTag] = useState<AdminNoteTag>('general');
  const [roomLabel, setRoomLabel] = useState('');
  const [media, setMedia] = useState<PendingMedia[]>([]);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadStep, setUploadStep] = useState<string | null>(null);

  const canSave = body.trim().length > 0 || media.length > 0;

  const pickMedia = useCallback(
    async (fromCamera: boolean) => {
      if (picking) return;
      setPicking(true);
      try {
        const granted = fromCamera
          ? await ensureCameraPermission({
              title: 'Kamera',
              message: 'Fotoğraf veya video eklemek için kamera izni gerekir.',
              settingsMessage: 'Ayarlardan kamera iznini açın.',
            })
          : await ensureMediaLibraryPermission({
              title: 'Galeri',
              message: 'Medya eklemek için galeri izni gerekir.',
              settingsMessage: 'Ayarlardan galeri iznini açın.',
            });
        if (!granted) return;

        const result = fromCamera
          ? await ImagePicker.launchCameraAsync(adminNotesMediaPickerCameraOptions)
          : await ImagePicker.launchImageLibraryAsync(adminNotesMediaPickerGalleryOptions);

        if (result.canceled || !result.assets?.length) return;

        const added: PendingMedia[] = [];
        for (const asset of result.assets) {
          const resolved = await resolveFeedPickedMediaUri(asset);
          if (!resolved.uri) continue;
          let posterUri: string | null = null;
          if (resolved.type === 'video') {
            const early = await buildEarlyVideoPreview(resolved.uri);
            posterUri = early.posterUri;
          }
          added.push({ uri: resolved.uri, type: resolved.type, posterUri, preparing: true });
        }
        if (!added.length) return;
        setMedia((m) => [...m, ...added]);
        for (const item of added) {
          void prepareAdminNoteUploadUri(item.uri, item.type).then((preparedUri) => {
            setMedia((prev) =>
              prev.map((x) => (x.uri === item.uri ? { ...x, preparedUri, preparing: false } : x))
            );
          });
        }
      } catch (e) {
        Alert.alert('Hata', (e as Error)?.message ?? 'Medya seçilemedi');
      } finally {
        setPicking(false);
      }
    },
    [picking]
  );

  const removeMedia = (uri: string) => setMedia((m) => m.filter((x) => x.uri !== uri));

  const submit = async () => {
    if (!staff?.id || !staff.organization_id) {
      Alert.alert('Hata', 'Oturum bulunamadı');
      return;
    }
    if (!canSave) {
      Alert.alert('Eksik', 'Not metni veya en az bir medya ekleyin.');
      return;
    }
    setSaving(true);
    try {
      let uploaded: Array<{ publicUrl: string; path: string; thumbnailUrl: string | null }> = [];
      if (media.length) {
        const uris: string[] = [];
        for (let i = 0; i < media.length; i++) {
          const m = media[i];
          setUploadStep(`Hazırlanıyor ${i + 1}/${media.length}…`);
          uris.push(
            m.preparedUri ?? (await prepareAdminNoteUploadUri(m.uri, m.type, (s) => setUploadStep(s)))
          );
        }
        uploaded = await uploadAdminNoteMediaBatch({
          items: uris.map((uri, i) => ({ uri, kind: media[i].type, skipPrepare: true })),
          organizationId: staff.organization_id,
          onProgress: (done, total, step) => setUploadStep(`${done}/${total} — ${step}`),
        });
      }

      setUploadStep('Kaydediliyor…');
      const { data, error } = await createAdminQuickNote({
        organizationId: staff.organization_id,
        staffId: staff.id,
        bodyText: body.trim(),
        title: title.trim() || null,
        tag,
        roomLabel: roomLabel.trim() || null,
        media: uploaded.map((u, i) => ({
          storagePath: u.path,
          publicUrl: u.publicUrl,
          mediaType: media[i].type,
          thumbnailUrl: u.thumbnailUrl,
          sortOrder: i,
        })),
      });

      if (error || !data) throw new Error(error ?? 'Kayıt başarısız');
      onSaved(data.id, data.note_number);
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Not kaydedilemedi');
    } finally {
      setSaving(false);
      setUploadStep(null);
    }
  };

  const tagChips = useMemo(
    () =>
      TAGS.map((t) => (
        <Pressable key={t} onPress={() => setTag(t)} style={[styles.chip, tag === t && styles.chipOn]}>
          <Text style={[styles.chipText, tag === t && styles.chipTextOn]}>{ADMIN_NOTE_TAG_LABELS[t]}</Text>
        </Pressable>
      )),
    [tag]
  );

  return (
    <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.hint}>Sınırsız metin ve medya. Not numarası otomatik verilir.</Text>

        <Text style={styles.label}>Başlık (isteğe bağlı)</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Kısa başlık"
          placeholderTextColor="#94A3B8"
        />

        <Text style={styles.label}>Not *</Text>
        <TextInput
          style={[styles.input, styles.body]}
          value={body}
          onChangeText={setBody}
          placeholder="Anlık notunuzu yazın…"
          placeholderTextColor="#94A3B8"
          multiline
          textAlignVertical="top"
        />

        <Text style={styles.label}>Etiket</Text>
        <View style={styles.chipRow}>{tagChips}</View>

        {tag === 'room' ? (
          <>
            <Text style={styles.label}>Oda / konum</Text>
            <TextInput
              style={styles.input}
              value={roomLabel}
              onChangeText={setRoomLabel}
              placeholder="Örn. 204, lobi"
              placeholderTextColor="#94A3B8"
            />
          </>
        ) : null}

        <Text style={styles.label}>Medya</Text>
        <View style={styles.mediaActions}>
          <PressableScale style={styles.mediaBtn} onPress={() => pickMedia(true)} disabled={picking}>
            <Ionicons name="camera-outline" size={20} color="#4F46E5" />
            <Text style={styles.mediaBtnText}>Kamera</Text>
          </PressableScale>
          <PressableScale style={styles.mediaBtn} onPress={() => pickMedia(false)} disabled={picking}>
            <Ionicons name="images-outline" size={20} color="#4F46E5" />
            <Text style={styles.mediaBtnText}>Galeri</Text>
          </PressableScale>
        </View>

        {media.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaStrip}>
            {media.map((m) => (
              <View key={m.uri} style={styles.mediaThumbWrap}>
                <CachedImage uri={m.type === 'video' ? m.posterUri ?? m.uri : m.uri} style={styles.mediaThumb} />
                {m.preparing ? (
                  <View style={styles.mediaOverlay}>
                    <ActivityIndicator color="#fff" size="small" />
                  </View>
                ) : null}
                {m.type === 'video' ? (
                  <View style={styles.videoBadge}>
                    <Ionicons name="videocam" size={10} color="#fff" />
                  </View>
                ) : null}
                <Pressable style={styles.mediaRemove} onPress={() => removeMedia(m.uri)}>
                  <Ionicons name="close-circle" size={20} color="#EF4444" />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : null}

        {uploadStep ? (
          <View style={styles.progress}>
            <ActivityIndicator size="small" color="#6366F1" />
            <Text style={styles.progressText}>{uploadStep}</Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          {onCancel ? (
            <Pressable style={styles.cancelBtn} onPress={onCancel} disabled={saving}>
              <Text style={styles.cancelText}>Vazgeç</Text>
            </Pressable>
          ) : null}
          <PressableScale style={[styles.saveWrap, !canSave && { opacity: 0.5 }]} onPress={submit} disabled={saving || !canSave}>
            <View style={styles.saveBtn}>
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  <Text style={styles.saveText}>Kaydet</Text>
                </>
              )}
            </View>
          </PressableScale>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 40 },
  hint: { fontSize: 12, color: '#64748B', marginBottom: 14, lineHeight: 17 },
  label: { fontSize: 12, fontWeight: '800', color: '#334155', marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: theme.colors.text,
    backgroundColor: '#fff',
  },
  body: { minHeight: 140, paddingTop: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipOn: { backgroundColor: '#EEF2FF', borderColor: '#A5B4FC' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  chipTextOn: { color: '#4F46E5' },
  mediaActions: { flexDirection: 'row', gap: 10 },
  mediaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  mediaBtnText: { fontSize: 13, fontWeight: '800', color: '#4F46E5' },
  mediaStrip: { gap: 10, paddingVertical: 12 },
  mediaThumbWrap: { width: 72, height: 72, borderRadius: 12, overflow: 'hidden' },
  mediaThumb: { width: '100%', height: '100%' },
  mediaOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 4,
    padding: 2,
  },
  mediaRemove: { position: 'absolute', top: 2, right: 2 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  progressText: { fontSize: 12, color: '#64748B' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  cancelText: { fontWeight: '700', color: '#64748B' },
  saveWrap: { flex: 2, borderRadius: 14, overflow: 'hidden' },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: '#4F46E5',
    borderRadius: 14,
  },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
