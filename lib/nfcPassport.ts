/**
 * ePasaport / ICAO 9303 — kamera sadece BAC kilidini açar, NFC çipten tüm veriyi çeker.
 * NFC sırasında kamera unmount edilmeli; startReading asılırsa zaman aşımı ile çıkılır.
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import i18n from 'i18next';
import type { ParsedDocument } from '@/lib/scanner/types';
import { isoDateToMrzSix, mrzSixDigitsToIso } from '@/lib/scanner/mrzDates';
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
  | {
      ok: false;
      code: 'unavailable' | 'native_build' | 'cancelled' | 'error' | 'timeout';
      message?: string;
    };

const PLACEHOLDER_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=';

/** iOS sistem NFC paneli ~60sn; biz UI’yi daha erken serbest bırakırız. */
const NFC_READ_TIMEOUT_MS = Platform.OS === 'ios' ? 45000 : 35000;

function normalizeToMrzSix(date: string): string | null {
  const s = date.trim().replace(/[./]/g, '-');
  if (/^\d{6}$/.test(s)) return s;
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split('-');
    return isoDateToMrzSix(`${yyyy}-${mm}-${dd}`);
  }
  return isoDateToMrzSix(s);
}

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

export function bacKeyFromMrzLock(args: {
  mrz?: string | null;
  parsed: ParsedDocument;
}): NfcBacKeyInput | null {
  const fromRaw = bacFieldsFromRawMrz(args.mrz ?? args.parsed.rawMrz);
  if (fromRaw) return fromRaw;
  return bacKeyFromParsed(args.parsed);
}

function cleanMrzLines(raw: string): string[] {
  return raw
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[^A-Z0-9<]/gi, '').toUpperCase())
    .filter((l) => l.length >= 28);
}

function bacFieldsFromRawMrz(raw: string | null | undefined): NfcBacKeyInput | null {
  if (!raw?.trim()) return null;
  const lines = cleanMrzLines(raw);
  if (lines.length === 0) return null;

  const tryTd3Line = (line: string): NfcBacKeyInput | null => {
    if (line.length < 27) return null;
    const documentNumber = line.slice(0, 9).replace(/</g, '').trim();
    const birthDate = line.slice(13, 19);
    const expiryDate = line.slice(21, 27);
    if (documentNumber.length >= 5 && /^\d{6}$/.test(birthDate) && /^\d{6}$/.test(expiryDate)) {
      return { documentNumber, birthDate, expiryDate };
    }
    return null;
  };

  for (const line of lines) {
    if (line.length === 44 && !/^[PV]/i.test(line)) {
      const hit = tryTd3Line(line);
      if (hit) return hit;
    }
  }
  if (lines.length >= 2) {
    const hit = tryTd3Line(lines[1]!);
    if (hit) return hit;
  }
  for (const line of lines) {
    if (line.length >= 36 && !/^[PV]/i.test(line)) {
      const hit = tryTd3Line(line);
      if (hit) return hit;
    }
  }

  if (lines.length >= 2 && lines[0]!.length >= 30 && lines[1]!.length >= 30) {
    const documentNumber = lines[0]!.slice(5, 14).replace(/</g, '').trim();
    const birthDate = lines[1]!.slice(0, 6);
    const expiryDate = lines[1]!.slice(8, 14);
    if (documentNumber.length >= 5 && /^\d{6}$/.test(birthDate) && /^\d{6}$/.test(expiryDate)) {
      return { documentNumber, birthDate, expiryDate };
    }
  }

  return null;
}

function resolveBacMrzInfo(bac: NfcBacKeyInput): {
  documentNumber: string;
  birthDate: string;
  expirationDate: string;
} | null {
  const birthDate = normalizeToMrzSix(bac.birthDate);
  const expirationDate = normalizeToMrzSix(bac.expiryDate);
  const documentNumber = bac.documentNumber.replace(/\s/g, '').replace(/</g, '').toUpperCase().trim();
  if (!birthDate || !expirationDate || documentNumber.length < 5) return null;
  return {
    documentNumber: documentNumber.length <= 9 ? formatBacDocumentNumber(documentNumber) : documentNumber,
    birthDate,
    expirationDate,
  };
}

async function portraitUriFromChip(
  reader: NonNullable<ReturnType<typeof getEIdReader>>,
  faceB64?: string
): Promise<string | null> {
  if (!faceB64?.trim()) return null;
  try {
    let dataUrl = faceB64.trim();
    if (!dataUrl.startsWith('data:')) {
      dataUrl = `data:image/jpeg;base64,${dataUrl}`;
    }
    if (dataUrl.includes('image/jp2') || dataUrl.includes('image/jpeg2000')) {
      dataUrl = reader.imageDataUrlToJpegDataUrl(dataUrl);
    } else if (!dataUrl.includes('image/jpeg')) {
      try {
        dataUrl = reader.imageDataUrlToJpegDataUrl(dataUrl);
      } catch {
        /* already jpeg */
      }
    }
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

let cachedPlaceholderUri: string | null = null;

export async function writeNfcPlaceholderImageUri(): Promise<string> {
  if (cachedPlaceholderUri) return cachedPlaceholderUri;
  const path = `${FileSystem.cacheDirectory}nfc-placeholder.jpg`;
  await FileSystem.writeAsStringAsync(path, PLACEHOLDER_JPEG_B64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  cachedPlaceholderUri = path.startsWith('file://') ? path : `file://${path}`;
  return cachedPlaceholderUri;
}

export function isNfcPassportNativeReady(): boolean {
  if (Platform.OS === 'web') return false;
  return getEIdReader() != null || isNfcNativeLinked();
}

export async function isNfcPassportAvailable(): Promise<boolean> {
  if (!isNfcPassportNativeReady()) return false;
  const reader = getEIdReader();
  if (!reader) return false;
  try {
    const supported = await reader.isNfcSupported();
    if (!supported) return false;
    if (Platform.OS === 'android') {
      const enabled = await Promise.resolve(reader.isNfcEnabled());
      return !!enabled;
    }
    return true;
  } catch {
    return false;
  }
}

function nfcLabels() {
  return {
    title: i18n.t('kbsNfcCaptureTitle'),
    requestPresentPassport: i18n.t('kbsNfcPresentPassport'),
    authenticatingWithPassport: i18n.t('kbsNfcAuthenticating'),
    reading: i18n.t('kbsNfcReadingChipData'),
    successfulRead: i18n.t('kbsNfcSuccess'),
    invalidMRZKey: i18n.t('kbsNfcInvalidMrzKey'),
    error: i18n.t('kbsNfcReadFailed'),
    cancelButton: i18n.t('cancel'),
  };
}

type NativeReadResult = {
  status: string;
  data?: EIdChipData & { originalFacePhoto?: string };
  dataGroupsBase64?: Record<string, string>;
  error?: string;
};

function safeStop(reader: NonNullable<ReturnType<typeof getEIdReader>>) {
  try {
    reader.stopReading();
  } catch {
    /* iOS stub / Android dismiss — promise asılı kalsa bile UI serbest */
  }
}

function withTimeoutOrCancel<T>(
  promise: Promise<T>,
  ms: number,
  signal: { cancelled: boolean } | undefined,
  onAbort: () => void
): Promise<T | 'timeout' | 'cancelled'> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (v: T | 'timeout' | 'cancelled') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(poll);
      resolve(v);
    };

    const timer = setTimeout(() => {
      onAbort();
      finish('timeout');
    }, ms);

    const poll = setInterval(() => {
      if (signal?.cancelled) {
        onAbort();
        finish('cancelled');
      }
    }, 200);

    promise
      .then((v) => finish(v))
      .catch((e) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearInterval(poll);
        reject(e);
      });
  });
}

export type NfcReadOptions = {
  /** true olunca mevcut okuma iptal sayılır */
  signal?: { cancelled: boolean };
  timeoutMs?: number;
};

/**
 * Tek NFC oturumu. Kamera unmount edilmiş olmalı.
 * Asılı native promise → zaman aşımı / iptal ile UI kurtarılır.
 */
export async function readPassportViaNfc(
  bac: NfcBacKeyInput,
  opts?: NfcReadOptions
): Promise<NfcPassportReadOutcome> {
  if (!isNfcNativeLinked() && !getEIdReader()) {
    return { ok: false, code: 'native_build', message: i18n.t('kbsNfcNativeBuildBody') };
  }

  const reader = getEIdReader();
  if (!reader) {
    return { ok: false, code: 'unavailable', message: i18n.t('kbsNfcUnavailable') };
  }

  const mrzInfo = resolveBacMrzInfo(bac);
  if (!mrzInfo) {
    return { ok: false, code: 'error', message: i18n.t('kbsNfcBacInvalid') };
  }

  if (opts?.signal?.cancelled) {
    return { ok: false, code: 'cancelled' };
  }

  try {
    if (opts?.signal?.cancelled) {
      return { ok: false, code: 'cancelled' };
    }

    const timeoutMs = opts?.timeoutMs ?? NFC_READ_TIMEOUT_MS;
    const readPromise = reader.startReading({
      mrzInfo,
      includeImages: true,
      includeRawData: true,
      labels: nfcLabels(),
    }) as Promise<NativeReadResult>;

    const raced = await withTimeoutOrCancel(readPromise, timeoutMs, opts?.signal, () =>
      safeStop(reader)
    );

    if (raced === 'cancelled' || opts?.signal?.cancelled) {
      safeStop(reader);
      return { ok: false, code: 'cancelled' };
    }

    if (raced === 'timeout') {
      return { ok: false, code: 'timeout', message: i18n.t('kbsNfcTimeout') };
    }

    const result = raced;
    if (result.status === 'Canceled') {
      return { ok: false, code: 'cancelled' };
    }
    if (result.status !== 'OK' || !result.data) {
      return {
        ok: false,
        code: 'error',
        message: result.error || i18n.t('kbsNfcReadFailed'),
      };
    }

    const dg1Base64 = result.dataGroupsBase64?.DG1 ?? null;
    const { parsed, rawMrz } = mapEIdChipToParsed(result.data, { dg1Base64, bac });
    let portraitUri = await portraitUriFromChip(reader, result.data.originalFacePhoto);
    if (!portraitUri) {
      portraitUri = await writeNfcPlaceholderImageUri();
    }

    const bacBirth = normalizeToMrzSix(bac.birthDate);
    const bacExpiry = normalizeToMrzSix(bac.expiryDate);
    const forced: ParsedDocument = {
      ...parsed,
      documentType: parsed.documentType || 'passport',
      documentNumber: parsed.documentNumber || bac.documentNumber.replace(/</g, ''),
      birthDate: parsed.birthDate || (bacBirth ? mrzSixDigitsToIso(bacBirth, 'birth') : null),
      expiryDate: parsed.expiryDate || (bacExpiry ? mrzSixDigitsToIso(bacExpiry, 'expiry') : null),
      rawMrz: rawMrz ?? parsed.rawMrz,
      confidence: 0.99,
      warnings: [...new Set([...(parsed.warnings ?? []), 'nfc_chip'])],
    };

    return {
      ok: true,
      data: {
        parsed: forced,
        rawMrz: rawMrz ?? forced.rawMrz,
        portraitUri,
      },
    };
  } catch (e) {
    const msg = (e as Error)?.message?.trim() ?? '';
    if (/TurboModuleRegistry|EIdReader|could not be found/i.test(msg)) {
      return { ok: false, code: 'native_build', message: i18n.t('kbsNfcNativeBuildBody') };
    }
    if (/cancel/i.test(msg)) {
      return { ok: false, code: 'cancelled' };
    }
    return { ok: false, code: 'error', message: msg || i18n.t('kbsNfcReadFailed') };
  } finally {
    safeStop(reader);
  }
}

export function cancelNfcPassportRead(): void {
  const reader = getEIdReader();
  if (reader) safeStop(reader);
}

export const readPassportViaNfcForced = readPassportViaNfc;
