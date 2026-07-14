import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import type { KbsCapturedDocumentRow } from '@/lib/kbsCaptureHistory';
import { enrichKbsParsedFromSources } from '@/lib/kbsCaptureParsedFields';
import { fetchKbsOpsRooms } from '@/lib/kbsStaffOpsEdge';
import {
  notifyKbsCaptureToKbs,
  updateKbsCaptureManualFields,
} from '@/lib/kbsCaptureNotify';

type Props = {
  row: KbsCapturedDocumentRow;
  canNotify: boolean;
  onUpdated: () => void;
};

export function KbsCaptureOpsActions({ row, canNotify, onUpdated }: Props) {
  const parsed = enrichKbsParsedFromSources(row.parsed_payload);
  const [firstName, setFirstName] = useState(parsed?.firstName ?? '');
  const [lastName, setLastName] = useState(parsed?.lastName ?? '');
  const [docNo, setDocNo] = useState(parsed?.documentNumber ?? '');
  const [birthDate, setBirthDate] = useState(parsed?.birthDate?.slice(0, 10) ?? '');
  const [nationality, setNationality] = useState(parsed?.nationalityCode ?? '');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [rooms, setRooms] = useState<{ id: string; room_number: string }[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notifying, setNotifying] = useState(false);

  useEffect(() => {
    const p = enrichKbsParsedFromSources(row.parsed_payload);
    setFirstName(p?.firstName ?? '');
    setLastName(p?.lastName ?? '');
    setDocNo(p?.documentNumber ?? '');
    setBirthDate(p?.birthDate?.slice(0, 10) ?? '');
    setNationality(p?.nationalityCode ?? '');
    setRoomId(null);
  }, [row.id, row.parsed_payload]);

  const loadRooms = useCallback(async () => {
    if (!canNotify) return;
    setRoomsLoading(true);
    const res = await fetchKbsOpsRooms();
    setRoomsLoading(false);
    if (res.ok) setRooms(res.data ?? []);
  }, [canNotify]);

  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  const roomChips = useMemo(() => rooms.slice(0, 48), [rooms]);

  const saveFields = async (): Promise<boolean> => {
    setSaving(true);
    const res = await updateKbsCaptureManualFields(row, {
      firstName,
      lastName,
      documentNumber: docNo,
      birthDate: birthDate.trim() || null,
      nationalityCode: nationality.trim() || null,
    });
    setSaving(false);
    if (!res.ok) {
      Alert.alert('Düzelt', res.message);
      return false;
    }
    onUpdated();
    return true;
  };

  const onSaveOnly = async () => {
    const ok = await saveFields();
    if (ok) Alert.alert('Kaydedildi', 'Kimlik bilgileri güncellendi.');
  };

  const onNotify = async () => {
    if (!canNotify) return;
    if (!roomId) {
      Alert.alert('Oda seç', 'Bildirmeden önce oda seçin.');
      return;
    }
    if (!docNo.trim() || (!firstName.trim() && !lastName.trim())) {
      Alert.alert('Eksik alan', 'Ad/soyad ve belge numarası gerekli.');
      return;
    }
    setNotifying(true);
    const saved = await saveFields();
    if (!saved) {
      setNotifying(false);
      return;
    }
    const res = await notifyKbsCaptureToKbs({
      guestDocumentId: row.id,
      roomId,
      currentStatus: row.scan_status,
    });
    setNotifying(false);
    if (!res.ok) {
      Alert.alert('Bildir', res.message);
      return;
    }
    Alert.alert(
      'Bildirildi',
      res.transactionId ? `İşlem: ${String(res.transactionId).slice(0, 8)}…` : 'KBS bildirimi alındı.'
    );
    onUpdated();
  };

  const busy = saving || notifying;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Manuel düzeltme</Text>
      <Text style={styles.hint}>Alanları düzeltin, kaydedin{canNotify ? ' veya oda seçip Bildir’e basın' : ''}.</Text>

      <Field label="Ad" value={firstName} onChangeText={setFirstName} editable={!busy} />
      <Field label="Soyad" value={lastName} onChangeText={setLastName} editable={!busy} />
      <Field label="Belge no" value={docNo} onChangeText={setDocNo} editable={!busy} autoCap="characters" />
      <Field
        label="Doğum tarihi (YYYY-MM-DD)"
        value={birthDate}
        onChangeText={setBirthDate}
        editable={!busy}
        keyboardType="numbers-and-punctuation"
      />
      <Field
        label="Uyruk (ISO)"
        value={nationality}
        onChangeText={setNationality}
        editable={!busy}
        autoCap="characters"
      />

      <Pressable
        style={[styles.secondaryBtn, busy && styles.btnDisabled]}
        onPress={() => void onSaveOnly()}
        disabled={busy}
      >
        {saving && !notifying ? (
          <ActivityIndicator color={theme.colors.primary} />
        ) : (
          <>
            <Ionicons name="save-outline" size={18} color={theme.colors.primary} />
            <Text style={styles.secondaryBtnText}>Düzeltmeleri kaydet</Text>
          </>
        )}
      </Pressable>

      {canNotify ? (
        <View style={styles.notifyBlock}>
          <Text style={styles.title}>Bildir (KBS)</Text>
          {roomsLoading ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : roomChips.length === 0 ? (
            <Text style={styles.hint}>OPS odası yok. Admin → KBS Ayarları’ndan oda ekleyin.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {roomChips.map((r) => {
                const on = roomId === r.id;
                return (
                  <Pressable
                    key={r.id}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => setRoomId(r.id)}
                    disabled={busy}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{r.room_number}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <Pressable
            style={[styles.primaryBtn, busy && styles.btnDisabled]}
            onPress={() => void onNotify()}
            disabled={busy || !roomId}
          >
            {notifying ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="paper-plane" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>Bildir</Text>
              </>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  editable,
  autoCap,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  editable: boolean;
  autoCap?: 'characters' | 'words' | 'none';
  keyboardType?: 'default' | 'numbers-and-punctuation';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        autoCapitalize={autoCap ?? 'words'}
        keyboardType={keyboardType ?? 'default'}
        placeholderTextColor={theme.colors.textMuted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    padding: 14,
    gap: 10,
    marginBottom: 14,
  },
  title: { fontSize: 15, fontWeight: '900', color: theme.colors.text },
  hint: { fontSize: 12, color: theme.colors.textSecondary, lineHeight: 18 },
  field: { gap: 4 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
  },
  secondaryBtnText: { color: theme.colors.primary, fontWeight: '900' },
  notifyBlock: { gap: 10, marginTop: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.colors.borderLight },
  chipRow: { gap: 8, paddingVertical: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: theme.colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  chipOn: { backgroundColor: '#dbeafe', borderColor: theme.colors.primary },
  chipText: { fontWeight: '800', color: theme.colors.text },
  chipTextOn: { color: theme.colors.primary },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
  },
  primaryBtnText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  btnDisabled: { opacity: 0.65 },
});
