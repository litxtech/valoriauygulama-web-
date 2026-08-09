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
  fetchBookingTrafficSummary,
  listOnlineBookingsForAdmin,
  listRecentBookingEvents,
  updateOnlineBookingStatus,
  deleteBookableShowcaseRoom,
  buildAdminGuestWhatsAppText,
  bookingStatusLabel,
  bookingStatusTone,
  formatBookingDate,
  formatBookingDateRange,
  type BookingTrafficRow,
  type OnlineBookingRow,
} from '@/lib/onlineBooking';
import { openWhatsApp } from '@/lib/contactLaunch';

type RoomRow = {
  id: string;
  room_number: string;
  capacity_label: string | null;
  display_title: string | null;
  price_per_night: number | null;
  bookable: boolean | null;
  status: string;
};

type Tab = 'requests' | 'rooms' | 'traffic';

export default function AdminBookingHub() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('requests');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bookings, setBookings] = useState<OnlineBookingRow[]>([]);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [traffic, setTraffic] = useState<BookingTrafficRow[]>([]);
  const [events, setEvents] = useState<
    { id: string; event_type: string; source: string; capacity_label: string | null; created_at: string }[]
  >([]);

  const load = useCallback(async () => {
    try {
      const [b, r, t, e] = await Promise.all([
        listOnlineBookingsForAdmin(),
        supabase
          .from('rooms')
          .select('id, room_number, capacity_label, display_title, price_per_night, bookable, status')
          .eq('bookable', true)
          .order('room_number')
          .then(({ data, error }) => {
            if (error) throw error;
            return (data ?? []) as RoomRow[];
          }),
        fetchBookingTrafficSummary(24).catch(() => [] as BookingTrafficRow[]),
        listRecentBookingEvents(40).catch(() => []),
      ]);
      setBookings(b);
      setRooms(r);
      setTraffic(t);
      setEvents(e);
    } catch (err) {
      Alert.alert('Hata', (err as Error)?.message || 'Yüklenemedi');
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

  const setStatus = async (id: string, status: 'confirmed' | 'cancelled', guestName?: string) => {
    const run = async () => {
      try {
        await updateOnlineBookingStatus(id, status);
        await load();
      } catch (err) {
        Alert.alert('Hata', (err as Error)?.message || 'Güncellenemedi');
      }
    };
    if (status === 'cancelled') {
      Alert.alert('Rezervasyonu iptal et', `${guestName || 'Bu talep'} iptal edilsin mi?`, [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'İptal et', style: 'destructive', onPress: () => void run() },
      ]);
      return;
    }
    await run();
  };

  const removeRoom = (room: RoomRow) => {
    Alert.alert(
      'Odayı sil',
      `${room.capacity_label || room.display_title || 'Bu oda'} vitrinden kaldırılacak. Emin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await deleteBookableShowcaseRoom(room.id);
                await load();
              } catch (err) {
                Alert.alert('Hata', (err as Error)?.message || 'Silinemedi');
              }
            })();
          },
        },
      ]
    );
  };

  const webViews = sumTraffic(traffic, 'web', 'page_view');
  const appViews = sumTraffic(traffic, 'app', 'page_view') + sumTraffic(traffic, 'lobby', 'page_view');
  const paidReserved = bookings.filter((x) => x.status === 'confirmed' || x.status === 'converted' || !!x.paid_at).length;

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <Text style={styles.heroKicker}>Online rezervasyon</Text>
        <Text style={styles.heroTitle}>Yönetim merkezi</Text>
        <Text style={styles.heroSub}>İptal · düzenle · WhatsApp ile misafire yaz</Text>
        <View style={styles.statRow}>
          <Stat label="Web ziyaret" value={String(webViews)} />
          <Stat label="Uygulama" value={String(appViews)} />
          <Stat label="Rezerve" value={String(paidReserved)} />
        </View>
        <TouchableOpacity style={styles.previewBtn} onPress={() => router.push('/booking')} activeOpacity={0.88}>
          <Ionicons name="eye-outline" size={18} color="#fff" />
          <Text style={styles.previewBtnText}>Misafir görünümü</Text>
        </TouchableOpacity>
        <Text style={styles.shareUrlHint}>Misafire paylaş: valoria.tr/rez</Text>
        <View style={styles.heroActions}>
          <TouchableOpacity
            style={styles.heroActionBtn}
            onPress={() => router.push('/admin/booking/rooms/new')}
            activeOpacity={0.88}
          >
            <Text style={styles.heroActionText}>+ Oda ekle</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.heroActionBtn}
            onPress={() => router.push('/admin/booking/breakfast')}
            activeOpacity={0.88}
          >
            <Text style={styles.heroActionText}>Kahvaltı menüsü</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.heroActionBtn}
            onPress={() => router.push('/admin/booking/stats')}
            activeOpacity={0.88}
          >
            <Text style={styles.heroActionText}>Aylık istatistik</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabs}>
        {([
          ['requests', `Talepler (${bookings.filter((x) => x.status === 'pending' || x.offer_status === 'pending').length})`],
          ['rooms', `Odalar (${rooms.length})`],
          ['traffic', 'Trafik'],
        ] as const).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[styles.tab, tab === key && styles.tabOn]}
            onPress={() => setTab(key)}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, tab === key && styles.tabTextOn]} numberOfLines={1}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
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
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => router.push({ pathname: '/admin/booking/[id]', params: { id: item.id } })}
            >
              <AdminCard style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.cardTitleCol}>
                    <Text style={styles.name}>{item.guest_full_name}</Text>
                    <Text style={styles.refTiny}>REF {item.id.slice(0, 8).toUpperCase()}</Text>
                  </View>
                  <View style={styles.cardTopRight}>
                    <View style={[styles.badge, badgeStyleFor(item)]}>
                      <Text style={styles.badgeText}>{bookingStatusLabel(item)}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={adminTheme.colors.textMuted} />
                  </View>
                </View>
                <Text style={styles.meta}>
                  {item.capacity_label || item.room_label || 'Standart'} ·{' '}
                  {formatBookingDateRange(item.check_in_date, item.check_out_date)} · {item.nights_count} gece
                </Text>
                <Text style={styles.meta}>
                  {item.adults} yetişkin{item.children ? ` · ${item.children} çocuk` : ''} · {item.guest_phone}
                </Text>
                {item.guest_id_number ? (
                  <Text style={styles.meta}>
                    TC {item.guest_id_number} · Doğum {formatBookingDate(item.guest_birth_date)}
                  </Text>
                ) : null}
                <View style={styles.cardFooter}>
                  {item.quoted_total != null ? (
                    <Text style={styles.price}>₺{Number(item.quoted_total).toLocaleString('tr-TR')}</Text>
                  ) : (
                    <View />
                  )}
                  <View style={styles.cardFooterRight}>
                    {!item.paid_at ? (
                      <View style={styles.unpaidChip}>
                        <Text style={styles.unpaidChipText}>Ödenmedi</Text>
                      </View>
                    ) : (
                      <View style={styles.paidChip}>
                        <Text style={styles.paidChipText}>Ödendi</Text>
                      </View>
                    )}
                    {item.pdf_url ? (
                      <View style={styles.pdfChip}>
                        <Ionicons name="document-text" size={12} color="#0f766e" />
                        <Text style={styles.pdfChipText}>PDF</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                {item.status === 'pending' || item.status === 'confirmed' ? (
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={styles.waBtn}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        void openWhatsApp(item.guest_phone, buildAdminGuestWhatsAppText(item));
                      }}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="logo-whatsapp" size={16} color="#fff" />
                      <Text style={styles.waText}>Yaz</Text>
                    </TouchableOpacity>
                    {item.status === 'pending' ? (
                      <TouchableOpacity
                        style={styles.confirmBtn}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          void setStatus(item.id, 'confirmed');
                        }}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.confirmText}>Onayla</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        void setStatus(item.id, 'cancelled', item.guest_full_name);
                      }}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.cancelText}>İptal</Text>
                    </TouchableOpacity>
                  </View>
                ) : item.guest_phone?.trim() ? (
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={styles.waBtn}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        void openWhatsApp(item.guest_phone, buildAdminGuestWhatsAppText(item));
                      }}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="logo-whatsapp" size={16} color="#fff" />
                      <Text style={styles.waText}>WhatsApp</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </AdminCard>
            </TouchableOpacity>
          )}
        />
      ) : tab === 'rooms' ? (
        <FlatList
          data={rooms}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
          ListEmptyComponent={<Text style={styles.empty}>Vitrinde oda yok. “+ Oda ekle” ile ekleyin.</Text>}
          renderItem={({ item }) => (
            <AdminCard style={styles.card}>
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/admin/booking/rooms/[id]', params: { id: item.id } })}
                activeOpacity={0.88}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.name}>
                    {item.capacity_label || 'Kapasite yok'}
                    {item.display_title ? ` · ${item.display_title}` : ''}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={adminTheme.colors.textMuted} />
                </View>
                <Text style={styles.meta}>
                  İç kayıt: Oda {item.room_number} · Vitrinde açık
                </Text>
                <Text style={styles.price}>
                  {item.price_per_night != null
                    ? `₺${Number(item.price_per_night).toLocaleString('tr-TR')} / gece`
                    : 'Fiyat yok'}
                </Text>
              </TouchableOpacity>
              <View style={styles.roomActions}>
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() => router.push({ pathname: '/admin/booking/rooms/[id]', params: { id: item.id } })}
                  activeOpacity={0.85}
                >
                  <Ionicons name="create-outline" size={16} color="#fff" />
                  <Text style={styles.editBtnText}>Düzenle</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteRoomBtn}
                  onPress={() => removeRoom(item)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="trash-outline" size={16} color="#b91c1c" />
                  <Text style={styles.deleteRoomBtnText}>Sil</Text>
                </TouchableOpacity>
              </View>
            </AdminCard>
          )}
        />
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
          ListHeaderComponent={
            <AdminCard style={styles.card}>
              <Text style={styles.name}>Son 24 saat özeti</Text>
              {traffic.length === 0 ? (
                <Text style={styles.meta}>Henüz olay yok.</Text>
              ) : (
                traffic.map((row) => (
                  <Text key={`${row.source}-${row.event_type}`} style={styles.meta}>
                    {row.source} · {eventLabel(row.event_type)}: {row.event_count}
                  </Text>
                ))
              )}
            </AdminCard>
          }
          ListEmptyComponent={<Text style={styles.empty}>Kanal olayı yok.</Text>}
          renderItem={({ item }) => (
            <AdminCard style={styles.card}>
              <Text style={styles.name}>{eventLabel(item.event_type)}</Text>
              <Text style={styles.meta}>
                {item.source}
                {item.capacity_label ? ` · ${item.capacity_label}` : ''} ·{' '}
                {new Date(item.created_at).toLocaleString('tr-TR')}
              </Text>
            </AdminCard>
          )}
        />
      )}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function sumTraffic(rows: BookingTrafficRow[], source: string, eventType: string) {
  return rows.filter((r) => r.source === source && r.event_type === eventType).reduce((a, r) => a + r.event_count, 0);
}

function eventLabel(s: string) {
  const map: Record<string, string> = {
    page_view: 'Sayfa görüntüleme',
    room_view: 'Oda görüntüleme',
    form_start: 'Form başladı',
    form_submit: 'Rezervasyon gönderildi',
    login_auto: 'Otomatik giriş',
    pdf_ready: 'PDF hazır',
  };
  return map[s] || s;
}

function badgeStyleFor(item: OnlineBookingRow) {
  const tone = bookingStatusTone(item);
  if (tone === 'warn') return { backgroundColor: '#ffedd5' };
  if (tone === 'ok') return { backgroundColor: '#d1fae5' };
  if (tone === 'bad') return { backgroundColor: '#fee2e2' };
  return { backgroundColor: '#e5e7eb' };
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: adminTheme.colors.background },
  hero: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 18, backgroundColor: '#0f172a' },
  heroKicker: { color: '#5eead4', fontWeight: '800', fontSize: 12, letterSpacing: 1, marginBottom: 6 },
  heroTitle: { color: '#fff', fontSize: 26, fontWeight: '900', marginBottom: 6 },
  heroSub: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600', marginBottom: 14 },
  statRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  stat: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center',
  },
  statValue: { color: '#fff', fontWeight: '900', fontSize: 18 },
  statLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: '700', marginTop: 2 },
  previewBtn: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#0f766e', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
  },
  previewBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  shareUrlHint: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.72)',
  },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  heroActionBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  heroActionText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  tabs: { flexDirection: 'row', gap: 6, padding: 12 },
  tab: {
    flex: 1, paddingVertical: 11, borderRadius: 12, backgroundColor: '#fff',
    borderWidth: 1, borderColor: adminTheme.colors.border, alignItems: 'center', paddingHorizontal: 4,
  },
  tabOn: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  tabText: { fontWeight: '800', color: adminTheme.colors.text, fontSize: 12 },
  tabTextOn: { color: '#fff' },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  card: { marginBottom: 12 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 8 },
  cardTitleCol: { flex: 1 },
  cardTopRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 17, fontWeight: '800', color: adminTheme.colors.text },
  refTiny: { marginTop: 2, fontSize: 11, fontWeight: '700', color: adminTheme.colors.textMuted, letterSpacing: 0.6 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '800', color: '#111827' },
  meta: { fontSize: 13, color: adminTheme.colors.textMuted, fontWeight: '600', marginTop: 2 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  cardFooterRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  price: { fontSize: 16, fontWeight: '800', color: '#0f766e' },
  paidChip: { backgroundColor: '#d1fae5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  paidChipText: { fontSize: 11, fontWeight: '800', color: '#065f46' },
  unpaidChip: { backgroundColor: '#ffedd5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  unpaidChipText: { fontSize: 11, fontWeight: '800', color: '#9a3412' },
  pdfChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#ecfdf5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  pdfChipText: { fontSize: 11, fontWeight: '800', color: '#0f766e' },
  editHint: { marginTop: 6, fontSize: 12, fontWeight: '600', color: adminTheme.colors.textMuted },
  roomActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  editBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#0f766e',
    borderRadius: 10,
    paddingVertical: 10,
  },
  editBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  deleteRoomBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#fee2e2',
    borderRadius: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  deleteRoomBtnText: { color: '#b91c1c', fontWeight: '800', fontSize: 13 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  waBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#128C7E',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  waText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  confirmBtn: { flex: 1, backgroundColor: '#0f766e', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  confirmText: { color: '#fff', fontWeight: '800' },
  cancelBtn: { flex: 1, backgroundColor: '#fee2e2', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  cancelText: { color: '#b91c1c', fontWeight: '800' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', color: adminTheme.colors.textMuted, marginTop: 40, fontWeight: '600' },
});
