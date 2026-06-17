import { useCallback, useLayoutEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Pressable,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useNavigation, usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AdminNotesAccessGate } from '@/components/adminNotes/AdminNotesAccessGate';
import { AdminNoteMediaGrid } from '@/components/adminNotes/AdminNoteMediaGrid';
import { AdminNoteMediaViewer } from '@/components/adminNotes/AdminNoteMediaViewer';
import {
  ADMIN_NOTE_TAG_COLORS,
  ADMIN_NOTE_TAG_LABELS,
  deleteAdminQuickNote,
  quickNoteAuthorLabel,
  getAdminQuickNote,
  updateAdminQuickNote,
  type AdminQuickNoteRow,
} from '@/lib/adminQuickNotes';
import { shareQuickNoteWithOptions } from '@/lib/adminQuickNoteShare';
import { theme } from '@/constants/theme';

function AdminNoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith('/admin') ?? false;
  const base = isAdminRoute ? '/admin/notes' : '/staff/admin-notes';

  const [note, setNote] = useState<AdminQuickNoteRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const load = useCallback(async () => {
    if (!id) return;
    const { data, error } = await getAdminQuickNote(id);
    if (error) Alert.alert('Hata', error);
    setNote(data);
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        note ? (
          <TouchableOpacity
            onPress={() => void shareQuickNoteWithOptions(note)}
            style={styles.headerShare}
            accessibilityLabel="Notu paylaş"
          >
            <Ionicons name="share-outline" size={22} color="#6366F1" />
          </TouchableOpacity>
        ) : null,
    });
  }, [navigation, note]);

  const openViewer = (index: number) => {
    setViewerIndex(index);
    setViewerOpen(true);
  };

  const togglePin = async () => {
    if (!note) return;
    const { error } = await updateAdminQuickNote(note.id, { isPinned: !note.is_pinned });
    if (error) Alert.alert('Hata', error);
    else void load();
  };

  const toggleArchive = async () => {
    if (!note) return;
    const { error } = await updateAdminQuickNote(note.id, { isArchived: !note.is_archived });
    if (error) Alert.alert('Hata', error);
    else {
      Alert.alert(note.is_archived ? 'Arşivden çıkarıldı' : 'Arşivlendi');
      void load();
    }
  };

  const onDelete = () => {
    if (!note) return;
    Alert.alert('Notu sil', `${note.note_number} kalıcı silinsin mi?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          const { error } = await deleteAdminQuickNote(note.id);
          if (error) Alert.alert('Hata', error);
          else router.replace(base as never);
        },
      },
    ]);
  };

  if (loading && !note) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#6366F1" />
      </View>
    );
  }

  if (!note) {
    return (
      <View style={styles.centered}>
        <Text style={styles.missing}>Not bulunamadı</Text>
      </View>
    );
  }

  const tagStyle = ADMIN_NOTE_TAG_COLORS[note.tag] ?? ADMIN_NOTE_TAG_COLORS.general;
  const when = new Date(note.created_at).toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const media = [...(note.media ?? [])].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <Text style={styles.number}>{note.note_number}</Text>
          <View style={[styles.tag, { backgroundColor: tagStyle.bg }]}>
            <Text style={[styles.tagText, { color: tagStyle.text }]}>{ADMIN_NOTE_TAG_LABELS[note.tag]}</Text>
          </View>
        </View>

        {note.title ? <Text style={styles.title}>{note.title}</Text> : null}
        <Text style={styles.authorRow}>{quickNoteAuthorLabel(note)}</Text>
        <Text style={styles.when}>{when}</Text>
        {note.room_label ? (
          <View style={styles.roomRow}>
            <Ionicons name="bed-outline" size={14} color="#64748B" />
            <Text style={styles.room}>{note.room_label}</Text>
          </View>
        ) : null}

        <Text style={styles.body}>{note.body_text || '—'}</Text>

        <AdminNoteMediaGrid media={media} onOpen={openViewer} />

        <View style={styles.actions}>
          <Pressable style={styles.actionBtn} onPress={() => void shareQuickNoteWithOptions(note)}>
            <Ionicons name="share-social-outline" size={18} color="#6366F1" />
            <Text style={[styles.actionText, { color: '#4F46E5' }]}>Paylaş</Text>
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={togglePin}>
            <Ionicons name={note.is_pinned ? 'pin' : 'pin-outline'} size={18} color="#6366F1" />
            <Text style={styles.actionText}>{note.is_pinned ? 'Sabitlemeyi kaldır' : 'Sabitle'}</Text>
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={toggleArchive}>
            <Ionicons name="archive-outline" size={18} color="#64748B" />
            <Text style={styles.actionText}>{note.is_archived ? 'Arşivden çıkar' : 'Arşivle'}</Text>
          </Pressable>
          <Pressable style={[styles.actionBtn, styles.deleteBtn]} onPress={onDelete}>
            <Ionicons name="trash-outline" size={18} color="#DC2626" />
            <Text style={[styles.actionText, { color: '#DC2626' }]}>Sil</Text>
          </Pressable>
        </View>
      </ScrollView>

      <AdminNoteMediaViewer
        visible={viewerOpen}
        media={media}
        initialIndex={viewerIndex}
        noteNumber={note.note_number}
        onClose={() => setViewerOpen(false)}
      />
    </>
  );
}

export default function AdminNoteDetail() {
  return (
    <AdminNotesAccessGate>
      <AdminNoteDetailScreen />
    </AdminNotesAccessGate>
  );
}

const styles = StyleSheet.create({
  headerShare: { paddingHorizontal: 14, paddingVertical: 6 },
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  missing: { color: theme.colors.textMuted },
  hero: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  number: { fontSize: 13, fontWeight: '900', color: '#6366F1', letterSpacing: 0.4 },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  tagText: { fontSize: 11, fontWeight: '800' },
  title: { fontSize: 20, fontWeight: '900', color: '#0F172A', marginBottom: 6 },
  authorRow: { fontSize: 12, fontWeight: '800', color: '#6366F1', marginBottom: 4 },
  when: { fontSize: 12, color: '#94A3B8', marginBottom: 8 },
  roomRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  room: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  body: { fontSize: 15, color: '#1E293B', lineHeight: 24, marginBottom: 8 },
  actions: { gap: 8 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  actionText: { fontSize: 14, fontWeight: '700', color: '#334155' },
  deleteBtn: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
});
