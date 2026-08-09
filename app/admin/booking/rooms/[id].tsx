import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { DEFAULT_PUBLIC_MENU_ORG_SLUG } from '@/lib/publicPortalNav';

type RoomEdit = {
  id: string;
  room_number: string;
  price_per_night: number | null;
  description: string | null;
  video_url: string | null;
  bookable: boolean | null;
  bed_type: string | null;
  view_type: string | null;
  area_sqm: number | null;
  capacity_label: string | null;
  display_title: string | null;
  max_guests: number | null;
  amenities: unknown;
};

type RoomImage = { id: string; url: string; sort_order: number | null };

const CAPACITY_PRESETS = ['1+1', '2+1', '2 kişilik', '3 kişilik', '4 kişilik', 'Aile'] as const;

const AMENITY_OPTIONS = [
  { id: 'wifi', label: 'Wi‑Fi' },
  { id: 'klima', label: 'Klima' },
  { id: 'tv', label: 'TV' },
  { id: 'minibar', label: 'Mini bar' },
  { id: 'balkon', label: 'Balkon' },
  { id: 'manzara', label: 'Manzara' },
] as const;

function parseAmenities(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  return [];
}

export default function AdminBookingRoomEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [room, setRoom] = useState<RoomEdit | null>(null);
  const [images, setImages] = useState<RoomImage[]>([]);
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [bedType, setBedType] = useState('');
  const [viewType, setViewType] = useState('');
  const [area, setArea] = useState('');
  const [bookable, setBookable] = useState(true);
  const [capacityLabel, setCapacityLabel] = useState('');
  const [displayTitle, setDisplayTitle] = useState('');
  const [maxGuests, setMaxGuests] = useState('');
  const [amenities, setAmenities] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [{ data: r, error: re }, { data: imgs, error: ie }] = await Promise.all([
        supabase.from('rooms').select('id, room_number, price_per_night, description, video_url, bookable, bed_type, view_type, area_sqm, capacity_label, display_title, max_guests, amenities').eq('id', id).single(),
        supabase.from('room_images').select('id, url, sort_order').eq('room_id', id).order('sort_order', { ascending: true }),
      ]);
      if (re) throw re;
      if (ie) throw ie;
      const row = r as RoomEdit;
      setRoom(row);
      setPrice(row.price_per_night != null ? String(row.price_per_night) : '');
      setDescription(row.description ?? '');
      setVideoUrl(row.video_url ?? '');
      setBedType(row.bed_type ?? '');
      setViewType(row.view_type ?? '');
      setArea(row.area_sqm != null ? String(row.area_sqm) : '');
      setBookable(row.bookable !== false);
      setCapacityLabel(row.capacity_label ?? '');
      setDisplayTitle(row.display_title ?? '');
      setMaxGuests(row.max_guests != null ? String(row.max_guests) : '');
      setAmenities(parseAmenities(row.amenities));
      setImages((imgs ?? []) as RoomImage[]);
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message || 'Oda yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!id) return;
    if (!capacityLabel.trim()) {
      Alert.alert('Hata', 'Kapasite etiketi gerekli.');
      return;
    }
    setSaving(true);
    try {
      const priceNum = price.trim() ? Number(price.replace(',', '.')) : null;
      const areaNum = area.trim() ? Number(area.replace(',', '.')) : null;
      const maxGuestsNum = maxGuests.trim() ? Number(maxGuests.replace(',', '.')) : null;
      const { error } = await supabase
        .from('rooms')
        .update({
          price_per_night: priceNum != null && Number.isFinite(priceNum) ? priceNum : null,
          description: description.trim() || null,
          video_url: videoUrl.trim() || null,
          bookable,
          bed_type: bedType.trim() || null,
          view_type: viewType.trim() || null,
          area_sqm: areaNum != null && Number.isFinite(areaNum) ? areaNum : null,
          capacity_label: capacityLabel.trim() || 'Standart',
          display_title: displayTitle.trim() || null,
          max_guests: maxGuestsNum != null && Number.isFinite(maxGuestsNum) ? maxGuestsNum : null,
          amenities,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
      Alert.alert('Kaydedildi', 'Oda düzenlendi.');
      await load();
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message || 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const removeRoom = () => {
    if (!id) return;
    Alert.alert(
      'Odayı sil',
      'Bu oda online rezervasyon vitrininden kaldırılacak. Devam edilsin mi?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setSaving(true);
              try {
                const { error } = await supabase.rpc('delete_bookable_showcase_room', {
                  p_room_id: id,
                });
                if (error) throw error;
                Alert.alert('Silindi', 'Oda kaldırıldı.');
                router.replace('/admin/booking');
              } catch (e) {
                Alert.alert('Hata', (e as Error)?.message || 'Silinemedi');
              } finally {
                setSaving(false);
              }
            })();
          },
        },
      ]
    );
  };

  const addPhoto = async () => {
    if (!id) return;
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (picked.canceled || !picked.assets?.[0]?.uri) return;
    setUploading(true);
    try {
      const uri = picked.assets[0].uri;
      const uploaded = await uploadUriToPublicBucket({
        bucketId: 'room-booking-media',
        uri,
        subfolder: `rooms/${id}`,
        kind: 'image',
      });
      const sort = images.length;
      const { error } = await supabase.from('room_images').insert({
        room_id: id,
        url: uploaded.publicUrl,
        sort_order: sort,
      });
      if (error) throw error;
      await load();
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message || 'Fotoğraf yüklenemedi');
    } finally {
      setUploading(false);
    }
  };

  const addVideo = async () => {
    if (!id) return;
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.8,
    });
    if (picked.canceled || !picked.assets?.[0]?.uri) return;
    setUploading(true);
    try {
      const uri = picked.assets[0].uri;
      const uploaded = await uploadUriToPublicBucket({
        bucketId: 'room-booking-media',
        uri,
        subfolder: `rooms/${id}/video`,
        kind: 'video',
      });
      setVideoUrl(uploaded.publicUrl);
      const { error } = await supabase
        .from('rooms')
        .update({ video_url: uploaded.publicUrl, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      Alert.alert('Tamam', 'Video eklendi.');
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message || 'Video yüklenemedi');
    } finally {
      setUploading(false);
    }
  };

  const removeImage = async (imageId: string) => {
    try {
      const { error } = await supabase.from('room_images').delete().eq('id', imageId);
      if (error) throw error;
      await load();
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message || 'Silinemedi');
    }
  };

  /** Oda düzenlerken otel galerisine de kapak / tanıtım ekle */
  const addToHotelShowcase = async (kind: 'image' | 'video') => {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes:
        kind === 'video'
          ? ImagePicker.MediaTypeOptions.Videos
          : ImagePicker.MediaTypeOptions.Images,
      quality: kind === 'image' ? 0.85 : 0.8,
      allowsMultipleSelection: kind === 'image',
      selectionLimit: kind === 'image' ? 20 : 1,
    });
    if (picked.canceled || !picked.assets?.length) return;
    setUploading(true);
    try {
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', DEFAULT_PUBLIC_MENU_ORG_SLUG)
        .maybeSingle();
      if (!org?.id) throw new Error('Organizasyon bulunamadı');

      const { count } = await supabase
        .from('booking_hotel_showcase')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', org.id)
        .eq('is_active', true);

      let sort = count ?? 0;
      let added = 0;
      for (const asset of picked.assets) {
        if (!asset.uri) continue;
        if (sort >= 100) break;
        const uploaded = await uploadUriToPublicBucket({
          bucketId: 'room-booking-media',
          uri: asset.uri,
          subfolder: `hotel-showcase/${org.id}`,
          kind,
        });
        const { error } = await supabase.from('booking_hotel_showcase').insert({
          organization_id: org.id,
          media_kind: kind,
          media_url: uploaded.publicUrl,
          thumbnail_url: kind === 'image' ? uploaded.publicUrl : null,
          title: room?.display_title || room?.capacity_label || null,
          category: kind === 'video' ? 'Tanıtım' : 'Oda',
          sort_order: sort,
          is_active: true,
        });
        if (error) throw error;
        sort += 1;
        added += 1;
      }
      Alert.alert('Oteli gezelim', `${added} medya otel galerisine eklendi.`);
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message || 'Otel galerisine eklenemedi');
    } finally {
      setUploading(false);
    }
  };

  const toggleAmenity = (aid: string) => {
    setAmenities((prev) => (prev.includes(aid) ? prev.filter((x) => x !== aid) : [...prev, aid]));
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={adminTheme.colors.primary} />
      </View>
    );
  }

  if (!room) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>Oda bulunamadı</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.link}>Geri</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Oda {room.room_number}</Text>
      <Text style={styles.sub}>Misafire oda numarası gösterilmez — kapasite etiketi kullanılır</Text>

      <View style={styles.rowBetween}>
        <Text style={styles.label}>Online rezervasyonda göster</Text>
        <Switch value={bookable} onValueChange={setBookable} />
      </View>

      <Text style={styles.label}>Kapasite etiketi (misafire görünen)</Text>
      <TextInput
        style={styles.input}
        value={capacityLabel}
        onChangeText={setCapacityLabel}
        placeholder="2+1 / 3 kişilik / 1+1"
        placeholderTextColor="#94a3b8"
      />
      <View style={styles.chips}>
        {CAPACITY_PRESETS.map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.chip, capacityLabel === p && styles.chipOn]}
            onPress={() => setCapacityLabel(p)}
            activeOpacity={0.85}
          >
            <Text style={[styles.chipText, capacityLabel === p && styles.chipTextOn]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Vitrin başlığı (isteğe bağlı)</Text>
      <TextInput
        style={styles.input}
        value={displayTitle}
        onChangeText={setDisplayTitle}
        placeholder="örn. Göl Suite"
        placeholderTextColor="#94a3b8"
      />

      <Text style={styles.label}>Maks. kişi</Text>
      <TextInput
        style={styles.input}
        value={maxGuests}
        onChangeText={setMaxGuests}
        keyboardType="number-pad"
        placeholder="3"
        placeholderTextColor="#94a3b8"
      />

      <Text style={styles.label}>Gecelik fiyat (₺)</Text>
      <TextInput style={styles.input} value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="örn. 4500" placeholderTextColor="#94a3b8" />

      <Text style={styles.label}>Açıklama</Text>
      <TextInput
        style={[styles.input, styles.area]}
        value={description}
        onChangeText={setDescription}
        multiline
        placeholder="Misafirin göreceği kısa açıklama"
        placeholderTextColor="#94a3b8"
      />

      <Text style={styles.label}>Yatak tipi</Text>
      <TextInput style={styles.input} value={bedType} onChangeText={setBedType} placeholder="King / Twin" placeholderTextColor="#94a3b8" />

      <Text style={styles.label}>Manzara</Text>
      <TextInput style={styles.input} value={viewType} onChangeText={setViewType} placeholder="Göl / Dağ" placeholderTextColor="#94a3b8" />

      <Text style={styles.label}>Metrekare</Text>
      <TextInput style={styles.input} value={area} onChangeText={setArea} keyboardType="decimal-pad" placeholder="28" placeholderTextColor="#94a3b8" />

      <Text style={styles.section}>Özellikler</Text>
      <View style={styles.chips}>
        {AMENITY_OPTIONS.map((a) => {
          const on = amenities.includes(a.id);
          return (
            <TouchableOpacity
              key={a.id}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => toggleAmenity(a.id)}
              activeOpacity={0.85}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{a.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.section}>Fotoğraflar</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
        {images.map((img) => (
          <View key={img.id} style={styles.photoWrap}>
            <Image source={{ uri: img.url }} style={styles.photo} />
            <TouchableOpacity style={styles.photoDel} onPress={() => void removeImage(img.id)}>
              <Ionicons name="close" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity style={styles.addMedia} onPress={() => void addPhoto()} disabled={uploading} activeOpacity={0.85}>
          {uploading ? <ActivityIndicator color="#0f766e" /> : <Ionicons name="image-outline" size={22} color="#0f766e" />}
          <Text style={styles.addMediaText}>Fotoğraf</Text>
        </TouchableOpacity>
      </ScrollView>

      <Text style={styles.section}>Video</Text>
      <TextInput
        style={styles.input}
        value={videoUrl}
        onChangeText={setVideoUrl}
        placeholder="Video URL veya yükle"
        placeholderTextColor="#94a3b8"
        autoCapitalize="none"
      />
      <TouchableOpacity style={styles.secondaryBtn} onPress={() => void addVideo()} disabled={uploading} activeOpacity={0.85}>
        <Ionicons name="videocam-outline" size={18} color="#0f172a" />
        <Text style={styles.secondaryBtnText}>Galeriden video yükle</Text>
      </TouchableOpacity>

      <Text style={styles.section}>Oteli gezelim (otel kapakları)</Text>
      <Text style={styles.hotelHint}>
        Bu oda düzenlemesinden otelin ortak galerisine fotoğraf / video ekleyebilirsiniz. Misafir rezervasyonda “Oteli gezelim” ile görür.
      </Text>
      <View style={styles.hotelRow}>
        <TouchableOpacity
          style={styles.hotelBtn}
          onPress={() => void addToHotelShowcase('image')}
          disabled={uploading}
          activeOpacity={0.88}
        >
          <Ionicons name="images-outline" size={18} color="#fff" />
          <Text style={styles.hotelBtnText}>Kapak fotoğrafı</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.hotelBtnSecondary}
          onPress={() => void addToHotelShowcase('video')}
          disabled={uploading}
          activeOpacity={0.88}
        >
          <Ionicons name="videocam-outline" size={18} color="#0f766e" />
          <Text style={styles.hotelBtnSecondaryText}>Tanıtım videosu</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={styles.linkBtn} onPress={() => router.push('/admin/booking/showcase')} activeOpacity={0.85}>
        <Text style={styles.link}>Tüm otel galerisini yönet →</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={() => void save()} disabled={saving} activeOpacity={0.88}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Düzenlemeyi kaydet</Text>}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.deleteBtn, saving && { opacity: 0.6 }]}
        onPress={removeRoom}
        disabled={saving}
        activeOpacity={0.88}
      >
        <Ionicons name="trash-outline" size={18} color="#b91c1c" />
        <Text style={styles.deleteBtnText}>Odayı sil</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.linkBtn} onPress={() => router.push('/booking')} activeOpacity={0.85}>
        <Text style={styles.link}>Misafir rezervasyon sayfasını aç</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: adminTheme.colors.background },
  content: { padding: 20, paddingBottom: 48 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  title: { fontSize: 24, fontWeight: '900', color: adminTheme.colors.text },
  sub: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.textMuted, marginBottom: 18 },
  label: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textMuted, marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    backgroundColor: '#fff',
    fontSize: 15,
    fontWeight: '600',
    color: adminTheme.colors.text,
  },
  area: { minHeight: 96, textAlignVertical: 'top' },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    marginBottom: 8,
  },
  section: { marginTop: 20, marginBottom: 10, fontSize: 16, fontWeight: '800', color: adminTheme.colors.text },
  hotelHint: {
    fontSize: 13,
    fontWeight: '500',
    color: adminTheme.colors.textMuted,
    lineHeight: 18,
    marginBottom: 10,
  },
  hotelRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  hotelBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0f766e',
    borderRadius: 12,
    paddingVertical: 12,
  },
  hotelBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  hotelBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ecfdf5',
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(15,118,110,0.2)',
  },
  hotelBtnSecondaryText: { color: '#0f766e', fontWeight: '800', fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  chipOn: { backgroundColor: '#0f766e', borderColor: '#0f766e' },
  chipText: { fontWeight: '700', color: adminTheme.colors.text, fontSize: 13 },
  chipTextOn: { color: '#fff' },
  photos: { gap: 10, paddingVertical: 4 },
  photoWrap: { position: 'relative' },
  photo: { width: 112, height: 84, borderRadius: 12, backgroundColor: '#e5e7eb' },
  photoDel: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMedia: {
    width: 112,
    height: 84,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#99f6e4',
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addMediaText: { fontSize: 12, fontWeight: '800', color: '#0f766e' },
  secondaryBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryBtnText: { fontWeight: '800', color: '#0f172a' },
  saveBtn: {
    marginTop: 24,
    backgroundColor: '#0f172a',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  deleteBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fee2e2',
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  deleteBtnText: { color: '#b91c1c', fontWeight: '800', fontSize: 15 },
  linkBtn: { marginTop: 14, alignItems: 'center' },
  link: { color: '#0f766e', fontWeight: '800' },
  error: { color: '#b91c1c', fontWeight: '700' },
});
