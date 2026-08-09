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

type ShowcaseRow = {
  id: string;
  media_kind: 'image' | 'video';
  media_url: string;
  thumbnail_url: string | null;
  title: string | null;
  category: string | null;
  sort_order: number;
  is_active: boolean;
};

const CATEGORY_PRESETS = [
  'Lobi',
  'Oda',
  'Aktivite',
  'Doğa',
  'Yemek',
  'Havuz',
  'Manzara',
  'Tanıtım',
] as const;

const MAX_ACTIVE = 100;

export default function AdminBookingShowcase() {
  const router = useRouter();
  const [rows, setRows] = useState<ShowcaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Tanıtım');

  const load = useCallback(async () => {
    try {
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', DEFAULT_PUBLIC_MENU_ORG_SLUG)
        .maybeSingle();
      let q = supabase
        .from('booking_hotel_showcase')
        .select('id, media_kind, media_url, thumbnail_url, title, category, sort_order, is_active')
        .order('sort_order', { ascending: true })
        .limit(120);
      if (org?.id) q = q.eq('organization_id', org.id);
      const { data, error } = await q;
      if (error) throw error;
      setRows(
        (data ?? []).map((r) => ({
          ...(r as ShowcaseRow),
          media_kind: String((r as ShowcaseRow).media_kind) === 'video' ? 'video' : 'image',
        }))
      );
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

  const activeCount = rows.filter((r) => r.is_active).length;

  const ensureOrgId = async (): Promise<string> => {
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', DEFAULT_PUBLIC_MENU_ORG_SLUG)
      .maybeSingle();
    if (!org?.id) throw new Error('Organizasyon bulunamadı');
    return org.id;
  };

  const uploadAssets = async (kind: 'image' | 'video') => {
    if (activeCount >= MAX_ACTIVE) {
      Alert.alert('Limit', `En fazla ${MAX_ACTIVE} aktif medya eklenebilir.`);
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes:
        kind === 'video'
          ? ImagePicker.MediaTypeOptions.Videos
          : ImagePicker.MediaTypeOptions.Images,
      quality: kind === 'image' ? 0.85 : 0.8,
      allowsMultipleSelection: kind === 'image',
      selectionLimit: kind === 'image' ? Math.min(30, MAX_ACTIVE - activeCount) : 1,
    });
    if (picked.canceled || !picked.assets?.length) return;

    setUploading(true);
    try {
      const orgId = await ensureOrgId();
      let sort = rows.length;
      let added = 0;

      for (const asset of picked.assets) {
        if (!asset.uri) continue;
        if (activeCount + added >= MAX_ACTIVE) break;

        const uploaded = await uploadUriToPublicBucket({
          bucketId: 'room-booking-media',
          uri: asset.uri,
          subfolder: `hotel-showcase/${orgId}`,
          kind,
        });

        const { error } = await supabase.from('booking_hotel_showcase').insert({
          organization_id: orgId,
          media_kind: kind,
          media_url: uploaded.publicUrl,
          thumbnail_url: kind === 'image' ? uploaded.publicUrl : null,
          title: title.trim() || null,
          category: category.trim() || null,
          sort_order: sort,
          is_active: true,
        });
        if (error) throw error;
        sort += 1;
        added += 1;
      }

      setTitle('');
      await load();
      Alert.alert('Kaydedildi', `${added} medya otel galerisine eklendi.`);
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message || 'Yüklenemedi');
    } finally {
      setUploading(false);
    }
  };

  const toggleActive = async (row: ShowcaseRow) => {
    if (!row.is_active && activeCount >= MAX_ACTIVE) {
      Alert.alert('Limit', `En fazla ${MAX_ACTIVE} aktif medya olabilir.`);
      return;
    }
    const { error } = await supabase
      .from('booking_hotel_showcase')
      .update({ is_active: !row.is_active, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (error) Alert.alert('Hata', error.message);
    else void load();
  };

  const remove = (id: string) => {
    Alert.alert('Sil', 'Bu medyayı galeriden kaldır?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('booking_hotel_showcase').delete().eq('id', id);
          if (error) Alert.alert('Hata', error.message);
          else void load();
        },
      },
    ]);
  };

  const move = async (row: ShowcaseRow, dir: -1 | 1) => {
    const idx = rows.findIndex((r) => r.id === row.id);
    const swap = rows[idx + dir];
    if (!swap) return;
    const a = row.sort_order;
    const b = swap.sort_order;
    const now = new Date().toISOString();
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from('booking_hotel_showcase').update({ sort_order: b, updated_at: now }).eq('id', row.id),
      supabase.from('booking_hotel_showcase').update({ sort_order: a, updated_at: now }).eq('id', swap.id),
    ]);
    if (e1 || e2) Alert.alert('Hata', e1?.message || e2?.message || 'Sıra güncellenemedi');
    else void load();
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={adminTheme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Oteli gezelim</Text>
        <Text style={styles.sub}>
          Otel kapak fotoğrafları, tanıtım videoları, aktivite paylaşımları. Misafir rezervasyonda sağa-sola kaydırır
          ({activeCount}/{MAX_ACTIVE} aktif).
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
        <AdminCard style={styles.form}>
          <Text style={styles.label}>Başlık (isteğe bağlı)</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Örn. Sabah trekking, lobi, Uzungöl manzara"
          />

          <Text style={styles.label}>Kategori</Text>
          <TextInput style={styles.input} value={category} onChangeText={setCategory} placeholder="Aktivite" />
          <View style={styles.chips}>
            {CATEGORY_PRESETS.map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.chip, category === p && styles.chipOn]}
                onPress={() => setCategory(p)}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipText, category === p && styles.chipTextOn]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.addRow}>
            <TouchableOpacity
              style={[styles.addBtn, uploading && styles.addBtnDisabled]}
              onPress={() => void uploadAssets('image')}
              disabled={uploading}
              activeOpacity={0.88}
            >
              {uploading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="images-outline" size={18} color="#fff" />
                  <Text style={styles.addBtnText}>Fotoğraf ekle</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.addBtnSecondary, uploading && styles.addBtnDisabled]}
              onPress={() => void uploadAssets('video')}
              disabled={uploading}
              activeOpacity={0.88}
            >
              <Ionicons name="videocam-outline" size={18} color="#0f766e" />
              <Text style={styles.addBtnSecondaryText}>Video ekle</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>Bir seferde 30 fotoğrafa kadar seçebilirsiniz. Toplam aktif limit: {MAX_ACTIVE}.</Text>
        </AdminCard>

        {loading ? (
          <ActivityIndicator color="#0f766e" style={{ marginTop: 24 }} />
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(r) => r.id}
            scrollEnabled={false}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
            contentContainerStyle={{ gap: 10, paddingBottom: 40 }}
            ListEmptyComponent={<Text style={styles.empty}>Henüz medya yok. Fotoğraf veya video ekleyin.</Text>}
            renderItem={({ item, index }) => (
              <AdminCard style={[styles.rowCard, !item.is_active && styles.rowOff]}>
                <View style={styles.rowTop}>
                  {item.media_kind === 'image' || item.thumbnail_url ? (
                    <Image
                      source={{ uri: item.thumbnail_url || item.media_url }}
                      style={styles.thumb}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.thumb, styles.thumbVideo]}>
                      <Ionicons name="play" size={22} color="#0f766e" />
                    </View>
                  )}
                  <View style={styles.rowMeta}>
                    <Text style={styles.rowKind}>
                      {item.media_kind === 'video' ? 'Video' : 'Fotoğraf'}
                      {item.category ? ` · ${item.category}` : ''}
                    </Text>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {item.title || 'Başlıksız'}
                    </Text>
                    <Text style={styles.rowOrder}>Sıra {index + 1}</Text>
                  </View>
                </View>
                <View style={styles.rowActions}>
                  <TouchableOpacity style={styles.iconBtn} onPress={() => void move(item, -1)} disabled={index === 0}>
                    <Ionicons name="chevron-up" size={18} color={index === 0 ? '#cbd5e1' : '#0f172a'} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => void move(item, 1)}
                    disabled={index >= rows.length - 1}
                  >
                    <Ionicons
                      name="chevron-down"
                      size={18}
                      color={index >= rows.length - 1 ? '#cbd5e1' : '#0f172a'}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.chipBtn} onPress={() => void toggleActive(item)}>
                    <Text style={styles.chipBtnText}>{item.is_active ? 'Aktif' : 'Gizli'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.dangerBtn} onPress={() => remove(item.id)}>
                    <Ionicons name="trash-outline" size={16} color="#b42318" />
                  </TouchableOpacity>
                </View>
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
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 6 },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    marginBottom: 4,
  },
  title: { fontSize: 22, fontWeight: '800', color: adminTheme.colors.text },
  sub: { fontSize: 13, fontWeight: '500', color: adminTheme.colors.textMuted, lineHeight: 19 },
  formScroll: { paddingHorizontal: 16, paddingBottom: 24, gap: 14 },
  form: { gap: 10, padding: 14 },
  label: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textMuted },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.1)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 15,
    fontWeight: '600',
    color: adminTheme.colors.text,
    backgroundColor: '#fff',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
  },
  chipOn: { backgroundColor: '#ccfbf1' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  chipTextOn: { color: '#0f766e' },
  addRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  addBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0f766e',
    borderRadius: 14,
    paddingVertical: 14,
  },
  addBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ecfdf5',
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,118,110,0.2)',
  },
  addBtnDisabled: { opacity: 0.6 },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  addBtnSecondaryText: { color: '#0f766e', fontSize: 14, fontWeight: '800' },
  hint: { fontSize: 12, fontWeight: '500', color: '#94a3b8', lineHeight: 17 },
  empty: { textAlign: 'center', color: '#94a3b8', fontWeight: '600', paddingVertical: 28 },
  rowCard: { padding: 12, gap: 10 },
  rowOff: { opacity: 0.55 },
  rowTop: { flexDirection: 'row', gap: 12 },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
    ...(Platform.OS === 'web' ? ({ objectFit: 'cover' } as Record<string, string>) : {}),
  },
  thumbVideo: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#ecfdf5' },
  rowMeta: { flex: 1, gap: 2, justifyContent: 'center' },
  rowKind: { fontSize: 11, fontWeight: '800', color: '#0f766e', textTransform: 'uppercase' },
  rowTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  rowOrder: { fontSize: 12, fontWeight: '600', color: '#94a3b8' },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#ecfdf5',
  },
  chipBtnText: { fontSize: 12, fontWeight: '800', color: '#0f766e' },
  dangerBtn: {
    marginLeft: 'auto',
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#fef3f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
