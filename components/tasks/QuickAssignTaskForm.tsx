import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  Pressable,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import {
  getCachedAssignRooms,
  getCachedAssignStaff,
  loadAssignRooms,
  loadAssignStaff,
  type AssignRoomRow,
  type AssignStaffRow,
} from '@/lib/adminAssignPickersCache';
import { submitQuickAssignTask } from '@/lib/submitQuickAssignTask';
import { copyUriToCacheForUpload } from '@/lib/uploadMedia';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { MAX_ASSIGNMENT_ATTACHMENTS } from '@/lib/staffAssignmentMedia';
import { AssignmentAttachmentThumb } from '@/components/assign/AssignmentAttachmentThumb';
import { PressableScale } from '@/components/premium/PressableScale';
import { staffRoleLabel } from '@/lib/staffAssignments';

type Props = {
  onSuccess?: (assignedCount: number) => void;
  onCancel?: () => void;
  showCancel?: boolean;
};

export function QuickAssignTaskForm({ onSuccess, onCancel, showCancel = false }: Props) {
  const { t } = useTranslation();
  const { staff } = useAuthStore();
  const [staffList, setStaffList] = useState<AssignStaffRow[]>(() => getCachedAssignStaff(true) ?? []);
  const [rooms, setRooms] = useState<AssignRoomRow[]>(() => getCachedAssignRooms(true) ?? []);
  const [loading, setLoading] = useState(() => !getCachedAssignStaff(true)?.length);
  const [saving, setSaving] = useState(false);
  const [staffSearch, setStaffSearch] = useState('');
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [taskText, setTaskText] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [showMedia, setShowMedia] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<{ uri: string; type: 'image' | 'video' }[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [s, r] = await Promise.all([loadAssignStaff(), loadAssignRooms()]);
      if (cancelled) return;
      setStaffList(s);
      setRooms(r);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredStaff = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    const base = staffList.filter((s) => s.id !== staff?.id);
    if (!q) return base;
    return base.filter((s) => {
      const blob = `${s.full_name ?? ''} ${s.department ?? ''} ${s.role ?? ''}`.toLowerCase();
      return blob.includes(q);
    });
  }, [staffList, staffSearch, staff?.id]);

  const pickFromLibrary = async () => {
    if (pendingAttachments.length >= MAX_ASSIGNMENT_ATTACHMENTS) {
      Alert.alert(t('assignPage_photoLimit', { max: MAX_ASSIGNMENT_ATTACHMENTS }));
      return;
    }
    const granted = await ensureMediaLibraryPermission({
      title: t('assignPage_galleryPermTitle'),
      message: t('assignPage_galleryPermMsg'),
      settingsMessage: t('assignPage_galleryPermSettings'),
    });
    if (!granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.length) return;
    const next: { uri: string; type: 'image' | 'video' }[] = [];
    for (const asset of result.assets) {
      if (pendingAttachments.length + next.length >= MAX_ASSIGNMENT_ATTACHMENTS) break;
      const uri = await copyUriToCacheForUpload(asset.uri, asset.type === 'video' ? 'video' : 'image');
      next.push({ uri, type: asset.type === 'video' ? 'video' : 'image' });
    }
    if (next.length) setPendingAttachments((prev) => [...prev, ...next].slice(0, MAX_ASSIGNMENT_ATTACHMENTS));
  };

  const takePhoto = async () => {
    if (pendingAttachments.length >= MAX_ASSIGNMENT_ATTACHMENTS) {
      Alert.alert(t('assignPage_photoLimit', { max: MAX_ASSIGNMENT_ATTACHMENTS }));
      return;
    }
    const granted = await ensureCameraPermission({
      title: t('assignPage_cameraPermTitle'),
      message: t('assignPage_cameraPermMsg'),
    });
    if (!granted) return;
    const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (result.canceled || !result.assets[0]?.uri) return;
    const uri = await copyUriToCacheForUpload(result.assets[0].uri, 'image');
    setPendingAttachments((prev) => [...prev, { uri, type: 'image' }].slice(0, MAX_ASSIGNMENT_ATTACHMENTS));
  };

  const submit = useCallback(async () => {
    if (!staff?.id) return;
    if (!selectedAssigneeIds.length) {
      Alert.alert(t('error'), t('staffAssignPickStaff'));
      return;
    }
    if (!taskText.trim()) {
      Alert.alert(t('error'), t('quickAssign_taskRequired'));
      return;
    }
    setSaving(true);
    try {
      const count = await submitQuickAssignTask({
        assigneeStaffIds: selectedAssigneeIds,
        createdByStaffId: staff.id,
        taskText,
        roomNumber,
        rooms,
        pendingAttachments,
      });
      setTaskText('');
      setRoomNumber('');
      setSelectedAssigneeIds([]);
      setPendingAttachments([]);
      setShowMedia(false);
      onSuccess?.(count);
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('assignPage_errSave'));
    } finally {
      setSaving(false);
    }
  }, [
    staff?.id,
    selectedAssigneeIds,
    taskText,
    roomNumber,
    rooms,
    staffList,
    pendingAttachments,
    onSuccess,
    t,
  ]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.hint}>{t('quickAssign_hint')}</Text>

      <View style={styles.labelRow}>
        <Text style={styles.label}>{t('quickAssign_assigneeLabel')}</Text>
        {selectedAssigneeIds.length > 0 ? (
          <View style={styles.selectedBadge}>
            <Text style={styles.selectedBadgeText}>{selectedAssigneeIds.length}</Text>
          </View>
        ) : null}
      </View>
      <TextInput
        style={styles.search}
        value={staffSearch}
        onChangeText={setStaffSearch}
        placeholder={t('quickAssign_searchStaff')}
        placeholderTextColor={theme.colors.textMuted}
        autoCapitalize="none"
      />
      <View style={styles.staffList}>
        {filteredStaff.slice(0, 24).map((s) => {
          const selected = selectedAssigneeIds.includes(s.id);
          return (
            <Pressable
              key={s.id}
              style={[styles.staffChip, selected && styles.staffChipSelected]}
              onPress={() =>
                setSelectedAssigneeIds((prev) =>
                  prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id],
                )
              }
            >
              <View style={styles.staffChipTextWrap}>
                <Text style={[styles.staffChipName, selected && styles.staffChipNameSelected]} numberOfLines={1}>
                  {s.full_name || '—'}
                </Text>
                <Text style={[styles.staffChipSub, selected && styles.staffChipSubSelected]} numberOfLines={1}>
                  {[staffRoleLabel(s.role), s.department].filter(Boolean).join(' · ') || '—'}
                </Text>
              </View>
              <Ionicons
                name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={selected ? theme.colors.primary : theme.colors.borderLight}
              />
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>{t('quickAssign_taskLabel')}</Text>
      <TextInput
        style={styles.taskInput}
        value={taskText}
        onChangeText={setTaskText}
        placeholder={t('quickAssign_taskPlaceholder')}
        placeholderTextColor={theme.colors.textMuted}
        multiline
        textAlignVertical="top"
      />

      <Text style={styles.label}>{t('quickAssign_roomLabel')}</Text>
      <TextInput
        style={styles.roomInput}
        value={roomNumber}
        onChangeText={setRoomNumber}
        placeholder={t('quickAssign_roomPlaceholder')}
        placeholderTextColor={theme.colors.textMuted}
        keyboardType="default"
      />

      <Pressable style={styles.mediaToggle} onPress={() => setShowMedia((v) => !v)}>
        <Ionicons name={showMedia ? 'chevron-up' : 'images-outline'} size={18} color={theme.colors.primary} />
        <Text style={styles.mediaToggleText}>{t('quickAssign_mediaOptional')}</Text>
        {pendingAttachments.length > 0 ? (
          <View style={styles.mediaCountBadge}>
            <Text style={styles.mediaCountText}>{pendingAttachments.length}</Text>
          </View>
        ) : null}
      </Pressable>

      {showMedia ? (
        <View style={styles.mediaBlock}>
          <View style={styles.mediaActions}>
            <PressableScale style={styles.mediaBtn} onPress={pickFromLibrary}>
              <Ionicons name="images-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.mediaBtnText}>{t('quickAssign_pickGallery')}</Text>
            </PressableScale>
            <PressableScale style={styles.mediaBtn} onPress={takePhoto}>
              <Ionicons name="camera-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.mediaBtnText}>{t('quickAssign_takePhoto')}</Text>
            </PressableScale>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbRow}>
            {pendingAttachments.map((a, idx) => (
              <AssignmentAttachmentThumb
                key={`${a.uri}-${idx}`}
                uri={a.uri}
                type={a.type}
                onRemove={() => setPendingAttachments((prev) => prev.filter((_, i) => i !== idx))}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.actions}>
        {showCancel && onCancel ? (
          <Pressable style={styles.cancelBtn} onPress={onCancel} disabled={saving}>
            <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
          onPress={() => void submit()}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="send" size={18} color="#fff" />
              <Text style={styles.submitBtnText}>{t('quickAssign_submit')}</Text>
            </>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  centered: { padding: 40, alignItems: 'center' },
  hint: {
    fontSize: 14,
    color: theme.colors.textMuted,
    lineHeight: 20,
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    marginBottom: 8,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectedBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginBottom: 8,
    marginTop: 4,
  },
  selectedBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  search: {
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 15,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    marginBottom: 10,
  },
  staffList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  staffChip: {
    minWidth: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
  },
  staffChipTextWrap: { flex: 1 },
  staffChipSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '14',
  },
  staffChipName: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  staffChipNameSelected: { color: theme.colors.primaryDark },
  staffChipSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  staffChipSubSelected: { color: theme.colors.primary },
  taskInput: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    marginBottom: 12,
  },
  roomInput: {
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    marginBottom: 8,
  },
  mediaToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  mediaToggleText: { fontSize: 15, fontWeight: '600', color: theme.colors.primary, flex: 1 },
  mediaCountBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  mediaCountText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  mediaBlock: { marginBottom: 12 },
  mediaActions: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  mediaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
  },
  mediaBtnText: { fontSize: 13, fontWeight: '600', color: theme.colors.primary },
  thumbRow: { minHeight: 92 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  cancelBtnText: { fontSize: 16, fontWeight: '600', color: theme.colors.textSecondary },
  submitBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
  },
  submitBtnDisabled: { opacity: 0.65 },
  submitBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
});
