import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminButton, AdminCard } from '@/components/admin';
import { sendNotification } from '@/lib/notificationService';
import { localDateIso } from '@/lib/localDateIso';

type RoomRow = { id: string; room_number: string; floor: number | null };
type StaffRow = { id: string; full_name: string | null; role: string | null; department: string | null };

type ExistingPlan = {
  id: string;
  rooms: string[];
  doneCount: number;
  totalCount: number;
  staffNames: string[];
};

const HOUSEKEEPING = 'housekeeping';

function isCleaner(s: StaffRow): boolean {
  return s.role === HOUSEKEEPING || s.department === HOUSEKEEPING;
}

/** Önümüzdeki 7 gün için seçim kartları üretir. */
function buildDayOptions() {
  const opts: { iso: string; weekday: string; day: number; month: string; special: string | null }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    opts.push({
      iso: localDateIso(d),
      weekday: d.toLocaleDateString('tr-TR', { weekday: 'short' }),
      day: d.getDate(),
      month: d.toLocaleDateString('tr-TR', { month: 'short' }),
      special: i === 0 ? 'Bugün' : i === 1 ? 'Yarın' : null,
    });
  }
  return opts;
}

function fullDateLabel(iso: string): string {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('tr-TR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  } catch {
    return iso;
  }
}

function planWhenLabel(iso: string): string {
  const today = localDateIso();
  const opts = buildDayOptions();
  const found = opts.find((o) => o.iso === iso);
  if (iso === today) return 'Bugün';
  if (found?.special === 'Yarın') return 'Yarın';
  return fullDateLabel(iso);
}

export default function AdminRoomCleaningPlanScreen() {
  const staff = useAuthStore((s) => s.staff);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(new Set());
  const [selectedStaffIds, setSelectedStaffIds] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');

  const dayOptions = useMemo(() => buildDayOptions(), []);
  // Varsayılan: yarın (ikinci kart). Kullanıcı net görsün diye tarih belirgin gösterilir.
  const [targetDate, setTargetDate] = useState(dayOptions[1]?.iso ?? localDateIso());

  const [existingPlans, setExistingPlans] = useState<ExistingPlan[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(false);

  const whenLabel = useMemo(() => planWhenLabel(targetDate), [targetDate]);

  const canCurrentUserManage = useMemo(() => {
    if (!staff) return false;
    if (staff.role === 'admin') return true;
    return staff.app_permissions?.yarin_oda_temizlik_listesi === true;
  }, [staff]);

  const cleaners = useMemo(() => staffList.filter(isCleaner), [staffList]);
  const otherStaff = useMemo(() => staffList.filter((s) => !isCleaner(s)), [staffList]);

  const selectedStaffNames = useMemo(
    () =>
      staffList
        .filter((s) => selectedStaffIds.has(s.id))
        .map((s) => s.full_name || 'İsimsiz')
        .sort((a, b) => a.localeCompare(b, 'tr')),
    [staffList, selectedStaffIds]
  );

  const selectedRoomNumbers = useMemo(
    () =>
      rooms
        .filter((r) => selectedRoomIds.has(r.id))
        .map((r) => r.room_number)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [rooms, selectedRoomIds]
  );

  async function loadData() {
    setLoading(true);
    try {
      const [{ data: roomsData }, { data: staffData }] = await Promise.all([
        supabase.from('rooms').select('id, room_number, floor').order('room_number'),
        supabase
          .from('staff')
          .select('id, full_name, role, department')
          .eq('is_active', true)
          .order('full_name'),
      ]);
      setRooms((roomsData as RoomRow[] | null) ?? []);
      setStaffList((staffData as StaffRow[] | null) ?? []);
    } finally {
      setLoading(false);
    }
  }

  const loadExistingPlans = useCallback(
    async (date: string, staffRef: StaffRow[], roomRef: RoomRow[]) => {
      setLoadingExisting(true);
      try {
        const { data: plans } = await supabase
          .from('room_cleaning_plans')
          .select('id, target_date')
          .eq('target_date', date)
          .order('created_at', { ascending: false });

        const planIds = ((plans as { id: string }[] | null) ?? []).map((p) => p.id);
        if (planIds.length === 0) {
          setExistingPlans([]);
          return;
        }

        const [{ data: assigns }, { data: prooms }] = await Promise.all([
          supabase.from('room_cleaning_plan_assignments').select('plan_id, staff_id').in('plan_id', planIds),
          supabase.from('room_cleaning_plan_rooms').select('plan_id, room_id, is_done').in('plan_id', planIds),
        ]);

        const staffNameById = new Map(staffRef.map((s) => [s.id, s.full_name || 'İsimsiz']));
        const roomNumById = new Map(roomRef.map((r) => [r.id, r.room_number]));

        const result: ExistingPlan[] = planIds.map((id) => {
          const planAssigns = ((assigns as { plan_id: string; staff_id: string }[] | null) ?? []).filter(
            (a) => a.plan_id === id
          );
          const planRooms = (
            (prooms as { plan_id: string; room_id: string; is_done: boolean }[] | null) ?? []
          ).filter((r) => r.plan_id === id);
          return {
            id,
            rooms: planRooms
              .map((r) => roomNumById.get(r.room_id) || '?')
              .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
            doneCount: planRooms.filter((r) => r.is_done).length,
            totalCount: planRooms.length,
            staffNames: planAssigns
              .map((a) => staffNameById.get(a.staff_id) || 'İsimsiz')
              .sort((a, b) => a.localeCompare(b, 'tr')),
          };
        });
        setExistingPlans(result);
      } finally {
        setLoadingExisting(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (rooms.length === 0 && staffList.length === 0) return;
    void loadExistingPlans(targetDate, staffList, rooms);
  }, [targetDate, rooms, staffList, loadExistingPlans]);

  function toggleRoom(id: string) {
    setSelectedRoomIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleStaff(id: string) {
    setSelectedStaffIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function requestSubmitPlan() {
    if (!staff?.id) {
      Alert.alert('Hata', 'Oturum bulunamadı.');
      return;
    }
    if (!canCurrentUserManage) {
      Alert.alert('Yetki yok', 'Bu planı göndermek için yetkiniz yok.');
      return;
    }
    if (selectedRoomIds.size === 0) {
      Alert.alert('Eksik', 'En az bir oda seçmelisiniz.');
      return;
    }
    if (selectedStaffIds.size === 0) {
      Alert.alert('Eksik', 'En az bir temizlikçi seçmelisiniz.');
      return;
    }

    Alert.alert(
      'Listeyi gönder',
      `${whenLabel} (${fullDateLabel(targetDate)})\n\nOdalar: ${selectedRoomNumbers.join(', ')}\n\nGidecekler: ${selectedStaffNames.join(', ')}`,
      [
        { text: 'İptal', style: 'cancel' },
        { text: 'Gönder', onPress: () => void submitPlan() },
      ]
    );
  }

  async function submitPlan() {
    setSaving(true);
    try {
      const { data: planRow, error: planError } = await supabase
        .from('room_cleaning_plans')
        .insert({
          target_date: targetDate,
          note: note.trim() || null,
          created_by_staff_id: staff!.id,
        })
        .select('id')
        .single();
      if (planError || !planRow?.id) throw planError || new Error('Plan oluşturulamadı');

      const planId = planRow.id as string;
      const roomRows = Array.from(selectedRoomIds).map((roomId, i) => ({ plan_id: planId, room_id: roomId, sort_order: i }));
      const assignmentRows = Array.from(selectedStaffIds).map((staffId) => ({ plan_id: planId, staff_id: staffId }));

      const { error: roomsInsertError } = await supabase.from('room_cleaning_plan_rooms').insert(roomRows);
      if (roomsInsertError) throw roomsInsertError;
      const { error: staffInsertError } = await supabase.from('room_cleaning_plan_assignments').insert(assignmentRows);
      if (staffInsertError) throw staffInsertError;

      const label = planWhenLabel(targetDate);

      await Promise.all(
        Array.from(selectedStaffIds).map((staffId) =>
          sendNotification({
            staffId,
            title: `Temizlik — ${label}`,
            body: `${label} temizlenecek ${selectedRoomNumbers.length} oda: ${selectedRoomNumbers.join(', ')}`,
            notificationType: 'staff_room_cleaning_plan',
            category: 'staff',
            createdByStaffId: staff!.id,
            data: { url: '/staff/cleaning-plan', planId, targetDate, roomNumbers: selectedRoomNumbers },
          })
        )
      );

      Alert.alert('Gönderildi', 'Temizlik listesi personele iletildi.');
      setSelectedRoomIds(new Set());
      setSelectedStaffIds(new Set());
      setNote('');
      void loadExistingPlans(targetDate, staffList, rooms);
    } catch (e) {
      Alert.alert('Hata', (e as Error).message || 'Plan gönderilirken hata oluştu.');
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      {/* 1) Tarih seçimi */}
      <AdminCard style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Ionicons name="calendar-outline" size={18} color={adminTheme.colors.accent} />
          <Text style={styles.title}>Hangi gün için plan?</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dayRow}
          keyboardShouldPersistTaps="handled"
        >
          {dayOptions.map((d) => {
            const on = targetDate === d.iso;
            return (
              <TouchableOpacity
                key={d.iso}
                style={[styles.dayCard, on && styles.dayCardOn]}
                onPress={() => setTargetDate(d.iso)}
                activeOpacity={0.8}
              >
                {d.special ? (
                  <Text style={[styles.daySpecial, on && styles.daySpecialOn]}>{d.special}</Text>
                ) : (
                  <Text style={[styles.dayWeekday, on && styles.dayWeekdayOn]}>{d.weekday}</Text>
                )}
                <Text style={[styles.dayNumber, on && styles.dayNumberOn]}>{d.day}</Text>
                <Text style={[styles.dayMonth, on && styles.dayMonthOn]}>{d.month}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <View style={styles.selectedDateBanner}>
          <Ionicons name="checkmark-circle" size={16} color={adminTheme.colors.success} />
          <Text style={styles.selectedDateText}>
            <Text style={styles.selectedDateStrong}>{whenLabel}</Text>
            {`  ·  ${fullDateLabel(targetDate)} için temizlik planı`}
          </Text>
        </View>
      </AdminCard>

      {/* 2) Bu tarih için mevcut planlar — kimler gidecek */}
      <AdminCard style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Ionicons name="people-outline" size={18} color={adminTheme.colors.info} />
          <Text style={styles.sectionTitle}>Bu güne atanmış temizlikler</Text>
        </View>
        {loadingExisting ? (
          <ActivityIndicator color={adminTheme.colors.accent} style={{ marginVertical: 8 }} />
        ) : existingPlans.length === 0 ? (
          <Text style={styles.smallText}>Bu tarih için henüz temizlik planı oluşturulmadı.</Text>
        ) : (
          existingPlans.map((p, idx) => (
            <View key={p.id} style={[styles.existingRow, idx > 0 && styles.existingRowBorder]}>
              <View style={styles.existingHeader}>
                <Ionicons
                  name={p.totalCount > 0 && p.doneCount === p.totalCount ? 'checkmark-done-circle' : 'time-outline'}
                  size={16}
                  color={p.totalCount > 0 && p.doneCount === p.totalCount ? adminTheme.colors.success : adminTheme.colors.warning}
                />
                <Text style={styles.existingProgress}>
                  {p.doneCount}/{p.totalCount} oda temizlendi
                </Text>
              </View>
              <Text style={styles.existingFieldLabel}>Temizlenecek odalar ({p.totalCount})</Text>
              <Text style={styles.existingRooms}>{p.rooms.join(', ') || '—'}</Text>
              <Text style={[styles.existingFieldLabel, { marginTop: 6 }]}>Bu odaları temizleyecekler</Text>
              <View style={styles.nameChipsRow}>
                {p.staffNames.length === 0 ? (
                  <Text style={styles.smallText}>Personel atanmadı</Text>
                ) : (
                  p.staffNames.map((n) => (
                    <View key={n} style={styles.nameChip}>
                      <Ionicons name="person" size={11} color={adminTheme.colors.info} />
                      <Text style={styles.nameChipText}>{n}</Text>
                    </View>
                  ))
                )}
              </View>
            </View>
          ))
        )}
      </AdminCard>

      {/* 3) Oda seçimi */}
      <AdminCard style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Ionicons name="bed-outline" size={18} color={adminTheme.colors.accent} />
          <Text style={styles.sectionTitle}>Temizlenecek odalar ({selectedRoomIds.size})</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => setSelectedRoomIds(new Set(rooms.map((r) => r.id)))}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.linkAction}>Tümü</Text>
            </TouchableOpacity>
            {selectedRoomIds.size > 0 ? (
              <TouchableOpacity
                onPress={() => setSelectedRoomIds(new Set())}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.linkActionMuted}>Temizle</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
        {rooms.length === 0 ? (
          <Text style={styles.smallText}>Oda bulunamadı.</Text>
        ) : (
          <View style={styles.grid}>
            {rooms.map((r) => {
              const on = selectedRoomIds.has(r.id);
              return (
                <TouchableOpacity key={r.id} style={[styles.chip, on && styles.chipOn]} onPress={() => toggleRoom(r.id)} activeOpacity={0.8}>
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{r.room_number}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </AdminCard>

      {/* 4) Temizlikçi seçimi */}
      <AdminCard style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Ionicons name="sparkles-outline" size={18} color={adminTheme.colors.accent} />
          <Text style={styles.sectionTitle}>Temizlikçi seç ({selectedStaffIds.size})</Text>
          <View style={styles.headerActions}>
            {cleaners.length > 0 ? (
              <TouchableOpacity
                onPress={() =>
                  setSelectedStaffIds((prev) => {
                    const next = new Set(prev);
                    cleaners.forEach((c) => next.add(c.id));
                    return next;
                  })
                }
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.linkAction}>Tüm temizlikçiler</Text>
              </TouchableOpacity>
            ) : null}
            {selectedStaffIds.size > 0 ? (
              <TouchableOpacity
                onPress={() => setSelectedStaffIds(new Set())}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.linkActionMuted}>Temizle</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {staffList.length === 0 ? (
          <Text style={styles.smallText}>Aktif personel bulunamadı.</Text>
        ) : (
          <>
            {cleaners.length > 0 ? (
              <>
                <Text style={styles.groupLabel}>TEMİZLİK EKİBİ</Text>
                {cleaners.map((s) => (
                  <StaffPickRow key={s.id} staff={s} on={selectedStaffIds.has(s.id)} onPress={() => toggleStaff(s.id)} />
                ))}
              </>
            ) : null}
            {otherStaff.length > 0 ? (
              <>
                <Text style={[styles.groupLabel, { marginTop: 12 }]}>DİĞER PERSONEL</Text>
                {otherStaff.map((s) => (
                  <StaffPickRow key={s.id} staff={s} on={selectedStaffIds.has(s.id)} onPress={() => toggleStaff(s.id)} />
                ))}
              </>
            ) : null}
          </>
        )}
      </AdminCard>

      {/* 5) Not */}
      <AdminCard style={styles.card}>
        <Text style={styles.sectionTitle}>Not (isteğe bağlı)</Text>
        <TextInput
          style={styles.noteInput}
          value={note}
          onChangeText={setNote}
          placeholder="Personelin göreceği not"
          placeholderTextColor={adminTheme.colors.textMuted}
          multiline
          textAlignVertical="top"
        />
      </AdminCard>

      {/* 6) Özet — kimler gidecek */}
      {selectedRoomIds.size > 0 || selectedStaffIds.size > 0 ? (
        <AdminCard style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Özet</Text>
          <View style={styles.summaryLine}>
            <Ionicons name="calendar" size={15} color={adminTheme.colors.accent} />
            <Text style={styles.summaryText}>
              {whenLabel} · {fullDateLabel(targetDate)}
            </Text>
          </View>
          <View style={styles.summaryLine}>
            <Ionicons name="bed" size={15} color={adminTheme.colors.accent} />
            <Text style={styles.summaryText}>
              {selectedRoomNumbers.length > 0 ? `${selectedRoomNumbers.length} oda: ${selectedRoomNumbers.join(', ')}` : 'Oda seçilmedi'}
            </Text>
          </View>
          <View style={styles.summaryLine}>
            <Ionicons name="people" size={15} color={adminTheme.colors.accent} />
            <Text style={styles.summaryText}>Bu temizliğe gidecekler:</Text>
          </View>
          {selectedStaffNames.length === 0 ? (
            <Text style={[styles.smallText, { marginLeft: 23 }]}>Henüz kimse seçilmedi</Text>
          ) : (
            <View style={[styles.nameChipsRow, { marginLeft: 23 }]}>
              {selectedStaffNames.map((n) => (
                <View key={n} style={[styles.nameChip, styles.nameChipAccent]}>
                  <Ionicons name="person" size={11} color={adminTheme.colors.accent} />
                  <Text style={[styles.nameChipText, { color: adminTheme.colors.accent }]}>{n}</Text>
                </View>
              ))}
            </View>
          )}
        </AdminCard>
      ) : null}

      <AdminButton
        title={saving ? 'Gönderiliyor...' : 'Planı gönder'}
        onPress={() => requestSubmitPlan()}
        disabled={saving || !canCurrentUserManage}
        variant="accent"
        fullWidth
        leftIcon={<Ionicons name="send-outline" size={18} color="#fff" />}
      />
      {!canCurrentUserManage ? <Text style={styles.warn}>Bu ekran için yetkiniz yok.</Text> : null}
    </ScrollView>
  );
}

function StaffPickRow({ staff, on, onPress }: { staff: StaffRow; on: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.staffRow, on && styles.staffRowOn]} onPress={onPress} activeOpacity={0.7}>
      <Ionicons
        name={on ? 'checkmark-circle' : 'ellipse-outline'}
        size={22}
        color={on ? adminTheme.colors.accent : adminTheme.colors.textMuted}
      />
      <Text style={[styles.staffName, on && styles.staffNameOn]}>{staff.full_name || 'İsimsiz'}</Text>
      {isCleaner(staff) ? (
        <View style={styles.cleanerBadge}>
          <Text style={styles.cleanerBadgeText}>Temizlik</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 48 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { marginBottom: 12 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '800', color: adminTheme.colors.text },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text, flexShrink: 1 },
  smallText: { fontSize: 13, color: adminTheme.colors.textMuted },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 14, marginLeft: 'auto' },
  linkAction: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.accent },
  linkActionMuted: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.textMuted },

  // Tarih kartları
  dayRow: { gap: 8, paddingVertical: 2 },
  dayCard: {
    width: 64,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: adminTheme.radius.md,
    borderWidth: 1.5,
    borderColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surface,
  },
  dayCardOn: { borderColor: adminTheme.colors.accent, backgroundColor: adminTheme.colors.warningLight },
  dayWeekday: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.textMuted, textTransform: 'capitalize' },
  dayWeekdayOn: { color: adminTheme.colors.accent },
  daySpecial: { fontSize: 12, fontWeight: '800', color: adminTheme.colors.textSecondary },
  daySpecialOn: { color: adminTheme.colors.accent },
  dayNumber: { fontSize: 22, fontWeight: '800', color: adminTheme.colors.text, marginVertical: 1 },
  dayNumberOn: { color: adminTheme.colors.accent },
  dayMonth: { fontSize: 11, fontWeight: '600', color: adminTheme.colors.textMuted, textTransform: 'capitalize' },
  dayMonthOn: { color: adminTheme.colors.accent },
  selectedDateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: adminTheme.radius.md,
    backgroundColor: adminTheme.colors.successLight,
  },
  selectedDateText: { fontSize: 13, color: adminTheme.colors.text, flexShrink: 1 },
  selectedDateStrong: { fontWeight: '800', color: adminTheme.colors.success },

  // Mevcut planlar
  existingRow: { paddingVertical: 10, gap: 6 },
  existingRowBorder: { borderTopWidth: 1, borderTopColor: adminTheme.colors.borderLight },
  existingHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  existingProgress: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textSecondary },
  existingFieldLabel: { fontSize: 11, fontWeight: '800', color: adminTheme.colors.textMuted, letterSpacing: 0.3 },
  existingRooms: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.text },
  nameChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  nameChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: adminTheme.radius.full,
    backgroundColor: adminTheme.colors.infoLight,
  },
  nameChipAccent: { backgroundColor: adminTheme.colors.warningLight },
  nameChipText: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.info },

  // Oda grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minWidth: 58,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1.5,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  chipOn: { borderColor: adminTheme.colors.accent, backgroundColor: adminTheme.colors.warningLight },
  chipText: { fontSize: 15, color: adminTheme.colors.textSecondary, fontWeight: '700' },
  chipTextOn: { color: adminTheme.colors.accent },

  // Personel
  groupLabel: { fontSize: 11, fontWeight: '800', color: adminTheme.colors.textMuted, letterSpacing: 0.5, marginBottom: 2 },
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.borderLight,
    borderRadius: adminTheme.radius.sm,
  },
  staffRowOn: { backgroundColor: adminTheme.colors.warningLight },
  staffName: { fontSize: 15, color: adminTheme.colors.text, flex: 1 },
  staffNameOn: { color: adminTheme.colors.accent, fontWeight: '700' },
  cleanerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: adminTheme.radius.full,
    backgroundColor: adminTheme.colors.infoLight,
  },
  cleanerBadgeText: { fontSize: 10, fontWeight: '700', color: adminTheme.colors.info },

  // Not
  noteInput: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.md,
    backgroundColor: adminTheme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 72,
    color: adminTheme.colors.text,
    fontSize: 14,
  },

  // Özet
  summaryCard: { marginBottom: 12, borderWidth: 1.5, borderColor: adminTheme.colors.accent },
  summaryTitle: { fontSize: 15, fontWeight: '800', color: adminTheme.colors.text, marginBottom: 10 },
  summaryLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  summaryText: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.text, flexShrink: 1 },

  warn: { marginTop: 10, fontSize: 12, color: adminTheme.colors.error, textAlign: 'center' },
});
