import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminButton, AdminCard } from '@/components/admin';
import { sendNotification } from '@/lib/notificationService';
import { localTomorrowIso, localDateIso } from '@/lib/localDateIso';
import { getPlanDateHighlight } from '@/lib/cleaningPlanLoad';

type RoomRow = { id: string; room_number: string; floor: number | null };
type StaffRow = { id: string; full_name: string | null };

const STANDARD_ROOM_NUMBERS = [
  '101', '102', '103', '104', '105', '106',
  '201', '202', '203', '204', '205', '206',
  '301', '302', '303', '304', '305', '306',
];

function planWhenLabel(targetDate: string): string {
  const h = getPlanDateHighlight(targetDate);
  if (h === 'tomorrow') return 'YARIN';
  if (h === 'today') return 'BUGÜN';
  return targetDate;
}

export default function AdminRoomCleaningPlanScreen() {
  const staff = useAuthStore((s) => s.staff);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seedSaving, setSeedSaving] = useState(false);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(new Set());
  const [selectedStaffIds, setSelectedStaffIds] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [targetDate, setTargetDate] = useState(localTomorrowIso());
  const whenLabel = useMemo(() => planWhenLabel(targetDate), [targetDate]);

  const canCurrentUserManage = useMemo(() => {
    if (!staff) return false;
    if (staff.role === 'admin') return true;
    return staff.app_permissions?.yarin_oda_temizlik_listesi === true;
  }, [staff]);
  const isAdmin = staff?.role === 'admin';

  async function loadData() {
    setLoading(true);
    try {
      const [{ data: roomsData }, { data: staffData }] = await Promise.all([
        supabase.from('rooms').select('id, room_number, floor').order('room_number'),
        // Initial screen load was slow due to unnecessary wide payload.
        supabase.from('staff').select('id, full_name').eq('is_active', true).order('full_name'),
      ]);
      const staffRows = (staffData as StaffRow[] | null) ?? [];
      setRooms((roomsData as RoomRow[] | null) ?? []);
      setStaffList(staffRows);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const assignableStaff = useMemo(() => staffList, [staffList]);

  const existingRoomNumbers = useMemo(() => new Set(rooms.map((r) => r.room_number)), [rooms]);
  const missingStandardRooms = useMemo(
    () => STANDARD_ROOM_NUMBERS.filter((no) => !existingRoomNumbers.has(no)),
    [existingRoomNumbers]
  );

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

  function selectAllStaff() {
    setSelectedStaffIds(new Set(assignableStaff.map((s) => s.id)));
  }

  function clearSelectedStaff() {
    setSelectedStaffIds(new Set());
  }

  async function seedStandardRooms() {
    if (missingStandardRooms.length === 0) {
      Alert.alert('Bilgi', 'Standart oda setindeki tüm odalar zaten mevcut.');
      return;
    }
    setSeedSaving(true);
    try {
      const payload = missingStandardRooms.map((roomNo) => ({
        room_number: roomNo,
        floor: Number(roomNo[0]) || null,
        status: 'available',
      }));
      const { error } = await supabase.from('rooms').insert(payload);
      if (error) throw error;
      Alert.alert('Başarılı', `${payload.length} oda eklendi. Tüm modüllerde otomatik kullanılacak.`);
      await loadData();
    } catch (e) {
      Alert.alert('Hata', (e as Error).message || 'Oda ekleme başarısız.');
    }
    setSeedSaving(false);
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
      Alert.alert('Eksik', 'En az bir personel seçmelisiniz.');
      return;
    }

    const selectedRoomNumbers = rooms
      .filter((r) => selectedRoomIds.has(r.id))
      .map((r) => r.room_number)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const staffNames = assignableStaff
      .filter((s) => selectedStaffIds.has(s.id))
      .map((s) => s.full_name || 'İsimsiz')
      .join(', ');

    Alert.alert(
      'Listeyi gönder',
      `${whenLabel} (${targetDate}) temizlik listesi:\n\nOdalar (${selectedRoomNumbers.length}): ${selectedRoomNumbers.join(', ')}\n\nPersonel: ${staffNames}\n\nTemizlikçi odaları görür → temizler → kontrol listesini işaretler → tek onayla tamamlar.`,
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
          created_by_staff_id: staff.id,
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

      const selectedRoomNumbers = rooms
        .filter((r) => selectedRoomIds.has(r.id))
        .map((r) => r.room_number)
        .sort();

      const whenLabel = planWhenLabel(targetDate);

      await Promise.all(
        Array.from(selectedStaffIds).map((staffId) =>
          sendNotification({
            staffId,
            title: `Temizlik listesi — ${whenLabel}`,
            body: `${whenLabel} temizlenecek ${selectedRoomNumbers.length} oda: ${selectedRoomNumbers.join(', ')}. Temizlik ekranından açın.`,
            notificationType: 'staff_room_cleaning_plan',
            category: 'staff',
            createdByStaffId: staff.id,
            data: { url: '/staff/cleaning-plan', planId, targetDate, roomNumbers: selectedRoomNumbers },
          })
        )
      );

      Alert.alert('Plan gönderildi', 'Seçilen personele bildirim gönderildi.');
      setSelectedRoomIds(new Set());
      setSelectedStaffIds(new Set());
      setNote('');
      setTargetDate(localTomorrowIso());
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AdminCard style={styles.card}>
        <Text style={styles.title}>Temizlik listesi gönder</Text>
        <Text style={styles.subtitle}>
          Odaları ve temizlikçiyi seçip gönderin. Temizlikçi listedeki tüm odaları görür, temizliği yapar, kontrol maddelerini işaretler ve tek onayla tamamlar.
        </Text>
      </AdminCard>

      {isAdmin ? (
        <AdminCard style={styles.card}>
          <Text style={styles.sectionTitle}>Standart oda seti</Text>
          <Text style={styles.subtitle}>101-106, 201-206, 301-306 odalarını tek tıkla ekleyebilirsiniz.</Text>
          <Text style={styles.smallText}>
            Eksik: {missingStandardRooms.length ? missingStandardRooms.join(', ') : 'Yok'}
          </Text>
          <AdminButton
            title={seedSaving ? 'Ekleniyor...' : 'Standart odaları ekle'}
            onPress={() => void seedStandardRooms()}
            disabled={seedSaving || missingStandardRooms.length === 0}
            variant="primary"
            fullWidth
          />
        </AdminCard>
      ) : null}

      <AdminCard style={styles.card}>
        <Text style={styles.sectionTitle}>Tarih ve not</Text>
        <View style={styles.dateQuickRow}>
          <TouchableOpacity
            style={[styles.dateQuickBtn, targetDate === localTomorrowIso() && styles.dateQuickBtnOn]}
            onPress={() => setTargetDate(localTomorrowIso())}
            activeOpacity={0.85}
          >
            <Text style={[styles.dateQuickText, targetDate === localTomorrowIso() && styles.dateQuickTextOn]}>Yarın</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dateQuickBtn, targetDate === localDateIso() && styles.dateQuickBtnOn]}
            onPress={() => setTargetDate(localDateIso())}
            activeOpacity={0.85}
          >
            <Text style={[styles.dateQuickText, targetDate === localDateIso() && styles.dateQuickTextOn]}>Bugün</Text>
          </TouchableOpacity>
          <View style={[styles.whenBadge, { backgroundColor: adminTheme.colors.accent + '22' }]}>
            <Text style={[styles.whenBadgeText, { color: adminTheme.colors.accent }]}>{whenLabel}</Text>
          </View>
        </View>
        <TextInput style={styles.input} value={targetDate} onChangeText={setTargetDate} placeholder="YYYY-AA-GG" />
        <TextInput
          style={[styles.input, styles.noteInput]}
          value={note}
          onChangeText={setNote}
          placeholder="Opsiyonel not (personel bunu görecek)"
          multiline
          textAlignVertical="top"
        />
      </AdminCard>

      <AdminCard style={styles.card}>
        <Text style={styles.sectionTitle}>Odalar ({selectedRoomIds.size} seçili)</Text>
        <View style={styles.grid}>
          {rooms.map((r) => {
            const on = selectedRoomIds.has(r.id);
            return (
              <TouchableOpacity key={r.id} style={[styles.chip, on && styles.chipOn]} onPress={() => toggleRoom(r.id)} activeOpacity={0.85}>
                <Ionicons name={on ? 'checkbox' : 'square-outline'} size={16} color={on ? adminTheme.colors.accent : adminTheme.colors.textMuted} />
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{r.room_number}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </AdminCard>

      <AdminCard style={styles.card}>
        <Text style={styles.sectionTitle}>Gönderilecek personel ({selectedStaffIds.size} seçili)</Text>
        {assignableStaff.length > 0 ? (
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={selectAllStaff} activeOpacity={0.85}>
              <Text style={styles.actionBtnText}>Tümünü seç</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={clearSelectedStaff} activeOpacity={0.85}>
              <Text style={styles.actionBtnText}>Temizle</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {assignableStaff.length === 0 ? (
          <Text style={styles.smallText}>Aktif personel bulunamadı.</Text>
        ) : (
          assignableStaff.map((s) => {
            const on = selectedStaffIds.has(s.id);
            return (
              <TouchableOpacity key={s.id} style={[styles.staffRow, on && styles.staffRowOn]} onPress={() => toggleStaff(s.id)} activeOpacity={0.85}>
                <Ionicons name={on ? 'checkbox' : 'square-outline'} size={18} color={on ? adminTheme.colors.accent : adminTheme.colors.textMuted} />
                <Text style={[styles.staffName, on && styles.staffNameOn]}>{s.full_name || 'İsimsiz'}</Text>
              </TouchableOpacity>
            );
          })
        )}
      </AdminCard>

      <AdminButton
        title={saving ? 'Gönderiliyor...' : 'Listeyi personele gönder'}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800', color: adminTheme.colors.text, marginBottom: 6 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text, marginBottom: 8 },
  subtitle: { fontSize: 13, color: adminTheme.colors.textSecondary, lineHeight: 19 },
  smallText: { fontSize: 12, color: adminTheme.colors.textMuted, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.md,
    backgroundColor: adminTheme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    color: adminTheme.colors.text,
  },
  noteInput: { minHeight: 90 },
  dateQuickRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  dateQuickBtn: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.md,
    backgroundColor: adminTheme.colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  dateQuickBtnOn: { borderColor: adminTheme.colors.accent, backgroundColor: adminTheme.colors.warningLight },
  dateQuickText: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.textSecondary },
  dateQuickTextOn: { color: adminTheme.colors.accent },
  whenBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  whenBadgeText: { fontSize: 12, fontWeight: '900', letterSpacing: 0.6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  chipOn: { borderColor: adminTheme.colors.accent, backgroundColor: adminTheme.colors.warningLight },
  chipText: { fontSize: 13, color: adminTheme.colors.textSecondary, fontWeight: '600' },
  chipTextOn: { color: adminTheme.colors.accent },
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.borderLight,
  },
  staffRowOn: { backgroundColor: adminTheme.colors.warningLight },
  staffName: { fontSize: 14, color: adminTheme.colors.text },
  staffNameOn: { color: adminTheme.colors.accent, fontWeight: '700' },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  actionBtn: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.md,
    backgroundColor: adminTheme.colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: adminTheme.colors.textSecondary,
  },
  warn: { marginTop: 10, fontSize: 12, color: adminTheme.colors.error, textAlign: 'center' },
});
