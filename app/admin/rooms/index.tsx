import { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Animated, Platform } from 'react-native';
import { useRouter, useFocusEffect, usePathname } from 'expo-router';
import { occupancyPathsFromPathname } from '@/lib/occupancyOpsPaths';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { AdminButton, AdminCard } from '@/components/admin';
import {
  getAdminRoomsListCache,
  setAdminRoomsListCache,
  getAdminRoomsListCacheAgeMs,
  ADMIN_ROOMS_FOCUS_REFRESH_MS,
} from '@/lib/adminRoomsListCache';

const DONE_GRACE_MS = 60 * 1000;

type Room = {
  id: string;
  room_number: string;
  floor: number | null;
  status: string;
  view_type: string | null;
  bed_type: string | null;
  price_per_night: number | null;
  previewSignerName?: string | null;
  liveGuests?: string[];
};

const STATUS_LABELS: Record<string, string> = {
  available: 'Müsait',
  occupied: 'Dolu',
  cleaning: 'Temizlik',
  maintenance: 'Bakım',
  out_of_order: 'Kullanılmıyor',
};

const statusColor: Record<string, string> = {
  available: adminTheme.colors.success,
  occupied: adminTheme.colors.error,
  cleaning: adminTheme.colors.warning,
  maintenance: adminTheme.colors.info,
  out_of_order: adminTheme.colors.textMuted,
};

function RoomCard({ item, onPress }: { item: Room; onPress: () => void }) {
  const preview = item.previewSignerName?.trim();
  const scale = useRef(new Animated.Value(1)).current;
  const handlePressIn = () => {
    Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 8 }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale }], marginBottom: 12 }}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        style={styles.card}
      >
        <View style={styles.cardRow}>
          <View style={styles.roomInfo}>
            <Text style={styles.roomNum}>Oda {item.room_number}</Text>
            {item.floor != null && (
              <Text style={styles.meta}>Kat {item.floor}</Text>
            )}
          </View>
          <View style={styles.cardRight}>
            <View style={[styles.badge, { backgroundColor: statusColor[item.status] || adminTheme.colors.textMuted }]}>
              <Text style={styles.badgeText}>{STATUS_LABELS[item.status] || item.status}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={adminTheme.colors.textMuted} />
          </View>
        </View>
        {item.price_per_night != null && (
          <Text style={styles.price}>₺{item.price_per_night} <Text style={styles.priceUnit}>/ gece</Text></Text>
        )}
        {preview ? (
          <Text style={styles.previewHint} numberOfLines={2}>
            Önizleme (sözleşme): {preview}
          </Text>
        ) : null}
        {item.liveGuests && item.liveGuests.length > 0 ? (
          <Text style={styles.liveGuests} numberOfLines={2}>
            Odada: {item.liveGuests.join(', ')}
          </Text>
        ) : (
          <Text style={styles.vacantHint}>Şu an misafir yok</Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function RoomsList() {
  const router = useRouter();
  const paths = occupancyPathsFromPathname(usePathname());
  const initialCached = getAdminRoomsListCache(true);
  const [rooms, setRooms] = useState<Room[]>(initialCached ?? []);
  const [loading, setLoading] = useState(!(initialCached && initialCached.length > 0));
  const [cleaningPlanLocked, setCleaningPlanLocked] = useState(false);
  const [cleaningPlanApproved, setCleaningPlanApproved] = useState(false);

  const loadCleaningPlanLockState = async () => {
    const now = new Date();
    const todayIso = now.toISOString().slice(0, 10);

    const { data: planRows } = await supabase
      .from('room_cleaning_plans')
      .select('id, target_date')
      .gte('target_date', todayIso)
      .order('target_date', { ascending: true })
      .limit(1);

    const activePlanId = planRows?.[0]?.id as string | undefined;
    const activePlanDate = (planRows?.[0]?.target_date as string | undefined) ?? null;
    let allRoomsDone = false;
    if (activePlanId) {
      const { data: planRoomRows } = await supabase
        .from('room_cleaning_plan_rooms')
        .select('id, is_done, done_at')
        .eq('plan_id', activePlanId);

      const rows = (planRoomRows ?? []) as { id: string; is_done: boolean; done_at: string | null }[];
      allRoomsDone = rows.length > 0 && rows.every((r) => {
        if (!r.is_done || !r.done_at) return false;
        const doneAtMs = new Date(r.done_at).getTime();
        return !Number.isNaN(doneAtMs) && now.getTime() - doneAtMs >= DONE_GRACE_MS;
      });
    }

    const dayPassed = activePlanDate ? todayIso > activePlanDate : false;
    const shouldLock = dayPassed || allRoomsDone;
    setCleaningPlanLocked(shouldLock);
    setCleaningPlanApproved(shouldLock);
  };

  const loadRooms = useCallback(async (opts?: { silent?: boolean; force?: boolean }) => {
    if (!opts?.force) {
      const age = getAdminRoomsListCacheAgeMs();
      if (age != null && age < ADMIN_ROOMS_FOCUS_REFRESH_MS) {
        const hit = getAdminRoomsListCache(true);
        if (hit) {
          setRooms(hit);
          setLoading(false);
        }
        return;
      }
      if (!opts?.silent) {
        const stale = getAdminRoomsListCache(true);
        if (stale?.length) {
          setRooms(stale);
          setLoading(false);
        }
      }
    }

    const { data } = await supabase
      .from('rooms')
      .select('id, room_number, floor, status, view_type, bed_type, price_per_night')
      .order('room_number');
    const base = (data ?? []) as Room[];
    const ids = base.map((r) => r.id);
    const previewByRoom: Record<string, string> = {};
    const liveGuestsByRoom: Record<string, string[]> = {};
    if (ids.length > 0) {
      const { data: cas } = await supabase
        .from('contract_acceptances')
        .select('room_id, guests(full_name, status, room_id)')
        .in('room_id', ids)
        .not('guest_id', 'is', null);
      for (const row of cas ?? []) {
        const rid = row.room_id as string | null;
        if (!rid || previewByRoom[rid]) continue;
        const g = Array.isArray(row.guests) ? row.guests[0] : row.guests;
        if (g && g.status === 'pending' && !g.room_id && g.full_name?.trim()) {
          previewByRoom[rid] = g.full_name.trim();
        }
      }

      const { data: liveRows } = await supabase
        .from('guests')
        .select('full_name, room_id')
        .eq('status', 'checked_in')
        .in('room_id', ids);
      for (const row of (liveRows ?? []) as { full_name: string | null; room_id: string | null }[]) {
        if (!row.room_id || !row.full_name?.trim()) continue;
        if (!liveGuestsByRoom[row.room_id]) liveGuestsByRoom[row.room_id] = [];
        liveGuestsByRoom[row.room_id]?.push(row.full_name.trim());
      }
    }
    const list = base.map((r) => ({
      ...r,
      previewSignerName: previewByRoom[r.id] ?? null,
      liveGuests: liveGuestsByRoom[r.id] ?? [],
    }));
    setAdminRoomsListCache(list);
    setRooms(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      await loadRooms({ silent: Boolean(initialCached?.length) });
      await loadCleaningPlanLockState();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ilk mount
  }, [loadRooms]);

  useFocusEffect(
    useCallback(() => {
      const stale = getAdminRoomsListCache(true);
      if (stale?.length) setRooms(stale);
      const age = getAdminRoomsListCacheAgeMs();
      if (age == null || age >= ADMIN_ROOMS_FOCUS_REFRESH_MS) {
        void loadRooms({ silent: Boolean(stale?.length) });
      }
      void loadCleaningPlanLockState();
    }, [loadRooms])
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingWrap}>
          <Text style={styles.loading}>Yükleniyor...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        {paths.scope === 'admin' ? (
        <AdminButton
          title={cleaningPlanApproved ? 'Yarın temizlenecek odalar - ONAYLANDI' : 'Yarın temizlenecek odalar'}
          onPress={() => {
            if (cleaningPlanLocked) return;
            router.push(paths.scope === 'admin' ? '/admin/rooms/cleaning-plan' : paths.hub);
          }}
          variant={cleaningPlanApproved ? 'primary' : 'secondary'}
          size="md"
          leftIcon={
            <Ionicons
              name={cleaningPlanApproved ? 'checkmark-circle' : 'checkbox-outline'}
              size={18}
              color={cleaningPlanApproved ? '#fff' : adminTheme.colors.text}
            />
          }
          disabled={cleaningPlanLocked}
          style={[{ marginBottom: 10 }, cleaningPlanApproved ? styles.cleaningApprovedBtn : undefined]}
          textStyle={cleaningPlanApproved ? styles.cleaningApprovedBtnText : undefined}
          fullWidth
        />
        ) : null}
        {paths.scope === 'admin' ? (
        <AdminButton
          title="Yeni oda ekle"
          onPress={() => router.push('/admin/rooms/new')}
          variant="accent"
          size="md"
          leftIcon={<Ionicons name="add" size={20} color="#fff" />}
          fullWidth
        />
        ) : (
          <Text style={styles.staffRoomsHint}>Odaya dokunun: kim var, giriş/çıkış ve sözleşme işlemleri.</Text>
        )}
      </View>
      <FlatList
        data={rooms}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        listEmptyComponent={
          <AdminCard>
            <Text style={styles.emptyText}>Henüz oda tanımlı değil.</Text>
            {paths.scope === 'admin' ? (
              <AdminButton
                title="İlk odayı ekle"
                onPress={() => router.push('/admin/rooms/new')}
                variant="primary"
                size="md"
                style={{ marginTop: 16 }}
              />
            ) : null}
          </AdminCard>
        }
        renderItem={({ item }) => (
          <RoomCard item={item} onPress={() => router.push(paths.room(item.id) as never)} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  loadingWrap: {
    padding: 24,
    alignItems: 'center',
  },
  loading: {
    fontSize: 15,
    color: adminTheme.colors.textSecondary,
  },
  topBar: {
    padding: 20,
    paddingBottom: 8,
    backgroundColor: adminTheme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.border,
  },
  list: {
    padding: 20,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: adminTheme.colors.surface,
    padding: 18,
    borderRadius: adminTheme.radius.lg,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    ...Platform.select({
      ios: adminTheme.shadow.sm,
      android: { elevation: 2 },
    }),
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  roomInfo: {
    flex: 1,
    minWidth: 0,
  },
  cardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  roomNum: {
    fontSize: 18,
    fontWeight: '700',
    color: adminTheme.colors.text,
  },
  meta: {
    fontSize: 13,
    color: adminTheme.colors.textSecondary,
    marginTop: 4,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: adminTheme.radius.sm,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  price: {
    fontSize: 15,
    fontWeight: '700',
    color: adminTheme.colors.accent,
    marginTop: 10,
  },
  priceUnit: {
    fontWeight: '500',
    color: adminTheme.colors.textSecondary,
    fontSize: 13,
  },
  previewHint: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '600',
    color: adminTheme.colors.info,
    lineHeight: 18,
  },
  liveGuests: {
    marginTop: 8,
    fontSize: 13,
    color: '#0f766e',
    fontWeight: '600',
    lineHeight: 18,
  },
  vacantHint: {
    marginTop: 8,
    fontSize: 12,
    color: adminTheme.colors.textMuted,
  },
  emptyText: {
    fontSize: 15,
    color: adminTheme.colors.textSecondary,
    textAlign: 'center',
  },
  staffRoomsHint: {
    fontSize: 13,
    color: adminTheme.colors.textSecondary,
    marginBottom: 8,
    lineHeight: 18,
  },
  cleaningApprovedBtn: {
    backgroundColor: adminTheme.colors.success,
    opacity: 1,
  },
  cleaningApprovedBtnText: {
    color: '#fff',
  },
});
