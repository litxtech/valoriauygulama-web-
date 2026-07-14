import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  enrichKbsParsedFromSources,
  isKbsOcrInProgress,
  kbsCaptureHasReadableData,
} from '@/lib/kbsCaptureParsedFields';
import { fetchKbsOpsRooms } from '@/lib/kbsStaffOpsEdge';
import {
  notifyKbsCaptureToKbs,
  updateKbsCaptureManualFields,
} from '@/lib/kbsCaptureNotify';
import { correctKbsCapturedDocument } from '@/lib/kbsCaptureOcrCorrection';
import type { ParsedDocument } from '@/lib/scanner/types';

type Props = {
  row: KbsCapturedDocumentRow;
  canNotify: boolean;
  onUpdated: () => void;
};

type FormState = {
  firstName: string;
  lastName: string;
  docNo: string;
  birthDate: string;
  nationality: string;
  gender: string;
  motherName: string;
  fatherName: string;
  expiryDate: string;
  documentSeries: string;
};

function formFromParsed(p: ParsedDocument | null): FormState {
  return {
    firstName: p?.firstName ?? '',
    lastName: p?.lastName ?? '',
    docNo: p?.documentNumber ?? '',
    birthDate: p?.birthDate?.slice(0, 10) ?? '',
    nationality: p?.nationalityCode ?? '',
    gender: p?.gender ?? '',
    motherName: p?.motherName ?? '',
    fatherName: p?.fatherName ?? '',
    expiryDate: p?.expiryDate?.slice(0, 10) ?? '',
    documentSeries: p?.documentSeries ?? '',
  };
}

/** Kullanıcının dokunmadığı alanları OCR ile güncelle; elle değişenler korunur. */
function softMergeForm(prev: FormState, next: FormState, dirty: Set<keyof FormState>): FormState {
  const out = { ...prev };
  (Object.keys(next) as (keyof FormState)[]).forEach((k) => {
    if (dirty.has(k)) return;
    out[k] = next[k];
  });
  return out;
}

export function KbsCaptureOpsActions({ row, canNotify, onUpdated }: Props) {
  const parsed = enrichKbsParsedFromSources(row.parsed_payload);
  const [form, setForm] = useState<FormState>(() => formFromParsed(parsed));
  const dirtyRef = useRef<Set<keyof FormState>>(new Set());
  const autoReadDoneRef = useRef<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [rooms, setRooms] = useState<{ id: string; room_number: string }[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [reading, setReading] = useState(false);

  const ocrBusy = isKbsOcrInProgress(parsed) || reading;
  const hasData = kbsCaptureHasReadableData(parsed);

  const patchField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    dirtyRef.current.add(key);
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  useEffect(() => {
    const p = enrichKbsParsedFromSources(row.parsed_payload);
    const next = formFromParsed(p);
    setForm((prev) => {
      // Yeni kayıt: dirty yoksa tamamen OCR ile doldur
      if (dirtyRef.current.size === 0) return next;
      return softMergeForm(prev, next, dirtyRef.current);
    });
  }, [row.id, row.parsed_payload]);

  useEffect(() => {
    dirtyRef.current = new Set();
    autoReadDoneRef.current = null;
    setRoomId(null);
  }, [row.id]);

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

  const runRead = useCallback(async () => {
    if (reading) return;
    setReading(true);
    try {
      const res = await correctKbsCapturedDocument(row);
      if (!res.ok) {
        Alert.alert('Oku', res.message);
        return;
      }
      dirtyRef.current = new Set();
      onUpdated();
      if (!res.coreComplete) {
        Alert.alert(
          'Kısmi okuma',
          'Belge okundu. Eksik veya hatalı alanları aşağıdan düzeltebilirsiniz.'
        );
      }
    } finally {
      setReading(false);
    }
  }, [onUpdated, reading, row]);

  const runReadRef = useRef(runRead);
  runReadRef.current = runRead;

  // Eski sistem: açılınca otomatik oku (boş / bekleyen OCR).
  useEffect(() => {
    if (autoReadDoneRef.current === row.id) return;
    if (!row.front_image_url) {
      autoReadDoneRef.current = row.id;
      return;
    }
    const p = enrichKbsParsedFromSources(row.parsed_payload);
    if (kbsCaptureHasReadableData(p) && !isKbsOcrInProgress(p)) {
      autoReadDoneRef.current = row.id;
      return;
    }
    autoReadDoneRef.current = row.id;
    void runReadRef.current();
  }, [row.id, row.front_image_url, row.parsed_payload]);

  const roomChips = useMemo(() => rooms.slice(0, 48), [rooms]);

  const saveFields = async (): Promise<boolean> => {
    setSaving(true);
    const genderRaw = form.gender.trim().toUpperCase();
    const gender =
      genderRaw === 'M' || genderRaw === 'E' || genderRaw === 'ERKEK'
        ? ('M' as const)
        : genderRaw === 'F' || genderRaw === 'K' || genderRaw === 'KADIN'
          ? ('F' as const)
          : genderRaw === 'X'
            ? ('X' as const)
            : null;

    const res = await updateKbsCaptureManualFields(row, {
      firstName: form.firstName,
      lastName: form.lastName,
      documentNumber: form.docNo,
      birthDate: form.birthDate.trim() || null,
      nationalityCode: form.nationality.trim() || null,
      gender,
      motherName: form.motherName.trim() || null,
      fatherName: form.fatherName.trim() || null,
      expiryDate: form.expiryDate.trim() || null,
      documentSeries: form.documentSeries.trim() || null,
    });
    setSaving(false);
    if (!res.ok) {
      Alert.alert('Düzelt', res.message);
      return false;
    }
    dirtyRef.current = new Set();
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
    if (!form.docNo.trim() || (!form.firstName.trim() && !form.lastName.trim())) {
      Alert.alert('Eksik alan', 'Ad/soyad ve belge numarası gerekli. Önce Oku veya elle doldurun.');
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

  const busy = saving || notifying || reading;

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Okunan bilgiler</Text>
        <Pressable
          style={[styles.readBtn, busy && styles.btnDisabled]}
          onPress={() => void runRead()}
          disabled={busy || !row.front_image_url}
        >
          {ocrBusy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="scan-outline" size={16} color="#fff" />
              <Text style={styles.readBtnText}>Oku</Text>
            </>
          )}
        </Pressable>
      </View>
      <Text style={styles.hint}>
        {ocrBusy
          ? 'Belge okunuyor… Bittiğinde alanlar dolar; yanlışsa düzeltip kaydedin.'
          : 'OCR ile doldurulur. Yanlışsa değiştirin, kaydedin' +
            (canNotify ? ' veya oda seçip Bildir’e basın.' : '.')}
      </Text>

      <Field label="Ad" value={form.firstName} onChangeText={(t) => patchField('firstName', t)} editable={!busy} />
      <Field label="Soyad" value={form.lastName} onChangeText={(t) => patchField('lastName', t)} editable={!busy} />
      <Field
        label="Belge / pasaport no"
        value={form.docNo}
        onChangeText={(t) => patchField('docNo', t)}
        editable={!busy}
        autoCap="characters"
      />
      <Field
        label="Seri no"
        value={form.documentSeries}
        onChangeText={(t) => patchField('documentSeries', t)}
        editable={!busy}
        autoCap="characters"
      />
      <Field
        label="Doğum tarihi (YYYY-MM-DD)"
        value={form.birthDate}
        onChangeText={(t) => patchField('birthDate', t)}
        editable={!busy}
        keyboardType="numbers-and-punctuation"
      />
      <Field
        label="Son geçerlilik (YYYY-MM-DD)"
        value={form.expiryDate}
        onChangeText={(t) => patchField('expiryDate', t)}
        editable={!busy}
        keyboardType="numbers-and-punctuation"
      />
      <Field
        label="Uyruk (ISO)"
        value={form.nationality}
        onChangeText={(t) => patchField('nationality', t)}
        editable={!busy}
        autoCap="characters"
      />
      <Field
        label="Cinsiyet (E/K veya M/F)"
        value={form.gender}
        onChangeText={(t) => patchField('gender', t)}
        editable={!busy}
        autoCap="characters"
      />
      <Field
        label="Anne adı"
        value={form.motherName}
        onChangeText={(t) => patchField('motherName', t)}
        editable={!busy}
      />
      <Field
        label="Baba adı"
        value={form.fatherName}
        onChangeText={(t) => patchField('fatherName', t)}
        editable={!busy}
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
        placeholder="—"
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
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { fontSize: 15, fontWeight: '900', color: theme.colors.text, flex: 1 },
  hint: { fontSize: 12, color: theme.colors.textSecondary, lineHeight: 18 },
  readBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  readBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
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
