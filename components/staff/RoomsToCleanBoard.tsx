import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';
import {
  groupCleaningRoomsByFloor,
  getPlanDateHighlight,
  type CleaningPlanRow,
  type CleaningPlanRoomRow,
  type CleaningRoomMeta,
} from '@/lib/cleaningPlanLoad';
import type { usePersonelDesign } from '@/hooks/usePersonelDesign';

const ACCENT = '#0d9488';

type Props = {
  plan: CleaningPlanRow;
  planRooms: CleaningPlanRoomRow[];
  roomMetaByRoomId: Record<string, CleaningRoomMeta>;
  locale: string;
  t: TFunction;
  pds: ReturnType<typeof usePersonelDesign>;
  isNight: boolean;
};

function formatPlanDateLong(iso: string, locale: string): string {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  } catch {
    return iso;
  }
}

function formatSentAt(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function RoomsToCleanBoard({ plan, planRooms, roomMetaByRoomId, locale, t, pds, isNight }: Props) {
  const highlight = getPlanDateHighlight(plan.target_date);
  const whenKey =
    highlight === 'today'
      ? 'cleaningPage_whenToday'
      : highlight === 'tomorrow'
        ? 'cleaningPage_whenTomorrow'
        : 'cleaningPage_whenOnDate';

  const whenBadge = t(whenKey);
  const dateLong = formatPlanDateLong(plan.target_date, locale);
  const sentAt = formatSentAt(plan.created_at, locale);
  const floorGroups = groupCleaningRoomsByFloor(planRooms, roomMetaByRoomId);

  const bannerAccent =
    highlight === 'today' ? '#ea580c' : highlight === 'tomorrow' ? ACCENT : '#2563eb';

  const bannerBg = isNight
    ? bannerAccent + '18'
    : highlight === 'today'
      ? '#fff7ed'
      : highlight === 'tomorrow'
        ? '#f0fdfa'
        : '#eff6ff';

  return (
    <View style={[styles.wrap, { borderColor: pds.cardBorder, backgroundColor: bannerBg }]}>
      <View style={styles.scheduleBanner}>
        <View style={styles.bannerTop}>
          <View style={[styles.whenPill, { backgroundColor: bannerAccent }]}>
            <Text style={styles.whenPillText}>{whenBadge}</Text>
          </View>
          <Text style={[styles.roomCount, { color: pds.text }]}>
            {t('cleaningPage_roomCount', { count: planRooms.length })}
          </Text>
        </View>
        <Text style={[styles.dateLong, { color: pds.text }]}>{dateLong}</Text>
        <View style={styles.metaItem}>
          <Ionicons name="paper-plane-outline" size={12} color={pds.muted} />
          <Text style={[styles.metaSent, { color: pds.muted }]}>{t('cleaningPage_sentAt', { when: sentAt })}</Text>
        </View>
      </View>

      {floorGroups.map((group) => (
        <View key={`floor-${group.floorLabel}`} style={styles.floorBlock}>
          <Text style={[styles.floorTitle, { color: pds.muted }]}>
            {group.floor != null ? t('cleaningPage_floorRooms', { floor: group.floor }) : t('cleaningPage_floorUnknown')}
          </Text>
          <View style={styles.roomGrid}>
            {group.rooms.map((pr) => {
              const num = roomMetaByRoomId[pr.room_id]?.room_number ?? '—';
              return (
                <View
                  key={pr.id}
                  style={[
                    styles.roomChip,
                    {
                      borderColor: bannerAccent + '44',
                      backgroundColor: isNight ? pds.cardBg : '#fff',
                    },
                  ]}
                >
                  <Text style={[styles.roomNumber, { color: bannerAccent }]}>{num}</Text>
                  {pr.note ? (
                    <Text style={[styles.roomNote, { color: pds.muted }]} numberOfLines={1}>
                      {pr.note}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  scheduleBanner: { padding: 12, gap: 4, paddingBottom: 10 },
  bannerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  whenPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  whenPillText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  roomCount: { fontSize: 13, fontWeight: '700' },
  dateLong: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2, lineHeight: 20 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  metaSent: { fontSize: 11, fontWeight: '500' },
  floorBlock: { paddingHorizontal: 10, paddingBottom: 10 },
  floorTitle: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  roomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  roomChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 44,
    alignItems: 'center',
  },
  roomNumber: { fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
  roomNote: { fontSize: 9, marginTop: 1, maxWidth: 72, textAlign: 'center' },
});
