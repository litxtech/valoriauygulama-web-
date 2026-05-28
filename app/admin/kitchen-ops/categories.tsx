import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TextInput, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAdminOrganizationQueryScope } from '@/hooks/useAdminOrganizationQueryScope';
import { adminTheme } from '@/constants/adminTheme';
import { Ionicons } from '@expo/vector-icons';

type Cat = { id: string; name: string; sort_order: number; active: boolean };

export default function AdminKitchenCategoriesScreen() {
  const orgScoped = useAdminOrganizationQueryScope();
  const [cats, setCats] = useState<Cat[]>([]);
  const [newName, setNewName] = useState('');

  const load = useCallback(async () => {
    let q = supabase.from('kitchen_stock_categories').select('id, name, sort_order, active').order('sort_order');
    if (orgScoped) q = q.eq('organization_id', orgScoped);
    const { data } = await q;
    setCats((data ?? []) as Cat[]);
  }, [orgScoped]);

  useEffect(() => { load(); }, [load]);

  const addCategory = async () => {
    if (!newName.trim() || !orgScoped) return;
    const { error } = await supabase.from('kitchen_stock_categories').insert({
      organization_id: orgScoped,
      name: newName.trim(),
      sort_order: cats.length,
    });
    if (error) Alert.alert('Hata', error.message);
    else { setNewName(''); load(); }
  };

  const toggleActive = async (cat: Cat) => {
    await supabase.from('kitchen_stock_categories').update({ active: !cat.active }).eq('id', cat.id);
    load();
  };

  return (
    <View style={styles.container}>
      <View style={styles.addRow}>
        <TextInput style={styles.input} value={newName} onChangeText={setNewName} placeholder="Yeni kategori" placeholderTextColor={adminTheme.colors.textMuted} />
        <TouchableOpacity style={styles.addBtn} onPress={addCategory}><Ionicons name="add" size={22} color="#fff" /></TouchableOpacity>
      </View>
      <FlatList
        data={cats}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={[styles.name, !item.active && styles.inactive]}>{item.name}</Text>
            <TouchableOpacity onPress={() => toggleActive(item)}>
              <Ionicons name={item.active ? 'eye-outline' : 'eye-off-outline'} size={22} color={adminTheme.colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  addRow: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 0 },
  input: { flex: 1, backgroundColor: adminTheme.colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: adminTheme.colors.border, fontSize: 16, color: adminTheme.colors.text },
  addBtn: { backgroundColor: adminTheme.colors.primary, borderRadius: 12, width: 48, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: adminTheme.colors.surface, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: adminTheme.colors.borderLight },
  name: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  inactive: { opacity: 0.5, textDecorationLine: 'line-through' },
});
