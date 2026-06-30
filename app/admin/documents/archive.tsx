import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { listDocuments } from '@/lib/documentManagement';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { DocumentScreenIntro } from '@/components/documents/DocumentScreenIntro';
import { documentDetailHref, useDocumentsBasePath } from '@/lib/documentManagementRoutes';
import { docTheme } from '@/constants/documentManagementTheme';

export default function AdminDocumentsArchive() {
  const router = useRouter();
  const base = useDocumentsBasePath();
  const staff = useAuthStore((s) => s.staff);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listDocuments({ archived: true });
    if (!res.error && res.data) setRows(res.data as any);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unarchiveDoc = (docId: string, title: string) => {
    Alert.alert('Arşivden çıkar', `"${title}" normal belgelere taşınsın mı?`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Taşı',
        onPress: async () => {
          const res = await supabase
            .from('documents')
            .update({ status: 'active', archived_at: null })
            .eq('id', docId);
          if (res.error) {
            Alert.alert('Hata', res.error.message);
            return;
          }
          await supabase.from('document_logs').insert({
            organization_id: staff?.organization_id,
            document_id: docId,
            actor_staff_id: staff?.id,
            action_type: 'document.unarchived',
            new_data: {},
          });
          await load();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={rows}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={<DocumentScreenIntro screenKey="archive" />}
        ListEmptyComponent={<Text style={styles.sub}>{loading ? 'Yükleniyor…' : 'Arşiv boş'}</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <TouchableOpacity
              style={styles.rowMain}
              activeOpacity={0.75}
              onPress={() => router.push(documentDetailHref(base, item.id) as never)}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  Arşiv: {item.archived_at ? new Date(item.archived_at).toLocaleString('tr-TR') : '-'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={docTheme.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.unarchiveBtn}
              activeOpacity={0.85}
              onPress={() => unarchiveDoc(item.id, item.title)}
            >
              <Ionicons name="arrow-undo-outline" size={18} color="#fff" />
              <Text style={styles.unarchiveBtnText}>Normal listeye</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: docTheme.bg },
  content: { padding: 16, paddingBottom: 24 },
  sub: { fontSize: 14, fontWeight: '600', color: docTheme.textMuted, textAlign: 'center', paddingVertical: 24 },
  row: {
    backgroundColor: docTheme.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: docTheme.border,
    marginBottom: 10,
    overflow: 'hidden',
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 8,
  },
  rowTitle: { fontSize: 15, fontWeight: '800', color: docTheme.text },
  rowMeta: { marginTop: 4, fontSize: 12, fontWeight: '600', color: docTheme.textMuted },
  unarchiveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: '#16A34A',
    borderTopWidth: 1,
    borderTopColor: docTheme.border,
  },
  unarchiveBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
});
