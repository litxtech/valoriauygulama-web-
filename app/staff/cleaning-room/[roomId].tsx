import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CachedImage } from '@/components/CachedImage';
import { useAuthStore } from '@/stores/authStore';
import {
  fetchHousekeepingHistoryForRoom,
  fetchOrgRooms,
  formatHkDateTime,
  housekeepingStatusLabel,
  HOUSEKEEPING_STATUS_COLORS,
  isSafeHkImageUrl,
  type RoomHousekeepingJobView,
  type RoomMeta,
} from '@/lib/roomHousekeeping';

const ACCENT = '#0f766e';

export default function CleaningRoomDetailScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ roomId: string; roomNumber?: string }>();
  const roomId = typeof params.roomId === 'string' ? params.roomId : '';
  const staff = useAuthStore((s) => s.staff);
  const orgId = staff?.organization_id ?? null;
  const locale = (i18n.language || 'tr').split('-')[0];

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [room, setRoom] = useState<RoomMeta | null>(null);
  const [history, setHistory] = useState<RoomHousekeepingJobView[]>([]);

  const load = useCallback(
    async (silent = false) => {
      if (!orgId || !roomId) {
        setLoading(false);
        setRefreshing(false);
        return;
      }
      if (!silent) setLoading(true);
      try {
        const [rooms, rows] = await Promise.all([
          fetchOrgRooms(orgId),
          fetchHousekeepingHistoryForRoom({ organizationId: orgId, roomId, limit: 80 }),
        ]);
        setRoom(rooms.find((r) => r.id === roomId) ?? null);
        setHistory(rows);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [orgId, roomId]
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const roomNumber = room?.room_number || params.roomNumber || '—';
  const cover = room?.cover_image_url;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={ACCENT} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load(true);
          }}
          tintColor={ACCENT}
        />
      }
    >
      <View style={styles.coverWrap}>
        {cover && isSafeHkImageUrl(cover) ? (
          <CachedImage uri={cover} style={styles.cover} contentFit="cover" />
        ) : (
          <View style={styles.coverFallback}>
            <Ionicons name="bed-outline" size={48} color="#94a3b8" />
          </View>
        )}
        <View style={styles.coverOverlay}>
          <Text style={styles.roomTitle}>{t('cleaningPage_roomLabel', { number: roomNumber })}</Text>
          {room?.floor != null ? (
            <Text style={styles.roomSub}>
              {t('hkFloor')} {room.floor}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('hkDetailHistoryTitle')}</Text>
        <Text style={styles.sectionSub}>{t('hkDetailHistorySub')}</Text>

        {history.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{t('hkDetailEmpty')}</Text>
          </View>
        ) : (
          history.map((job) => {
            const colors = HOUSEKEEPING_STATUS_COLORS[job.status];
            const photos = job.photo_urls.filter(isSafeHkImageUrl);
            return (
              <View key={job.id} style={[styles.card, { borderColor: colors.border }]}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardDate}>{job.target_date}</Text>
                  <View style={[styles.pill, { backgroundColor: colors.accent }]}>
                    <Text style={styles.pillText}>{housekeepingStatusLabel(job.status, t)}</Text>
                  </View>
                </View>
                {job.is_priority ? (
                  <Text style={styles.priority}>{t('hkAlertPriority')}</Text>
                ) : null}

                <Row
                  icon="person-add-outline"
                  label={t('hkDetailOpenedBy')}
                  value={job.scheduled_by_name || '—'}
                />
                <Row
                  icon="play-outline"
                  label={t('hkDetailStartedBy')}
                  value={
                    job.started_by_name
                      ? `${job.started_by_name} · ${formatHkDateTime(job.started_at, locale)}`
                      : '—'
                  }
                />
                <Row
                  icon="checkmark-circle-outline"
                  label={t('hkDetailCompletedBy')}
                  value={
                    job.completed_by_name
                      ? `${job.completed_by_name} · ${formatHkDateTime(job.completed_at, locale)}`
                      : '—'
                  }
                />
                {job.note ? (
                  <Text style={styles.note}>
                    {t('hkNotePh').replace('(isteğe bağlı)', '').replace('(optional)', '').trim()}: {job.note}
                  </Text>
                ) : null}
                {photos.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                    {photos.map((u) => (
                      <CachedImage key={u} uri={u} style={styles.thumb} contentFit="cover" />
                    ))}
                  </ScrollView>
                ) : null}
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={16} color="#64748b" />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  coverWrap: { height: 180, backgroundColor: '#e2e8f0', position: 'relative' },
  cover: { width: '100%', height: '100%' },
  coverFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  coverOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  roomTitle: { color: '#fff', fontSize: 24, fontWeight: '800' },
  roomSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 },
  section: { padding: 16, gap: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  sectionSub: { fontSize: 13, color: '#64748b', marginBottom: 4 },
  empty: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyText: { color: '#64748b', textAlign: 'center' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 12,
    gap: 6,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardDate: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pillText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  priority: { color: '#dc2626', fontWeight: '800', fontSize: 11 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 4 },
  rowLabel: { fontSize: 11, color: '#94a3b8', fontWeight: '600' },
  rowValue: { fontSize: 13, color: '#0f172a', fontWeight: '700' },
  note: { fontSize: 12, color: '#475569', fontStyle: 'italic', marginTop: 4 },
  thumb: { width: 56, height: 56, borderRadius: 8, marginRight: 8, backgroundColor: '#e2e8f0' },
});
