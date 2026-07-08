/**
 * ePasaport / ICAO 9303 çip okuma — MRZ BAC anahtarı ile NFC üzerinden DG1 (+ isteğe bağlı DG2 portre).
 * Yalnızca kullanıcı NFC oturumunu başlattığında çalışır; arka planda dinleme yok.
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import i18n from 'i18next';
import type { ParsedDocument } from '@/lib/scanner/types';
import { isoDateToMrzSix } from '@/lib/scanner/mrzDates';
import { getEIdReader, isNfcNativeLinked } from '@/lib/nfcNative';
import { mapEIdChipToParsed, type EIdChipData, type NfcBacKeyInput } from '@/lib/nfcChipParse';

export type { NfcBacKeyInput } from '@/lib/nfcChipParse';

export type NfcPassportCaptureResult = {
  parsed: ParsedDocument;
  rawMrz: string | null;
  portraitUri: string;
};

export type NfcPassportReadOutcome =
  | { ok: true; data: NfcPassportCaptureResult }
  | { ok: false; code: 'unavailable' | 'native_build' | 'cancelled' | 'error'; message?: string };

/** 1×1 beyaz JPEG — portre yoksa KBS kayıt kuyruğu için yedek. */
const PLACEHOLDER_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=';

function normalizeToMrzSix(date: string): string | null {
  const s = date.trim();
  if (/^\d{6}$/.test(s)) return s;
  return isoDateToMrzSix(s);
}

/** ICAO BAC — belge no 9 karakter, eksik `<` ile doldurulur. */
export function formatBacDocumentNumber(docNo: string): string {
  return docNo.replace(/</g, '').trim().toUpperCase().padEnd(9, '<').slice(0, 9);
}

export function bacKeyFromParsed(parsed: ParsedDocument): NfcBacKeyInput | null {
  const doc = parsed.documentNumber?.replace(/</g, '').trim();
  const birth = parsed.birthDate;
  const expiry = parsed.expiryDate;
  if (!doc || !birth || !expiry) return null;
  return { documentNumber: doc, birthDate: birth, expiryDate: expiry };
}

/**
 * ICAO BAC alanları — mümkünse ham MRZ satırından (kamera kilidi).
 * TD3 satır 2: belge no (9) + doğum (YYMMDD) + bitiş (YYMMDD).
 * Parse edilmiş alanlar yedek; TR kimlikte TC ile karışmayı engeller.
 */
export function bacKeyFromMrzLock(args: {
  mrz?: string | null;
  parsed: ParsedDocument;
}): NfcBacKeyInput | null {
  const fromRaw = bacFieldsFromRawMrz(args.mrz ?? args.parsed.rawMrz);
  if (fromRaw) return fromRaw;
  return bacKeyFromParsed(args.parsed);
}

/** TD2/TD3 MRZ satırından BAC documentNumber + YYMMDD dates. */
function bacFieldsFromRawMrz(raw: string | null | undefined): NfcBacKeyInput | null {
  if (!raw?.trim()) return null;
  const lines = raw
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+/g, '').toUpperCase())
    .filter((l) => l.length >= 28 && /^[A-Z0-9<]+$/.test(l));

  if (lines.length === 0) return null;

  // TD3 passport: 2×44 — belge/doğum/bitiş satır 2'de (satır 1 P</V< ile başlar)
  const line2 =
    lines.find((l) => l.length === 44 && !/^[PV]/i.test(l)) ??
    (lines.length >= 2 && lines[1]!.length >= 28 ? lines[1]! : null) ??
    lines.find((l) => l.length >= 36 && !/^[PV]/i.test(l));

  if (line2 && line2.length >= 27) {
    const documentNumber = line2.slice(0, 9).replace(/</g, '').trim();
    const birthDate = line2.slice(13, 19);
    const expiryDate = line2.slice(21, 27);
    if (documentNumber.length >= 5 && /^\d{6}$/.test(birthDate) && /^\d{6}$/.test(expiryDate)) {
      return { documentNumber, birthDate, expiryDate };
    }
  }

  // TD1 kimlik: 3×30 — belge satır 1'de (5..14), doğum/bitiş satır 2'de
  if (lines.length >= 2 && lines[0]!.length === 30 && lines[1]!.length === 30) {
    const documentNumber = lines[0]!.slice(5, 14).replace(/</g, '').trim();
    const birthDate = lines[1]!.slice(0, 6);
    const expiryDate = lines[1]!.slice(8, 14);
    if (documentNumber.length >= 5 && /^\d{6}$/.test(birthDate) && /^\d{6}$/.test(expiryDate)) {
      return { documentNumber, birthDate, expiryDate };
    }
  }

  return null;
}

async function portraitUriFromChip(
  reader: NonNullable<ReturnType<typeof getEIdReader>>,
  faceB64?: string
): Promise<string | null> {
  if (!faceB64?.trim()) return null;
  try {
    const dataUrl = reader.imageDataUrlToJpegDataUrl(`data:image/jp2;base64,${faceB64.trim()}`);
    const b64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
    const path = `${FileSystem.cacheDirectory}nfc-portrait-${Date.now()}.jpg`;
    await FileSystem.writeAsStringAsync(path, b64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return path.startsWith('file://') ? path : `file://${path}`;
  } catch {
    return null;
  }
}

export async function writeNfcPlaceholderImageUri(): Promise<string> {
  const path = `${FileSystem.cacheDirectory}nfc-placeholder-${Date.now()}.jpg`;
  await FileSystem.writeAsStringAsync(path, PLACEHOLDER_JPEG_B64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return path.startsWith('file://') ? path : `file://${path}`;
}

/** Native EIdReader modülü binary içinde mi? */
export function isNfcPassportNativeReady(): boolean {
  if (Platform.OS === 'web') return false;
  return isNfcNativeLinked() && getEIdReader() != null;
}

export async function isNfcPassportAvailable(): Promise<boolean> {
  if (!isNfcPassportNativeReady()) return false;
  const reader = getEIdReader();
  if (!reader) return false;
  try {
    const supported = await reader.isNfcSupported();
    if (!supported) return false;
    if (Platform.OS === 'android') {
      return reader.isNfcEnabled();
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * NFC pasaport okuma — yalnızca bu fonksiyon çağrıldığında oturum açılır.
 * DG1 ham verisi ile tam MRZ (ad, soyad, uyruk, veren ülke, tarihler vb.) çıkarılır.
 */
export async function readPassportViaNfc(bac: NfcBacKeyInput): Promise<NfcPassportReadOutcome> {
  if (!isNfcNativeLinked()) {
    return { ok: false, code: 'native_build', message: i18n.t('kbsNfcNativeBuildBody') };
  }

  const reader = getEIdReader();
  if (!reader) {
    return { ok: false, code: 'unavailable', message: i18n.t('kbsNfcUnavailable') };
  }

  // Native getMRZKey padOrKeep kullanır: YYMMDD bırakın, belgeyi kısaltmayın (TD1 uzatılabilir).
  const birthDate = normalizeToMrzSix(bac.birthDate);
  const expirationDate = normalizeToMrzSix(bac.expiryDate);
  const documentNumber = bac.documentNumber.replace(/\s/g, '').toUpperCase().trim();

  if (!birthDate || !expirationDate || documentNumber.length < 5) {
    return { ok: false, code: 'error', message: i18n.t('kbsNfcBacInvalid') };
  }

  try {
    const result = (await reader.startReading({
      mrzInfo: {
        documentNumber: documentNumber.length <= 9 ? formatBacDocumentNumber(documentNumber) : documentNumber,
        birthDate,
        expirationDate,
      },
      includeImages: true,
      includeRawData: true,
      labels: {
        title: i18n.t('kbsNfcCaptureTitle'),
        requestPresentPassport: i18n.t('kbsNfcPresentPassport'),
        authenticatingWithPassport: i18n.t('kbsNfcAuthenticating'),
        reading: i18n.t('kbsNfcReading'),
        successfulRead: i18n.t('kbsNfcSuccess'),
        invalidMRZKey: i18n.t('kbsNfcInvalidMrzKey'),
        error: i18n.t('kbsNfcReadFailed'),
        cancelButton: i18n.t('cancel'),
      },
    })) as {
      status: string;
      data: EIdChipData & { originalFacePhoto?: string };
      dataGroupsBase64?: Record<string, string>;
    };

    if (result.status === 'Canceled') {
      return { ok: false, code: 'cancelled' };
    }
    if (result.status !== 'OK') {
      return { ok: false, code: 'error', message: i18n.t('kbsNfcReadFailed') };
    }

    const dg1Base64 = result.dataGroupsBase64?.DG1 ?? null;
    const { parsed, rawMrz } = mapEIdChipToParsed(result.data, { dg1Base64, bac });
    let portraitUri = await portraitUriFromChip(reader, result.data.originalFacePhoto);
    if (!portraitUri) {
      portraitUri = await writeNfcPlaceholderImageUri();
    }

    return {
      ok: true,
      data: {
        parsed: { ...parsed, rawMrz: rawMrz ?? parsed.rawMrz },
        rawMrz: rawMrz ?? parsed.rawMrz,
        portraitUri,
      },
    };
  } catch (e) {
    const msg = (e as Error)?.message?.trim() ?? '';
    if (/TurboModuleRegistry|EIdReader|could not be found/i.test(msg)) {
      return { ok: false, code: 'native_build', message: i18n.t('kbsNfcNativeBuildBody') };
    }
    return {
      ok: false,
      code: 'error',
      message: msg || i18n.t('kbsNfcReadFailed'),
    };
  } finally {
    try {
      reader.stopReading();
    } catch {
      /* ignore */
    }
  }
}

