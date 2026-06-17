import { useRouter, usePathname } from 'expo-router';
import { Alert } from 'react-native';
import { AdminNotesAccessGate } from '@/components/adminNotes/AdminNotesAccessGate';
import { AdminNoteComposer } from '@/components/adminNotes/AdminNoteComposer';

function AdminNotesNewScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith('/admin') ?? false;
  const base = isAdminRoute ? '/admin/notes' : '/staff/admin-notes';

  return (
    <AdminNoteComposer
      onCancel={() => router.back()}
      onSaved={(id, noteNumber) => {
        Alert.alert('Kaydedildi', `Not numarası: ${noteNumber}`, [
          { text: 'Listeye dön', onPress: () => router.replace(base as never) },
          { text: 'Detay', onPress: () => router.replace(`${base}/${id}` as never) },
        ]);
      }}
    />
  );
}

export default function AdminNotesNew() {
  return (
    <AdminNotesAccessGate>
      <AdminNotesNewScreen />
    </AdminNotesAccessGate>
  );
}
