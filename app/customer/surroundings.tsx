import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { poiTypeLabel } from '@/lib/i18nLookup';

type Poi = {
  id: string;
  name: string;
  type: string;
  address: string | null;
  phone: string | null;
  lat: number;
  lng: number;
  rating: number | null;
};

const TYPE_ICON: Record<string, string> = {
  restaurant: '🍽️',
  cafe: '☕',
  pharmacy: '💊',
  hospital: '🏥',
  police: '🚔',
  hotel: '🏨',
  other: '📍',
};

export default function SurroundingsScreen() {
  const { t, i18n } = useTranslation();
  const [pois, setPois] = useState<Poi[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('pois')
        .select('id, name, type, address, phone, lat, lng, rating')
        .order('name');
      setPois((data as Poi[]) ?? []);
      setLoading(false);
    };
    load();
  }, []);

  const openInMaps = (lat: number, lng: number, _name: string) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://maps.google.com/?q=${lat},${lng}`).catch(() => {});
    });
  };

  const types = Array.from(new Set(pois.map((p) => p.type))).sort();
  const filtered = filter ? pois.filter((p) => p.type === filter) : pois;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('surroundingsTitle')}</Text>
      <Text style={styles.subtitle}>{t('surroundingsSubtitle')}</Text>

      {types.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          <TouchableOpacity
            style={[styles.filterChip, !filter && styles.filterChipActive]}
            onPress={() => setFilter(null)}
          >
            <Text style={[styles.filterText, !filter && styles.filterTextActive]}>{t('missingItemsFilterAll')}</Text>
          </TouchableOpacity>
          {types.map((typeKey) => (
            <TouchableOpacity
              key={typeKey}
              style={[styles.filterChip, filter === typeKey && styles.filterChipActive]}
              onPress={() => setFilter(typeKey)}
            >
              <Text style={[styles.filterText, filter === typeKey && styles.filterTextActive]}>
                {TYPE_ICON[typeKey] || '📍'} {poiTypeLabel(typeKey)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {loading ? (
        <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 24 }} />
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {pois.length === 0 ? t('surroundingsEmptyNoPois') : t('surroundingsEmptyCategory')}
          </Text>
        </View>
      ) : (
        filtered.map((p) => (
          <TouchableOpacity
            key={p.id}
            style={styles.card}
            onPress={() => openInMaps(Number(p.lat), Number(p.lng), p.name)}
            activeOpacity={0.8}
          >
            <Text style={styles.cardIcon}>{TYPE_ICON[p.type] || '📍'}</Text>
            <View style={styles.cardBody}>
              <Text style={styles.cardName}>{p.name}</Text>
              <Text style={styles.cardType}>{poiTypeLabel(p.type)}</Text>
              {p.address ? <Text style={styles.cardAddress} numberOfLines={1}>{p.address}</Text> : null}
              {p.rating != null && (
                <Text style={styles.cardRating}>⭐ {Number(p.rating).toFixed(1)}</Text>
              )}
            </View>
            <Text style={styles.cardArrow}>{t('surroundingsDirections')}</Text>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  title: { ...theme.typography.title, color: theme.colors.text, marginBottom: 4 },
  subtitle: { ...theme.typography.bodySmall, color: theme.colors.textSecondary, marginBottom: theme.spacing.lg },
  filterScroll: { marginHorizontal: -theme.spacing.lg, marginBottom: theme.spacing.md },
  filterChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    marginRight: 8,
    marginLeft: theme.spacing.lg,
  },
  filterChipActive: { backgroundColor: theme.colors.primary },
  filterText: { fontSize: 14, color: theme.colors.textSecondary },
  filterTextActive: { color: theme.colors.white, fontWeight: '600' },
  empty: { padding: theme.spacing.xl, alignItems: 'center' },
  emptyText: { fontSize: 15, color: theme.colors.textMuted, textAlign: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  cardIcon: { fontSize: 28, marginRight: theme.spacing.md },
  cardBody: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  cardType: { fontSize: 13, color: theme.colors.primary, marginTop: 2 },
  cardAddress: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },
  cardRating: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  cardArrow: { fontSize: 13, color: theme.colors.primary, fontWeight: '600' },
});
