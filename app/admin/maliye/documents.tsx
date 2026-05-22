import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, TextInput } from 'react-native';
import { supabase } from '@/lib/supabase';
import { listMaliyeSections } from '@/lib/maliyeAccess';

type Row = {
  id: string;
  title: string;
  is_maliye_visible: boolean;
  maliye_section_id: string | null;
};

export default function AdminMaliyeDocuments() {
  const [rows, setRows] = useState<Row[]>([]);
  const [sections, setSections] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [newSectionName, setNewSectionName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [docsRes, secRes] = await Promise.all([
      supabase
        .from('documents')
        .select('id, title, is_maliye_visible, maliye_section_id')
        .is('archived_at', null)
        .order('updated_at', { ascending: false })
        .limit(200),
      listMaliyeSections(),
    ]);
    if (!docsRes.error) setRows((docsRes.data as Row[]) ?? []);
    if (!secRes.error) setSections((secRes.data as any) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleVisible = async (item: Row) => {
    const next = !item.is_maliye_visible;
    const { error } = await supabase.from('documents').update({ is_maliye_visible: next }).eq('id', item.id);
    if (error) return Alert.alert('Hata', error.message);
    setRows((prev) => prev.map((r) => (r.id === item.id ? { ...r, is_maliye_visible: next } : r)));
  };

  const assignSection = (item: Row) => {
    if (!sections.length) return Alert.alert('Bilgi', 'Önce maliye çekmecesi oluşturun.');
    const buttons = [
      ...sections.map((s) => ({
        text: s.name,
        onPress: async () => {
          const { error } = await supabase
            .from('documents')
            .update({ maliye_section_id: s.id })
            .eq('id', item.id);
          if (error) return Alert.alert('Hata', error.message);
          setRows((prev) =>
            prev.map((r) => (r.id === item.id ? { ...r, maliye_section_id: s.id } : r))
          );
        },
      })),
      { text: 'İptal', style: 'cancel' as const },
    ];
    Alert.alert('Çekmece seçin', item.title, buttons);
  };

  const createSection = async () => {
    const name = newSectionName.trim();
    if (!name) return Alert.alert('Eksik', 'Section adı girin.');
    const { data: me } = await supabase.from('staff').select('id, organization_id').eq('auth_id', (await supabase.auth.getUser()).data.user?.id ?? '').maybeSingle();
    if (!me?.organization_id) return Alert.alert('Hata', 'Organizasyon bulunamadı.');
    const nextOrder = sections.length;
    const { error } = await supabase
      .from('maliye_document_sections')
      .insert({ organization_id: me.organization_id, name, display_order: nextOrder, created_by_staff_id: me.id, is_active: true });
    if (error) return Alert.alert('Hata', error.message);
    setNewSectionName('');
    await load();
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 20 }} />;

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>Denetim portalinda gorunecek evraklari buradan yonetin: cekmece olustur, sira ver, gorunurluk degistir.</Text>
      <View style={styles.row}>
        <TextInput
          value={newSectionName}
          onChangeText={setNewSectionName}
          placeholder="Yeni cekmece adi"
          style={[styles.input, { flex: 1 }]}
        />
        <TouchableOpacity style={styles.altCreate} onPress={createSection}>
          <Text style={styles.btnText}>Cekmece Ekle</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.meta}>Denetim portalinda: {item.is_maliye_visible ? 'Gorunur' : 'Gizli'}</Text>
            <View style={styles.row}>
              <TouchableOpacity style={styles.btn} onPress={() => toggleVisible(item)}>
                <Text style={styles.btnText}>{item.is_maliye_visible ? 'Gizle' : 'Goster'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.alt]} onPress={() => assignSection(item)}>
                <Text style={styles.btnText}>Cekmece Ata</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 14 },
  hint: { color: '#475569', marginBottom: 10 },
  card: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', padding: 12, marginBottom: 8 },
  title: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  meta: { color: '#64748b', marginTop: 4 },
  row: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn: { backgroundColor: '#1d4ed8', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  alt: { backgroundColor: '#0f766e' },
  altCreate: { backgroundColor: '#0f766e', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, marginLeft: 8 },
  btnText: { color: '#fff', fontWeight: '700' },
});
