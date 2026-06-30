import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { DocumentScreenIntro } from '@/components/documents/DocumentScreenIntro';
import { documentDetailHref, useDocumentsBasePath } from '@/lib/documentManagementRoutes';
import { docTheme } from '@/constants/documentManagementTheme';

export default function AdminDocumentsExpired() {
  const router = useRouter();
  const base = useDocumentsBasePath();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const res = await supabase
      .from('documents')
      .select('id, title, expiry_date, status, updated_at')
      .not('expiry_date', 'is', null)
      .lt('expiry_date', today)
      .order('expiry_date', { ascending: true })
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
        ListHeaderComponent={<DocumentScreenIntro screenKey="expired" />}
        ListEmptyComponent={<Text style={styles.empty}>{loading ? 'Yükleniyor…' : 'Süresi dolmuş belge yok'}</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.75}
            onPress={() => router.push(documentDetailHref(base, item.id) as never)}
          >
            <Text style={styles.rowTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.rowMeta}>Süresi doldu: {item.expiry_date}</Text>
          </TouchableOpacity>
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
    borderColor: '#FECDD3',
    padding: 14,
    marginBottom: 10,
  },
  rowTitle: { fontSize: 15, fontWeight: '700', color: docTheme.text },
  rowMeta: { marginTop: 4, fontSize: 12, fontWeight: '600', color: docTheme.rose },
});
