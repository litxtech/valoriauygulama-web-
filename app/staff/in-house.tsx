import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import {
  fetchHotelInHouseGuests,
  fetchHotelInHouseSummary,
  groupInHouseByRoom,
  formatMaskedInitials,
  type HotelInHouseSummary,
  type InHouseRoomGroup,
} from '@/lib/hotelInHouse';

const EMPTY_SUMMARY: HotelInHouseSummary = { inHouse: 0, occupiedRooms: 0, checkinsToday: 0 };

export default function StaffInHouseScreen() {
  const [groups, setGroups] = useState<InHouseRoomGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<HotelInHouseSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    const [rows, sum] = await Promise.all([
      fetchHotelInHouseGuests(),
      fetchHotelInHouseSummary(),
    ]);
    if (!mountedRef.current) return;
    setGroups(groupInHouseByRoom(rows));
    setTotal(rows.length);
    setSummary(sum);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel('staff-in-house-list')
      .on('postgres_changes', { event: '*', schema: 'ops', table: 'stay_assignments' }, () => {
        void load();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.summaryCard}>
        <View style={styles.summaryIcon}>
          <Ionicons name="people" size={22} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.summaryCount}>{summary.inHouse || total}</Text>
          <Text style={styles.summaryLabel}>Otelde konaklayan misafir</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Ionicons name="log-in-outline" size={18} color="#2563eb" />
          <Text style={styles.statNum}>{summary.checkinsToday}</Text>
          <Text style={styles.statLabel}>Bugün giriş</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="bed-outline" size={18} color="#0f766e" />
          <Text style={styles.statNum}>{summary.occupiedRooms || groups.length}</Text>
          <Text style={styles.statLabel}>Dolu oda</Text>
        </View>
      </View>

      <Text style={styles.privacyNote}>
        Mahremiyet için misafir adları yalnızca baş harfleriyle gösterilir.
      </Text>

      {groups.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="bed-outline" size={40} color={theme.colors.textMuted} />
          <Text style={styles.emptyText}>Şu an otelde kayıtlı misafir yok.</Text>
        </View>
      ) : (
        groups.map((group) => (
          <View key={group.roomNumber} style={styles.roomCard}>
            <View style={styles.roomHeader}>
              <View style={styles.roomBadge}>
                <Ionicons name="home" size={14} color={theme.colors.primary} />
                <Text style={styles.roomBadgeText}>Oda {group.roomNumber}</Text>
              </View>
              <Text style={styles.roomCount}>{group.guests.length} kişi</Text>
            </View>
            <View style={styles.guestWrap}>
              {group.guests.map((guest, idx) => (
                <View key={`${group.roomNumber}-${idx}`} style={styles.guestChip}>
                  <View style={styles.guestAvatar}>
                    <Text style={styles.guestAvatarText}>{guest.firstInitial || '?'}</Text>
                  </View>
                  <Text style={styles.guestName}>{formatMaskedInitials(guest)}</Text>
                </View>
              ))}
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 16, paddingBottom: 40 },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    padding: 16,
  },
  summaryIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#0f766e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCount: { fontSize: 26, fontWeight: '900', color: theme.colors.text },
  summaryLabel: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  statCard: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    paddingVertical: 14,
  },
  statNum: { fontSize: 22, fontWeight: '900', color: theme.colors.text },
  statLabel: { fontSize: 12, color: theme.colors.textSecondary, fontWeight: '700' },
  privacyNote: {
    marginTop: 12,
    marginBottom: 8,
    fontSize: 12,
    color: theme.colors.textMuted,
    lineHeight: 17,
  },
  roomCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    padding: 14,
    marginTop: 10,
  },
  roomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  roomBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  roomBadgeText: { fontSize: 15, fontWeight: '800', color: theme.colors.text },
  roomCount: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary },
  guestWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  guestChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    paddingLeft: 4,
    paddingRight: 12,
    paddingVertical: 4,
  },
  guestAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#0f766e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestAvatarText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  guestName: { fontSize: 15, fontWeight: '700', color: theme.colors.text, letterSpacing: 1 },
  emptyBox: {
    alignItems: 'center',
    gap: 12,
    padding: 30,
    marginTop: 16,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  emptyText: { fontSize: 14, color: theme.colors.textSecondary, fontWeight: '600', textAlign: 'center' },
});
