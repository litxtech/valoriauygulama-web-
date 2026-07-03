import { useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { roomStatusLabel } from '@/lib/i18nLookup';
import { useCachedList } from '@/hooks/useCachedList';

type Room = {
  id: string;
  room_number: string;
  floor: number | null;
  view_type: string | null;
  status: string;
  price_per_night: number | null;
};

export default function CustomerRooms() {
  const { t } = useTranslation();

  const fetchItems = useCallback(async () => {
    const { data } = await supabase
      .from('rooms')
      .select('id, room_number, floor, view_type, status, price_per_night')
      .order('room_number');
    return (data ?? []) as Room[];
  }, []);

  const { items: rooms, loading, refreshing, refresh } = useCachedList<Room>({
    cacheKey: 'customer-rooms-list',
    fetchItems,
  });

  if (loading && !refreshing && rooms.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.listContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.primary} />}
    >
      {rooms.map((r) => (
        <View key={r.id} style={styles.card}>
          <View style={styles.cardRow}>
            <Text style={styles.roomNumber}>{t('roomNumberLabel', { num: r.room_number })}</Text>
            <View style={[styles.badge, r.status === 'available' ? styles.badgeOk : styles.badgeBusy]}>
              <Text style={styles.badgeText}>{roomStatusLabel(r.status)}</Text>
            </View>
          </View>
          {r.floor != null && <Text style={styles.meta}>{t('guestRoomFloor', { floor: r.floor })}</Text>}
          {r.view_type && <Text style={styles.meta}>{t('guestRoomView', { view: r.view_type })}</Text>}
          {r.price_per_night != null && (
            <Text style={styles.price}>{t('guestRoomPricePerNight', { price: r.price_per_night })}</Text>
          )}
        </View>
      ))}
      {rooms.length === 0 && <Text style={styles.empty}>{t('guestRoomsEmpty')}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  listContent: { paddingTop: 8, paddingBottom: 24 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: {
    backgroundColor: theme.colors.surface,
    margin: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: theme.radius.md,
    ...theme.shadows.sm,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  roomNumber: { fontSize: 18, fontWeight: '700' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeOk: { backgroundColor: '#dcfce7' },
  badgeBusy: { backgroundColor: '#fee2e2' },
  badgeText: { fontSize: 12, fontWeight: '600' },
  meta: { fontSize: 13, color: '#666', marginTop: 4 },
  price: { fontSize: 14, fontWeight: '600', color: '#b8860b', marginTop: 8 },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 32 },
});
