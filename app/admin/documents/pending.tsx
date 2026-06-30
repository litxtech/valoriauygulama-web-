import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { DocumentScreenIntro } from '@/components/documents/DocumentScreenIntro';
import { documentDetailHref, useDocumentsBasePath } from '@/lib/documentManagementRoutes';
import { docTheme } from '@/constants/documentManagementTheme';

export default function AdminDocumentsPending() {
  const router = useRouter();
  const base = useDocumentsBasePath();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await supabase
      .from('document_approvals')
      .select('id, document_id, status, created_at, requested_by_staff_id, documents(title, status)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(200);
    if (!res.error && res.data) setRows(res.data as any);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = async (approvalId: string, documentId: string) => {
    const now = new Date().toISOString();
    const docUp = await supabase
      .from('documents')
      .update({ status: 'active', approved_by_staff_id: null, rejected_reason: null })
      .eq('id', documentId);
    if (docUp.error) {
      Alert.alert('Hata', docUp.error.message);
      return;
    }
    const apprUp = await supabase
      .from('document_approvals')
      .update({ status: 'approved', reviewed_at: now })
      .eq('id', approvalId);
    if (apprUp.error) {
      Alert.alert('Hata', apprUp.error.message);
      return;
    }
    await load();
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={rows}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={<DocumentScreenIntro screenKey="pending" />}
        ListEmptyComponent={<Text style={styles.empty}>{loading ? 'Yükleniyor…' : 'Onay bekleyen belge yok'}</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <TouchableOpacity
              style={styles.rowMain}
              activeOpacity={0.75}
              onPress={() => router.push(documentDetailHref(base, item.document_id) as never)}
            >
              <View style={styles.rowIcon}>
                <Ionicons name="document-outline" size={20} color={docTheme.amber} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.documents?.title ?? 'Belge'}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  Talep: {new Date(item.created_at).toLocaleString('tr-TR')}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.approveBtn}
              onPress={() => void approve(item.id, item.document_id)}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark" size={20} color="#fff" />
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
  empty: { fontSize: 14, fontWeight: '600', color: docTheme.textMuted, textAlign: 'center', paddingVertical: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: docTheme.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: docTheme.border,
    marginBottom: 10,
    padding: 12,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: docTheme.amberSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: 15, fontWeight: '700', color: docTheme.text },
  rowMeta: { marginTop: 3, fontSize: 12, fontWeight: '500', color: docTheme.textMuted },
  approveBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
