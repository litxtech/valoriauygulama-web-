import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { AdminAttendanceStaffCard } from '@/components/admin/attendance/AdminAttendanceStaffCard';
import { adminTheme as T } from '@/constants/adminTheme';
import { useAdminAttendanceToday, type AdminAttendanceRow } from '@/hooks/useAdminAttendanceToday';
import { attendanceTrackingPhase } from '@/lib/attendancePresentation';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

type FilterKey = 'all' | 'on_shift' | 'finished' | 'not_started';

type MonthlyRank = {
  staffId: string;
  fullName: string;
  punctualityRate: number;
  checkInDays: number;
  lateDays: number;
};

export default function AdminAttendanceIndexScreen() {
  const router = useRouter();
  const { i18n } = useTranslation();
  const [qText, setQText] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [manualNote, setManualNote] = useState('');
  const [notifyExpanded, setNotifyExpanded] = useState(false);

  const isTr = i18n.language?.toLowerCase().startsWith('tr');
  const localeCode = isTr ? 'tr-TR' : 'en-US';

  const {
    today,
    dailyQuery,
    trackingStats,
    sortedRows,
    noCheckInRows,
    sendingNoCheckIn,
    refresh,
    sendNoCheckInNotification,
  } = useAdminAttendanceToday({ enabled: true });

  const monthStart = `${today.slice(0, 8)}01`;

  const monthlyQuery = useQuery({
    queryKey: ['admin-attendance', 'month', monthStart, today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_attendance_daily_report')
        .select('work_date, staff_id, full_name, day_status, late_minutes, check_in_at')
        .gte('work_date', monthStart)
        .lte('work_date', today);
      if (error) throw new Error(error.message);
      return (data ?? []) as AdminAttendanceRow[];
    },
  });

  const todayPretty = useMemo(
    () =>
      new Date(`${today}T12:00:00`).toLocaleDateString(localeCode, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    [localeCode, today]
  );

  const rows = useMemo(() => {
    const txt = qText.trim().toLocaleLowerCase('tr-TR');
    let base = sortedRows;
    if (activeFilter === 'on_shift') {
      base = base.filter((r) => attendanceTrackingPhase(r) === 'on_shift');
    } else if (activeFilter === 'finished') {
      base = base.filter((r) => attendanceTrackingPhase(r) === 'finished');
    } else if (activeFilter === 'not_started') {
      base = base.filter((r) => attendanceTrackingPhase(r) === 'not_started');
    }
    if (!txt) return base;
    return base.filter((r) => (r.full_name ?? '').toLocaleLowerCase('tr-TR').includes(txt));
  }, [activeFilter, qText, sortedRows]);

  const monthlyRanking = useMemo((): MonthlyRank[] => {
    const grouped = new Map<
      string,
      { staffId: string; fullName: string; totalDays: number; onTimeDays: number; lateDays: number; checkInDays: number }
    >();

    for (const row of monthlyQuery.data ?? []) {
      const current = grouped.get(row.staff_id) ?? {
        staffId: row.staff_id,
        fullName: row.full_name ?? '—',
        totalDays: 0,
        onTimeDays: 0,
        lateDays: 0,
        checkInDays: 0,
      };
      current.totalDays += 1;
      if (row.check_in_at) current.checkInDays += 1;
      if (row.day_status === 'zamaninda') current.onTimeDays += 1;
      if (row.day_status === 'gec_geldi') current.lateDays += 1;
      grouped.set(row.staff_id, current);
    }

    return Array.from(grouped.values())
      .map((item) => ({
        staffId: item.staffId,
        fullName: item.fullName,
        punctualityRate: item.totalDays > 0 ? (item.onTimeDays / item.totalDays) * 100 : 0,
        checkInDays: item.checkInDays,
        lateDays: item.lateDays,
      }))
      .sort((a, b) => b.punctualityRate - a.punctualityRate || b.checkInDays - a.checkInDays);
  }, [monthlyQuery.data]);

  const filters: {
    key: FilterKey;
    label: string;
    value: number;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
  }[] = [
    { key: 'all', label: isTr ? 'Tümü' : 'All', value: trackingStats.total, icon: 'people', color: T.colors.primaryMuted },
    { key: 'on_shift', label: isTr ? 'Mesaide' : 'On shift', value: trackingStats.onShift, icon: 'radio-button-on', color: T.colors.success },
    { key: 'finished', label: isTr ? 'Bitti' : 'Done', value: trackingStats.finished, icon: 'checkmark-done', color: T.colors.info },
    { key: 'not_started', label: isTr ? 'Başlamadı' : 'Missing', value: trackingStats.notStarted, icon: 'alert-circle', color: T.colors.error },
  ];

  const handleNotify = async () => {
    const result = await sendNoCheckInNotification(manualNote);
    if (!result?.error) setManualNote('');
  };

  const isLoading = dailyQuery.isLoading && !dailyQuery.data;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={dailyQuery.isFetching || monthlyQuery.isFetching}
          onRefresh={() => void Promise.all([refresh(), monthlyQuery.refetch()])}
          tintColor={T.colors.accentBright}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient colors={['#0f172a', '#1e293b', '#334155']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroDecor} pointerEvents="none" />
        <View style={styles.heroTop}>
          <View style={styles.heroTitleCol}>
            <View style={styles.heroEyebrowRow}>
              <Ionicons name="time" size={14} color={T.colors.accentBright} />
              <Text style={styles.heroEyebrow}>{isTr ? 'Mesai Operasyon Merkezi' : 'Attendance Command Center'}</Text>
            </View>
            <Text style={styles.heroDate}>{todayPretty}</Text>
          </View>
          <TouchableOpacity style={styles.heroRefresh} onPress={() => void refresh()} disabled={dailyQuery.isFetching}>
            {dailyQuery.isFetching ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="refresh" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{trackingStats.onShift}</Text>
            <Text style={styles.kpiLabel}>{isTr ? 'Şu an mesaide' : 'On shift now'}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={[styles.kpiValue, { color: '#fca5a5' }]}>{trackingStats.notStarted}</Text>
            <Text style={styles.kpiLabel}>{isTr ? 'Giriş yok' : 'No check-in'}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{trackingStats.finished}</Text>
            <Text style={styles.kpiLabel}>{isTr ? 'Mesai bitti' : 'Finished'}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={[styles.kpiValue, { color: '#fcd34d' }]}>{trackingStats.late}</Text>
            <Text style={styles.kpiLabel}>{isTr ? 'Geç kalan' : 'Late today'}</Text>
          </View>
        </View>

        <Text style={styles.heroHint}>
          {isTr
            ? 'Giriş ve çıkışlar canlı güncellenir. Karta dokunarak geçmişe gidin.'
            : 'Check-ins update live. Tap a card for history.'}
        </Text>
      </LinearGradient>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
        {filters.map((f) => {
          const active = activeFilter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterPill, active && { borderColor: f.color, backgroundColor: `${f.color}18` }]}
              onPress={() => setActiveFilter(f.key)}
              activeOpacity={0.85}
            >
              <Ionicons name={f.icon} size={16} color={active ? f.color : T.colors.textMuted} />
              <Text style={[styles.filterPillValue, active && { color: f.color }]}>{f.value}</Text>
              <Text style={styles.filterPillLabel}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={T.colors.textMuted} />
        <TextInput
          value={qText}
          onChangeText={setQText}
          placeholder={isTr ? 'Personel adı ara…' : 'Search by name…'}
          placeholderTextColor={T.colors.textMuted}
          style={styles.searchInput}
        />
        {qText.length > 0 ? (
          <TouchableOpacity onPress={() => setQText('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={T.colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>
          {isTr ? 'Bugünkü personel' : "Today's staff"} ({rows.length})
        </Text>
        <Text style={styles.listSub}>{isTr ? 'Durum · giriş · çıkış · süre' : 'Status · in · out · duration'}</Text>
      </View>

      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={T.colors.accent} />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="people-outline" size={40} color={T.colors.textMuted} />
          <Text style={styles.emptyTitle}>{isTr ? 'Kayıt bulunamadı' : 'No records'}</Text>
          <Text style={styles.emptySub}>
            {isTr ? 'Filtreyi değiştirin veya listeyi yenileyin.' : 'Change filter or refresh the list.'}
          </Text>
        </View>
      ) : (
        <View style={styles.cardList}>
          {rows.map((row) => (
            <AdminAttendanceStaffCard
              key={`${row.staff_id}-${row.work_date}`}
              row={row}
              localeCode={localeCode}
              isTr={isTr}
              onPress={() =>
                router.push({ pathname: '/admin/attendance/[staffId]', params: { staffId: row.staff_id } })
              }
            />
          ))}
        </View>
      )}

      <TouchableOpacity
        style={styles.notifyBanner}
        onPress={() => setNotifyExpanded((v) => !v)}
        activeOpacity={0.9}
      >
        <View style={styles.notifyBannerIcon}>
          <Ionicons name="notifications" size={20} color="#fff" />
        </View>
        <View style={styles.notifyBannerTextCol}>
          <Text style={styles.notifyBannerTitle}>
            {isTr ? 'Giriş yapmayanlara hatırlat' : 'Remind missing check-ins'}
          </Text>
          <Text style={styles.notifyBannerSub}>
            {isTr ? `${noCheckInRows.length} personel bekliyor` : `${noCheckInRows.length} staff waiting`}
          </Text>
        </View>
        <Ionicons name={notifyExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={T.colors.textMuted} />
      </TouchableOpacity>

      {notifyExpanded ? (
        <View style={styles.notifyPanel}>
          <TextInput
            value={manualNote}
            onChangeText={setManualNote}
            multiline
            placeholder={
              isTr
                ? 'Özel mesaj (boş bırakılırsa varsayılan hatırlatma gider)'
                : 'Custom message (default reminder if empty)'
            }
            placeholderTextColor={T.colors.textMuted}
            style={styles.noteInput}
          />
          <TouchableOpacity
            style={[styles.notifyBtn, (sendingNoCheckIn || noCheckInRows.length === 0) && styles.notifyBtnDisabled]}
            onPress={() => void handleNotify()}
            disabled={sendingNoCheckIn || noCheckInRows.length === 0}
          >
            {sendingNoCheckIn ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={16} color="#fff" />
            )}
            <Text style={styles.notifyBtnText}>
              {isTr ? `Bildirim gönder (${noCheckInRows.length})` : `Send reminder (${noCheckInRows.length})`}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{isTr ? 'Ayın performansı' : 'Monthly performance'}</Text>
        <Text style={styles.sectionSub}>{isTr ? 'Zamanında giriş oranı' : 'On-time rate'}</Text>
      </View>

      {monthlyRanking.length === 0 ? (
        <Text style={styles.emptyInlineText}>{isTr ? 'Bu ay henüz veri yok' : 'No data this month yet'}</Text>
      ) : (
        <View style={styles.rankList}>
          {monthlyRanking.slice(0, 8).map((item, idx) => {
            const medalColor = idx === 0 ? '#f59e0b' : idx === 1 ? '#94a3b8' : idx === 2 ? '#b45309' : T.colors.textMuted;
            return (
              <TouchableOpacity
                key={item.staffId}
                style={styles.rankRow}
                onPress={() => router.push({ pathname: '/admin/attendance/[staffId]', params: { staffId: item.staffId } })}
                activeOpacity={0.88}
              >
                <View style={[styles.rankBadge, idx < 3 && { backgroundColor: `${medalColor}22` }]}>
                  <Text style={[styles.rankBadgeText, idx < 3 && { color: medalColor }]}>{idx + 1}</Text>
                </View>
                <View style={styles.rankBody}>
                  <Text style={styles.rankName} numberOfLines={1}>
                    {item.fullName}
                  </Text>
                  <Text style={styles.rankMeta}>
                    {isTr ? 'Giriş' : 'Check-ins'}: {item.checkInDays}
                    {item.lateDays > 0 ? ` · ${isTr ? 'Geç' : 'Late'}: ${item.lateDays}` : ''}
                  </Text>
                </View>
                <View style={styles.rankRateCol}>
                  <Text style={styles.rankRate}>%{item.punctualityRate.toFixed(0)}</Text>
                  <Text style={styles.rankRateLabel}>{isTr ? 'zamanında' : 'on time'}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.colors.surfaceSecondary },
  content: { padding: T.spacing.lg, paddingBottom: 36, gap: T.spacing.md },
  hero: {
    borderRadius: T.radius.xl,
    padding: T.spacing.lg,
    overflow: 'hidden',
    ...T.shadow.md,
  },
  heroDecor: {
    position: 'absolute',
    right: -30,
    top: -20,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(245,158,11,0.12)',
  },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  heroTitleCol: { flex: 1 },
  heroEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroEyebrow: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700' },
  heroDate: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 6 },
  heroRefresh: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: T.spacing.lg,
  },
  kpiCard: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: T.radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  kpiValue: { color: '#fff', fontSize: 26, fontWeight: '900', fontVariant: ['tabular-nums'] },
  kpiLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600', marginTop: 2 },
  heroHint: { color: 'rgba(255,255,255,0.7)', fontSize: 12, lineHeight: 17, marginTop: T.spacing.md },
  filterScroll: { gap: 8, paddingVertical: 2 },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: T.radius.full,
    backgroundColor: T.colors.surface,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  filterPillValue: { fontSize: 16, fontWeight: '900', color: T.colors.text },
  filterPillLabel: { fontSize: 12, fontWeight: '700', color: T.colors.textMuted },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: T.colors.surface,
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: T.radius.lg,
    paddingHorizontal: 14,
    minHeight: 50,
    ...T.shadow.sm,
  },
  searchInput: { flex: 1, fontSize: 15, color: T.colors.text, paddingVertical: 8 },
  listHeader: { gap: 2, marginTop: 4 },
  listTitle: { fontSize: 16, fontWeight: '900', color: T.colors.text },
  listSub: { fontSize: 12, fontWeight: '600', color: T.colors.textMuted },
  cardList: { gap: 10 },
  loadingBox: { paddingVertical: 48, alignItems: 'center' },
  emptyBox: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 36,
    paddingHorizontal: 20,
    backgroundColor: T.colors.surface,
    borderRadius: T.radius.lg,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: T.colors.text },
  emptySub: { fontSize: 13, color: T.colors.textMuted, textAlign: 'center' },
  notifyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: T.colors.surface,
    borderRadius: T.radius.lg,
    borderWidth: 1,
    borderColor: T.colors.border,
    padding: 14,
    marginTop: 4,
    ...T.shadow.sm,
  },
  notifyBannerIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: T.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifyBannerTextCol: { flex: 1 },
  notifyBannerTitle: { fontSize: 14, fontWeight: '800', color: T.colors.text },
  notifyBannerSub: { fontSize: 12, color: T.colors.textMuted, marginTop: 2 },
  notifyPanel: {
    backgroundColor: T.colors.surface,
    borderRadius: T.radius.lg,
    borderWidth: 1,
    borderColor: T.colors.border,
    padding: 14,
    gap: 10,
    marginTop: -4,
  },
  noteInput: {
    minHeight: 80,
    textAlignVertical: 'top',
    backgroundColor: T.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: T.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: T.colors.text,
    fontSize: 14,
  },
  notifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: T.radius.md,
    backgroundColor: T.colors.primary,
    paddingVertical: 14,
  },
  notifyBtnDisabled: { opacity: 0.5 },
  notifyBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  sectionHead: { marginTop: 8, gap: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: T.colors.text },
  sectionSub: { fontSize: 12, fontWeight: '600', color: T.colors.textMuted },
  rankList: {
    backgroundColor: T.colors.surface,
    borderRadius: T.radius.lg,
    borderWidth: 1,
    borderColor: T.colors.border,
    overflow: 'hidden',
    ...T.shadow.sm,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.colors.border,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: T.colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: { fontSize: 14, fontWeight: '900', color: T.colors.textMuted },
  rankBody: { flex: 1, minWidth: 0 },
  rankName: { fontSize: 14, fontWeight: '800', color: T.colors.text },
  rankMeta: { fontSize: 11, color: T.colors.textMuted, marginTop: 2 },
  rankRateCol: { alignItems: 'flex-end' },
  rankRate: { fontSize: 16, fontWeight: '900', color: T.colors.success },
  rankRateLabel: { fontSize: 10, fontWeight: '600', color: T.colors.textMuted },
  emptyInlineText: {
    padding: 16,
    textAlign: 'center',
    color: T.colors.textMuted,
    fontSize: 13,
    backgroundColor: T.colors.surface,
    borderRadius: T.radius.lg,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
});
