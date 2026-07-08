import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { theme } from '@/constants/theme';
import { useGuestScanSessionStore } from '@/stores/guestScanSessionStore';
import { validateGuestScanItem } from '@/lib/guestScan/validateGuestItem';
import { playKbsScanSound } from '@/lib/kbsScanSounds';
import type { GuestScanItem } from '@/lib/guestScan/types';
import { formatIsoDateTr } from '@/lib/scanner/mrzDates';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { upsertGuestDocumentLocal } from '@/lib/kbsDocumentUpsertLocal';
import { MRZ_OCR_ENGINE_VISION_MLKIT } from '@/lib/scanner/mrzOcrEngine';
import type { ParsedDocument } from '@/lib/scanner/types';

const SOUND_KEY = 'kbs_mrz_scan_sound_enabled';

function FieldRow(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  warn?: boolean;
  issue?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        style={[styles.input, props.warn && styles.inputWarn, props.issue && styles.inputIssue]}
        value={props.value}
        onChangeText={props.onChange}
        placeholder="—"
      />
      {props.warn ? <Text style={styles.warnTag}>{'Kontrol önerilir'}</Text> : null}
    </View>
  );
}

export default function KbsGuestConfirmScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const pending = useGuestScanSessionStore((s) => s.pendingConfirmItem);
  const addItem = useGuestScanSessionStore((s) => s.addItem);
  const setPending = useGuestScanSessionStore((s) => s.setPendingConfirmItem);
  const [draft, setDraft] = useState<GuestScanItem | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [archiveBusy, setArchiveBusy] = useState(false);

  useEffect(() => {
    if (pending) setDraft({ ...pending });
    else router.back();
  }, [pending, router]);

  useEffect(() => {
    void AsyncStorage.getItem(SOUND_KEY).then((v) => setSoundOn(v !== '0'));
  }, []);

  const issues = useMemo(() => (draft ? validateGuestScanItem(draft) : []), [draft]);
  const issueFields = new Set(issues.map((i) => i.field));

  if (!draft) return null;

  const patch = (p: Partial<GuestScanItem>) => setDraft((d) => (d ? { ...d, ...p } : d));

  const personKindLabel =
    draft.guestType === 'tc_citizen'
      ? t('kbsPersonTc')
      : draft.guestType === 'ykn_foreign'
        ? t('kbsPersonYkn')
        : t('kbsPersonForeign');

  const sourceLabel =
    draft.sourceType === 'gallery'
      ? t('kbsGuestSourceGallery')
      : draft.sourceType === 'nfc'
        ? t('kbsGuestSourceNfc')
        : t('kbsGuestSourceCamera');

  const rescan = () => {
    setPending(null);
    router.replace({ pathname: '/staff/kbs/guests/scan', params: { mode: mode ?? 'single' } } as never);
  };

  const saveToGroup = async () => {
    await addItem(draft);
    await playKbsScanSound('group_add', soundOn);
    setPending(null);
    router.replace('/staff/kbs/guests/group' as never);
  };

  const reportNow = () => {
    if (issues.length > 0) {
      Alert.alert(t('kbsGuestMissingTitle'), t('kbsGuestMissingBody'));
      return;
    }
    void addItem(draft).then(() => {
      setPending(null);
      router.push('/staff/kbs/guests/room' as never);
    });
  };

  const saveArchiveOnly = async () => {
    const base = draft.parsed;
    const docNo = (draft.identityNo ?? draft.passportNo ?? base?.documentNumber ?? '').trim();
    const fn = (draft.firstName ?? base?.firstName ?? '').trim();
    const ln = (draft.lastName ?? base?.lastName ?? '').trim();
    if (!docNo || !fn || !ln) {
      Alert.alert(t('kbsGuestMissingTitle'), t('staffPassportsEmpty'));
      return;
    }
    const parsed: ParsedDocument = {
      documentType:
        base?.documentType ??
        (draft.documentType === 'passport' ? 'passport' : draft.documentType === 'tc_id' ? 'id_card' : 'other'),
      fullName: [fn, ln].filter(Boolean).join(' ').trim() || base?.fullName || null,
      firstName: fn || null,
      lastName: ln || null,
      middleName: base?.middleName ?? null,
      documentNumber: docNo,
      nationalityCode: draft.nationality ?? base?.nationalityCode ?? null,
      issuingCountryCode: draft.country ?? base?.issuingCountryCode ?? null,
      birthDate: draft.birthDate ?? base?.birthDate ?? null,
      expiryDate: draft.passportExpiryDate ?? base?.expiryDate ?? null,
      gender: draft.gender ?? base?.gender ?? null,
      rawMrz: draft.rawMrz ?? base?.rawMrz ?? null,
      confidence: draft.confidenceScore ?? base?.confidence ?? null,
      checksumsValid: base?.checksumsValid ?? null,
      warnings: base?.warnings ?? [],
    };
    setArchiveBusy(true);
    try {
      const res = await upsertGuestDocumentLocal({
        parsed,
        scanConfidence: parsed.confidence,
        rawMrz: parsed.rawMrz,
        deferReady: true,
        ocrEngine: MRZ_OCR_ENGINE_VISION_MLKIT,
        kbsPersonKind: draft.guestType,
        usageKind: draft.usageKind,
        documentSeries: draft.documentSerialNo,
        plateNumber: draft.plateNumber,
        guestPhone: draft.guestPhone,
        forwardDated: draft.forwardDated,
        fatherName: draft.fatherName,
        motherName: draft.motherName,
      });
      if (!res.ok) {
        Alert.alert(t('error'), res.message);
        return;
      }
      await playKbsScanSound('read', soundOn);
      setPending(null);
      Alert.alert(t('staffMrzArchiveSavedTitle'), t('staffMrzArchiveSavedBody'), [
        { text: t('staffMrzContinueScan'), onPress: () => router.replace('/staff/kbs/guests/scan' as never) },
        { text: t('staffPassportsTitle'), onPress: () => router.replace('/staff/profile/passports' as never) },
      ]);
    } finally {
      setArchiveBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }}>
      <Text style={styles.h1}>{t('kbsGuestConfirmReadTitle')}</Text>
      <Text style={styles.meta}>{sourceLabel} · {personKindLabel}</Text>

      {issues.length > 0 ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{t('kbsGuestMissingTitle')}</Text>
        </View>
      ) : null}

      <FieldRow
        label={t('kbsGuestFirstName')}
        value={draft.firstName ?? ''}
        onChange={(v) => patch({ firstName: v })}
        issue={issueFields.has('firstName')}
        warn={draft.lowConfidenceFields.includes('name')}
      />
      <FieldRow
        label={t('kbsGuestLastName')}
        value={draft.lastName ?? ''}
        onChange={(v) => patch({ lastName: v })}
        issue={issueFields.has('lastName')}
        warn={draft.lowConfidenceFields.includes('name')}
      />
      <FieldRow
        label={t('kbsGuestIdentityNo')}
        value={draft.identityNo ?? draft.passportNo ?? ''}
        onChange={(v) =>
          patch(
            draft.guestType === 'foreign'
              ? { passportNo: v, identityNo: null }
              : { identityNo: v, passportNo: null }
          )
        }
        issue={issueFields.has('identityNo') || issueFields.has('passportNo')}
        warn={draft.lowConfidenceFields.includes('documentNumber')}
      />
      <FieldRow
        label={t('kbsGuestSerialNo')}
        value={draft.documentSerialNo ?? ''}
        onChange={(v) => patch({ documentSerialNo: v })}
        issue={issueFields.has('documentSerialNo')}
      />
      <FieldRow
        label={t('kbsGuestBirthDate')}
        value={draft.birthDate ? formatIsoDateTr(draft.birthDate) : ''}
        onChange={(v) => patch({ birthDate: v })}
        issue={issueFields.has('birthDate')}
      />
      <FieldRow
        label={t('kbsGuestNationality')}
        value={draft.nationality ?? draft.country ?? ''}
        onChange={(v) => patch({ nationality: v, country: v })}
        issue={issueFields.has('nationality')}
      />
      {draft.guestType === 'foreign' || draft.documentType === 'passport' ? (
        <FieldRow
          label={t('kbsGuestExpiryDate')}
          value={draft.passportExpiryDate ? formatIsoDateTr(draft.passportExpiryDate) : ''}
          onChange={(v) => patch({ passportExpiryDate: v })}
          issue={issueFields.has('passportExpiryDate')}
        />
      ) : null}
      {draft.guestType === 'foreign' ? (
        <FieldRow
          label={t('kbsGuestGender')}
          value={
            draft.gender === 'M' ? 'E' : draft.gender === 'F' ? 'K' : draft.gender === 'X' ? 'X' : ''
          }
          onChange={(v) => {
            const u = v.trim().toUpperCase();
            const g =
              u === 'E' || u === 'M' || u === 'ERKEK' ? 'M' : u === 'K' || u === 'F' || u === 'KADIN' ? 'F' : u === 'X' ? 'X' : null;
            patch({ gender: g });
          }}
          issue={issueFields.has('gender')}
        />
      ) : null}
      <FieldRow
        label={t('kbsGuestFather')}
        value={draft.fatherName ?? ''}
        onChange={(v) => patch({ fatherName: v })}
        issue={issueFields.has('fatherName')}
      />
      <FieldRow
        label={t('kbsGuestMother')}
        value={draft.motherName ?? ''}
        onChange={(v) => patch({ motherName: v })}
        issue={issueFields.has('motherName')}
      />

      <Text style={styles.section}>{t('kbsGuestStaySection')}</Text>
      <FieldRow
        label={t('kbsGuestPhone')}
        value={draft.guestPhone ?? ''}
        onChange={(v) => patch({ guestPhone: v })}
      />
      <FieldRow
        label={t('kbsGuestPlate')}
        value={draft.plateNumber ?? ''}
        onChange={(v) => patch({ plateNumber: v })}
      />

      <TouchableOpacity
        style={[styles.archiveBtn, archiveBusy && { opacity: 0.65 }]}
        onPress={() => void saveArchiveOnly()}
        disabled={archiveBusy}
      >
        <Text style={styles.archiveText}>{t('staffMrzSaveArchiveOnly')}</Text>
      </TouchableOpacity>
      <Text style={styles.archiveHint}>{t('staffMrzSaveArchiveHint')}</Text>
      <TouchableOpacity style={styles.primaryBtn} onPress={reportNow}>
        <Text style={styles.primaryText}>{t('kbsGuestReportOne')}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryBtn} onPress={() => void saveToGroup()}>
        <Text style={styles.secondaryText}>{t('kbsGuestAddToGroup')}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.ghostBtn} onPress={rescan}>
        <Text style={styles.ghostText}>{t('kbsGuestRescan')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary, padding: 16 },
  h1: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
  meta: { fontSize: 13, color: theme.colors.textSecondary, marginBottom: 12 },
  banner: { backgroundColor: '#fef2f2', padding: 12, borderRadius: 10, marginBottom: 12 },
  bannerText: { color: '#b91c1c', fontWeight: '700' },
  section: { fontSize: 16, fontWeight: '800', marginTop: 16, marginBottom: 8, color: theme.colors.text },
  field: { marginBottom: 10 },
  label: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary, marginBottom: 4 },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    padding: 12,
    fontSize: 15,
    color: theme.colors.text,
  },
  inputWarn: { borderColor: '#f59e0b' },
  inputIssue: { borderColor: '#ef4444' },
  warnTag: { fontSize: 11, color: '#b45309', marginTop: 4 },
  archiveBtn: {
    backgroundColor: '#0369a1',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  archiveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  archiveHint: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 6, marginBottom: 4, lineHeight: 17 },
  primaryBtn: {
    backgroundColor: theme.colors.primary,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  secondaryBtn: {
    backgroundColor: theme.colors.surface,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  secondaryText: { color: theme.colors.text, fontWeight: '800' },
  ghostBtn: { padding: 14, alignItems: 'center', marginTop: 6 },
  ghostText: { color: theme.colors.textSecondary, fontWeight: '700' },
});
