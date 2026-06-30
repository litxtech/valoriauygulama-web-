import { View, Text, StyleSheet } from 'react-native';
import type { TFunction } from 'i18next';
import {
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

  const sortedRooms = [...planRooms].sort((a, b) => {
    const na = roomMetaByRoomId[a.room_id]?.room_number ?? '';
    const nb = roomMetaByRoomId[b.room_id]?.room_number ?? '';
    return na.localeCompare(nb, undefined, { numeric: true });
  });

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.whenPill}>
          <Text style={styles.whenPillText}>{whenBadge}</Text>
        </View>
        <Text style={[styles.dateLong, { color: pds.text }]}>{dateLong}</Text>
        <Text style={[styles.roomCount, { color: pds.subtext }]}>
          {t('cleaningPage_roomCount', { count: planRooms.length })}
        </Text>
      </View>

      <View style={styles.roomGrid}>
        {sortedRooms.map((pr) => {
          const num = roomMetaByRoomId[pr.room_id]?.room_number ?? '—';
          return (
            <View
              key={pr.id}
              style={[
                styles.roomChip,
                {
                  borderColor: isNight ? 'rgba(20,184,166,0.35)' : '#99f6e4',
                  backgroundColor: isNight ? 'rgba(13,148,136,0.12)' : '#f0fdfa',
                },
              ]}
            >
              <Text style={styles.roomNumber}>{num}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  header: { gap: 4 },
  whenPill: {
    alignSelf: 'flex-start',
    backgroundColor: ACCENT,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  whenPillText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  dateLong: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  roomCount: { fontSize: 13, fontWeight: '500' },
  roomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roomChip: {
    minWidth: 56,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomNumber: { fontSize: 18, fontWeight: '800', color: ACCENT, letterSpacing: -0.3 },
});
