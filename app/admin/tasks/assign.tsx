import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode } from 'expo-av';
import { useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import {
  createStaffAssignmentsForAssignees,
  dispatchNewTaskAssignmentsNotify,
} from '@/lib/staffAssignmentCreate';
import { adminTheme } from '@/constants/adminTheme';
import { AdminButton, AdminCard } from '@/components/admin';
import { CachedImage } from '@/components/CachedImage';
import {
  ASSIGNMENT_TASK_LABELS,
  ASSIGNMENT_PRIORITY_LABELS,
  ASSIGNMENT_TASK_TYPE_KEYS,
  ASSIGNMENT_PRIORITY_KEYS,
  STAFF_ROLE_LABELS,
} from '@/lib/staffAssignments';
import { copyAndroidContentUriToCacheForPreview } from '@/lib/uploadMedia';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { MAX_ASSIGNMENT_ATTACHMENTS } from '@/lib/staffAssignmentMedia';
import { sortStaffAdminFirst } from '@/lib/sortStaffAdminFirst';
import { AdminStackBackButton } from '@/lib/adminStackBack';
import { useTranslation } from 'react-i18next';

type StaffRow = { id: string; full_name: string | null; role: string | null; department: string | null };
type RoomRow = { id: string; room_number: string; floor: number | null };

const TASK_TYPES = ASSIGNMENT_TASK_TYPE_KEYS;
const PRIORITIES = ASSIGNMENT_PRIORITY_KEYS;

export default function AdminAssignTaskScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { staff } = useAuthStore();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <AdminStackBackButton accessibilityLabel={t('back')} fallback="/admin/tasks" />
      ),
    });
  }, [navigation, t]);
  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedAssignees, setSelectedAssignees] = useState<Set<string>>(new Set());
  const [staffSearch, setStaffSearch] = useState('');
  const [taskType, setTaskType] = useState<string>('general');
  const [priority, setPriority] = useState<string>('normal');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [selectedRooms, setSelectedRooms] = useState<Set<string>>(new Set());
  const [roomSearch, setRoomSearch] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<{ uri: string; type: 'image' | 'video' }[]>([]);

  useEffect(() => {
    (async () => {
      const [sRes, rRes] = await Promise.all([
        supabase.from('staff').select('id, full_name, role, department').eq('is_active', true).order('full_name'),
        supabase.from('rooms').select('id, room_number, floor').order('floor', { ascending: true }).order('room_number'),
      ]);
      setStaffList(
        sortStaffAdminFirst((sRes.data as StaffRow[]) ?? [], (a, b) =>
          (a.full_name || '').localeCompare(b.full_name || '', 'tr')
        )
      );
      setRooms((rRes.data as RoomRow[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const filteredRooms = useMemo(() => {
    const q = roomSearch.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter((r) => r.room_number.toLowerCase().includes(q) || String(r.floor ?? '').includes(q));
  }, [rooms, roomSearch]);

  const filteredStaff = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    if (!q) return staffList;
    return staffList.filter((s) => {
      const name = (s.full_name ?? '').toLowerCase();
      const dept = (s.department ?? '').toLowerCase();
      const role = (s.role ?? '').toLowerCase();
      return name.includes(q) || dept.includes(q) || role.includes(q);
    });
  }, [staffList, staffSearch]);

  const toggleAssignee = (id: string) => {
    setSelectedAssignees((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisibleStaff = () => {
    setSelectedAssignees((prev) => {
      const next = new Set(prev);
      filteredStaff.forEach((s) => next.add(s.id));
      return next;
    });
  };

  const clearAssignees = () => setSelectedAssignees(new Set());

  const toggleRoom = (id: string) => {
    setSelectedRooms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedRooms((prev) => {
      const next = new Set(prev);
      filteredRooms.forEach((r) => next.add(r.id));
      return next;
    });
  };

  const clearRooms = () => setSelectedRooms(new Set());

  const pickFromLibrary = async () => {
    if (pendingAttachments.length >= MAX_ASSIGNMENT_ATTACHMENTS) {
      Alert.alert('Limit', `En fazla ${MAX_ASSIGNMENT_ATTACHMENTS} dosya ekleyebilirsiniz.`);
      return;
    }
    const granted = await ensureMediaLibraryPermission({
      title: 'Galeri izni',
      message: 'Göreve fotoğraf veya video eklemek için galeri erişimi gerekir.',
      settingsMessage: 'Ayarlar üzerinden galeri iznini açın.',
    });
    if (!granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      quality: 0.85,
      base64: false,
    });
    if (result.canceled || !result.assets?.length) return;
    const resolved: { uri: string; type: 'image' | 'video' }[] = [];
    for (const asset of result.assets) {
      if (resolved.length >= MAX_ASSIGNMENT_ATTACHMENTS) break;
      const raw = asset.uri;
      if (!raw) continue;
      const kind = asset.type === 'video' ? 'video' : 'image';
      let uri = raw;
      try {
        uri = await copyAndroidContentUriToCacheForPreview(raw, kind);
      } catch {
        uri = raw;
      }
      resolved.push({ uri, type: kind });
    }
    setPendingAttachments((prev) => {
      const next = [...prev, ...resolved];
      return next.slice(0, MAX_ASSIGNMENT_ATTACHMENTS);
    });
  };

  const takeMedia = async () => {
    if (pendingAttachments.length >= MAX_ASSIGNMENT_ATTACHMENTS) {
      Alert.alert('Limit', `En fazla ${MAX_ASSIGNMENT_ATTACHMENTS} dosya ekleyebilirsiniz.`);
      return;
    }
    const granted = await ensureCameraPermission({
      title: 'Kamera izni',
      message: 'Göreve fotoğraf veya video eklemek için kamera gerekir.',
      settingsMessage: 'Ayarlar üzerinden kamera iznini açın.',
    });
    if (!granted) return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: false,
      quality: 0.85,
      base64: false,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    const asset = result.assets[0];
    const kind = asset.type === 'video' ? 'video' : 'image';
    let uri = asset.uri!;
    try {
      uri = await copyAndroidContentUriToCacheForPreview(uri, kind);
    } catch {
      /* orijinal URI */
    }
    setPendingAttachments((prev) =>
      prev.length >= MAX_ASSIGNMENT_ATTACHMENTS
        ? prev
        : [...prev, { uri, type: kind }]
    );
  };

  const removeAttachment = (index: number) => {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = async () => {
    if (!staff?.id) {
      Alert.alert('Oturum', 'Personel oturumu gerekli.');
      return;
    }
    const assigneeIds = Array.from(selectedAssignees);
    if (assigneeIds.length === 0) {
      Alert.alert('Eksik', 'Görevin atanacağı en az bir personel seçin.');
      return;
    }
    const t = title.trim();
    if (!t) {
      Alert.alert('Eksik', 'Görev başlığı yazın (ör. “Stok sayımı”, “3. kat kontrol”, “Gece vardiyası notu”).');
      return;
    }
    let dueAt: string | null = null;
    const dStr = dueDate.trim();
    if (dStr) {
      const tRaw = dueTime.trim();
      const [hh0, mm0] = tRaw ? tRaw.split(':').map((x) => parseInt(x, 10)) : [18, 0];
      const hh = Number.isFinite(hh0) ? Math.min(23, Math.max(0, hh0)) : 18;
      const mm = Number.isFinite(mm0) ? Math.min(59, Math.max(0, mm0)) : 0;
      const parts = dStr.split('-').map((x) => parseInt(x, 10));
      if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
        const [y, mo, day] = parts;
        dueAt = new Date(y, mo - 1, day, hh, mm, 0, 0).toISOString();
      }
    }
    setSaving(true);
    try {
      const roomIds = Array.from(selectedRooms);
      const { rows, uploadedUrls } = await createStaffAssignmentsForAssignees({
        assigneeStaffIds: assigneeIds,
        createdByStaffId: staff.id,
        title: t,
        body: body.trim() || null,
        taskType,
        priority,
        roomIds,
        dueAt,
        pendingAttachments,
      });

      const typeLabel = ASSIGNMENT_TASK_LABELS[taskType] ?? taskType;
      const roomLabels = roomIds
        .map((rid) => rooms.find((r) => r.id === rid)?.room_number)
        .filter(Boolean) as string[];
      const roomPart = roomLabels.length ? ` Odalar: ${roomLabels.join(', ')}.` : '';
      const mediaPart = uploadedUrls.length ? ` ${uploadedUrls.length} ek.` : '';
      const pushBody = `${typeLabel}: ${t}.${roomPart}${mediaPart}`.trim();

      const boardContent = [body.trim(), roomPart.replace(/^\s*/, ''), mediaPart.replace(/^\s*/, '')]
        .filter(Boolean)
        .join('\n')
        .trim() || pushBody;

      dispatchNewTaskAssignmentsNotify(
        rows.map((row) => ({
          assigneeStaffId: row.assigned_staff_id,
          createdByStaffId: staff.id,
          assignmentId: row.id,
          title: t,
          pushBody,
          boardContent,
          priority,
        }))
      );

      const assigneeNames = rows
        .map((row) => staffList.find((s) => s.id === row.assigned_staff_id)?.full_name ?? 'Personel')
        .join(', ');
      const countNote =
        rows.length === 1
          ? `${assigneeNames} için görev oluşturuldu.`
          : `${rows.length} personel için görev oluşturuldu (${assigneeNames}).`;

      setSaving(false);
      Alert.alert('Görev atandı', `${countNote} Bildirim ve pano kaydı arka planda iletilir.`, [
        { text: 'Tamam', onPress: () => router.back() },
      ]);
      return;
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Kayıt başarısız.');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <AdminCard style={styles.heroCard} elevated>
          <View style={styles.heroTop}>
            <View style={styles.heroIconWrap}>
              <Ionicons name="rocket-outline" size={26} color={adminTheme.colors.accent} />
            </View>
            <View style={styles.heroTextCol}>
              <Text style={styles.heroTitle}>Görev oluştur</Text>
              <Text style={styles.heroSub}>
                Her departman ve iş türü için bir veya birden fazla personele görev atayabilirsiniz. İsteğe bağlı fotoğraf veya video ekleyin; her atanan için ayrı görev ve bildirim oluşturulur.
              </Text>
            </View>
          </View>
        </AdminCard>

        <AdminCard style={styles.card}>
          <View style={styles.roomHeader}>
            <View>
              <Text style={styles.sectionLabel}>Atanan personel *</Text>
              <Text style={styles.roomHint}>Birden fazla seçebilirsiniz ({selectedAssignees.size} seçili)</Text>
            </View>
            <View style={styles.roomActions}>
              <TouchableOpacity onPress={selectAllVisibleStaff} hitSlop={8}>
                <Text style={styles.linkText}>Görünenleri seç</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={clearAssignees} hitSlop={8}>
                <Text style={styles.linkText}>Temizle</Text>
              </TouchableOpacity>
            </View>
          </View>
          <TextInput
            style={[styles.input, styles.searchInput]}
            placeholder="İsim, departman veya rol ara..."
            placeholderTextColor={adminTheme.colors.textMuted}
            value={staffSearch}
            onChangeText={setStaffSearch}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
            {filteredStaff.map((s) => {
              const selected = selectedAssignees.has(s.id);
              const roleL = s.role ? STAFF_ROLE_LABELS[s.role] ?? s.role : '';
              return (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.personChip, selected && styles.personChipOn]}
                  onPress={() => toggleAssignee(s.id)}
                  activeOpacity={0.85}
                >
                  <View style={styles.personChipRow}>
                    <Ionicons
                      name={selected ? 'checkbox' : 'square-outline'}
                      size={18}
                      color={selected ? adminTheme.colors.accent : adminTheme.colors.textMuted}
                    />
                    <View style={styles.personChipTextCol}>
                      <Text style={[styles.personChipName, selected && styles.personChipNameOn]} numberOfLines={1}>
                        {s.full_name ?? 'İsimsiz'}
                      </Text>
                      {(roleL || s.department) && (
                        <Text style={[styles.personChipMeta, selected && styles.personChipMetaOn]} numberOfLines={1}>
                          {[roleL, s.department].filter(Boolean).join(' · ')}
                        </Text>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </AdminCard>

        <AdminCard style={styles.card}>
          <Text style={styles.sectionLabel}>Kategori</Text>
          <Text style={[styles.roomHint, styles.categoryHint]}>İşin türünü seçin; çoğu görev için «Genel» yeterlidir.</Text>
          <View style={styles.wrapRow}>
            {TASK_TYPES.map((key) => (
              <TouchableOpacity
                key={key}
                style={[styles.typeChip, taskType === key && styles.typeChipOn]}
                onPress={() => setTaskType(key)}
                activeOpacity={0.85}
              >
                <Text style={[styles.typeChipText, taskType === key && styles.typeChipTextOn]}>
                  {ASSIGNMENT_TASK_LABELS[key]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </AdminCard>

        <AdminCard style={styles.card}>
          <Text style={styles.sectionLabel}>Öncelik</Text>
          <View style={styles.wrapRow}>
            {PRIORITIES.map((key) => (
              <TouchableOpacity
                key={key}
                style={[styles.prioChip, priority === key && styles.prioChipOn]}
                onPress={() => setPriority(key)}
                activeOpacity={0.85}
              >
                <Text style={[styles.prioChipText, priority === key && styles.prioChipTextOn]}>
                  {ASSIGNMENT_PRIORITY_LABELS[key]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </AdminCard>

        <AdminCard style={styles.card}>
          <Text style={styles.sectionLabel}>Başlık *</Text>
          <TextInput
            style={styles.input}
            placeholder="Örn. Resepsiyon vardiya notu / 3. kat oda hazırlığı"
            placeholderTextColor={adminTheme.colors.textMuted}
            value={title}
            onChangeText={setTitle}
          />
          <Text style={[styles.sectionLabel, styles.mt]}>Otel & görev detayı</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Misafir beklentisi, özel notlar, ekipman, saat, ilgili birimler..."
            placeholderTextColor={adminTheme.colors.textMuted}
            value={body}
            onChangeText={setBody}
            multiline
            textAlignVertical="top"
          />
          <Text style={[styles.sectionLabel, styles.mt]}>Son tarih (isteğe bağlı)</Text>
          <View style={styles.dueRow}>
            <TextInput
              style={[styles.input, styles.dueInput]}
              placeholder="YYYY-AA-GG"
              placeholderTextColor={adminTheme.colors.textMuted}
              value={dueDate}
              onChangeText={setDueDate}
              autoCapitalize="none"
            />
            <TextInput
              style={[styles.input, styles.dueInputTime]}
              placeholder="SS:DD"
              placeholderTextColor={adminTheme.colors.textMuted}
              value={dueTime}
              onChangeText={setDueTime}
              autoCapitalize="none"
            />
          </View>
          <Text style={styles.fieldHint}>Saat boşsa 18:00 kabul edilir.</Text>
        </AdminCard>

        <AdminCard style={styles.card}>
          <Text style={styles.sectionLabel}>Ekler (fotoğraf / video)</Text>
          <Text style={styles.roomHint}>Personele görünür; en fazla {MAX_ASSIGNMENT_ATTACHMENTS} dosya.</Text>
          <View style={styles.mediaActions}>
            <TouchableOpacity style={styles.mediaBtn} onPress={pickFromLibrary} activeOpacity={0.85}>
              <Ionicons name="images-outline" size={20} color={adminTheme.colors.accent} />
              <Text style={styles.mediaBtnText}>Galeri</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.mediaBtn} onPress={takeMedia} activeOpacity={0.85}>
              <Ionicons name="camera-outline" size={20} color={adminTheme.colors.accent} />
              <Text style={styles.mediaBtnText}>Kamera</Text>
            </TouchableOpacity>
          </View>
          {pendingAttachments.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mediaStrip}>
              {pendingAttachments.map((item, idx) => (
                <View key={`${item.uri.slice(-24)}_${idx}`} style={styles.mediaThumbWrap}>
                  {item.type === 'video' ? (
                    <Video
                      source={{ uri: item.uri }}
                      style={styles.mediaThumb}
                      resizeMode={ResizeMode.COVER}
                      shouldPlay={false}
                      isMuted
                      useNativeControls={false}
                    />
                  ) : (
                    <CachedImage
                      uri={item.uri}
                      style={styles.mediaThumb}
                      contentFit="cover"
                      cachePolicy="none"
                    />
                  )}
                  <TouchableOpacity style={styles.mediaRemove} onPress={() => removeAttachment(idx)} hitSlop={8}>
                    <Ionicons name="close-circle" size={22} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          ) : null}
        </AdminCard>

        <AdminCard style={styles.card}>
          <View style={styles.roomHeader}>
            <View>
              <Text style={styles.sectionLabel}>İlgili odalar (isteğe bağlı)</Text>
              <Text style={styles.roomHint}>Oda ile ilgili işlerde numaraları seçin ({selectedRooms.size} seçili)</Text>
            </View>
            <View style={styles.roomActions}>
              <TouchableOpacity onPress={selectAllVisible} hitSlop={8}>
                <Text style={styles.linkText}>Görünenleri seç</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={clearRooms} hitSlop={8}>
                <Text style={styles.linkText}>Temizle</Text>
              </TouchableOpacity>
            </View>
          </View>
          <TextInput
            style={[styles.input, styles.searchInput]}
            placeholder="Oda no veya kat ara..."
            placeholderTextColor={adminTheme.colors.textMuted}
            value={roomSearch}
            onChangeText={setRoomSearch}
          />
          <View style={styles.roomGrid}>
            {filteredRooms.map((r) => {
              const on = selectedRooms.has(r.id);
              return (
                <TouchableOpacity
                  key={r.id}
                  style={[styles.roomCell, on && styles.roomCellOn]}
                  onPress={() => toggleRoom(r.id)}
                  activeOpacity={0.85}
                >
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={18} color={on ? adminTheme.colors.accent : adminTheme.colors.textMuted} />
                  <Text style={[styles.roomCellNum, on && styles.roomCellNumOn]}>{r.room_number}</Text>
                  {r.floor != null && <Text style={styles.roomCellFloor}>Kat {r.floor}</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </AdminCard>

        <AdminButton
          title={saving ? 'Kaydediliyor…' : 'Görevi ata ve bildir'}
          onPress={() => submit()}
          disabled={saving}
          variant="accent"
          fullWidth
          leftIcon={!saving ? <Ionicons name="send" size={18} color="#fff" /> : undefined}
        />
        <View style={{ height: 32 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  scroll: { padding: adminTheme.spacing.lg, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: adminTheme.colors.surfaceSecondary },
  heroCard: { marginBottom: adminTheme.spacing.md },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start' },
  heroIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: adminTheme.colors.warningLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: adminTheme.spacing.md,
  },
  heroTextCol: { flex: 1 },
  heroTitle: { fontSize: 20, fontWeight: '800', color: adminTheme.colors.text, marginBottom: 6 },
  heroSub: { fontSize: 14, lineHeight: 21, color: adminTheme.colors.textSecondary },
  card: { marginBottom: adminTheme.spacing.md },
  dueRow: { flexDirection: 'row', gap: 10 },
  dueInput: { flex: 1.4 },
  dueInputTime: { flex: 0.9 },
  fieldHint: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 6 },
  mediaActions: { flexDirection: 'row', gap: 10, marginTop: 8, marginBottom: 12 },
  mediaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: adminTheme.radius.md,
    borderWidth: 1,
    borderColor: adminTheme.colors.accent,
    backgroundColor: adminTheme.colors.surface,
  },
  mediaBtnText: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.accent },
  mediaStrip: { marginTop: 4, maxHeight: 100 },
  mediaThumbWrap: { marginRight: 10, position: 'relative' },
  mediaThumb: { width: 88, height: 88, borderRadius: 10, backgroundColor: adminTheme.colors.border },
  mediaRemove: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: adminTheme.colors.text,
    marginBottom: adminTheme.spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  mt: { marginTop: adminTheme.spacing.md },
  categoryHint: { marginBottom: adminTheme.spacing.sm, maxWidth: undefined },
  chipsScroll: { maxHeight: 120, marginHorizontal: -4 },
  personChip: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: adminTheme.radius.md,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    borderWidth: 2,
    borderColor: adminTheme.colors.border,
    marginRight: 10,
    maxWidth: 220,
  },
  personChipRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  personChipTextCol: { flexShrink: 1, maxWidth: 170 },
  personChipOn: {
    borderColor: adminTheme.colors.accent,
    backgroundColor: adminTheme.colors.warningLight,
  },
  personChipName: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  personChipNameOn: { color: adminTheme.colors.primary },
  personChipMeta: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 2 },
  personChipMetaOn: { color: adminTheme.colors.textSecondary },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: adminTheme.radius.full,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  typeChipOn: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  typeChipText: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.textSecondary },
  typeChipTextOn: { color: '#fff' },
  prioChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: adminTheme.radius.md,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  prioChipOn: { borderColor: adminTheme.colors.accent, backgroundColor: adminTheme.colors.warningLight },
  prioChipText: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.text },
  prioChipTextOn: { color: adminTheme.colors.accent },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: adminTheme.colors.text,
    backgroundColor: adminTheme.colors.surface,
  },
  textArea: { minHeight: 120, paddingTop: 12 },
  searchInput: { marginBottom: adminTheme.spacing.md },
  roomHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: adminTheme.spacing.sm },
  roomHint: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 4, maxWidth: 220 },
  roomActions: { alignItems: 'flex-end', gap: 4 },
  linkText: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.accent },
  roomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roomCell: {
    width: '30%',
    minWidth: 100,
    flexGrow: 1,
    padding: 10,
    borderRadius: adminTheme.radius.md,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  roomCellOn: { borderColor: adminTheme.colors.accent, backgroundColor: adminTheme.colors.warningLight },
  roomCellNum: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  roomCellNumOn: { color: adminTheme.colors.accent },
  roomCellFloor: { fontSize: 10, color: adminTheme.colors.textMuted, marginLeft: 'auto' },
});
