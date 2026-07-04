import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '@/stores/authStore';
import {
  ADMIN_NOTE_TAG_LABELS,
  createAdminQuickNote,
  saveAdminQuickNoteEdit,
  type AdminNoteTag,
  type AdminQuickNoteRow,
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
import { notesTheme } from '@/constants/adminNotesTheme';
import { pds } from '@/constants/personelDesignSystem';

type PendingMedia = {
  uri: string;
  type: 'image' | 'video';
  posterUri?: string | null;
  preparedUri?: string;
  preparing?: boolean;
};

const TAGS: AdminNoteTag[] = ['general', 'room', 'staff', 'guest', 'urgent'];

const TAG_ICONS: Record<AdminNoteTag, keyof typeof Ionicons.glyphMap> = {
  general: 'document-text-outline',
  room: 'bed-outline',
  staff: 'people-outline',
  guest: 'person-outline',
  urgent: 'alert-circle-outline',
};

type Props = {
  onSaved: (noteId: string, noteNumber: string) => void;
  onCancel?: () => void;
  editNote?: AdminQuickNoteRow;
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export function AdminNoteComposer({ onSaved, onCancel, editNote }: Props) {
  const insets = useSafeAreaInsets();
  const staff = useAuthStore((s) => s.staff);
  const isEdit = Boolean(editNote);
  const [body, setBody] = useState(editNote?.body_text ?? '');
  const [title, setTitle] = useState(editNote?.title ?? '');
  const [tag, setTag] = useState<AdminNoteTag>(editNote?.tag ?? 'general');
  const [roomLabel, setRoomLabel] = useState(editNote?.room_label ?? '');
  const [keptMediaIds, setKeptMediaIds] = useState<Set<string>>(
    () => new Set((editNote?.media ?? []).map((m) => m.id))
  );
  const [media, setMedia] = useState<PendingMedia[]>([]);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadStep, setUploadStep] = useState<string | null>(null);
  const submitInFlightRef = useRef(false);

  const keptExistingMedia = useMemo(
    () =>
      [...(editNote?.media ?? [])]
        .filter((m) => keptMediaIds.has(m.id))
        .sort((a, b) => a.sort_order - b.sort_order),
    [editNote?.media, keptMediaIds]
  );

  const canSave = body.trim().length > 0 || keptExistingMedia.length > 0 || media.length > 0;

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

  const removeExistingMedia = (id: string) => {
    setKeptMediaIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const submit = async () => {
    if (submitInFlightRef.current) return;
    if (!staff?.id || !staff.organization_id) {
      Alert.alert('Hata', 'Oturum bulunamadı');
      return;
    }
    if (!canSave) {
      Alert.alert('Eksik', 'Not metni veya en az bir medya ekleyin.');
      return;
    }
    submitInFlightRef.current = true;
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
      if (isEdit && editNote) {
        const removedMediaIds = (editNote.media ?? [])
          .map((m) => m.id)
          .filter((id) => !keptMediaIds.has(id));
        const { data, error } = await saveAdminQuickNoteEdit({
          noteId: editNote.id,
          bodyText: body.trim(),
          title: title.trim() || null,
          tag,
          roomLabel: roomLabel.trim() || null,
          removedMediaIds,
          newMedia: uploaded.map((u, i) => ({
            storagePath: u.path,
            publicUrl: u.publicUrl,
            mediaType: media[i].type,
            thumbnailUrl: u.thumbnailUrl,
            sortOrder: keptExistingMedia.length + i,
          })),
        });
        if (error || !data) throw new Error(error ?? 'Güncelleme başarısız');
        onSaved(data.id, data.note_number);
        return;
      }

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
      submitInFlightRef.current = false;
      setSaving(false);
      setUploadStep(null);
    }
  };

  const allThumbs = [
    ...keptExistingMedia.map((m) => ({
      key: m.id,
      uri: m.media_type === 'video' ? m.thumbnail_url ?? m.public_url : m.public_url,
      isVideo: m.media_type === 'video',
      onRemove: () => removeExistingMedia(m.id),
      preparing: false,
    })),
    ...media.map((m) => ({
      key: m.uri,
      uri: m.type === 'video' ? m.posterUri ?? m.uri : m.uri,
      isVideo: m.type === 'video',
      onRemove: () => removeMedia(m.uri),
      preparing: m.preparing,
    })),
  ];

  return (
    <View style={styles.wrap}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scroll, { paddingBottom: 100 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {isEdit ? (
            <View style={styles.editBanner}>
              <Text style={styles.editBannerLabel}>Düzenleniyor</Text>
              <Text style={styles.editBannerNum}>{editNote?.note_number}</Text>
            </View>
          ) : (
            <Text style={styles.lead}>Metin ve medya ekleyin. Not numarası otomatik atanır.</Text>
          )}

          <Section title="İçerik">
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Başlık (isteğe bağlı)"
              placeholderTextColor={notesTheme.textSoft}
            />
            <TextInput
              style={[styles.input, styles.bodyInput]}
              value={body}
              onChangeText={setBody}
              placeholder="Notunuzu yazın…"
              placeholderTextColor={notesTheme.textSoft}
              multiline
              textAlignVertical="top"
            />
          </Section>

          <Section title="Kategori">
            <View style={styles.tagGrid}>
              {TAGS.map((t) => {
                const on = tag === t;
                return (
                  <Pressable
                    key={t}
                    style={[styles.tagOption, on && styles.tagOptionOn]}
                    onPress={() => setTag(t)}
                  >
                    <Ionicons
                      name={TAG_ICONS[t]}
                      size={16}
                      color={on ? notesTheme.accentDark : notesTheme.textMuted}
                    />
                    <Text style={[styles.tagOptionText, on && styles.tagOptionTextOn]}>
                      {ADMIN_NOTE_TAG_LABELS[t]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {tag === 'room' ? (
              <TextInput
                style={[styles.input, { marginTop: 10 }]}
                value={roomLabel}
                onChangeText={setRoomLabel}
                placeholder="Oda veya konum (örn. 204, lobi)"
                placeholderTextColor={notesTheme.textSoft}
              />
            ) : null}
          </Section>

          <Section title="Ekler">
            <View style={styles.mediaActions}>
              <PressableScale style={styles.mediaBtn} onPress={() => pickMedia(true)} disabled={picking}>
                <Ionicons name="camera-outline" size={20} color={notesTheme.accentDark} />
                <Text style={styles.mediaBtnText}>Kamera</Text>
              </PressableScale>
              <PressableScale style={styles.mediaBtn} onPress={() => pickMedia(false)} disabled={picking}>
                <Ionicons name="images-outline" size={20} color={notesTheme.accentDark} />
                <Text style={styles.mediaBtnText}>Galeri</Text>
              </PressableScale>
            </View>

            {allThumbs.length > 0 ? (
              <View style={styles.thumbGrid}>
                {allThumbs.map((t) => (
                  <View key={t.key} style={styles.thumbWrap}>
                    <CachedImage uri={t.uri} style={styles.thumb} contentFit="cover" />
                    {t.preparing ? (
                      <View style={styles.thumbOverlay}>
                        <ActivityIndicator color="#fff" size="small" />
                      </View>
                    ) : null}
                    {t.isVideo ? (
                      <View style={styles.videoBadge}>
                        <Ionicons name="videocam" size={10} color="#fff" />
                      </View>
                    ) : null}
                    <Pressable style={styles.thumbRemove} onPress={t.onRemove}>
                      <Ionicons name="close" size={14} color="#fff" />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.noMedia}>Henüz ek yok</Text>
            )}
          </Section>

          {uploadStep ? (
            <View style={styles.progress}>
              <ActivityIndicator size="small" color={notesTheme.accent} />
              <Text style={styles.progressText}>{uploadStep}</Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {onCancel ? (
            <Pressable style={styles.cancelBtn} onPress={onCancel} disabled={saving}>
              <Text style={styles.cancelText}>Vazgeç</Text>
            </Pressable>
          ) : null}
          <PressableScale
            style={[styles.saveBtn, !canSave && styles.saveBtnDisabled, onCancel ? { flex: 2 } : { flex: 1 }]}
            onPress={submit}
            disabled={saving || !canSave}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.saveText}>{isEdit ? 'Güncelle' : 'Kaydet'}</Text>
              </>
            )}
          </PressableScale>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: pds.pageBg },
  flex: { flex: 1 },
  scroll: { padding: 16 },
  lead: { fontSize: 14, color: notesTheme.textMuted, lineHeight: 20, marginBottom: 16 },
  editBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: notesTheme.accentGhost,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: notesTheme.borderFocus,
  },
  editBannerLabel: { fontSize: 13, fontWeight: '700', color: notesTheme.accentDark },
  editBannerNum: { fontSize: 12, fontWeight: '800', color: notesTheme.textSecondary },
  section: { marginBottom: 14 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: notesTheme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginLeft: 2,
  },
  sectionBody: {
    backgroundColor: notesTheme.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: notesTheme.border,
    gap: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: notesTheme.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: notesTheme.text,
    backgroundColor: notesTheme.cardMuted,
  },
  bodyInput: { minHeight: 130, paddingTop: 12, textAlignVertical: 'top' },
  tagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: notesTheme.cardMuted,
    borderWidth: 1,
    borderColor: notesTheme.border,
  },
  tagOptionOn: {
    backgroundColor: notesTheme.accentGhost,
    borderColor: notesTheme.accent,
  },
  tagOptionText: { fontSize: 13, fontWeight: '600', color: notesTheme.textMuted },
  tagOptionTextOn: { color: notesTheme.accentDark, fontWeight: '700' },
  mediaActions: { flexDirection: 'row', gap: 10 },
  mediaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: notesTheme.accentGhost,
    borderWidth: 1,
    borderColor: notesTheme.borderFocus,
  },
  mediaBtnText: { fontSize: 13, fontWeight: '700', color: notesTheme.accentDark },
  thumbGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  thumbWrap: { width: 76, height: 76, borderRadius: 10, overflow: 'hidden' },
  thumb: { width: '100%', height: '100%' },
  thumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
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
  thumbRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(220,38,38,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noMedia: { fontSize: 13, color: notesTheme.textSoft, textAlign: 'center', paddingVertical: 8 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  progressText: { fontSize: 12, color: notesTheme.textMuted },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: notesTheme.card,
    borderTopWidth: 1,
    borderTopColor: notesTheme.border,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: notesTheme.cardMuted,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: notesTheme.border,
  },
  cancelText: { fontWeight: '700', color: notesTheme.textMuted, fontSize: 15 },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: notesTheme.accent,
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
