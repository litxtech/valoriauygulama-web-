import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import {
  COLUMN_FIELD_LABELS,
  missingColumnFields,
  type ColumnField,
  type TabularColumnMap,
} from '@/lib/bankStatement/columnMap';

type Props = {
  visible: boolean;
  headers: string[];
  initialMap: TabularColumnMap;
  onCancel: () => void;
  onConfirm: (map: TabularColumnMap) => void;
};

const MAPPABLE_FIELDS: ColumnField[] = [
  'date',
  'description',
  'amount',
  'debit',
  'credit',
  'type',
  'balance',
  'reference',
  'counterparty',
  'iban',
  'currency',
];

export function BankImportColumnMapSheet({
  visible,
  headers,
  initialMap,
  onCancel,
  onConfirm,
}: Props) {
  const [map, setMap] = useState<TabularColumnMap>(initialMap);

  useEffect(() => {
    if (visible) setMap(initialMap);
  }, [visible, initialMap]);

  const missing = useMemo(() => missingColumnFields(map), [map]);

  const setField = (field: ColumnField, colIndex: number | null) => {
    setMap((prev) => {
      const next = { ...prev };
      if (colIndex == null) delete next[field];
      else next[field] = colIndex;
      return next;
    });
  };

  const canConfirm = missing.length === 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Sütun eşleştirme</Text>
          <Text style={styles.sub}>
            Dosyadaki sütunları sistem alanlarıyla eşleştirin. Tarih, açıklama ve tutar (veya borç/alacak) zorunludur.
          </Text>

          <ScrollView style={styles.list}>
            {MAPPABLE_FIELDS.map((field) => (
              <View key={field} style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>{COLUMN_FIELD_LABELS[field]}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <TouchableOpacity
                    style={[styles.chip, map[field] == null && styles.chipOn]}
                    onPress={() => setField(field, null)}
                  >
                    <Text style={[styles.chipText, map[field] == null && styles.chipTextOn]}>—</Text>
                  </TouchableOpacity>
                  {headers.map((h, i) => (
                    <TouchableOpacity
                      key={`${field}-${i}`}
                      style={[styles.chip, map[field] === i && styles.chipOn]}
                      onPress={() => setField(field, i)}
                    >
                      <Text style={[styles.chipText, map[field] === i && styles.chipTextOn]} numberOfLines={1}>
                        {h || `Sütun ${i + 1}`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ))}
          </ScrollView>

          {missing.length > 0 ? (
            <Text style={styles.warn}>
              Eksik: {missing.map((f) => COLUMN_FIELD_LABELS[f]).join(', ')}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, !canConfirm && styles.confirmDisabled]}
              disabled={!canConfirm}
              onPress={() => onConfirm(map)}
            >
              <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
              <Text style={styles.confirmText}>Devam et</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: adminTheme.colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    maxHeight: '88%',
  },
  title: { fontSize: 18, fontWeight: '800', color: adminTheme.colors.text },
  sub: { fontSize: 13, color: adminTheme.colors.textMuted, marginTop: 6, lineHeight: 18, marginBottom: 12 },
  list: { maxHeight: 420 },
  fieldBlock: { marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textMuted, marginBottom: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    marginRight: 8,
    maxWidth: 160,
  },
  chipOn: { backgroundColor: '#0f766e', borderColor: '#0f766e' },
  chipText: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.text },
  chipTextOn: { color: '#fff' },
  warn: { fontSize: 12, color: '#dc2626', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    alignItems: 'center',
  },
  cancelText: { fontSize: 15, fontWeight: '600', color: adminTheme.colors.text },
  confirmBtn: {
    flex: 2,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#0f766e',
  },
  confirmDisabled: { opacity: 0.45 },
  confirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
