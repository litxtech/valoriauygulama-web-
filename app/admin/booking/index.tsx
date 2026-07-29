import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard } from '@/components/admin';
import {
  listOnlineBookingsForAdmin,
  updateOnlineBookingStatus,
  type OnlineBookingRow,
} from '@/lib/onlineBooking';

type RoomRow = {
  id: string;
  room_number: string;
  price_per_night: number | null;
  bookable: boolean | null;
  status: string;
};

export default function AdminBookingHub() {
  const router = useRouter();
  const [tab, setTab] = useState<'requests' | 'rooms'>('requests');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bookings, setBookings] = useState<OnlineBookingRow[]>([]);
  const [rooms, setRooms] = useState<RoomRow[]>([]);

  const load = useCallback(async () => {
    try {
      const [b, r] = await Promise.all([
        listOnlineBookingsForAdmin(),
        supabase
          .from('rooms')
          .select('id, room_number, price_per_night, bookable, status')
          .order('room_number')
          .then(({ data, error }) => {
            if (error) throw error;
            return (data ?? []) as RoomRow[];
          }),
      ]);
      setBookings(b);
      setRooms(r);
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message || 'Yüklenemedi');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const setStatus = async (id: string, status: 'confirmed' | 'cancelled') => {
    try {
      await updateOnlineBookingStatus(id, status);
      await load();
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message || 'Güncellenemedi');
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <Text style={styles.heroKicker}>Online rezervasyon</Text>
        <Text style={styles.heroTitle}>Yönetim merkezi</Text>
        <Text style={styles.heroSub}>Talepleri onayla · oda fiyat / fotoğraf / video düzenle</Text>
        <TouchableOpacity
          style={styles.previewBtn}
          onPress={() => router.push('/booking')}
          activeOpacity={0.88}
        >
          <Ionicons name="eye-outline" size={18} color="#fff" />
          <Text style={styles.previewBtnText}>Misafir görünümünü aç</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'requests' && styles.tabOn]}
          onPress={() => setTab('requests')}
          activeOpacity={0.85}
        >
          <Text style={[styles.tabText, tab === 'requests' && styles.tabTextOn]}>
            Talepler ({bookings.filter((b) => b.status === 'pending').length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'rooms' && styles.tabOn]}
          onPress={() => setTab('rooms')}
          activeOpacity={0.85}
        >
          <Text style={[styles.tabText, tab === 'rooms' && styles.tabTextOn]}>Odalar ({rooms.length})</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={adminTheme.colors.primary} />
        </View>
      ) : tab === 'requests' ? (
        <FlatList
          data={bookings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
          ListEmptyComponent={<Text style={styles.empty}>Henüz online rezervasyon talebi yok.</Text>}
          renderItem={({ item }) => (
            <AdminCard style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.name}>{item.guest_full_name}</Text>
                <View style={[styles.badge, badgeStyle(item.status)]}>
                  <Text style={styles.badgeText}>{statusLabel(item.status)}</Text>
                </View>
              </View>
              <Text style={styles.meta}>
                Oda {item.room_number ?? '—'} · {item.check_in_date} → {item.check_out_date} · {item.nights_count} gece
              </Text>
              <Text style={styles.meta}>
                {item.adults} yetişkin{item.children ? ` · ${item.children} çocuk` : ''} · {item.guest_phone}
              </Text>
              {item.quoted_total != null ? (
                <Text style={styles.price}>₺{Number(item.quoted_total).toLocaleString('tr-TR')}</Text>
              ) : null}
              {item.status === 'pending' ? (
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.confirmBtn} onPress={() => void setStatus(item.id, 'confirmed')} activeOpacity={0.85}>
                    <Text style={styles.confirmText}>Onayla</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => void setStatus(item.id, 'cancelled')} activeOpacity={0.85}>
                    <Text style={styles.cancelText}>İptal</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </AdminCard>
          )}
        />
      ) : (
        <FlatList
          data={rooms}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
          ListEmptyComponent={<Text style={styles.empty}>Oda kaydı yok.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/admin/booking/rooms/[id]', params: { id: item.id } })}
              activeOpacity={0.88}
            >
              <AdminCard style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.name}>Oda {item.room_number}</Text>
                  <Ionicons name="chevron-forward" size={18} color={adminTheme.colors.textMuted} />
                </View>
                <Text style={styles.meta}>
                  {item.bookable === false ? 'Vitrinde gizli' : 'Online rezervasyonda açık'} · {item.status}
                </Text>
                <Text style={styles.price}>
                  {item.price_per_night != null
                    ? `₺${Number(item.price_per_night).toLocaleString('tr-TR')} / gece`
                    : 'Fiyat yok'}
                </Text>
                <Text style={styles.editHint}>Fotoğraf · video · fiyat · açıklama</Text>
              </AdminCard>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

function statusLabel(s: string) {
  if (s === 'pending') return 'Bekliyor';
  if (s === 'confirmed') return 'Onaylı';
  if (s === 'cancelled') return 'İptal';
  return s;
}

function badgeStyle(s: string) {
  if (s === 'pending') return { backgroundColor: '#fef3c7' };
  if (s === 'confirmed') return { backgroundColor: '#d1fae5' };
  if (s === 'cancelled') return { backgroundColor: '#fee2e2' };
  return { backgroundColor: '#e5e7eb' };
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: adminTheme.colors.background },
  hero: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 18,
    backgroundColor: '#0f172a',
  },
  heroKicker: { color: '#5eead4', fontWeight: '800', fontSize: 12, letterSpacing: 1, marginBottom: 6 },
  heroTitle: { color: '#fff', fontSize: 26, fontWeight: '900', marginBottom: 6 },
  heroSub: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600', marginBottom: 14 },
  previewBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0f766e',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  previewBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  tabs: { flexDirection: 'row', gap: 8, padding: 16 },
  tab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    alignItems: 'center',
  },
  tabOn: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  tabText: { fontWeight: '800', color: adminTheme.colors.text },
  tabTextOn: { color: '#fff' },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  card: { marginBottom: 12 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  name: { fontSize: 16, fontWeight: '800', color: adminTheme.colors.text, flex: 1 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '800', color: '#111827' },
  meta: { fontSize: 13, color: adminTheme.colors.textMuted, fontWeight: '600', marginTop: 2 },
  price: { marginTop: 8, fontSize: 15, fontWeight: '800', color: '#0f766e' },
  editHint: { marginTop: 6, fontSize: 12, fontWeight: '600', color: adminTheme.colors.textMuted },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  confirmBtn: {
    flex: 1, backgroundColor: '#0f766e', borderRadius: 10, paddingVertical: 10, alignItems: 'center',
  },
  confirmText: { color: '#fff', fontWeight: '800' },
  cancelBtn: {
    flex: 1, backgroundColor: '#fee2e2', borderRadius: 10, paddingVertical: 10, alignItems: 'center',
  },
  cancelText: { color: '#b91c1c', fontWeight: '800' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', color: adminTheme.colors.textMuted, marginTop: 40, fontWeight: '600' },
});
