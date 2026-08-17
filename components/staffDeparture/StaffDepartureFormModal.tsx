import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme as T } from '@/constants/adminTheme';
import { TemplateStaffRecipientPicker } from '@/components/admin/TemplateStaffRecipientPicker';
import {
  bulkCreateStaffDepartures,
  createStaffDeparture,
  updateStaffDeparture,
} from '@/lib/staffDeparture/api';
import type { StaffDepartureListItem } from '@/lib/staffDeparture/types';

type Props = {
  visible: boolean;
  organizationId: string;
  createdByStaffId: string;
  editItem?: StaffDepartureListItem | null;
  onClose: () => void;
  onSaved: () => void;
};

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function StaffDepartureFormModal({
  visible,
  organizationId,
  createdByStaffId,
  editItem,
  onClose,
  onSaved,
}: Props) {
  const isEdit = !!editItem;
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [departureDate, setDepartureDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const resetForOpen = useCallback(() => {
    if (editItem) {
      setMode('single');
      setSelectedStaffIds([editItem.staff_id]);
      setDepartureDate(editItem.departure_date);
      setNote(editItem.note ?? '');
    } else {
      setMode('single');
      setSelectedStaffIds([]);
      setDepartureDate(todayIso());
      setNote('');
    }
  }, [editItem]);

  const handleToggleSelect = useCallback((staffId: string) => {
    if (mode === 'single') {
      setSelectedStaffIds((prev) => (prev.includes(staffId) ? [] : [staffId]));
      return;
    }
    setSelectedStaffIds((prev) =>
      prev.includes(staffId) ? prev.filter((id) => id !== staffId) : [...prev, staffId]
    );
  }, [mode]);

  const handleSetSelected = useCallback((staffIds: string[]) => {
    setSelectedStaffIds(staffIds);
  }, []);

  const canSave = useMemo(() => {
    if (!departureDate.trim()) return false;
    if (isEdit) return true;
    if (mode === 'single') return selectedStaffIds.length === 1;
    return selectedStaffIds.length > 0;
  }, [departureDate, isEdit, mode, selectedStaffIds.length]);

  const handleSave = async () => {
    if (!canSave || saving) return;
    const date = departureDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      Alert.alert('Tarih', 'YYYY-MM-DD formatında girin.');
      return;
    }

    setSaving(true);
    try {
      if (isEdit && editItem) {
        const result = await updateStaffDeparture({
          id: editItem.id,
          departureDate: date,
          note: note.trim() || null,
          updatedByStaffId: createdByStaffId,
        });
        if (result.error) {
          Alert.alert('Hata', result.error);
          return;
        }
        if (result.notifyError) {
          Alert.alert('Kaydedildi', `Bildirim gönderilemedi: ${result.notifyError}`);
        }
      } else if (mode === 'bulk') {
        const result = await bulkCreateStaffDepartures({
          organizationId,
          staffIds: selectedStaffIds,
          departureDate: date,
          note: note.trim() || null,
          createdByStaffId,
        });
        if (result.created === 0 && result.errors.length > 0) {
          Alert.alert('Hata', result.errors[0]);
          return;
        }
        const parts = [`${result.created} kayıt oluşturuldu.`];
        if (result.skipped.length > 0) {
          parts.push(`${result.skipped.length} personelde zaten plan vardı (atlandı).`);
        }
        if (result.errors.length > 0) {
          parts.push(`Uyarı: ${result.errors[0]}`);
        }
        Alert.alert('Tamam', parts.join('\n'));
      } else {
        const staffId = selectedStaffIds[0];
        const result = await createStaffDeparture({
          organizationId,
          staffId,
          departureDate: date,
          note: note.trim() || null,
          createdByStaffId,
        });
        if (result.error) {
          Alert.alert('Hata', result.error);
          return;
        }
        if (result.notifyError) {
          Alert.alert('Kaydedildi', `Bildirim gönderilemedi: ${result.notifyError}`);
        }
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleCancelDeparture = () => {
    if (!editItem) return;
    Alert.alert('İptal et', 'Bu ayrılış planı iptal edilsin mi? Personele bildirim gider.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'İptal et',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setSaving(true);
            try {
              const result = await updateStaffDeparture({
                id: editItem.id,
                status: 'cancelled',
                updatedByStaffId: createdByStaffId,
              });
              if (result.error) Alert.alert('Hata', result.error);
              else {
                onSaved();
                onClose();
              }
            } finally {
              setSaving(false);
            }
          })();
        },
      },
    ]);
  };

  const handleComplete = () => {
    if (!editItem) return;
    Alert.alert('Tamamlandı', 'Personel ayrılış yaptı olarak işaretlensin mi?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Tamamla',
        onPress: () => {
          void (async () => {
            setSaving(true);
            try {
              const result = await updateStaffDeparture({
                id: editItem.id,
                status: 'completed',
                updatedByStaffId: createdByStaffId,
              });
              if (result.error) Alert.alert('Hata', result.error);
              else {
                onSaved();
                onClose();
              }
            } finally {
              setSaving(false);
            }
          })();
        },
      },
    ]);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onShow={resetForOpen}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={T.colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>
            {isEdit ? 'Ayrılış düzenle' : 'Ayrılış ekle'}
          </Text>
          <TouchableOpacity onPress={() => void handleSave()} disabled={!canSave || saving}>
            {saving ? (
              <ActivityIndicator size="small" color={T.colors.primary} />
            ) : (
              <Text style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}>Kaydet</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {!isEdit ? (
            <View style={styles.modeRow}>
              <TouchableOpacity
                style={[styles.modeChip, mode === 'single' && styles.modeChipActive]}
                onPress={() => setMode('single')}
              >
                <Ionicons
                  name="person-outline"
                  size={16}
                  color={mode === 'single' ? '#fff' : T.colors.textMuted}
                />
                <Text style={[styles.modeChipText, mode === 'single' && styles.modeChipTextActive]}>
                  Bireysel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeChip, mode === 'bulk' && styles.modeChipActive]}
                onPress={() => setMode('bulk')}
              >
                <Ionicons
                  name="people-outline"
                  size={16}
                  color={mode === 'bulk' ? '#fff' : T.colors.textMuted}
                />
                <Text style={[styles.modeChipText, mode === 'bulk' && styles.modeChipTextActive]}>
                  Toplu
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {!isEdit ? (
            <TemplateStaffRecipientPicker
              mode="include"
              organizationId={organizationId}
              selectedStaffIds={selectedStaffIds}
              onToggleSelect={handleToggleSelect}
              onSetSelected={handleSetSelected}
              disabled={saving}
            />
          ) : (
            <View style={styles.editPerson}>
              <Text style={styles.label}>Personel</Text>
              <Text style={styles.editPersonName}>{editItem?.staff_name ?? '—'}</Text>
            </View>
          )}

          <Text style={styles.label}>Ayrılış tarihi</Text>
          <TextInput
            style={styles.input}
            value={departureDate}
            onChangeText={setDepartureDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={T.colors.textMuted}
            autoCapitalize="none"
            editable={!saving}
          />

          <Text style={styles.label}>Not (isteğe bağlı)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={note}
            onChangeText={setNote}
            placeholder="Örn: Sözleşme bitişi, sezon sonu…"
            placeholderTextColor={T.colors.textMuted}
            multiline
            editable={!saving}
          />

          {!isEdit ? (
            <Text style={styles.hint}>
              Kayıt oluşturulunca ilgili personele özel sesli push bildirim gider.
            </Text>
          ) : editItem?.status === 'planned' ? (
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.completeBtn} onPress={handleComplete} disabled={saving}>
                <Ionicons name="checkmark-circle-outline" size={18} color="#15803d" />
                <Text style={styles.completeBtnText}>Ayrılış tamamlandı</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={handleCancelDeparture} disabled={saving}>
                <Ionicons name="close-circle-outline" size={18} color="#b91c1c" />
                <Text style={styles.cancelBtnText}>Planı iptal et</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  title: { fontSize: 17, fontWeight: '700', color: T.colors.text },
  saveBtn: { fontSize: 16, fontWeight: '700', color: T.colors.primary },
  saveBtnDisabled: { opacity: 0.4 },
  body: { padding: 16, paddingBottom: 40 },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  modeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  modeChipActive: { backgroundColor: T.colors.primary, borderColor: T.colors.primary },
  modeChipText: { fontSize: 14, fontWeight: '600', color: T.colors.textMuted },
  modeChipTextActive: { color: '#fff' },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: T.colors.textMuted,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: T.colors.text,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  hint: { marginTop: 16, fontSize: 13, color: T.colors.textMuted, lineHeight: 18 },
  editPerson: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  editPersonName: { fontSize: 16, fontWeight: '700', color: T.colors.text },
  editActions: { marginTop: 20, gap: 10 },
  completeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
  },
  completeBtnText: { color: '#15803d', fontWeight: '600' },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#fef2f2',
    borderRadius: 10,
  },
  cancelBtnText: { color: '#b91c1c', fontWeight: '600' },
});
