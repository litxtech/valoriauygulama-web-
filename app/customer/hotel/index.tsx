import { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import HotelMap from '@/components/HotelMap';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';

type HotelInfo = {
  name: string | null;
  address: string | null;
  description: string | null;
  stars: number | null;
  cover_image: string | null;
};
type GalleryItem = { id: string; url: string; sort_order: number };
type Facility = { id: string; name: string; icon: string | null };

export default function HotelInfoScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [hotel, setHotel] = useState<HotelInfo | null>(null);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data: h } = await supabase.from('hotel_info').select('*').limit(1).single();
      setHotel(h ?? null);
      const { data: g } = await supabase.from('hotel_gallery').select('id, url, sort_order').order('sort_order');
      setGallery(g ?? []);
      const { data: f } = await supabase.from('facilities').select('id, name, icon').eq('is_active', true).order('sort_order');
      setFacilities(f ?? []);
    };
    load();
  }, []);

  return (
    <ScrollView style={styles.container}>
      {hotel?.cover_image ? (
        <CachedImage uri={hotel.cover_image} style={styles.cover} contentFit="cover" />
      ) : (
        <View style={styles.coverPlaceholder} />
      )}
      <View style={styles.body}>
        <Text style={styles.name}>{hotel?.name || t('valoriaHotel')}</Text>
        {hotel?.address && <Text style={styles.address}>{hotel.address}</Text>}
        {hotel?.stars != null && (
          <View style={styles.stars}>
            {Array.from({ length: hotel.stars }).map((_, i) => (
              <Text key={i} style={styles.star}>★</Text>
            ))}
          </View>
        )}
      </View>
      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>{t('guestHotelLocation')}</Text>
          <TouchableOpacity onPress={() => router.push('/customer/surroundings')}>
            <Text style={styles.linkText}>{t('guestHotelSurroundingsLink')}</Text>
          </TouchableOpacity>
        </View>
        <HotelMap
          latitude={typeof process.env.EXPO_PUBLIC_HOTEL_LAT !== 'undefined' ? Number(process.env.EXPO_PUBLIC_HOTEL_LAT) : undefined}
          longitude={typeof process.env.EXPO_PUBLIC_HOTEL_LON !== 'undefined' ? Number(process.env.EXPO_PUBLIC_HOTEL_LON) : undefined}
          title={hotel?.name || t('valoriaHotel')}
        />
      </View>
      <TouchableOpacity style={styles.mapLinkCard} onPress={() => router.push('/customer/hotel/map')}>
        <Text style={styles.mapLinkText}>{t('guestHotelIndoorMap')}</Text>
      </TouchableOpacity>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('guestHotelAbout')}</Text>
        <Text style={styles.desc}>{hotel?.description || t('guestHotelDefaultDesc')}</Text>
      </View>
      {facilities.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('guestHotelFacilities')}</Text>
          <View style={styles.facilityGrid}>
            {facilities.map((f) => (
              <View key={f.id} style={styles.facilityItem}>
                {f.icon && <Text style={styles.facilityIcon}>{f.icon}</Text>}
                <Text style={styles.facilityName}>{f.name}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
      {gallery.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('guestHotelGallery')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {gallery.map((img) => (
              <CachedImage key={img.id} uri={img.url} style={styles.galleryImg} contentFit="cover" />
            ))}
          </ScrollView>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  cover: { width: '100%', height: 220 },
  coverPlaceholder: { width: '100%', height: 220, backgroundColor: '#e5e7eb' },
  body: { padding: 20 },
  name: { fontSize: 26, fontWeight: '700' },
  address: { fontSize: 14, color: '#666', marginTop: 4 },
  stars: { flexDirection: 'row', marginTop: 8 },
  star: { color: '#b8860b', fontSize: 20 },
  section: { paddingHorizontal: 20, paddingBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  desc: { fontSize: 15, color: '#374151', lineHeight: 24 },
  facilityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  facilityItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  facilityIcon: { fontSize: 18, marginRight: 8 },
  facilityName: { fontSize: 14, fontWeight: '500' },
  galleryImg: { width: 240, height: 180, borderRadius: 12, marginRight: 12 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  linkText: { fontSize: 14, color: theme.colors.primary, fontWeight: '600' },
  mapLinkCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 16,
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  mapLinkText: { fontSize: 15, color: theme.colors.text, fontWeight: '500' },
});
