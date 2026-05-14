import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  AppState,
  ActivityIndicator,
  Platform,
  Modal,
  ScrollView,
  Pressable,
  TextInput,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';
import { Camera, CameraView } from 'expo-camera';
import { parseMrzToNormalized } from '@/lib/scanner/mrzParser';
import type { ParsedDocument } from '@/lib/scanner/types';
import { formatIsoDateTr } from '@/lib/scanner/mrzDates';
import { formatIcao3ForTr } from '@/lib/scanner/mrzIssuingLabel';
import { extractMrzFromLines } from '@/lib/scanner/mrzExtractLines';
import { ocrLinesLookLikeMrz } from '@/lib/scanner/mrzPresence';
import { MRZ_OCR_ENGINE_EXPO, ocrLinesFromImage } from '@/lib/scanner/ocrLinesFromImage';
import { canSaveMrzDocument } from '@/lib/scanner/mrzScanGate';
import {
  MRZ_FRAME_BORDER,
  MRZ_FRAME_PILL_BG,
  frameKindFromGate,
  type MrzCameraFrameKind,
} from '@/lib/scanner/mrzFrameTheme';
import * as FileSystem from 'expo-file-system';
import { apiPost } from '@/lib/kbsApi';
import { upsertGuestDocumentLocal } from '@/lib/kbsDocumentUpsertLocal';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { canStaffUseMrzScan } from '@/lib/kbsMrzAccess';
import { inferKbsPersonKind, type KbsPersonKind, type UsageKind } from '@/lib/kbsInferPersonKind';
import { fingerprintFromMrzQueued, useKbsMrzBatchStore } from '@/stores/kbsMrzBatchStore';
import { playMrzReadSuccessBeep } from '@/lib/mrzScanBeep';
import { triggerMrzSuccessHaptic } from '@/lib/mrzScanHaptics';

type UpsertData = { guestId: string; guestDocumentId: string; scanStatus: string };

/** Düşük çözünürlüklü peek karesi: tam kayıt öncesi MRZ’nin gerçekten doğrulanabilir olduğunu doğrular. */
function peekGateValidMrzFromLines(lines: string[]): { mrz: string; parsed: ParsedDocument } | null {
  if (!ocrLinesLookLikeMrz(lines)) return null;
  const mrz = extractMrzFromLines(lines);
  if (!mrz?.trim()) return null;
  const parsed = parseMrzToNormalized(mrz);
  const gate = canSaveMrzDocument({ rawMrz: mrz, parsed });
  if (!gate.allowed) return null;
  return { mrz, parsed };
}

/** `onCameraReady` sonrası bu süre dolmadan otomatik kare örneklemesi başlamaz. */
const MRZ_AUTO_CAPTURE_GRACE_MS = 1800;
/** Otomatik mod: aynı MRZ hash’inin peş peşe doğrulanması (yanlış pozitif azaltma). */
const MRZ_STREAK_AUTO_NEEDED = 2;
const MRZ_STREAK_WINDOW_MS = 3800;
const MRZ_LIVE_SAMPLE_MS = 920;
const MRZ_CONFIDENCE_WARN_BELOW = 0.92;
const MRZ_SOUND_PREF_KEY = 'kbs_mrz_scan_sound_enabled';

export default function KbsScanScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  type PermStatus = 'granted' | 'denied' | 'undetermined';
  const [permStatus, setPermStatus] = useState<PermStatus | null>(null);
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [requesting, setRequesting] = useState(false);

  const cameraRef = useRef<CameraView | null>(null);
  const [cameraMounted, setCameraMounted] = useState(false);
  /** expo-camera: önizleme hazır (`onCameraReady`). takePictureAsync bundan önce çağrılmamalı. */
  const [cameraReady, setCameraReady] = useState(false);
  const cameraReadyRef = useRef(false);
  /** Bu zaman damgasından önce otomatik kare örneklemesi yok (ms epoch). */
  const autoCaptureAllowedAfterRef = useRef(0);
  const [busy, setBusy] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [stepLabel, setStepLabel] = useState<string | null>(null);
  const [frameKind, setFrameKind] = useState<MrzCameraFrameKind>('hunting');
  const [detailOpen, setDetailOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const successPulse = useRef(new Animated.Value(0)).current;

  const inFlightRef = useRef(false);
  const frameKindRef = useRef(frameKind);
  const mrzStreakRef = useRef(0);
  const lastStreakHashRef = useRef<string | null>(null);
  const lastStreakTsRef = useRef(0);
  const busyRef = useRef(false);
  const pendingSaveRef = useRef<{
    parsed: ParsedDocument;
    mrzLine: string;
  } | null>(null);
  const ocrErrAlertRef = useRef(false);
  const camErrAlertRef = useRef(false);

  const [pendingSave, setPendingSave] = useState<{
    parsed: ParsedDocument;
    mrzLine: string;
  } | null>(null);
  const [lastMrz, setLastMrz] = useState<string | null>(null);
  const [lastParsed, setLastParsed] = useState<ParsedDocument | null>(null);
  const [lastOcrPreview, setLastOcrPreview] = useState<string | null>(null);
  const [upsertResult, setUpsertResult] = useState<UpsertData | null>(null);
  const lastCommittedMrzRef = useRef<string | null>(null);

  const startBatchSession = useKbsMrzBatchStore((s) => s.startSession);
  const bumpQueued = useKbsMrzBatchStore((s) => s.bumpQueued);
  const batchKey = useKbsMrzBatchStore((s) => s.batchKey);
  const queuedCount = useKbsMrzBatchStore((s) => s.queuedCount);
  const hasQueuedConflict = useKbsMrzBatchStore((s) => s.hasQueuedConflict);
  const registerQueuedFingerprint = useKbsMrzBatchStore((s) => s.registerQueuedFingerprint);

  const [kbsPersonKind, setKbsPersonKind] = useState<KbsPersonKind>('foreign');
  const [usageKind, setUsageKind] = useState<UsageKind>('konaklama');
  const [documentSeries, setDocumentSeries] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [motherName, setMotherName] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [forwardDated, setForwardDated] = useState(false);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editDocNumber, setEditDocNumber] = useState('');
  const [editBirthDate, setEditBirthDate] = useState('');
  const [editExpiryDate, setEditExpiryDate] = useState('');
  const [editNationality, setEditNationality] = useState('');
  const successBeepVariantRef = useRef(0);
  /** Karanlık ortam: MRZ için flaş (varsayılan açık; üst bardan kapatılabilir). */
  const [torchEnabled, setTorchEnabled] = useState(true);
  /** Ardışık peek’te MRZ doğrulandı; tam çekimden hemen önce kullanıcıya gösterilir. */
  const [mrzDetectWarmup, setMrzDetectWarmup] = useState(false);

  const staff = useAuthStore((s) => s.staff);
  const allowedMrz = canStaffUseMrzScan(staff);
  useEffect(() => {
    if (allowedMrz) startBatchSession();
  }, [allowedMrz, startBatchSession]);
  useEffect(() => {
    void (async () => {
      try {
        const v = await AsyncStorage.getItem(MRZ_SOUND_PREF_KEY);
        if (v === '0') setSoundEnabled(false);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const persistSoundPref = useCallback(async (on: boolean) => {
    setSoundEnabled(on);
    try {
      await AsyncStorage.setItem(MRZ_SOUND_PREF_KEY, on ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!staff) return;
    if (!canStaffUseMrzScan(staff)) {
      router.replace('/staff' as never);
    }
  }, [staff, router]);

  const refreshPermission = useCallback(async () => {
    try {
      const p = await Camera.getCameraPermissionsAsync();
      setPermStatus(p.status as PermStatus);
      setCanAskAgain(p.canAskAgain ?? true);
    } catch {
      setPermStatus('undetermined');
      setCanAskAgain(true);
    }
  }, []);

  useEffect(() => {
    refreshPermission();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshPermission();
    });
    return () => sub.remove();
  }, [refreshPermission]);

  useEffect(() => {
    if (permStatus !== 'granted') {
      setCameraMounted(false);
      return;
    }
    const delay = Platform.OS === 'android' ? 680 : 160;
    const mountTimer = setTimeout(() => setCameraMounted(true), delay);
    return () => clearTimeout(mountTimer);
  }, [permStatus]);

  useEffect(() => {
    if (!cameraMounted) {
      setCameraReady(false);
      cameraReadyRef.current = false;
      autoCaptureAllowedAfterRef.current = 0;
      setMrzDetectWarmup(false);
    }
  }, [cameraMounted]);

  useEffect(() => {
    cameraReadyRef.current = cameraReady;
  }, [cameraReady]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  useEffect(() => {
    frameKindRef.current = frameKind;
  }, [frameKind]);
  useEffect(() => {
    pendingSaveRef.current = pendingSave;
    if (!pendingSave) return;
    const p = pendingSave.parsed;
    setEditFirstName(p.firstName ?? '');
    setEditLastName(p.lastName ?? '');
    setEditDocNumber(p.documentNumber ?? '');
    setEditBirthDate(p.birthDate && p.birthDate.length >= 10 ? p.birthDate.slice(0, 10) : '');
    setEditExpiryDate(p.expiryDate && p.expiryDate.length >= 10 ? p.expiryDate.slice(0, 10) : '');
    setEditNationality(p.nationalityCode ?? '');
    setKbsPersonKind(inferKbsPersonKind(p));
    setUsageKind('konaklama');
    setDocumentSeries('');
    setFatherName('');
    setMotherName('');
    setPlateNumber('');
    setGuestPhone('');
    setForwardDated(false);
  }, [pendingSave?.mrzLine]);

  useEffect(() => {
    if (
      frameKind === 'idle' ||
      frameKind === 'hunting' ||
      frameKind === 'reading' ||
      frameKind === 'ready_save'
    )
      return;
    const ms =
      frameKind === 'success' ? 2600 : frameKind === 'no_mrz' || frameKind === 'suspect_ocr' ? 2200 : 3200;
    const id = setTimeout(() => {
      setFrameKind('hunting');
    }, ms);
    return () => clearTimeout(id);
  }, [frameKind]);

  const handleRequestPermission = useCallback(async () => {
    setRequesting(true);
    try {
      const result = await Camera.requestCameraPermissionsAsync();
      setPermStatus(result.status as PermStatus);
      setCanAskAgain(result.canAskAgain ?? true);
    } catch {
      setPermStatus('undetermined');
    } finally {
      setRequesting(false);
    }
  }, []);

  const buildMergedParsed = useCallback(
    (ps: { parsed: ParsedDocument; mrzLine: string }): ParsedDocument => {
      const p = ps.parsed;
      const fn = editFirstName.trim() || p.firstName;
      const ln = editLastName.trim() || p.lastName;
      const dn = editDocNumber.trim() || p.documentNumber;
      const bdRaw = editBirthDate.trim();
      const bd2 = /^\d{4}-\d{2}-\d{2}$/.test(bdRaw) ? bdRaw : p.birthDate;
      const exRaw = editExpiryDate.trim();
      const ex2 = /^\d{4}-\d{2}-\d{2}$/.test(exRaw) ? exRaw : p.expiryDate;
      const nat = editNationality.trim().toUpperCase().slice(0, 3) || p.nationalityCode;
      const fullName = [fn, ln].filter(Boolean).join(' ').trim() || p.fullName;
      return {
        ...p,
        firstName: fn,
        lastName: ln,
        documentNumber: dn,
        birthDate: bd2,
        expiryDate: ex2,
        nationalityCode: nat,
        fullName,
      };
    },
    [editFirstName, editLastName, editDocNumber, editBirthDate, editExpiryDate, editNationality]
  );

  /**
   * Canlı önizleme üzerinden tek kare örneklenir → OCR → MRZ doğrulama.
   * expo-camera kısıtı: ham piksel buffer’ı yok; kare diske yazılmadan hemen silinir (galeri yok).
   */
  const runLiveMrzSample = useCallback(
    async (opts?: { manual?: boolean }) => {
      if (inFlightRef.current) return;
      if (!cameraMounted) return;
      if (!cameraReadyRef.current) return;
      if (pendingSaveRef.current) return;
      if (busyRef.current) return;

      const manual = opts?.manual === true;
      if (!manual && Date.now() < autoCaptureAllowedAfterRef.current) return;

      setUpsertResult(null);
      inFlightRef.current = true;
      setCapturing(true);
      setFrameKind('reading');
      setStepLabel(manual ? 'MRZ analizi…' : t('kbsMrzScanBusy'));

      let sampleUri: string | null = null;
      try {
        const camAny = cameraRef.current as any;
        if (!camAny?.takePictureAsync) {
          if (!camErrAlertRef.current) {
            camErrAlertRef.current = true;
            Alert.alert(t('kbsCameraAlertTitle'), t('kbsPhotoModeUnavailable'));
          }
          setFrameKind('idle');
          return;
        }

        const q = torchEnabled ? 0.87 : manual ? 0.86 : 0.8;
        const photo = await camAny.takePictureAsync({ quality: q, skipProcessing: true });
        sampleUri = (photo?.uri as string | undefined) ?? null;
        if (!sampleUri) {
          setFrameKind(manual ? 'no_mrz' : 'hunting');
          return;
        }

        const { lines } = await ocrLinesFromImage(sampleUri);
        setLastOcrPreview(`OCR | ${lines.slice(0, 10).join(' | ') || '—'}`);

        const gated = peekGateValidMrzFromLines(lines);
        if (!gated) {
          mrzStreakRef.current = 0;
          lastStreakHashRef.current = null;
          lastStreakTsRef.current = 0;
          setMrzDetectWarmup(false);
          setLastMrz(null);
          setLastParsed(null);
          setFrameKind(manual ? 'no_mrz' : 'hunting');
          return;
        }

        const { mrz, parsed: preParsed } = gated;
        let streakOk = manual;
        if (!manual) {
          const h = gated.mrz.trim();
          const now = Date.now();
          if (lastStreakHashRef.current !== h || now - lastStreakTsRef.current > MRZ_STREAK_WINDOW_MS) {
            mrzStreakRef.current = 1;
            lastStreakHashRef.current = h;
            lastStreakTsRef.current = now;
          } else {
            mrzStreakRef.current += 1;
          }
          if (mrzStreakRef.current >= 1 && mrzStreakRef.current < MRZ_STREAK_AUTO_NEEDED) {
            setMrzDetectWarmup(true);
          } else {
            setMrzDetectWarmup(false);
          }
          streakOk = mrzStreakRef.current >= MRZ_STREAK_AUTO_NEEDED;
        }

        if (!streakOk) {
          setFrameKind('hunting');
          return;
        }

        mrzStreakRef.current = 0;
        lastStreakHashRef.current = null;
        lastStreakTsRef.current = 0;
        setMrzDetectWarmup(false);

        if (mrz === lastCommittedMrzRef.current) {
          Alert.alert(t('kbsSameDocumentTitle'), t('kbsSameDocumentMessage'));
          setFrameKind('hunting');
          return;
        }

        const fp = fingerprintFromMrzQueued({
          mrzLine: mrz,
          documentNumber: preParsed.documentNumber,
          birthDate: preParsed.birthDate,
          nationalityCode: preParsed.nationalityCode,
          firstName: preParsed.firstName,
          lastName: preParsed.lastName,
        });
        if (hasQueuedConflict(fp)) {
          Alert.alert('Zaten listede', 'Bu belge bu MRZ oturumunda zaten sıraya alınmış.');
          setFrameKind('hunting');
          return;
        }

        setLastMrz(mrz);
        setLastParsed(preParsed);

        setPendingSave({ parsed: preParsed, mrzLine: mrz });
        setFrameKind('ready_save');

        const v = successBeepVariantRef.current;
        successBeepVariantRef.current = v + 1;
        void playMrzReadSuccessBeep(v, soundEnabled);
        triggerMrzSuccessHaptic(v, true);
        successPulse.setValue(0);
        Animated.sequence([
          Animated.timing(successPulse, { toValue: 1, duration: 140, useNativeDriver: true }),
          Animated.timing(successPulse, { toValue: 0, duration: 520, useNativeDriver: true }),
        ]).start();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === 'OCR_NOT_SUPPORTED' || msg.includes('OCR_NOT_SUPPORTED')) {
          if (!ocrErrAlertRef.current) {
            ocrErrAlertRef.current = true;
            Alert.alert(t('scanErrorTitle'), t('ocrNotSupportedOnDevice'));
          }
          setFrameKind('idle');
          return;
        }
        setFrameKind(manual ? 'suspect_ocr' : 'hunting');
      } finally {
        if (sampleUri) {
          try {
            await FileSystem.deleteAsync(sampleUri, { idempotent: true });
          } catch {
            /* ignore */
          }
        }
        inFlightRef.current = false;
        setCapturing(false);
        setStepLabel(null);
      }
    },
    [cameraMounted, t, torchEnabled, soundEnabled, hasQueuedConflict, successPulse]
  );

  useEffect(() => {
    if (!cameraMounted || !cameraReady || permStatus !== 'granted') return undefined;
    if (pendingSave) return undefined;
    const id = setInterval(() => {
      void runLiveMrzSample();
    }, MRZ_LIVE_SAMPLE_MS);
    return () => clearInterval(id);
  }, [cameraMounted, cameraReady, permStatus, pendingSave, runLiveMrzSample]);

  const buildUpsertPayload = useCallback(
    (ps: { parsed: ParsedDocument; mrzLine: string }, deferReady: boolean) => {
      const merged = buildMergedParsed(ps);
      return {
        arrivalGroupId: null,
        parsed: merged,
        scanConfidence: merged.confidence,
        rawMrz: merged.rawMrz,
        ocrEngine: MRZ_OCR_ENGINE_EXPO,
        deferReady,
        kbsPersonKind,
        usageKind,
        documentSeries: documentSeries.trim() || null,
        plateNumber: plateNumber.trim() || null,
        guestPhone: guestPhone.trim() || null,
        forwardDated,
        mrzBatchKey: batchKey,
        fatherName: fatherName.trim() || null,
        motherName: motherName.trim() || null
      };
    },
    [batchKey, buildMergedParsed, documentSeries, fatherName, forwardDated, guestPhone, kbsPersonKind, motherName, plateNumber, usageKind]
  );

  const savePendingToServer = useCallback(
    async (deferReady: boolean): Promise<boolean> => {
      if (!pendingSave) return false;
      const merged = buildMergedParsed(pendingSave);
      const gate = canSaveMrzDocument({ rawMrz: pendingSave.mrzLine, parsed: merged });
      if (!gate.allowed) {
        Alert.alert('Doğrulama', 'Düzenlenen bilgiler MRZ ile uyumsuz veya güven skoru yetersiz. Tarihleri YYYY-MM-DD kontrol edin.');
        setFrameKind(frameKindFromGate(gate.reason));
        return false;
      }
      setBusy(true);
      setFrameKind('reading');
      setStepLabel('Kaydediliyor…');
      const payload = buildUpsertPayload(pendingSave, deferReady);
      try {
        const local = await upsertGuestDocumentLocal({
          parsed: merged,
          scanConfidence: merged.confidence,
          rawMrz: merged.rawMrz,
          arrivalGroupId: null,
          ocrEngine: MRZ_OCR_ENGINE_EXPO,
          deferReady,
          kbsPersonKind,
          usageKind,
          documentSeries: documentSeries.trim() || null,
          plateNumber: plateNumber.trim() || null,
          guestPhone: guestPhone.trim() || null,
          forwardDated,
          mrzBatchKey: batchKey,
          fatherName: fatherName.trim() || null,
          motherName: motherName.trim() || null
        });
        if (local.ok) {
          lastCommittedMrzRef.current = pendingSave.mrzLine;
          setPendingSave(null);
          setUpsertResult(local.data);
          setFrameKind('success');
          if (deferReady) {
            bumpQueued();
            registerQueuedFingerprint(
              fingerprintFromMrzQueued({
                mrzLine: pendingSave.mrzLine,
                documentNumber: merged.documentNumber,
                birthDate: merged.birthDate,
                nationalityCode: merged.nationalityCode,
                firstName: merged.firstName,
                lastName: merged.lastName,
              })
            );
          }
          return true;
        }
        const res = await apiPost<UpsertData>('/documents/upsert', payload);
        if (!res.ok) {
          const vps = res.error.message ?? '';
          if (/checksum|MRZ|parse|OCR|bad request/i.test(vps)) {
            setFrameKind('checksum_bad');
          } else {
            setFrameKind('ready_save');
          }
          Alert.alert(
            t('error'),
            t('kbsSaveErrorWithVps', { localMessage: local.message, vpsMessage: vps })
          );
          return false;
        }
        lastCommittedMrzRef.current = pendingSave.mrzLine;
        setPendingSave(null);
        setUpsertResult(res.data);
        setFrameKind('success');
        if (deferReady) {
          bumpQueued();
          registerQueuedFingerprint(
            fingerprintFromMrzQueued({
              mrzLine: pendingSave.mrzLine,
              documentNumber: merged.documentNumber,
              birthDate: merged.birthDate,
              nationalityCode: merged.nationalityCode,
              firstName: merged.firstName,
              lastName: merged.lastName,
            })
          );
        }
        return true;
      } catch (e) {
        setFrameKind('ready_save');
        const msg = e instanceof Error ? e.message : t('unknownError');
        Alert.alert(t('scanErrorTitle'), msg);
        return false;
      } finally {
        setStepLabel(null);
        setBusy(false);
      }
    },
    [
      pendingSave,
      t,
      buildUpsertPayload,
      buildMergedParsed,
      kbsPersonKind,
      usageKind,
      documentSeries,
      plateNumber,
      guestPhone,
      forwardDated,
      batchKey,
      fatherName,
      motherName,
      bumpQueued,
      registerQueuedFingerprint,
    ]
  );

  const onQueueAndNext = useCallback(async () => {
    const ok = await savePendingToServer(true);
    if (ok) {
      setUpsertResult(null);
      setFrameKind('hunting');
    }
  }, [savePendingToServer]);

  const onQueueAndFinish = useCallback(async () => {
    const ok = await savePendingToServer(true);
    if (ok && batchKey) {
      router.push({ pathname: '/staff/kbs/batch', params: { batchKey } } as never);
    }
  }, [savePendingToServer, batchKey, router]);

  const onSaveReadyDirect = useCallback(async () => {
    await savePendingToServer(false);
  }, [savePendingToServer]);

  const framePillText = useMemo(() => {
    if (frameKind === 'reading') {
      return stepLabel || t('kbsMrzScanBusy');
    }
    if (frameKind === 'ready_save') {
      return 'MRZ okundu. Bilgileri kontrol edin.';
    }
    if (frameKind === 'hunting') {
      if (capturing) return t('kbsMrzScanBusy');
      if (mrzDetectWarmup) return 'MRZ aranıyor…';
      return 'Belgeyi MRZ alanı görünecek şekilde hizalayın.';
    }
    switch (frameKind) {
      case 'idle':
        return t('kbsMrzScanAlignPassportIdMrz');
      case 'no_mrz':
        return t('kbsMrzScanReadFailedHold');
      case 'suspect_ocr':
        return t('kbsMrzFrameUnsharp');
      case 'checksum_bad':
        return t('kbsMrzFrameChecksumBad');
      case 'success':
        return t('kbsMrzFrameSuccess');
      default:
        return t('kbsMrzScanAlignPassportIdMrz');
    }
  }, [frameKind, stepLabel, t, mrzDetectWarmup, capturing]);

  const fmt = (v: string | null | undefined) => (v != null && String(v).length > 0 ? String(v) : '—');

  const docTypeTr = (code: string | null | undefined) => {
    const m: Record<string, string> = {
      passport: 'Pasaport',
      id_card: 'Kimlik kartı',
      residence_permit: 'İkamet izni',
      other: 'Diğer',
    };
    return code && m[code] ? m[code] : fmt(code);
  };

  const genderTr = (g: ParsedDocument['gender']) => {
    if (g === 'M') return 'Erkek (M)';
    if (g === 'F') return 'Kadın (F)';
    if (g === 'X') return 'Belirtilmedi (X)';
    return '—';
  };

  const renderFieldsBlock = (parsed: ParsedDocument) => (
    <View style={styles.fieldsTable}>
      <Row label="Belge türü" value={docTypeTr(parsed.documentType)} />
      <Row label="Tam ad (MRZ)" value={fmt(parsed.fullName)} />
      <Row label="Ad" value={fmt(parsed.firstName)} />
      <Row label="Diğer ad / ikinci ad" value={fmt(parsed.middleName)} />
      <Row label="Soyad" value={fmt(parsed.lastName)} />
      <Row label="Belge no" value={fmt(parsed.documentNumber)} />
      <Row label="Uyruk (ICAO)" value={fmt(parsed.nationalityCode)} />
      <Row label="Veren ülke (ICAO)" value={formatIcao3ForTr(parsed.issuingCountryCode)} />
      <Row label="Doğum tarihi" value={formatIsoDateTr(parsed.birthDate)} />
      <Row label="Son geçerlilik" value={formatIsoDateTr(parsed.expiryDate)} />
      <Row label="Cinsiyet" value={genderTr(parsed.gender)} />
      <Row
        label="MRZ checksum"
        value={parsed.checksumsValid == null ? '—' : parsed.checksumsValid ? 'Geçerli' : 'Hatalı / şüpheli'}
      />
      {parsed.warnings?.length ? (
        <Text style={styles.warn}>Uyarı: {parsed.warnings.join('; ')}</Text>
      ) : null}
    </View>
  );

  const discardPending = useCallback(() => {
    mrzStreakRef.current = 0;
    lastStreakHashRef.current = null;
    lastStreakTsRef.current = 0;
    setMrzDetectWarmup(false);
    setPendingSave(null);
    setFrameKind('hunting');
  }, []);

  if (!allowedMrz) {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>Bu işlem için yetkiniz yok.</Text>
      </View>
    );
  }

  if (permStatus === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
        <Text style={styles.message}>Kamera izni kontrol ediliyor...</Text>
      </View>
    );
  }

  if (permStatus !== 'granted') {
    return (
      <View style={styles.centered}>
        <View style={styles.permCard}>
          <Text style={styles.permTitle}>MRZ Tarama</Text>
          <Text style={styles.permSub}>Pasaport/ID MRZ okumak için kamera izni gerekiyor.</Text>
          <TouchableOpacity
            style={[styles.permBtn, requesting && { opacity: 0.75 }]}
            onPress={canAskAgain ? handleRequestPermission : () => Camera.requestCameraPermissionsAsync()}
            disabled={requesting}
            activeOpacity={0.85}
          >
            {requesting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.permBtnText}>{canAskAgain ? 'Devam' : 'Ayarları aç'}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const pillBg = MRZ_FRAME_PILL_BG[frameKind];

  const shutterDisabled = capturing || busy || !!pendingSave || !cameraMounted || !cameraReady;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {!cameraMounted ? (
        <View style={[styles.centered, styles.rootCameraBg]}>
          <Text style={styles.messageLight}>Kamera hazırlanıyor...</Text>
        </View>
      ) : (
        <>
          <CameraView
            ref={(r) => {
              cameraRef.current = r;
            }}
            style={StyleSheet.absoluteFillObject}
            facing="back"
            enableTorch={torchEnabled}
            onCameraReady={() => {
              setCameraReady(true);
              cameraReadyRef.current = true;
              autoCaptureAllowedAfterRef.current = Date.now() + MRZ_AUTO_CAPTURE_GRACE_MS;
            }}
            onMountError={() => {
              setCameraReady(false);
              cameraReadyRef.current = false;
              autoCaptureAllowedAfterRef.current = 0;
            }}
          />
          <View style={styles.vignette} pointerEvents="none" />
        </>
      )}

      <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
        <View style={[styles.topBar, { paddingTop: insets.top + 4 }]}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.75 }]}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('back')}
          >
            <Ionicons name="chevron-back" size={28} color="#fff" />
          </Pressable>
          <View style={styles.topTitleWrap}>
            <Text style={styles.topTitle}>{t('kbsNavScanSerial')}</Text>
            <Text style={styles.topSubtitle} numberOfLines={2}>
              {t('kbsScanTopHintShort')}
              {queuedCount > 0 ? ` · ${queuedCount}` : ''}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
            <Pressable
              onPress={() => setTorchEnabled((v) => !v)}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.75 }]}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={torchEnabled ? t('kbsTorchOff') : t('kbsTorchOn')}
            >
              <Ionicons name={torchEnabled ? 'flashlight' : 'flashlight-outline'} size={24} color="#fff" />
            </Pressable>
            <Pressable
              onPress={() => void persistSoundPref(!soundEnabled)}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.75 }]}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={soundEnabled ? 'Ses açık' : 'Ses kapalı'}
            >
              <Ionicons name={soundEnabled ? 'volume-high-outline' : 'volume-mute-outline'} size={24} color="#fff" />
            </Pressable>
            <Pressable
              onPress={() => batchKey && router.push({ pathname: '/staff/kbs/batch', params: { batchKey } } as never)}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.75 }, !batchKey && { opacity: 0.35 }]}
              hitSlop={12}
              disabled={!batchKey}
              accessibilityRole="button"
              accessibilityLabel="Parti listesi"
            >
              <Ionicons name="people-outline" size={24} color="#fff" />
            </Pressable>
            <Pressable
              onPress={() => setDetailOpen(true)}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.75 }, !lastParsed && { opacity: 0.35 }]}
              hitSlop={12}
              disabled={!lastParsed}
              accessibilityRole="button"
              accessibilityLabel="Özet"
            >
              <Ionicons name="information-circle-outline" size={26} color="#fff" />
            </Pressable>
          </View>
        </View>

        <View style={styles.guideBlock} pointerEvents="none">
          <View style={styles.mrzFrameWrap}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.mrzPulse,
                {
                  opacity: successPulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.28] }),
                },
              ]}
            />
            <View
              style={[
                styles.mrzFrame,
                {
                  borderColor: MRZ_FRAME_BORDER[frameKind],
                  borderWidth:
                    frameKind === 'success' || frameKind === 'reading' || frameKind === 'ready_save' ? 3.5 : 3,
                },
              ]}
            />
          </View>
          <Text style={styles.frameHint}>
            {pendingSave ? 'Bilgileri kontrol edin.' : 'Belgeyi MRZ alanı görünecek şekilde hizalayın.'}
          </Text>
        </View>

        <View style={[styles.bottomDock, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
          <View style={[styles.statusPill, { backgroundColor: pillBg }]}>
            {frameKind === 'reading' || capturing ? (
              <ActivityIndicator size="small" color="#fff" style={styles.pillSpinner} />
            ) : null}
            <Text style={styles.statusPillText} numberOfLines={3}>
              {framePillText}
            </Text>
          </View>

          {!pendingSave ? (
            <View style={styles.autoRow}>
              <Text style={styles.autoHint} numberOfLines={5}>
                MRZ aranıyor… Belgeyi çerçeveye hizalayın. İki kez üst üste doğrulanınca okuma kilitlenir. Sorun
                olursa kamera ile tek kare deneyin.
              </Text>
              <Pressable
                onPress={() => void runLiveMrzSample({ manual: true })}
                disabled={shutterDisabled}
                style={({ pressed }) => [
                  styles.manualFab,
                  shutterDisabled && styles.manualFabDisabled,
                  pressed && !shutterDisabled && { opacity: 0.88 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Manuel MRZ taraması"
              >
                {capturing ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="camera" size={22} color="#fff" />}
              </Pressable>
            </View>
          ) : (
            <Text style={styles.reviewMiniHint}>Aşağıdaki karttan bilgileri onaylayın.</Text>
          )}

          {upsertResult && !pendingSave ? (
            <View style={styles.successDock}>
              <View style={styles.successRow}>
                <Ionicons name="checkmark-circle" size={22} color="#22c55e" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.successTitle}>Kayıt oluşturuldu</Text>
                  <Text style={styles.monoTiny}>Durum: {upsertResult.scanStatus}</Text>
                  <Text style={styles.monoTiny}>Belge: {upsertResult.guestDocumentId}</Text>
                </View>
              </View>
              <Text style={styles.successHint}>
                {upsertResult.scanStatus === 'scanned'
                  ? 'Partide sıraya alındı. Tüm MRZ bittikten sonra parti ekranından oda atayıp hazıra çekin.'
                  : 'KBS için oda atayıp bildirim gönderin.'}
              </Text>
              <View style={styles.successActions}>
                {upsertResult.scanStatus === 'scanned' && batchKey ? (
                  <TouchableOpacity
                    style={styles.btnMiniPrimary}
                    onPress={() => router.push({ pathname: '/staff/kbs/batch', params: { batchKey } } as never)}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.btnMiniPrimaryText}>Parti özeti</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={styles.btnMiniPrimary} onPress={() => router.push('/staff/kbs/ready')} activeOpacity={0.9}>
                  <Text style={styles.btnMiniPrimaryText}>Bildirime hazır</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnMiniGhost} onPress={() => router.push('/staff/kbs')} activeOpacity={0.9}>
                  <Text style={styles.btnMiniGhostText}>KBS menü</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>
      </View>

      <Modal
        visible={!!pendingSave}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (busy) return;
          Alert.alert('İptal', 'Okumayı iptal etmek istiyor musunuz?', [
            { text: 'Vazgeç', style: 'cancel' },
            { text: 'Yeniden tara', style: 'destructive', onPress: () => discardPending() },
          ]);
        }}
      >
        <View style={styles.reviewOverlay}>
          <View style={[styles.reviewSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.reviewGrab} />
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.reviewTitle}>MRZ başarıyla okundu</Text>
              <Text style={styles.reviewSubtitle}>Bilgileri kontrol edin. Listeye eklemeden KBS’ye gönderilmez.</Text>
              {pendingSave &&
              pendingSave.parsed.confidence != null &&
              pendingSave.parsed.confidence < MRZ_CONFIDENCE_WARN_BELOW ? (
                <Text style={styles.reviewWarn}>
                  Düşük güven skoru ({pendingSave.parsed.confidence.toFixed(2)}). Alanları MRZ ile karşılaştırın.
                </Text>
              ) : null}
              <Text style={styles.reviewSection}>Kimlik (MRZ)</Text>
              <Text style={styles.reviewLabel}>Ad</Text>
              <TextInput
                value={editFirstName}
                onChangeText={setEditFirstName}
                style={styles.reviewInput}
                placeholder="Ad"
                placeholderTextColor={theme.colors.textSecondary}
              />
              <Text style={styles.reviewLabel}>Soyad</Text>
              <TextInput
                value={editLastName}
                onChangeText={setEditLastName}
                style={styles.reviewInput}
                placeholder="Soyad"
                placeholderTextColor={theme.colors.textSecondary}
              />
              <Text style={styles.reviewLabel}>Belge numarası</Text>
              <TextInput
                value={editDocNumber}
                onChangeText={setEditDocNumber}
                style={styles.reviewInput}
                autoCapitalize="characters"
              />
              <Text style={styles.reviewLabel}>Doğum tarihi (YYYY-MM-DD)</Text>
              <TextInput value={editBirthDate} onChangeText={setEditBirthDate} style={styles.reviewInput} />
              <Text style={styles.reviewLabel}>Son geçerlilik (YYYY-MM-DD)</Text>
              <TextInput value={editExpiryDate} onChangeText={setEditExpiryDate} style={styles.reviewInput} />
              <Text style={styles.reviewLabel}>Uyruk (ICAO 3 harf)</Text>
              <TextInput
                value={editNationality}
                onChangeText={setEditNationality}
                style={styles.reviewInput}
                autoCapitalize="characters"
                maxLength={3}
              />
              <Text style={styles.reviewMeta}>
                Belge türü: {docTypeTr(pendingSave?.parsed.documentType)} · Cinsiyet:{' '}
                {genderTr(pendingSave?.parsed.gender ?? null)} · MRZ güven:{' '}
                {pendingSave?.parsed.confidence != null ? pendingSave.parsed.confidence.toFixed(2) : '—'}
              </Text>

              <Text style={styles.reviewSection}>KBS</Text>
              <Text style={styles.reviewLabel}>Müşteri tipi</Text>
              <View style={styles.chipRowLight}>
                {(['tc_citizen', 'ykn_foreign', 'foreign'] as const).map((k) => (
                  <TouchableOpacity
                    key={k}
                    style={[styles.kbsChipLight, kbsPersonKind === k && styles.kbsChipLightOn]}
                    onPress={() => setKbsPersonKind(k)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.kbsChipLightText, kbsPersonKind === k && styles.kbsChipLightTextOn]}>
                      {k === 'tc_citizen' ? 'T.C.' : k === 'ykn_foreign' ? 'YKN' : 'Yabancı'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.reviewLabel}>Kullanım şekli</Text>
              <View style={styles.chipRowLight}>
                {(['konaklama', 'gunluk', 'afetzede'] as const).map((k) => (
                  <TouchableOpacity
                    key={k}
                    style={[styles.kbsChipLight, usageKind === k && styles.kbsChipLightOn]}
                    onPress={() => setUsageKind(k)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.kbsChipLightText, usageKind === k && styles.kbsChipLightTextOn]}>
                      {k === 'konaklama' ? 'Konaklama' : k === 'gunluk' ? 'Günlük' : 'Afetzede'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.reviewLabel}>Belge seri no (KBS, isteğe bağlı)</Text>
              <TextInput
                value={documentSeries}
                onChangeText={setDocumentSeries}
                style={styles.reviewInput}
                autoCapitalize="characters"
              />
              <Text style={styles.reviewLabel}>Opsiyonel</Text>
              <TextInput value={fatherName} onChangeText={setFatherName} style={styles.reviewInput} placeholder="Baba adı" />
              <TextInput value={motherName} onChangeText={setMotherName} style={styles.reviewInput} placeholder="Ana adı" />
              <TextInput
                value={plateNumber}
                onChangeText={setPlateNumber}
                style={styles.reviewInput}
                placeholder="Plaka"
                autoCapitalize="characters"
              />
              <TextInput value={guestPhone} onChangeText={setGuestPhone} style={styles.reviewInput} placeholder="Telefon" keyboardType="phone-pad" />
              <TouchableOpacity style={styles.reviewForwardRow} onPress={() => setForwardDated((v) => !v)} activeOpacity={0.85}>
                <Ionicons name={forwardDated ? 'checkbox' : 'square-outline'} size={22} color={theme.colors.primary} />
                <Text style={styles.reviewForwardText}>İleri tarihli</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.reviewBtnPrimary, busy && { opacity: 0.65 }]}
                onPress={() => void onQueueAndNext()}
                disabled={busy}
                activeOpacity={0.9}
              >
                <Text style={styles.reviewBtnPrimaryText}>Listeye ekle ve sıradakini tara</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.reviewBtnSecondary, busy && { opacity: 0.65 }]}
                onPress={() => void onQueueAndFinish()}
                disabled={busy}
                activeOpacity={0.9}
              >
                <Text style={styles.reviewBtnSecondaryText}>Listeye ekle ve bitir</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.reviewBtnGhost, busy && { opacity: 0.65 }]}
                onPress={() => void onSaveReadyDirect()}
                disabled={busy}
                activeOpacity={0.9}
              >
                <Text style={styles.reviewBtnGhostText}>Tek seferde bildirime hazır</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.reviewBtnDiscard} onPress={discardPending} disabled={busy} activeOpacity={0.85}>
                <Text style={styles.reviewBtnDiscardText}>Yeniden tara (iptal)</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={detailOpen}
        animationType="slide"
        {...(Platform.OS === 'ios' ? { presentationStyle: 'pageSheet' as const } : {})}
        onRequestClose={() => setDetailOpen(false)}
      >
        <View style={[styles.modalHeader, { paddingTop: insets.top + 8 }]}>
          <Text style={styles.modalTitle}>Okuma özeti</Text>
          <Pressable onPress={() => setDetailOpen(false)} hitSlop={12} accessibilityRole="button">
            <Ionicons name="close" size={28} color={theme.colors.text} />
          </Pressable>
        </View>
        <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          <Text style={styles.help}>
            MRZ, kamera önizlemesinden periyodik kare örneklenerek okunur; kare dosyası galeriye eklenmez ve işlem sonunda
            silinmeye çalışılır. Sunucuya yalnızca MRZ metni ve onayladığınız form alanları gider.
          </Text>
          {lastOcrPreview ? <Text style={styles.muted}>Son OCR satırları: {lastOcrPreview}</Text> : null}
          {lastParsed ? (
            renderFieldsBlock(lastParsed)
          ) : (
            <Text style={styles.muted}>{lastOcrPreview ? '' : t('kbsScanOcrEmptyHint')}</Text>
          )}
          {lastMrz ? (
            <View style={styles.mrzBox}>
              <Text style={styles.mrzTitle}>Ham MRZ</Text>
              <Text style={styles.monoSmall}>{String(lastMrz)}</Text>
            </View>
          ) : null}
        </ScrollView>
      </Modal>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.k}>{label}</Text>
      <Text style={rowStyles.v}>{value}</Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderLight },
  k: { color: theme.colors.textSecondary, fontWeight: '700', flex: 0.42 },
  v: { color: theme.colors.text, fontWeight: '600', flex: 0.58, textAlign: 'right' },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  rootCameraBg: { backgroundColor: '#000' },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 8,
    gap: 4,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  topTitleWrap: { flex: 1, paddingHorizontal: 4, paddingTop: 2 },
  topTitle: { color: '#fff', fontWeight: '900', fontSize: 15, textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 6 },
  topSubtitle: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.88)',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 4,
  },
  guideBlock: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '18%',
    bottom: '36%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  mrzFrameWrap: {
    width: '94%',
    maxWidth: 440,
    aspectRatio: 6.2 / 2.1,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mrzPulse: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    backgroundColor: '#22c55e',
  },
  mrzFrame: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  reviewMiniHint: {
    color: 'rgba(255,255,255,0.95)',
    fontWeight: '800',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 4,
  },
  reviewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  reviewSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '88%',
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  reviewGrab: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.borderLight,
    marginBottom: 10,
  },
  reviewTitle: { fontSize: 20, fontWeight: '900', color: theme.colors.text },
  reviewSubtitle: { marginTop: 6, color: theme.colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 12 },
  reviewWarn: {
    backgroundColor: 'rgba(234,179,8,0.2)',
    borderRadius: 10,
    padding: 10,
    color: '#92400e',
    fontWeight: '700',
    marginBottom: 12,
    fontSize: 13,
  },
  reviewSection: { fontSize: 15, fontWeight: '900', color: theme.colors.text, marginTop: 8, marginBottom: 8 },
  reviewLabel: { fontSize: 12, fontWeight: '800', color: theme.colors.textSecondary, marginBottom: 4 },
  reviewInput: {
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 10,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  reviewMeta: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 8, lineHeight: 18 },
  chipRowLight: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  kbsChipLight: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  kbsChipLightOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  kbsChipLightText: { color: theme.colors.text, fontWeight: '800', fontSize: 13 },
  kbsChipLightTextOn: { color: '#fff' },
  reviewForwardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  reviewForwardText: { color: theme.colors.text, fontWeight: '700', fontSize: 14 },
  reviewBtnPrimary: {
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  reviewBtnPrimaryText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  reviewBtnSecondary: {
    backgroundColor: '#0d9488',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  reviewBtnSecondaryText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  reviewBtnGhost: {
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    marginBottom: 8,
  },
  reviewBtnGhostText: { color: theme.colors.text, fontWeight: '800', fontSize: 14 },
  reviewBtnDiscard: { alignItems: 'center', paddingVertical: 12, marginBottom: 20 },
  reviewBtnDiscardText: { color: theme.colors.textSecondary, fontWeight: '800', fontSize: 15, textDecorationLine: 'underline' },
  frameHint: {
    marginTop: 14,
    color: 'rgba(255,255,255,0.95)',
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 12,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
  },
  bottomDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    gap: 10,
    alignItems: 'center',
  },
  autoRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 2,
    marginTop: 2,
  },
  autoHint: {
    flex: 1,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 4,
  },
  manualFab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(14,165,233,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },
  manualFabDisabled: { opacity: 0.4 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 8,
    maxWidth: '96%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  pillSpinner: { marginRight: 0 },
  statusPillText: { color: '#fff', fontWeight: '800', fontSize: 13, lineHeight: 18, flex: 1 },
  shutterOuter: {
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  shutterDisabled: { opacity: 0.45 },
  shutterInner: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.35)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  shutterLabel: { color: '#fff', fontWeight: '900', fontSize: 15, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
  saveDock: { width: '100%', gap: 10, marginTop: 4 },
  saveDockScroll: { maxHeight: 340, width: '100%', marginTop: 4 },
  kbsDockTitle: { color: 'rgba(255,255,255,0.9)', fontWeight: '900', fontSize: 12, marginBottom: 6, marginTop: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  kbsChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  kbsChipOn: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  kbsChipText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  kbsChipTextOn: { color: '#fff' },
  kbsInput: {
    backgroundColor: 'rgba(15,23,42,0.75)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontWeight: '600',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  forwardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  forwardRowText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnSaveTeal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#0d9488',
    borderRadius: 16,
    paddingVertical: 14,
    width: '100%',
    marginBottom: 8,
  },
  btnSave: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#16a34a',
    borderRadius: 16,
    paddingVertical: 16,
    width: '100%',
  },
  btnSaveText: { color: '#fff', fontWeight: '900', fontSize: 17 },
  btnDiscard: { alignItems: 'center', paddingVertical: 10 },
  btnDiscardText: { color: 'rgba(255,255,255,0.95)', fontWeight: '800', fontSize: 15, textDecorationLine: 'underline' },
  successDock: {
    width: '100%',
    backgroundColor: 'rgba(15,23,42,0.92)',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    gap: 8,
    marginTop: 4,
  },
  successRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  successTitle: { fontWeight: '900', color: '#fff', marginBottom: 4, fontSize: 16 },
  successHint: { color: 'rgba(255,255,255,0.75)', fontSize: 12, lineHeight: 17 },
  monoTiny: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: 'rgba(255,255,255,0.85)', fontSize: 11 },
  successActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  btnMiniPrimary: {
    minWidth: '30%',
    flexGrow: 1,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnMiniPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  btnMiniGhost: {
    minWidth: '30%',
    flexGrow: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  btnMiniGhostText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
  },
  modalTitle: { fontSize: 18, fontWeight: '900', color: theme.colors.text },
  modalBody: { flex: 1, backgroundColor: theme.colors.backgroundSecondary, paddingHorizontal: 16, paddingTop: 12 },
  help: { color: theme.colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 8 },
  previewBlock: { gap: 8, marginBottom: 12 },
  previewLabel: { fontWeight: '800', color: theme.colors.text, fontSize: 13 },
  previewImage: { width: '100%', height: 220, backgroundColor: theme.colors.background, borderRadius: 12 },
  fieldsTable: { marginTop: 4 },
  mrzBox: { marginTop: 12, padding: 10, backgroundColor: theme.colors.surface, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.borderLight },
  mrzTitle: { fontWeight: '800', color: theme.colors.textSecondary, marginBottom: 6, fontSize: 12 },
  monoSmall: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: theme.colors.text, fontSize: 11, lineHeight: 16 },
  warn: { color: '#b45309', fontWeight: '700', marginTop: 8, fontSize: 13 },
  muted: { color: theme.colors.textSecondary, fontSize: 13, lineHeight: 19 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  message: { color: theme.colors.textSecondary, marginTop: 12 },
  messageLight: { color: 'rgba(255,255,255,0.85)', marginTop: 12 },
  permCard: { backgroundColor: theme.colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.colors.borderLight, width: '100%', maxWidth: 360 },
  permTitle: { fontSize: 18, fontWeight: '900', color: theme.colors.text, marginBottom: 6 },
  permSub: { color: theme.colors.textSecondary, lineHeight: 20, marginBottom: 12 },
  permBtn: { backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  permBtnText: { color: '#fff', fontWeight: '900' },
});
