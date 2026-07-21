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
  isKbsCaptureOcrCoreComplete,
  isKbsOcrFailed,
  isKbsOcrInProgress,
  isKbsOcrManualReview,
  isKbsOcrPartial,
  kbsCaptureHasReadableData,
} from '@/lib/kbsCaptureParsedFields';
import { fetchKbsOpsRooms } from '@/lib/kbsStaffOpsEdge';
import {
  notifyKbsCaptureToKbs,
  updateKbsCaptureManualFields,
} from '@/lib/kbsCaptureNotify';
import { validateCaptureNotifyForm } from '@/lib/kbsCaptureNotifyValidate';
import { correctKbsCapturedDocument } from '@/lib/kbsCaptureOcrCorrection';
import {
  duplicateNotifyWarning,
  fetchKbsActiveByDocument,
} from '@/lib/kbsSubmissionBoard';
import { isKbsDocInOcrQueue, requeueStuckKbsCaptureOcr } from '@/lib/kbsCaptureOcrQueue';
import { formatKbsTrDate } from '@/lib/kbsDisplayFormat';
import { resolveKbsDocumentSeries } from '@/lib/kbsDocumentSeries';
import {
  formatKbsReturningGuestWarning,
  isKbsReturningGuest,
} from '@/lib/kbsGuestDocumentIdentity';
import type { ParsedDocument } from '@/lib/scanner/types';

type Props = {
  row: KbsCapturedDocumentRow;
  canNotify: boolean;
  onUpdated: () => void;
};

type FormState = {
  firstName: string;
  lastName: string;
  middleName: string;
  docNo: string;
  birthDate: string;
  nationality: string;
  issuingCountry: string;
  gender: string;
  motherName: string;
  fatherName: string;
  expiryDate: string;
  documentSeries: string;
  placeOfBirth: string;
  personalNumber: string;
  maritalStatus: string;
};

function formFromParsed(p: ParsedDocument | null): FormState {
  const docNo = (p?.documentNumber ?? '').trim();
  const series =
    resolveKbsDocumentSeries({
      documentSeries: p?.documentSeries,
      documentNumber: docNo,
      documentType: p?.documentType,
    }) ?? '';

  return {
    firstName: p?.firstName ?? '',
    lastName: p?.lastName ?? '',
    middleName: p?.middleName ?? '',
    docNo,
    birthDate: formatKbsTrDate(p?.birthDate) ?? '',
    nationality: p?.nationalityCode ?? '',
    issuingCountry: p?.issuingCountryCode ?? '',
    gender: p?.gender ?? '',
    motherName: p?.motherName ?? '',
    fatherName: p?.fatherName ?? '',
    expiryDate: formatKbsTrDate(p?.expiryDate) ?? '',
    documentSeries: series,
    placeOfBirth: p?.placeOfBirth ?? '',
    personalNumber: p?.personalNumber ?? '',
    maritalStatus:
      p?.maritalStatus === 'married' ? 'EVLI' : p?.maritalStatus === 'single' ? 'BEKAR' : '',
  };
}

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
  const returningAlertShownRef = useRef<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [rooms, setRooms] = useState<{ id: string; room_number: string }[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [reading, setReading] = useState(false);

  const ocrBusy = reading || isKbsDocInOcrQueue(row.id);

  const patchField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    dirtyRef.current.add(key);
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  useEffect(() => {
    const p = enrichKbsParsedFromSources(row.parsed_payload);
    const next = formFromParsed(p);
    setForm((prev) => {
      if (dirtyRef.current.size === 0) return next;
      return softMergeForm(prev, next, dirtyRef.current);
    });
  }, [row.id, row.parsed_payload]);

  useEffect(() => {
    dirtyRef.current = new Set();
    autoReadDoneRef.current = null;
    returningAlertShownRef.current = null;
    setRoomId(null);
  }, [row.id]);

  useEffect(() => {
    const p = enrichKbsParsedFromSources(row.parsed_payload);
    if (!isKbsReturningGuest(p)) return;
    if (returningAlertShownRef.current === row.id) return;
    returningAlertShownRef.current = row.id;
    const msg =
      formatKbsReturningGuestWarning(p) ??
      'Bu pasaport / kimlik daha önce sisteme eklendi — daha önce geldi.';
    Alert.alert('Daha önce geldi', msg);
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

  // Arka plan OCR kuyruğu / processing bitmeden otomatik Oku tetikleme (çift okuma yok).
  // DB’de ocr_* kalıp bellek kuyruğu boşsa (app kill) → yeniden kuyruğa al veya kurtar.
  // Takılı "Okunuyor" (pending/processing + kuyruk boş) → 1.5 sn sonra otomatik derin Oku.
  useEffect(() => {
    if (autoReadDoneRef.current === row.id) return;
    if (!row.front_image_url) {
      autoReadDoneRef.current = row.id;
      return;
    }
    const p = enrichKbsParsedFromSources(row.parsed_payload);
    // Çekirdek tamam veya manuel kontrol kuyruğundaysa otomatik okuma yok
    if (isKbsCaptureOcrCoreComplete(p) || isKbsOcrManualReview(p)) {
      autoReadDoneRef.current = row.id;
      return;
    }

    let cancelled = false;
    let waitTimer: ReturnType<typeof setTimeout> | null = null;
    let forceTimer: ReturnType<typeof setTimeout> | null = null;

    const tryKick = () => {
      if (cancelled || autoReadDoneRef.current === row.id) return;
      if (isKbsDocInOcrQueue(row.id)) {
        // Kuyruk bitince tekrar dene (liste jank yok — yalnız detay)
        waitTimer = setTimeout(tryKick, 2_000);
        return;
      }
      const sideWarn = Array.isArray(p?.warnings)
        ? p!.warnings!.find((w) => w.startsWith('kbs_side:'))
        : null;
      const captureSide = sideWarn === 'kbs_side:mrz_back' ? ('mrz_back' as const) : ('front' as const);
      const stuckReading =
        isKbsOcrInProgress(p) || isKbsOcrPartial(p) || isKbsOcrFailed(p) || !kbsCaptureHasReadableData(p);

      if (!stuckReading && isKbsCaptureOcrCoreComplete(p)) {
        autoReadDoneRef.current = row.id;
        return;
      }

      const requeued = requeueStuckKbsCaptureOcr({
        docId: row.id,
        guestId: row.guest_id,
        imageUrl: row.front_image_url!,
        captureSide,
        captureSource: 'gallery',
        strategy: 'device_deep',
      });
      if (requeued) {
        forceTimer = setTimeout(() => {
          if (cancelled || autoReadDoneRef.current === row.id) return;
          if (isKbsDocInOcrQueue(row.id)) return;
          autoReadDoneRef.current = row.id;
          void runReadRef.current();
        }, 20_000);
        return;
      }
      autoReadDoneRef.current = row.id;
      void runReadRef.current();
    };

    const start = setTimeout(tryKick, 1_500);
    return () => {
      cancelled = true;
      clearTimeout(start);
      if (waitTimer) clearTimeout(waitTimer);
      if (forceTimer) clearTimeout(forceTimer);
    };
  }, [row.id, row.front_image_url, row.guest_id, row.parsed_payload, onUpdated]);

  const roomChips = useMemo(() => rooms.slice(0, 48), [rooms]);

  const toGender = (): 'M' | 'F' | 'X' | null => {
    const genderRaw = form.gender.trim().toUpperCase();
    if (genderRaw === 'M' || genderRaw === 'E' || genderRaw === 'ERKEK') return 'M';
    if (genderRaw === 'F' || genderRaw === 'K' || genderRaw === 'KADIN') return 'F';
    if (genderRaw === 'X') return 'X';
    return null;
  };

  const toMarital = (): 'married' | 'single' | null => {
    const m = form.maritalStatus.trim().toUpperCase();
    if (m === 'EVLI' || m === 'MARRIED' || m === 'E') return 'married';
    if (m === 'BEKAR' || m === 'SINGLE' || m === 'B') return 'single';
    return null;
  };

  const saveFields = async (): Promise<boolean> => {
    setSaving(true);
    const res = await updateKbsCaptureManualFields(row, {
      firstName: form.firstName,
      lastName: form.lastName,
      middleName: form.middleName.trim() || null,
      documentNumber: form.docNo,
      birthDate: form.birthDate.trim() || null,
      nationalityCode: form.nationality.trim() || null,
      issuingCountryCode: form.issuingCountry.trim() || null,
      gender: toGender(),
      motherName: (() => {
        const m = form.motherName.trim();
        if (!m || /^(anne|anne\s*ad[ıi]|mother)$/i.test(m)) return null;
        return m;
      })(),
      fatherName: (() => {
        const m = form.fatherName.trim();
        if (!m || /^(baba|baba\s*ad[ıi]|father)$/i.test(m)) return null;
        return m;
      })(),
      expiryDate: form.expiryDate.trim() || null,
      documentSeries: form.documentSeries.trim() || null,
      placeOfBirth: form.placeOfBirth.trim() || null,
      personalNumber: form.personalNumber.trim() || null,
      maritalStatus: toMarital(),
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
    const gate = validateCaptureNotifyForm(
      {
        firstName: form.firstName,
        lastName: form.lastName,
        docNo: form.docNo,
        documentSeries: form.documentSeries,
        birthDate: form.birthDate,
        nationality: form.nationality,
        roomSelected: !!roomId,
      },
      enrichKbsParsedFromSources(row.parsed_payload)
    );
    if (!gate.ok) {
      Alert.alert('KBS zorunlu alanlar', gate.message);
      return;
    }

    const runNotify = async () => {
      setNotifying(true);
      const saved = await saveFields();
      if (!saved) {
        setNotifying(false);
        return;
      }
      const res = await notifyKbsCaptureToKbs({
        guestDocumentId: row.id,
        roomId: roomId!,
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

    setNotifying(true);
    const active = await fetchKbsActiveByDocument(row.id);
    setNotifying(false);
    if (active.ok && active.data.alreadyNotified) {
      Alert.alert('Zaten bildirilmiş', duplicateNotifyWarning(active.data), [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Yine de bildir',
          style: 'destructive',
          onPress: () => void runNotify(),
        },
      ]);
      return;
    }

    await runNotify();
  };

  const busy = saving || notifying || reading;
  const docTypeLabel =
    parsed?.documentType === 'passport'
      ? 'Pasaport'
      : parsed?.documentType === 'id_card'
        ? 'Kimlik'
        : 'Belge';

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Okunan bilgiler ({docTypeLabel})</Text>
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
          ? 'Belge okunuyor… Tüm alanlar doldurulacak; yanlışsa düzeltin.'
          : 'Tüm okunan alanlar aşağıda. Yanlışsa değiştirin. Bildir yalnızca KBS zorunlu alanları gönderir.'}
      </Text>

      <Field label="Ad" value={form.firstName} onChangeText={(t) => patchField('firstName', t)} editable={!busy} />
      <Field label="Soyad" value={form.lastName} onChangeText={(t) => patchField('lastName', t)} editable={!busy} />
      <Field
        label="İkinci ad"
        value={form.middleName}
        onChangeText={(t) => patchField('middleName', t)}
        editable={!busy}
      />
      <Field
        label="Kimlik / pasaport no"
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
        label="Kişisel / ulusal no"
        value={form.personalNumber}
        onChangeText={(t) => patchField('personalNumber', t)}
        editable={!busy}
        autoCap="characters"
      />
      <Field
        label="Doğum tarihi (GG.AA.YYYY)"
        value={form.birthDate}
        onChangeText={(t) => patchField('birthDate', t)}
        editable={!busy}
        keyboardType="numbers-and-punctuation"
        placeholder="01.01.1990"
      />
      <Field
        label="Doğum yeri"
        value={form.placeOfBirth}
        onChangeText={(t) => patchField('placeOfBirth', t)}
        editable={!busy}
      />
      <Field
        label="Son geçerlilik (GG.AA.YYYY)"
        value={form.expiryDate}
        onChangeText={(t) => patchField('expiryDate', t)}
        editable={!busy}
        keyboardType="numbers-and-punctuation"
        placeholder="01.01.2030"
      />
      <Field
        label="Ülke / Uyruk (ISO)"
        value={form.nationality}
        onChangeText={(t) => patchField('nationality', t)}
        editable={!busy}
        autoCap="characters"
      />
      <Field
        label="Veren ülke (ISO)"
        value={form.issuingCountry}
        onChangeText={(t) => patchField('issuingCountry', t)}
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
        label="Medeni hal (EVLI/BEKAR)"
        value={form.maritalStatus}
        onChangeText={(t) => patchField('maritalStatus', t)}
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
          <Text style={styles.title}>Bildir (KBS zorunlu alanlar)</Text>
          <Text style={styles.hint}>
            Sistemde tüm bilgileri görürsünüz; Jandarma’ya yalnızca zorunlu alanlar gider.
          </Text>
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
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  editable: boolean;
  autoCap?: 'characters' | 'words' | 'none';
  keyboardType?: 'default' | 'numbers-and-punctuation';
  placeholder?: string;
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
        placeholder={placeholder ?? '—'}
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
