import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useCachedFocusLoad } from '@/hooks/useCachedFocusLoad';

type DoneRoomRow = {
  id: string;
  plan_id: string;
  room_id: string;
  done_at: string | null;
  done_by_staff_id: string | null;
  is_done: boolean;
};

type RoomRow = { id: string; room_number: string };
type StaffRow = { id: string; full_name: string | null };
type PlanRow = { id: string; target_date: string };

type CleaningHistoryCache = {
  rows: DoneRoomRow[];
  roomNumbers: Record<string, string>;
  staffNames: Record<string, string>;
  planDates: Record<string, string>;
};

function monthKeyFromIso(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function dayKeyFromIso(iso: string): string {
  return iso.slice(0, 10);
}

function monthTitle(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
}

function dayTitle(dayKey: string): string {
  return new Date(`${dayKey}T00:00:00`).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function StaffCleaningHistoryScreen() {
  const [rows, setRows] = useState<DoneRoomRow[]>([]);
  const [roomNumbers, setRoomNumbers] = useState<Record<string, string>>({});
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});
  const [planDates, setPlanDates] = useState<Record<string, string>>({});
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const fetchData = useCallback(async (): Promise<CleaningHistoryCache | null> => {
    const { data, error } = await supabase
      .from('room_cleaning_plan_rooms')
      .select('id, plan_id, room_id, done_at, done_by_staff_id, is_done')
      .eq('is_done', true)
      .not('done_at', 'is', null)
      .order('done_at', { ascending: false });
    if (error) return null;
    const doneRows = (data as DoneRoomRow[] | null) ?? [];
    const roomIds = [...new Set(doneRows.map((x) => x.room_id))];
    const staffIds = [...new Set(doneRows.map((x) => x.done_by_staff_id).filter(Boolean) as string[])];
    const planIds = [...new Set(doneRows.map((x) => x.plan_id))];
    const [roomsRes, staffRes, plansRes] = await Promise.all([
      roomIds.length ? supabase.from('rooms').select('id, room_number').in('id', roomIds) : Promise.resolve({ data: [] as RoomRow[] }),
      staffIds.length ? supabase.from('staff').select('id, full_name').in('id', staffIds) : Promise.resolve({ data: [] as StaffRow[] }),
      planIds.length ? supabase.from('room_cleaning_plans').select('id, target_date').in('id', planIds) : Promise.resolve({ data: [] as PlanRow[] }),
    ]);
    const roomNumbersMap: Record<string, string> = {};
    ((roomsRes.data as RoomRow[] | null) ?? []).forEach((r) => {
      roomNumbersMap[r.id] = r.room_number;
    });
    const staffNamesMap: Record<string, string> = {};
    ((staffRes.data as StaffRow[] | null) ?? []).forEach((s) => {
      staffNamesMap[s.id] = s.full_name || 'Bilinmiyor';
    });
    const planDatesMap: Record<string, string> = {};
    ((plansRes.data as PlanRow[] | null) ?? []).forEach((p) => {
      planDatesMap[p.id] = p.target_date;
    });
    return {
      rows: doneRows,
      roomNumbers: roomNumbersMap,
      staffNames: staffNamesMap,
      planDates: planDatesMap,
    };
  }, []);

  const { data: cached, showContent } = useCachedFocusLoad({
    cacheKey: 'staff-cleaning-history',
    fetchData,
  });

  useEffect(() => {
    if (!cached) return;
    setRows(cached.rows);
    setRoomNumbers(cached.roomNumbers);
    setStaffNames(cached.staffNames);
    setPlanDates(cached.planDates);
  }, [cached]);

  const grouped = useMemo(() => {
    const byMonth: Record<string, Record<string, DoneRoomRow[]>> = {};
    rows.forEach((r) => {
      if (!r.done_at) return;
      const mk = monthKeyFromIso(r.done_at);
      const dk = dayKeyFromIso(r.done_at);
      if (!byMonth[mk]) byMonth[mk] = {};
      if (!byMonth[mk][dk]) byMonth[mk][dk] = [];
      byMonth[mk][dk].push(r);
    });
    return byMonth;
  }, [rows]);

  const monthKeys = useMemo(() => Object.keys(grouped).sort((a, b) => b.localeCompare(a)), [grouped]);

  if (!showContent && rows.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Geçmiş Temizlikler</Text>
      <Text style={styles.subtitle}>En son işlemler yukarıda. Ay ve gün bazında sıralanır.</Text>
      {rows.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="time-outline" size={36} color={theme.colors.textMuted} />
          <Text style={styles.emptyText}>Henüz temizleme kaydı yok.</Text>
        </View>
      ) : (
        monthKeys.map((mk) => {
          const dayMap = grouped[mk];
          const dayKeys = Object.keys(dayMap).sort((a, b) => b.localeCompare(a));
          return (
            <View key={mk} style={styles.monthCard}>
              <Text style={styles.monthTitle}>{monthTitle(mk)}</Text>
              {dayKeys.map((dk) => (
                <View key={dk} style={styles.daySection}>
                  <Text style={styles.dayTitle}>{dayTitle(dk)}</Text>
                  {dayMap[dk].map((r) => {
                    const isExpanded = expandedRowId === r.id;
                    const who = r.done_by_staff_id ? staffNames[r.done_by_staff_id] || 'Bilinmiyor' : 'Bilinmiyor';
                    const doneDateTime = r.done_at
                      ? new Date(r.done_at).toLocaleString('tr-TR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })
                      : '-';
                    return (
                    <TouchableOpacity
                      key={r.id}
                      style={[styles.row, isExpanded && styles.rowExpanded]}
                      activeOpacity={0.85}
                      onPress={() => setExpandedRowId((prev) => (prev === r.id ? null : r.id))}
                    >
                      <View style={styles.rowHead}>
                      <Text style={styles.rowMain}>
                        Oda {roomNumbers[r.room_id] || '-'} temizlendi
                      </Text>
                        <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={theme.colors.textMuted} />
                      </View>
                      <Text style={styles.rowSub}>
                          Personel: {who} · Saat:{' '}
                        {r.done_at ? new Date(r.done_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '--:--'} · Plan:{' '}
                        {planDates[r.plan_id] || '-'}
                      </Text>
                      {isExpanded ? (
                        <View style={styles.detailBox}>
                          <Text style={styles.detailRow}>
                            Oda No: <Text style={styles.detailValue}>{roomNumbers[r.room_id] || '-'}</Text>
                          </Text>
                          <Text style={styles.detailRow}>
                            Isaretleyen: <Text style={styles.detailValue}>{who}</Text>
                          </Text>
                          <Text style={styles.detailRow}>
                            Isaretlenme Tarih/Saat: <Text style={styles.detailValue}>{doneDateTime}</Text>
                          </Text>
                          <Text style={styles.detailRow}>
                            Plan Tarihi: <Text style={styles.detailValue}>{planDates[r.plan_id] || '-'}</Text>
                          </Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 16, paddingBottom: 36 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: theme.colors.text },
  subtitle: { marginTop: 6, marginBottom: 12, fontSize: 13, color: theme.colors.textSecondary },
  emptyCard: {
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    alignItems: 'center',
    paddingVertical: 28,
    gap: 8,
  },
  emptyText: { fontSize: 14, color: theme.colors.textMuted },
  monthCard: {
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    marginBottom: 12,
    padding: 12,
  },
  monthTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text, marginBottom: 8, textTransform: 'capitalize' },
  daySection: { marginBottom: 10 },
  dayTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary, marginBottom: 6 },
  row: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  rowExpanded: {
    backgroundColor: theme.colors.background,
    borderRadius: 10,
    paddingHorizontal: 8,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  rowMain: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  rowSub: { marginTop: 2, fontSize: 12, color: theme.colors.textMuted },
  detailBox: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  detailRow: { fontSize: 12, color: theme.colors.textSecondary },
  detailValue: { color: theme.colors.text, fontWeight: '700' },
});
