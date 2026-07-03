import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { useCachedList } from '@/hooks/useCachedList';
import {
  fetchStaffGuestServiceRequests,
  updateGuestServiceRequestStatus,
  type GuestServiceRequestRow,
} from '@/lib/guestServiceRequests';
import {
  guestServiceTypeLabel,
  guestServiceStatusLabel,
  type GuestServiceRequestStatus,
  type GuestServiceRequestType,
} from '@/lib/guestServiceRequestsI18n';
import { formatFeedRelativeTime } from '@/lib/feedRelativeTime';
import { guestDisplayName } from '@/lib/guestDisplayName';
import { supabase } from '@/lib/supabase';

const TYPE_ICON: Record<GuestServiceRequestType, keyof typeof Ionicons.glyphMap> = {
  room_cleaning: 'sparkles-outline',
  towels: 'layers-outline',
  maintenance: 'construct-outline',
  late_checkout: 'time-outline',
  lost_item: 'search-outline',
  amenities: 'cube-outline',
  kitchen_order: 'restaurant-outline',
  other: 'ellipsis-horizontal-outline',
};

const NEXT_STATUS: Partial<Record<GuestServiceRequestStatus, GuestServiceRequestStatus>> = {
  pending: 'in_progress',
  in_progress: 'completed',
};

export default function StaffGuestServiceRequestsScreen() {
  const { staff } = useAuthStore();
  const orgId = staff?.organization_id ?? null;
  const cacheKey = orgId ? `guest-service-requests:${orgId}` : 'guest-service-requests:none';

  const fetchItems = useCallback(async () => {
    try {
      return await fetchStaffGuestServiceRequests(orgId);
    } catch {
      return [];
    }
  }, [orgId]);

  const {
    items: rows,
    setItems: setRows,
    loading,
    refreshing,
    refresh,
    load,
  } = useCachedList<GuestServiceRequestRow>({
    cacheKey,
    enabled: !!orgId,
    fetchItems,
  });

  const [guestNames, setGuestNames] = useState<Record<string, string>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    const guestIds = [...new Set(rows.map((r) => r.guest_id))];
    if (guestIds.length === 0) {
      setGuestNames({});
      return;
    }
    let cancelled = false;
    void supabase
      .from('guests')
      .select('id, full_name')
      .in('id', guestIds)
      .then(({ data }) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const g of data ?? []) {
          const row = g as { id: string; full_name: string | null };
          map[row.id] = guestDisplayName(row.full_name) || 'Misafir';
        }
        setGuestNames(map);
      });
    return () => {
      cancelled = true;
    };
  }, [rows]);

  const advanceStatus = async (row: GuestServiceRequestRow) => {
    const next = NEXT_STATUS[row.status];
    if (!next) return;
    setUpdatingId(row.id);
    try {
      await updateGuestServiceRequestStatus({
        id: row.id,
        status: next,
        staffId: staff?.id ?? null,
      });
      await load({ silent: true });
    } catch (e: unknown) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Güncellenemedi');
    } finally {
      setUpdatingId(null);
    }
  };

  const pendingCount = useMemo(() => rows.filter((r) => r.status === 'pending').length, [rows]);

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Misafir talepleri</Text>
        <Text style={styles.heroSub}>Oda temizliği, havlu, bakım ve kayıp eşya bildirimleri</Text>
        {pendingCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{pendingCount} bekleyen</Text>
          </View>
        ) : null}
      </View>

      {loading && rows.length === 0 ? (
        <ActivityIndicator style={styles.loader} color={theme.colors.primary} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        >
          {rows.length === 0 ? (
            <Text style={styles.empty}>Kayıt yok</Text>
          ) : (
            rows.map((row) => {
              const next = NEXT_STATUS[row.status];
              return (
                <View key={row.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Ionicons name={TYPE_ICON[row.request_type]} size={20} color={theme.colors.primary} />
                    <Text style={styles.type}>{guestServiceTypeLabel(row.request_type)}</Text>
                    <Text style={styles.status}>{guestServiceStatusLabel(row.status)}</Text>
                  </View>
                  <Text style={styles.guest}>{guestNames[row.guest_id] ?? 'Misafir'}</Text>
                  <Text style={styles.desc}>{row.description}</Text>
                  {row.room_number ? <Text style={styles.meta}>Oda {row.room_number}</Text> : null}
                  <Text style={styles.time}>{formatFeedRelativeTime(row.created_at)}</Text>
                  {next ? (
                    <TouchableOpacity
                      style={styles.action}
                      onPress={() => advanceStatus(row)}
                      disabled={updatingId === row.id}
                    >
                      {updatingId === row.id ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.actionText}>
                          {next === 'in_progress' ? 'İşleme al' : 'Tamamla'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  hero: { padding: theme.spacing.lg, paddingBottom: 8 },
  heroTitle: { fontSize: 22, fontWeight: '800', color: theme.colors.text },
  heroSub: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 4 },
  badge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: '#fef3c7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#b45309' },
  loader: { marginTop: 32 },
  list: { padding: theme.spacing.lg, gap: 12, paddingBottom: 40 },
  empty: { textAlign: 'center', color: theme.colors.textSecondary, marginTop: 24 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  type: { flex: 1, fontSize: 15, fontWeight: '800', color: theme.colors.text },
  status: { fontSize: 11, fontWeight: '800', color: theme.colors.primary },
  guest: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted, marginTop: 6 },
  desc: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 6, lineHeight: 20 },
  meta: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  time: { fontSize: 11, color: theme.colors.textMuted, marginTop: 4 },
  action: {
    marginTop: 12,
    backgroundColor: theme.colors.primary,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  actionText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
