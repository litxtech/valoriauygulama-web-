import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import {
  buildKbsGuestRecommendations,
  kbsRecommendationBannerColors,
} from '@/lib/kbsGuestRecommendations';
import {
  createKbsGuestNote,
  deleteKbsGuestNote,
  fetchKbsGuestNotes,
  formatKbsNoteTime,
  KBS_GUEST_NOTE_TAG_META,
  type KbsGuestNote,
  type KbsGuestNoteTag,
} from '@/lib/kbsGuestNotes';
import type { ParsedDocument } from '@/lib/scanner/types';

type Props = {
  hotelId: string;
  guestId: string;
  guestDocumentId: string;
  documentNumber?: string | null;
  parsed: ParsedDocument | null;
  authUserId?: string | null;
  staffName?: string | null;
  canWrite?: boolean;
};

const TAG_ORDER: KbsGuestNoteTag[] = ['info', 'good', 'problematic', 'incident', 'vip'];

export function KbsGuestNotesPanel({
  hotelId,
  guestId,
  guestDocumentId,
  documentNumber,
  parsed,
  authUserId,
  staffName,
  canWrite = true,
}: Props) {
  const [notes, setNotes] = useState<KbsGuestNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [body, setBody] = useState('');
  const [tag, setTag] = useState<KbsGuestNoteTag>('info');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await fetchKbsGuestNotes({
        guestId,
        hotelId,
        documentNumber,
      });
      setNotes(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Notlar yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [guestId, hotelId, documentNumber]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const recommendations = useMemo(
    () => buildKbsGuestRecommendations({ notes, parsed }),
    [notes, parsed]
  );

  const save = useCallback(async () => {
    if (!canWrite || saving) return;
    const text = body.trim();
    if (!text) {
      Alert.alert('Not', 'Lütfen bir not yazın.');
      return;
    }
    setSaving(true);
    try {
      const res = await createKbsGuestNote({
        hotelId,
        guestId,
        guestDocumentId,
        documentNumber,
        tag,
        body: text,
        createdByAuthId: authUserId,
        createdByStaffName: staffName,
      });
      if (!res.ok) {
        Alert.alert('Not', res.message);
        return;
      }
      setBody('');
      setTag('info');
      setNotes((prev) => [res.note, ...prev]);
    } finally {
      setSaving(false);
    }
  }, [
    canWrite,
    saving,
    body,
    hotelId,
    guestId,
    guestDocumentId,
    documentNumber,
    tag,
    authUserId,
    staffName,
  ]);

  const remove = useCallback(
    (note: KbsGuestNote) => {
      Alert.alert('Notu sil', 'Bu not silinsin mi?', [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const res = await deleteKbsGuestNote(note.id);
              if (!res.ok) {
                Alert.alert('Not', res.message);
                return;
              }
              setNotes((prev) => prev.filter((n) => n.id !== note.id));
            })();
          },
        },
      ]);
    },
    []
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Ionicons name="create-outline" size={18} color={theme.colors.primary} />
        <Text style={styles.title}>Müşteri notları</Text>
        {notes.length > 0 ? (
          <View style={styles.countChip}>
            <Text style={styles.countText}>{notes.length}</Text>
          </View>
        ) : null}
      </View>

      {recommendations.length > 0 ? (
        <View style={styles.recoList}>
          {recommendations.map((r) => {
            const colors = kbsRecommendationBannerColors(r.tone);
            return (
              <View
                key={r.id}
                style={[styles.recoCard, { backgroundColor: colors.bg, borderColor: colors.border }]}
              >
                <Ionicons name={colors.icon as 'alert-circle'} size={18} color={colors.fg} />
                <View style={styles.recoTextCol}>
                  <Text style={[styles.recoTitle, { color: colors.fg }]}>{r.title}</Text>
                  <Text style={[styles.recoDetail, { color: colors.fg }]}>{r.detail}</Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {canWrite ? (
        <View style={styles.composer}>
          <Text style={styles.composerHint}>Bu müşteri hakkında bilgi / durum notu yazın</Text>
          <View style={styles.tagRow}>
            {TAG_ORDER.map((t) => {
              const meta = KBS_GUEST_NOTE_TAG_META[t];
              const on = tag === t;
              return (
                <Pressable
                  key={t}
                  style={[styles.tagChip, on && { backgroundColor: meta.color, borderColor: meta.color }]}
                  onPress={() => setTag(t)}
                >
                  <Text style={[styles.tagChipText, on && styles.tagChipTextOn]}>{meta.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            style={styles.input}
            value={body}
            onChangeText={setBody}
            placeholder="Örn. Sorunlu müşteri — resepsiyonda tartışma yaşandı…"
            placeholderTextColor={theme.colors.textMuted}
            multiline
            textAlignVertical="top"
            maxLength={4000}
          />
          <Pressable
            style={[styles.saveBtn, (saving || !body.trim()) && styles.saveBtnDisabled]}
            onPress={() => void save()}
            disabled={saving || !body.trim()}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={18} color="#fff" />
                <Text style={styles.saveText}>Not ekle</Text>
              </>
            )}
          </Pressable>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator style={{ marginVertical: 12 }} color={theme.colors.primary} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : notes.length === 0 ? (
        <Text style={styles.empty}>Henüz not yok. İsim / pasaport no ile listeden de aranabilir.</Text>
      ) : (
        <View style={styles.list}>
          {notes.map((note) => {
            const meta = KBS_GUEST_NOTE_TAG_META[note.tag];
            const canDelete =
              canWrite && (!note.created_by_auth_id || note.created_by_auth_id === authUserId);
            return (
              <View key={note.id} style={styles.noteCard}>
                <View style={styles.noteHead}>
                  <View style={[styles.noteTag, { backgroundColor: meta.bg }]}>
                    <Text style={[styles.noteTagText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                  <Text style={styles.noteTime}>{formatKbsNoteTime(note.created_at)}</Text>
                  {canDelete ? (
                    <Pressable onPress={() => remove(note)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={16} color="#dc2626" />
                    </Pressable>
                  ) : null}
                </View>
                <Text style={styles.noteBody}>{note.body}</Text>
                {note.created_by_staff_name ? (
                  <Text style={styles.noteAuthor}>{note.created_by_staff_name}</Text>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    padding: 14,
    marginBottom: 14,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  title: { fontSize: 14, fontWeight: '800', color: theme.colors.text, flex: 1 },
  countChip: {
    backgroundColor: theme.colors.backgroundSecondary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  countText: { fontSize: 12, fontWeight: '800', color: theme.colors.textSecondary },
  recoList: { gap: 8, marginBottom: 12 },
  recoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  recoTextCol: { flex: 1 },
  recoTitle: { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  recoDetail: { fontSize: 12, fontWeight: '600', lineHeight: 17, opacity: 0.92 },
  composer: { marginBottom: 12 },
  composerHint: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 8, fontWeight: '600' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  tagChip: {
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.backgroundSecondary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  tagChipText: { fontSize: 11, fontWeight: '700', color: theme.colors.textSecondary },
  tagChipTextOn: { color: '#fff' },
  input: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.colors.text,
    backgroundColor: theme.colors.backgroundSecondary,
    marginBottom: 8,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    paddingVertical: 11,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  error: { color: '#b91c1c', fontSize: 13, fontWeight: '600' },
  empty: { fontSize: 12, color: theme.colors.textMuted, lineHeight: 17 },
  list: { gap: 8 },
  noteCard: {
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  noteHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  noteTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7 },
  noteTagText: { fontSize: 11, fontWeight: '800' },
  noteTime: { flex: 1, fontSize: 11, color: theme.colors.textMuted, fontWeight: '600' },
  noteBody: { fontSize: 13, color: theme.colors.text, lineHeight: 18, fontWeight: '600' },
  noteAuthor: { marginTop: 6, fontSize: 11, color: theme.colors.textMuted, fontWeight: '600' },
});
