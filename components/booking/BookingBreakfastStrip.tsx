import { View, Text, StyleSheet, ScrollView, Image, useWindowDimensions, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

export type BreakfastDay = {
  meal_date: string;
  title: string | null;
  items: string;
  image_url: string | null;
};

type Props = {
  days: BreakfastDay[];
};

function formatDay(iso: string): string {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('tr-TR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return iso;
  }
}

/** Konaklama günlerinde sunulacak kahvaltı vitrini */
export function BookingBreakfastStrip({ days }: Props) {
  const { width } = useWindowDimensions();
  const wide = width >= 768;
  const cardW = wide ? 280 : 200;
  const imgH = wide ? 160 : 110;

  if (!days.length) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.kicker}>Sabah kahvaltısı</Text>
      <Text style={styles.title}>Konaklamanızda sunulacak</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {days.map((d) => (
          <LinearGradient
            key={d.meal_date}
            colors={['#fffbeb', '#ffffff']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.card, { width: cardW }]}
          >
            {d.image_url ? (
              <Image
                source={{ uri: d.image_url }}
                style={[styles.img, { height: imgH }]}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.imgFallback, { height: imgH }]}>
                <Ionicons name="nutrition-outline" size={28} color="#b45309" />
              </View>
            )}
            <Text style={styles.date}>{formatDay(d.meal_date)}</Text>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {d.title?.trim() || 'Kahvaltı'}
            </Text>
            <Text style={styles.items} numberOfLines={4}>
              {d.items}
            </Text>
          </LinearGradient>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 22 },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#b45309',
    marginBottom: 4,
  },
  title: { fontSize: 18, fontWeight: '900', color: '#0b1220', marginBottom: 12 },
  row: { gap: 14, paddingRight: 8 },
  card: {
    borderRadius: 20,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(180,83,9,0.12)',
  },
  img: {
    width: '100%',
    borderRadius: 14,
    marginBottom: 10,
    backgroundColor: '#fef3c7',
    ...(Platform.OS === 'web' ? ({ objectFit: 'cover' } as Record<string, string>) : {}),
  },
  imgFallback: {
    width: '100%',
    borderRadius: 14,
    marginBottom: 10,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  date: { fontSize: 11, fontWeight: '800', color: '#b45309', marginBottom: 2 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#0b1220', marginBottom: 4 },
  items: { fontSize: 12, fontWeight: '600', color: '#78716c', lineHeight: 17 },
});
