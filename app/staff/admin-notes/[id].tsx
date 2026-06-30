import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect, useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { AdminNotesAccessGate } from '@/components/adminNotes/AdminNotesAccessGate';
import { AdminNoteDetailCard } from '@/components/adminNotes/AdminNoteDetailCard';
import { AdminNoteMediaViewer } from '@/components/adminNotes/AdminNoteMediaViewer';
import {
  deleteAdminQuickNote,
  getAdminQuickNote,
  updateAdminQuickNote,
  type AdminQuickNoteRow,
} from '@/lib/adminQuickNotes';
import { shareQuickNoteWithOptions } from '@/lib/adminQuickNoteShare';
import { canEditQuickNote } from '@/lib/staffPermissions';
import { useAuthStore } from '@/stores/authStore';
import { notesTheme } from '@/constants/adminNotesTheme';

function AdminNoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const staff = useAuthStore((s) => s.staff);
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
        <ActivityIndicator color={notesTheme.accent} size="large" />
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

  const media = [...(note.media ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const canEdit = canEditQuickNote(staff, note);

  return (
    <View style={styles.screen}>
      <AdminNoteDetailCard
        note={note}
        canEdit={canEdit}
        onEdit={() => router.push(`${base}/edit/${note.id}` as never)}
        onShare={() => void shareQuickNoteWithOptions(note)}
        onOpenMedia={openViewer}
        onPin={() => void togglePin()}
        onArchive={() => void toggleArchive()}
        onDelete={onDelete}
      />

      <AdminNoteMediaViewer
        visible={viewerOpen}
        media={media}
        initialIndex={viewerIndex}
        noteNumber={note.note_number}
        onClose={() => setViewerOpen(false)}
      />
    </View>
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
  screen: { flex: 1, backgroundColor: notesTheme.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: notesTheme.bg },
  missing: { color: notesTheme.textMuted, fontSize: 15 },
});
