import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { AdminNotesAccessGate } from '@/components/adminNotes/AdminNotesAccessGate';
import { AdminNoteComposer } from '@/components/adminNotes/AdminNoteComposer';
import { getAdminQuickNote, type AdminQuickNoteRow } from '@/lib/adminQuickNotes';
import { canEditQuickNote } from '@/lib/staffPermissions';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { useCachedFocusLoad } from '@/hooks/useCachedFocusLoad';

function AdminNotesEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const staff = useAuthStore((s) => s.staff);
  const isAdminRoute = pathname?.startsWith('/admin') ?? false;
  const base = isAdminRoute ? '/admin/notes' : '/staff/admin-notes';

  const [note, setNote] = useState<AdminQuickNoteRow | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return null;
    const { data, error } = await getAdminQuickNote(id);
    if (error) Alert.alert('Hata', error);
    return data;
  }, [id]);

  const { data: cachedNote, showContent } = useCachedFocusLoad({
    cacheKey: id ? `admin-quick-note:${id}` : 'admin-quick-note:none',
    enabled: !!id,
    fetchData,
  });

  useEffect(() => {
    setNote(cachedNote);
  }, [cachedNote]);

  if (!showContent && !note) {
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

  if (!canEditQuickNote(staff, note)) {
    return (
      <View style={styles.centered}>
        <Text style={styles.missing}>Bu notu düzenleme yetkiniz yok</Text>
      </View>
    );
  }

  return (
    <AdminNoteComposer
      editNote={note}
      onCancel={() => router.back()}
      onSaved={(noteId) => {
        Alert.alert('Güncellendi', 'Not kaydedildi.', [
          { text: 'Detay', onPress: () => router.replace(`${base}/${noteId}` as never) },
        ]);
      }}
    />
  );
}

export default function AdminNotesEdit() {
  return (
    <AdminNotesAccessGate>
      <AdminNotesEditScreen />
    </AdminNotesAccessGate>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  missing: { color: theme.colors.textMuted, textAlign: 'center', lineHeight: 22 },
});
