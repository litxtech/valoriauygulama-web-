import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard } from '@/components/admin';
import { DEFAULT_PUBLIC_MENU_ORG_SLUG } from '@/lib/publicPortalNav';
import { todayIso } from '@/lib/onlineBooking';

type Row = {
  id: string;
  meal_date: string;
  title: string | null;
  items: string;
  image_url: string | null;
};

export default function AdminBookingBreakfast() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(todayIso);
  const [title, setTitle] = useState('Sabah kahvaltısı');
  const [items, setItems] = useState('');

  const load = useCallback(async () => {
    try {
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', DEFAULT_PUBLIC_MENU_ORG_SLUG)
        .maybeSingle();
      let q = supabase
        .from('guest_breakfast_days')
        .select('id, meal_date, title, items, image_url')
        .order('meal_date', { ascending: true })
        .limit(60);
      if (org?.id) q = q.eq('organization_id', org.id);
      const { data, error } = await q;
      if (error) throw error;
      setRows((data ?? []) as Row[]);
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message || 'Yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const save = async () => {
    if (!date.trim() || !items.trim()) {
      Alert.alert('Eksik', 'Tarih ve menü içeriği gerekli.');
      return;
    }
    setSaving(true);
    try {
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', DEFAULT_PUBLIC_MENU_ORG_SLUG)
        .maybeSingle();
      if (!org?.id) throw new Error('Organizasyon bulunamadı');
      const { error } = await supabase.from('guest_breakfast_days').upsert(
        {
          organization_id: org.id,
          meal_date: date.trim(),
          title: title.trim() || 'Sabah kahvaltısı',
          items: items.trim(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id,meal_date' }
      );
      if (error) throw error;
      setItems('');
      await load();
      Alert.alert('Kaydedildi', 'Kahvaltı vitrini güncellendi.');
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message || 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Misafir kahvaltı vitrini</Text>
        <Text style={styles.heroSub}>Rezervasyon tarihlerinde misafire gösterilir</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Geri</Text>
        </TouchableOpacity>
      </View>

      <AdminCard style={styles.form}>
        <Text style={styles.label}>Tarih (YYYY-MM-DD)</Text>
        <TextInput style={styles.input} value={date} onChangeText={setDate} autoCapitalize="none" />
        <Text style={styles.label}>Başlık</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} />
        <Text style={styles.label}>Menü</Text>
        <TextInput
          style={[styles.input, styles.area]}
          value={items}
          onChangeText={setItems}
          multiline
          placeholder="Serpme, yumurta, bal-kaymak, reçel…"
          placeholderTextColor="#94a3b8"
        />
        <TouchableOpacity style={styles.btn} onPress={() => void save()} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Kaydet / güncelle</Text>}
        </TouchableOpacity>
      </AdminCard>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={adminTheme.colors.primary} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load()} />}
          ListEmptyComponent={<Text style={styles.empty}>Henüz kahvaltı günü yok.</Text>}
          renderItem={({ item }) => (
            <AdminCard style={styles.card}>
              <Text style={styles.name}>{item.meal_date}</Text>
              <Text style={styles.meta}>{item.title}</Text>
              <Text style={styles.meta}>{item.items}</Text>
            </AdminCard>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: adminTheme.colors.background },
  hero: { backgroundColor: '#78350f', padding: 20 },
  heroTitle: { color: '#fff', fontSize: 22, fontWeight: '900' },
  heroSub: { color: 'rgba(255,255,255,0.75)', fontWeight: '600', marginTop: 4 },
  back: { color: '#fde68a', fontWeight: '800', marginTop: 12 },
  form: { margin: 16 },
  label: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textMuted, marginTop: 8, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    backgroundColor: '#fff',
    fontWeight: '600',
  },
  area: { minHeight: 80, textAlignVertical: 'top' },
  btn: {
    marginTop: 14,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '800' },
  card: { marginBottom: 10 },
  name: { fontWeight: '900', color: adminTheme.colors.text },
  meta: { marginTop: 4, fontWeight: '600', color: adminTheme.colors.textMuted },
  empty: { textAlign: 'center', marginTop: 24, color: adminTheme.colors.textMuted, fontWeight: '600' },
});
