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
  Image,
  Platform,
  ScrollView,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard } from '@/components/admin';
import { DEFAULT_PUBLIC_MENU_ORG_SLUG } from '@/lib/publicPortalNav';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';

type HostRow = {
  id: string;
  display_name: string;
  role_label: string | null;
  photo_url: string | null;
  vibe_tag: string | null;
  sort_order: number;
  is_active: boolean;
};

const ROLE_PRESETS = ['Resepsiyon', 'Ön büro', 'Guest relations', 'Bellboy', 'Yönetim'] as const;

export default function AdminBookingHosts() {
  const router = useRouter();
  const [rows, setRows] = useState<HostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState('Resepsiyon');
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', DEFAULT_PUBLIC_MENU_ORG_SLUG)
        .maybeSingle();
      let q = supabase
        .from('booking_welcome_hosts')
        .select('id, display_name, role_label, photo_url, vibe_tag, sort_order, is_active')
        .order('sort_order', { ascending: true })
        .limit(80);
      if (org?.id) q = q.eq('organization_id', org.id);
      const { data, error } = await q;
      if (error) throw error;
      setRows((data ?? []) as HostRow[]);
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

  const pickPhoto = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (picked.canceled || !picked.assets?.[0]?.uri) return;
    setPhotoUri(picked.assets[0].uri);
  };

  const save = async () => {
    if (name.trim().length < 2) {
      Alert.alert('Eksik', 'İsim gerekli.');
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

      let photoUrl: string | null = null;
      if (photoUri) {
        const uploaded = await uploadUriToPublicBucket({
          bucketId: 'room-booking-media',
          uri: photoUri,
          subfolder: `hosts/${org.id}`,
          kind: 'image',
        });
        photoUrl = uploaded.publicUrl;
      }

      const { error } = await supabase.from('booking_welcome_hosts').insert({
        organization_id: org.id,
        display_name: name.trim(),
        role_label: role.trim() || null,
        vibe_tag: null,
        photo_url: photoUrl,
        sort_order: rows.length,
        is_active: true,
      });
      if (error) throw error;
      setName('');
      setRole('Resepsiyon');
      setPhotoUri(null);
      await load();
      Alert.alert('Kaydedildi', 'Misafir rezervasyon sayfasında görünecek.');
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message || 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: HostRow) => {
    const { error } = await supabase
      .from('booking_welcome_hosts')
      .update({ is_active: !row.is_active, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (error) Alert.alert('Hata', error.message);
    else void load();
  };

  const remove = async (id: string) => {
    Alert.alert('Sil', 'Bu kişiyi kaldır?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('booking_welcome_hosts').delete().eq('id', id);
          if (error) Alert.alert('Hata', error.message);
          else void load();
        },
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={adminTheme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Karşılama ekibi</Text>
        <Text style={styles.sub}>
          Yuvarlak fotoğraf + isim ekle. Misafir rezervasyon yaparken kimlerin karşılayacağını görür.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
        <AdminCard style={styles.form}>
          <TouchableOpacity style={styles.avatarPick} onPress={() => void pickPhoto()} activeOpacity={0.88}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.avatarPickImg} />
            ) : (
              <View style={styles.avatarPickEmpty}>
                <Ionicons name="camera" size={28} color="#0f766e" />
                <Text style={styles.avatarPickHint}>Fotoğraf</Text>
              </View>
            )}
            <View style={styles.avatarPlus}>
              <Ionicons name="add" size={16} color="#fff" />
            </View>
          </TouchableOpacity>

          <Text style={styles.label}>İsim</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Ayşe Yılmaz" />

          <Text style={styles.label}>Görev</Text>
          <TextInput style={styles.input} value={role} onChangeText={setRole} placeholder="Resepsiyon" />
          <View style={styles.chips}>
            {ROLE_PRESETS.map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.chip, role === p && styles.chipOn]}
                onPress={() => setRole(p)}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipText, role === p && styles.chipTextOn]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={() => void save()}
            disabled={saving}
            activeOpacity={0.88}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Ekibe ekle</Text>}
          </TouchableOpacity>
        </AdminCard>

        <Text style={styles.listTitle}>Ekip ({rows.filter((r) => r.is_active).length} aktif)</Text>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 16 }} color={adminTheme.colors.primary} />
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            contentContainerStyle={{ gap: 10, paddingBottom: 40 }}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
            ListEmptyComponent={<Text style={styles.empty}>Henüz kimse yok — yuvarlak fotoğrafla ekle.</Text>}
            renderItem={({ item }) => (
              <AdminCard style={[styles.row, !item.is_active && styles.rowHidden]}>
                {item.photo_url ? (
                  <Image source={{ uri: item.photo_url }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarEmpty]}>
                    <Text style={styles.avatarInitial}>
                      {item.display_name
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((p) => p[0]?.toUpperCase() ?? '')
                        .join('')}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{item.display_name}</Text>
                  <Text style={styles.rowMeta}>{item.role_label || '—'}</Text>
                  <Text style={styles.rowStatus}>{item.is_active ? 'Misafire görünür' : 'Gizli'}</Text>
                </View>
                <TouchableOpacity onPress={() => void toggleActive(item)} style={styles.iconBtn}>
                  <Ionicons
                    name={item.is_active ? 'eye-outline' : 'eye-off-outline'}
                    size={20}
                    color={adminTheme.colors.text}
                  />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => void remove(item.id)} style={styles.iconBtn}>
                  <Ionicons name="trash-outline" size={20} color="#b42318" />
                </TouchableOpacity>
              </AdminCard>
            )}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: adminTheme.colors.background },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  back: { alignSelf: 'flex-start', marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '800', color: adminTheme.colors.text },
  sub: { fontSize: 13, color: adminTheme.colors.textSecondary, marginTop: 4, lineHeight: 18 },
  formScroll: { paddingBottom: 24 },
  form: { marginHorizontal: 16, marginTop: 8, alignItems: 'center' },
  avatarPick: {
    width: 108,
    height: 108,
    borderRadius: 54,
    marginTop: 8,
    marginBottom: 8,
    borderWidth: 3,
    borderColor: '#14b8a6',
    overflow: 'visible',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPickImg: {
    width: 102,
    height: 102,
    borderRadius: 51,
  },
  avatarPickEmpty: {
    width: 102,
    height: 102,
    borderRadius: 51,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  avatarPickHint: { fontSize: 11, fontWeight: '800', color: '#0f766e' },
  avatarPlus: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#0f766e',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  label: {
    alignSelf: 'stretch',
    fontSize: 12,
    fontWeight: '700',
    color: adminTheme.colors.textSecondary,
    marginTop: 10,
  },
  input: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 9,
    fontSize: 15,
    color: adminTheme.colors.text,
    backgroundColor: '#fff',
    marginTop: 6,
  },
  chips: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  chipOn: { backgroundColor: '#0f766e', borderColor: '#0f766e' },
  chipText: { fontWeight: '700', color: adminTheme.colors.text, fontSize: 12 },
  chipTextOn: { color: '#fff' },
  saveBtn: {
    alignSelf: 'stretch',
    marginTop: 16,
    backgroundColor: '#0f172a',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontWeight: '800' },
  listTitle: {
    marginHorizontal: 16,
    marginTop: 18,
    marginBottom: 10,
    fontSize: 14,
    fontWeight: '800',
    color: adminTheme.colors.text,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16 },
  rowHidden: { opacity: 0.55 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#e2e8f0' },
  avatarEmpty: { backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#5eead4', fontWeight: '800', fontSize: 16 },
  rowName: { fontSize: 15, fontWeight: '800', color: adminTheme.colors.text },
  rowMeta: { fontSize: 12, color: adminTheme.colors.textSecondary, marginTop: 2 },
  rowStatus: { fontSize: 11, fontWeight: '700', color: '#0f766e', marginTop: 4 },
  iconBtn: { padding: 8 },
  empty: { textAlign: 'center', color: adminTheme.colors.textSecondary, marginTop: 24 },
});
