import { useMemo, useState } from 'react';
import {
  Alert,
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
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { adminTheme as T } from '@/constants/adminTheme';
import { useTranslation } from 'react-i18next';
import { sendNotification } from '@/lib/notificationService';
import { useAuthStore } from '@/stores/authStore';
import {
  adminStatusLabel,
  attendanceStatusVisual,
  formatAttendanceTime,
} from '@/lib/attendancePresentation';
import type { AttendanceDayStatus } from '@/lib/staffAttendance';

type AttendanceRow = {
  work_date: string;
  staff_id: string;
  full_name: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  late_minutes: number | null;
  total_hours: number | null;
  day_status: AttendanceDayStatus;
};

type FilterKey = 'all' | 'on_time' | 'late' | 'no_check_in';

export default function AdminAttendanceIndexScreen() {
  const router = useRouter();
  const { i18n } = useTranslation();
  const staff = useAuthStore((s) => s.staff);
  const [qText, setQText] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [manualNote, setManualNote] = useState('');
  const [sendingNoCheckIn, setSendingNoCheckIn] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const isTr = i18n.language?.toLowerCase().startsWith('tr');
  const localeCode = isTr ? 'tr-TR' : 'en-US';
  const monthStart = `${today.slice(0, 8)}01`;

  const todayPretty = useMemo(
    () =>
      new Date(`${today}T12:00:00`).toLocaleDateString(localeCode, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    [localeCode, today]
  );

  const dailyQuery = useQuery({
    queryKey: ['admin-attendance', 'day', today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_attendance_daily_report')
        .select('*')
        .eq('work_date', today)
        .order('full_name', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as AttendanceRow[];
    },
  });

  const monthlyQuery = useQuery({
    queryKey: ['admin-attendance', 'month', monthStart, today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_attendance_daily_report')
        .select('work_date, staff_id, full_name, day_status, late_minutes, check_in_at')
        .gte('work_date', monthStart)
        .lte('work_date', today);
      if (error) throw new Error(error.message);
      return (data ?? []) as AttendanceRow[];
    },
  });

  const rows = useMemo(() => {
    const txt = qText.trim().toLocaleLowerCase('tr-TR');
    const base = dailyQuery.data ?? [];
    const filteredByStatus = base.filter((r) => {
      if (activeFilter === 'on_time') return r.day_status === 'zamaninda';
      if (activeFilter === 'late') return r.day_status === 'gec_geldi';
      if (activeFilter === 'no_check_in') return !r.check_in_at;
      return true;
    });
    if (!txt) return filteredByStatus;
    return filteredByStatus.filter((r) => (r.full_name ?? '').toLocaleLowerCase('tr-TR').includes(txt));
  }, [activeFilter, dailyQuery.data, qText]);

  const dailyStats = useMemo(() => {
    const data = dailyQuery.data ?? [];
    return {
      total: data.length,
      onTime: data.filter((r) => r.day_status === 'zamaninda').length,
      late: data.filter((r) => r.day_status === 'gec_geldi').length,
      noCheckIn: data.filter((r) => !r.check_in_at).length,
    };
  }, [dailyQuery.data]);

  const monthlyRanking = useMemo(() => {
    const grouped = new Map<
      string,
      {
        staffId: string;
        fullName: string;
        totalDays: number;
        checkInDays: number;
        onTimeDays: number;
        lateDays: number;
        totalLateMinutes: number;
      }
    >();

    for (const row of monthlyQuery.data ?? []) {
      const key = row.staff_id;
      const current = grouped.get(key) ?? {
        staffId: row.staff_id,
        fullName: row.full_name ?? '-',
        totalDays: 0,
        checkInDays: 0,
        onTimeDays: 0,
        lateDays: 0,
        totalLateMinutes: 0,
      };
      current.totalDays += 1;
      if (row.check_in_at) current.checkInDays += 1;
      if (row.day_status === 'zamaninda') current.onTimeDays += 1;
      if (row.day_status === 'gec_geldi') {
        current.lateDays += 1;
        current.totalLateMinutes += row.late_minutes ?? 0;
      }
      grouped.set(key, current);
    }

    return Array.from(grouped.values())
      .map((item) => {
        const punctualityRate = item.totalDays > 0 ? (item.onTimeDays / item.totalDays) * 100 : 0;
        const avgLateMinutes = item.lateDays > 0 ? item.totalLateMinutes / item.lateDays : 0;
        return { ...item, punctualityRate, avgLateMinutes };
      })
      .sort((a, b) => {
        if (b.punctualityRate !== a.punctualityRate) return b.punctualityRate - a.punctualityRate;
        if (a.avgLateMinutes !== b.avgLateMinutes) return a.avgLateMinutes - b.avgLateMinutes;
        return b.checkInDays - a.checkInDays;
      });
  }, [monthlyQuery.data]);

  const refreshAll = async () => {
    await Promise.all([dailyQuery.refetch(), monthlyQuery.refetch()]);
  };

  const noCheckInRows = useMemo(
    () => (dailyQuery.data ?? []).filter((r) => !r.check_in_at),
    [dailyQuery.data]
  );

  const sendNoCheckInNotification = async () => {
    if (noCheckInRows.length === 0) {
      Alert.alert(isTr ? 'Bilgi' : 'Info', isTr ? 'Bugün giriş yapmayan personel yok.' : 'No staff without check-in today.');
      return;
    }
    if (!staff?.id) {
      Alert.alert(isTr ? 'Hata' : 'Error', isTr ? 'Oturum bilgisi bulunamadı.' : 'Session information is missing.');
      return;
    }
    try {
      setSendingNoCheckIn(true);
      const bodyText =
        manualNote.trim() ||
        (isTr
          ? 'Bugün neden giriş yapmadınız? Lütfen mesai ekranından bilgi notu bırakın.'
          : 'Why did you not check in today? Please leave a note on the attendance screen.');
      const titleText = isTr ? 'Mesai Giriş Hatırlatması' : 'Attendance Check-in Reminder';

      const results = await Promise.all(
        noCheckInRows.map((row) =>
          sendNotification({
            staffId: row.staff_id,
            title: titleText,
            body: bodyText,
            notificationType: 'attendance_missing_checkin',
            category: 'staff',
            createdByStaffId: staff.id,
            data: { screen: 'staff/attendance/index', date: today },
          })
        )
      );
      const failedCount = results.filter((r) => !!r.error).length;
      const okCount = results.length - failedCount;
      Alert.alert(
        isTr ? 'Bildirim gönderildi' : 'Notification sent',
        isTr
          ? `${okCount} personele gönderildi${failedCount > 0 ? `, ${failedCount} kişide hata var.` : '.'}`
          : `Sent to ${okCount} staff${failedCount > 0 ? `, ${failedCount} failed.` : '.'}`
      );
    } catch (error) {
      Alert.alert(
        isTr ? 'Hata' : 'Error',
        error instanceof Error ? error.message : isTr ? 'Bilinmeyen hata' : 'Unknown error'
      );
    } finally {
      setSendingNoCheckIn(false);
    }
  };

  const filters: { key: FilterKey; label: string; value: number; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
    { key: 'all', label: isTr ? 'Toplam' : 'Total', value: dailyStats.total, icon: 'people-outline', color: '#6366f1' },
    { key: 'on_time', label: isTr ? 'Zamanında' : 'On time', value: dailyStats.onTime, icon: 'checkmark-circle-outline', color: '#16a34a' },
    { key: 'late', label: isTr ? 'Geç' : 'Late', value: dailyStats.late, icon: 'time-outline', color: '#ea580c' },
    { key: 'no_check_in', label: isTr ? 'Giriş yok' : 'No check-in', value: dailyStats.noCheckIn, icon: 'alert-circle-outline', color: '#dc2626' },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={dailyQuery.isFetching || monthlyQuery.isFetching}
          onRefresh={refreshAll}
          tintColor={T.colors.accent}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient colors={['#1e3a8a', '#2563eb', '#6366f1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroDecor} pointerEvents="none" />
        <View style={styles.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroEyebrow}>{isTr ? 'Mesai Takibi' : 'Attendance'}</Text>
            <Text style={styles.heroDate}>{todayPretty}</Text>
          </View>
          <TouchableOpacity style={styles.heroRefresh} onPress={refreshAll} disabled={dailyQuery.isFetching}>
            <Ionicons name="refresh" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        <Text style={styles.heroSub}>
          {isTr ? 'Günlük durum, aylık performans ve personel bildirimleri' : 'Daily status, monthly performance and staff notifications'}
        </Text>
      </LinearGradient>

      <View style={styles.filterRow}>
        {filters.map((f) => {
          const active = activeFilter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, active && { borderColor: f.color, backgroundColor: `${f.color}14` }]}
              onPress={() => setActiveFilter(f.key)}
            >
              <Ionicons name={f.icon} size={16} color={active ? f.color : T.colors.textMuted} />
              <Text style={[styles.filterValue, active && { color: f.color }]}>{f.value}</Text>
              <Text style={styles.filterLabel} numberOfLines={2}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.notifyCard}>
        <View style={styles.notifyHead}>
          <Ionicons name="megaphone-outline" size={20} color="#1d4ed8" />
          <Text style={styles.notifyTitle}>
            {isTr ? 'Giriş yapmayan personele bildirim' : 'Notify staff without check-in'}
          </Text>
        </View>
        <Text style={styles.notifyHint}>
          {isTr
            ? 'Özel mesaj yazın; personel mesai ekranına yönlendirilir. Boş bırakırsanız varsayılan hatırlatma gider.'
            : 'Write a custom message; staff are directed to the attendance screen. Leave empty for the default reminder.'}
        </Text>
        <TextInput
          value={manualNote}
          onChangeText={setManualNote}
          multiline
          placeholder={
            isTr ? 'Örn: Lütfen giriş yapın ve gecikme sebebini not olarak yazın.' : 'E.g. Please check in and add a delay note.'
          }
          placeholderTextColor={T.colors.textMuted}
          style={styles.noteInput}
        />
        <TouchableOpacity
          style={[styles.notifyBtn, sendingNoCheckIn && styles.notifyBtnDisabled]}
          onPress={sendNoCheckInNotification}
          disabled={sendingNoCheckIn}
        >
          <Ionicons name="send" size={16} color="#fff" />
          <Text style={styles.notifyBtnText}>
            {sendingNoCheckIn
              ? isTr
                ? 'Gönderiliyor…'
                : 'Sending…'
              : isTr
                ? `Gönder (${noCheckInRows.length} kişi)`
                : `Send (${noCheckInRows.length})`}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={T.colors.textMuted} />
        <TextInput
          value={qText}
          onChangeText={setQText}
          placeholder={isTr ? 'Personel ara…' : 'Search staff…'}
          placeholderTextColor={T.colors.textMuted}
          style={styles.searchInput}
        />
      </View>

      <Text style={styles.sectionTitle}>
        {isTr ? 'Aylık performans sıralaması' : 'Monthly performance ranking'}
      </Text>
      <View style={styles.rankingCard}>
        {monthlyRanking.slice(0, 8).map((item, idx) => {
          const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
          return (
            <TouchableOpacity
              key={item.staffId}
              style={[styles.rankingRow, idx === Math.min(7, monthlyRanking.length - 1) && styles.rankingRowLast]}
              onPress={() => router.push({ pathname: '/admin/attendance/[staffId]', params: { staffId: item.staffId } })}
            >
              <Text style={styles.rankBadge}>{medal}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.rankName}>{item.fullName}</Text>
                <Text style={styles.rankMeta}>
                  %{item.punctualityRate.toFixed(0)} {isTr ? 'zamanında' : 'on-time'} ·{' '}
                  {item.avgLateMinutes.toFixed(0)} {isTr ? 'dk ort. geç' : 'min avg late'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={T.colors.textMuted} />
            </TouchableOpacity>
          );
        })}
        {monthlyRanking.length === 0 ? (
          <Text style={styles.emptyInline}>{isTr ? 'Bu ay henüz veri yok' : 'No data this month yet'}</Text>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>
        {isTr ? 'Bugünkü personel listesi' : "Today's staff list"} ({rows.length})
      </Text>

      {rows.map((row) => {
        const visual = attendanceStatusVisual(row.day_status);
        return (
          <TouchableOpacity
            key={`${row.staff_id}-${row.work_date}`}
            style={styles.staffCard}
            onPress={() => router.push({ pathname: '/admin/attendance/[staffId]', params: { staffId: row.staff_id } })}
            activeOpacity={0.88}
          >
            <View style={styles.staffCardHead}>
              <View style={[styles.avatar, { backgroundColor: visual.bg }]}>
                <Text style={[styles.avatarLetter, { color: visual.color }]}>
                  {(row.full_name ?? '?').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.staffName}>{row.full_name ?? '—'}</Text>
                <View style={[styles.statusPill, { backgroundColor: visual.bg }]}>
                  <Ionicons name={visual.icon} size={12} color={visual.color} />
                  <Text style={[styles.statusPillText, { color: visual.color }]}>
                    {adminStatusLabel(row.day_status, isTr)}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={T.colors.textMuted} />
            </View>
            <View style={styles.timeRow}>
              <View style={styles.timeBoxIn}>
                <Text style={styles.timeBoxLabel}>{isTr ? 'Giriş' : 'In'}</Text>
                <Text style={styles.timeBoxValue}>{formatAttendanceTime(row.check_in_at, localeCode)}</Text>
              </View>
              <View style={styles.timeBoxOut}>
                <Text style={styles.timeBoxLabel}>{isTr ? 'Çıkış' : 'Out'}</Text>
                <Text style={styles.timeBoxValue}>{formatAttendanceTime(row.check_out_at, localeCode)}</Text>
              </View>
            </View>
            <View style={styles.metaFoot}>
              <Text style={styles.metaText}>
                {isTr ? 'Geç' : 'Late'}: {row.late_minutes ?? 0} {isTr ? 'dk' : 'min'}
              </Text>
              <Text style={styles.metaText}>
                {isTr ? 'Süre' : 'Hours'}: {row.total_hours != null ? `${row.total_hours.toFixed(1)}s` : '—'}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}

      {!dailyQuery.isFetching && rows.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="document-text-outline" size={36} color={T.colors.textMuted} />
          <Text style={styles.empty}>{isTr ? 'Kayıt bulunamadı' : 'No records found'}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  hero: { borderRadius: 20, padding: 18, overflow: 'hidden' },
  heroDecor: {
    position: 'absolute',
    bottom: -40,
    right: -30,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  heroEyebrow: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
  heroDate: { color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 4 },
  heroRefresh: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroSub: { color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 19, marginTop: 12 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: {
    width: '23%',
    minWidth: 76,
    flexGrow: 1,
    backgroundColor: T.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.colors.border,
    padding: 10,
    alignItems: 'center',
    gap: 2,
  },
  filterValue: { fontSize: 20, fontWeight: '900', color: T.colors.text },
  filterLabel: { fontSize: 10, fontWeight: '600', color: T.colors.textMuted, textAlign: 'center' },
  notifyCard: {
    backgroundColor: T.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.colors.border,
    padding: 14,
    gap: 10,
  },
  notifyHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notifyTitle: { fontSize: 15, fontWeight: '800', color: T.colors.text, flex: 1 },
  notifyHint: { fontSize: 12, color: T.colors.textSecondary, lineHeight: 17 },
  noteInput: {
    minHeight: 80,
    textAlignVertical: 'top',
    backgroundColor: T.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: 12,
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
    borderRadius: 12,
    backgroundColor: '#1d4ed8',
    paddingVertical: 13,
  },
  notifyBtnDisabled: { opacity: 0.6 },
  notifyBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: T.colors.surface,
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  searchInput: { flex: 1, fontSize: 15, color: T.colors.text, paddingVertical: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: T.colors.text },
  rankingCard: {
    backgroundColor: T.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.colors.border,
    overflow: 'hidden',
  },
  rankingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.colors.border,
  },
  rankingRowLast: { borderBottomWidth: 0 },
  rankBadge: { width: 36, fontSize: 16, fontWeight: '900', textAlign: 'center' },
  rankName: { fontSize: 14, fontWeight: '800', color: T.colors.text },
  rankMeta: { fontSize: 12, color: T.colors.textSecondary, marginTop: 2 },
  emptyInline: { padding: 16, textAlign: 'center', color: T.colors.textMuted, fontSize: 13 },
  staffCard: {
    backgroundColor: T.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: T.colors.border,
    padding: 14,
    gap: 12,
  },
  staffCardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 18, fontWeight: '900' },
  staffName: { fontSize: 16, fontWeight: '800', color: T.colors.text },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  timeRow: { flexDirection: 'row', gap: 10 },
  timeBoxIn: {
    flex: 1,
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  timeBoxOut: {
    flex: 1,
    backgroundColor: '#ecfdf5',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  timeBoxLabel: { fontSize: 11, fontWeight: '700', color: '#64748b' },
  timeBoxValue: { fontSize: 20, fontWeight: '900', color: '#0f172a', marginTop: 2 },
  metaFoot: { flexDirection: 'row', justifyContent: 'space-between' },
  metaText: { fontSize: 12, color: T.colors.textSecondary, fontWeight: '600' },
  emptyBox: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  empty: { color: T.colors.textMuted, fontSize: 14, fontWeight: '600' },
});
