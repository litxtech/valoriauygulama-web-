import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { supabase } from '@/lib/supabase';
import { DocumentScreenIntro } from '@/components/documents/DocumentScreenIntro';
import { docTheme } from '@/constants/documentManagementTheme';

const ACTION_LABELS: Record<string, string> = {
  'document.created': 'Belge oluşturuldu',
  'document.updated': 'Belge güncellendi',
  'document.submit_approval': 'Onaya gönderildi',
  'document.approved': 'Onaylandı',
  'document.rejected': 'Reddedildi',
  'document.archived': 'Arşivlendi',
  'document.unarchived': 'Arşivden çıkarıldı',
};

function formatAction(action: string): string {
  return ACTION_LABELS[action] ?? action.replace('document.', '').replace(/_/g, ' ');
}

export default function AdminDocumentsLogs() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await supabase
      .from('document_logs')
      .select('id, document_id, actor_staff_id, action_type, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (!res.error && res.data) setRows(res.data as any);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.container}>
      <FlatList
        data={rows}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={<DocumentScreenIntro screenKey="logs" />}
        ListEmptyComponent={<Text style={styles.empty}>{loading ? 'Yükleniyor…' : 'Henüz işlem kaydı yok'}</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rowTitle}>{formatAction(item.action_type)}</Text>
            <Text style={styles.rowMeta}>
              {new Date(item.created_at).toLocaleString('tr-TR')}
              {item.document_id ? ` · Belge #${String(item.document_id).slice(0, 8)}` : ''}
            </Text>
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
    backgroundColor: docTheme.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: docTheme.border,
    padding: 14,
    marginBottom: 10,
  },
  rowTitle: { fontSize: 14, fontWeight: '800', color: docTheme.text },
  rowMeta: { marginTop: 4, fontSize: 12, fontWeight: '600', color: docTheme.textMuted },
});
