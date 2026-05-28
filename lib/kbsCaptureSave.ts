import type { ParsedDocument } from '@/lib/scanner/types';
import { upsertGuestDocumentLocal } from '@/lib/kbsDocumentUpsertLocal';
import { prepareKbsCaptureImageUri } from '@/lib/kbsCaptureUpload';
import { uploadPassportPrivateFromUri } from '@/lib/uploadPassportPrivate';
import { assignKbsRoomsBatch, type KbsOpsRoom } from '@/lib/kbsStaffOpsEdge';
import { resolveOpsHotelIdForCaller } from '@/lib/resolveOpsHotelId';
import { parseIdCardImageUri, type KbsOcrResult } from '@/lib/kbsCaptureOcr';
import { sanitizeKbsOcrForApply } from '@/lib/kbsCaptureOcrMerge';
import { canSaveMrzDocument } from '@/lib/scanner/mrzScanGate';
import { isUsablePersonName, sanitizePersonName } from '@/lib/guestScan/personNameUtils';

export type KbsCaptureSaveItem = {
  imageUri: string;
  index: number;
  captureSource: 'camera' | 'gallery';
  /** İsteğe bağlı — oda onayunda girilir. */
  firstName?: string | null;
  lastName?: string | null;
};

function buildFallbackParsed(
  _index: number,
  _roomNumber: string,
  optional?: { firstName?: string | null; lastName?: string | null }
): ParsedDocument {
  const fnTrim = optional?.firstName?.trim() ?? '';
  const lnTrim = optional?.lastName?.trim() ?? '';
  const hasManual = !!(fnTrim || lnTrim);
  const firstName = fnTrim || null;
  const lastName = lnTrim || null;
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || null;
  const warnings: string[] = ['manual_capture'];
  if (hasManual) warnings.push('manual_name');

  return {
    documentType: 'id_card',
    fullName,
    firstName,
    lastName,
    middleName: null,
    documentNumber: null,
    nationalityCode: null,
    issuingCountryCode: null,
    birthDate: null,
    expiryDate: null,
    gender: null,
    rawMrz: null,
    confidence: null,
    checksumsValid: null,
    warnings,
  };
}

function mergeOcrIntoCaptureParsed(
  fallback: ParsedDocument,
  ocr: KbsOcrResult | null,
  manual?: { firstName?: string | null; lastName?: string | null }
): { parsed: ParsedDocument; ocrEngine: string | null; ocrOk: boolean } {
  if (!ocr) {
    return {
      parsed: { ...fallback, warnings: [...fallback.warnings, 'ocr_pending'] },
      ocrEngine: null,
      ocrOk: false,
    };
  }

  let p = sanitizeKbsOcrForApply(ocr.parsed);
  if (p.rawMrz) {
    const gate = canSaveMrzDocument({ rawMrz: p.rawMrz, parsed: p });
    if (!gate.allowed) {
      p = {
        ...p,
        rawMrz: null,
        warnings: [...(p.warnings ?? []), 'mrz_checksum_skip'],
      };
    }
  }

  const manualFn = manual?.firstName?.trim();
  const manualLn = manual?.lastName?.trim();
  if (manualFn && isUsablePersonName(manualFn)) {
    p.firstName = sanitizePersonName(manualFn);
    p.warnings = [...(p.warnings ?? []).filter((w) => w !== 'name_uncertain'), 'manual_name'];
  }
  if (manualLn && isUsablePersonName(manualLn)) {
    p.lastName = sanitizePersonName(manualLn);
    p.warnings = [...(p.warnings ?? []).filter((w) => w !== 'name_uncertain'), 'manual_name'];
  }

  const fn = p.firstName ?? fallback.firstName;
  const ln = p.lastName ?? fallback.lastName;
  p.firstName = fn;
  p.lastName = ln;
  p.fullName = [fn, ln].filter(Boolean).join(' ').trim() || p.fullName || fallback.fullName;

  const hasId = !!(p.documentNumber && String(p.documentNumber).replace(/\D/g, '').length >= 6);
  const hasNames = isUsablePersonName(p.firstName) && isUsablePersonName(p.lastName);
  const ocrOk = hasId || hasNames || !!p.rawMrz;

  const warnings = (p.warnings ?? []).filter(
    (w) => w !== 'ocr_pending' && w !== 'ocr_processing' && w !== 'ocr_failed'
  );

  return {
    parsed: { ...p, warnings },
    ocrEngine: ocr.engine,
    ocrOk,
  };
}

export type KbsCaptureSaveResult = {
  guestDocumentId: string;
  guestId: string;
  frontImageUrl: string;
  /** Kayıt sırasında OCR uygulandı — kuyruk gerekmez. */
  ocrApplied: boolean;
  localUri: string;
};

function newCaptureBatchKey(): string {
  return `cap-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Tek kimlik: sıkıştır → yükle → DB → oda (OCR kayıt ile paralel). */
export async function saveOneKbsCaptureItem(
  item: KbsCaptureSaveItem,
  room: KbsOpsRoom,
  captureBatchKey?: string | null
): Promise<KbsCaptureSaveResult> {
  const [saved] = await saveKbsCaptureItemsParallel([item], room, undefined, captureBatchKey);
  return saved!;
}

/** Görselleri paralel kaydet; OCR yerel dosyada yükleme ile birlikte çalışır. */
export async function saveKbsCaptureItemsParallel(
  items: KbsCaptureSaveItem[],
  room: KbsOpsRoom,
  onProgress?: (message: string) => void,
  existingBatchKey?: string | null
): Promise<KbsCaptureSaveResult[]> {
  if (items.length === 0) return [];

  const ctx = await resolveOpsHotelIdForCaller();
  if (!ctx.ok) throw new Error(ctx.message);

  const batchKey = existingBatchKey ?? (items.length > 1 ? newCaptureBatchKey() : null);
  const total = items.length;
  const capturedAt = new Date().toISOString();

  onProgress?.(`Hazırlanıyor (0/${total})…`);
  const preparedUris = await Promise.all(items.map((item) => prepareKbsCaptureImageUri(item.imageUri)));

  onProgress?.(`Okunuyor ve yükleniyor (0/${total})…`);
  const ocrAndUpload = await Promise.all(
    preparedUris.map(async (uri, index) => {
      const [ocrSettled, upload] = await Promise.all([
        parseIdCardImageUri(uri).then(
          (r) => ({ ok: true as const, result: r }),
          () => ({ ok: false as const, result: null })
        ),
        uploadPassportPrivateFromUri({ uri, subfolder: 'kbs-documents' }),
      ]);
      return { index, ocrSettled, upload };
    })
  );

  onProgress?.(`Kayıtlar oluşturuluyor…`);
  const upserted = await Promise.all(
    items.map(async (item, index) => {
      const pack = ocrAndUpload.find((x) => x.index === index)!;
      const fallback = buildFallbackParsed(item.index, String(room.room_number), {
        firstName: item.firstName,
        lastName: item.lastName,
      });
      const { parsed, ocrEngine, ocrOk } = mergeOcrIntoCaptureParsed(
        fallback,
        pack.ocrSettled.ok ? pack.ocrSettled.result : null,
        { firstName: item.firstName, lastName: item.lastName }
      );

      const result = await upsertGuestDocumentLocal({
        parsed,
        scanConfidence: parsed.confidence,
        rawMrz: parsed.rawMrz,
        deferReady: !ocrOk,
        usageKind: 'konaklama',
        mrzBatchKey: batchKey,
        frontImageUrl: pack.upload.publicUrl,
        backImageUrl: null,
        captureSource: item.captureSource,
        capturedAt,
        ocrEngine,
        opsContext: ctx,
      });
      if (!result.ok) throw new Error(result.message);
      return {
        item,
        guestDocumentId: result.data.guestDocumentId,
        guestId: result.data.guestId,
        frontImageUrl: pack.upload.publicUrl,
        localUri: preparedUris[index]!,
        ocrApplied: ocrOk,
      };
    })
  );

  onProgress?.(`Oda atanıyor…`);
  const assignRes = await assignKbsRoomsBatch({
    roomId: room.id,
    guestDocumentIds: upserted.map((r) => r.guestDocumentId),
  });
  if (!assignRes.ok) throw new Error(assignRes.error.message);

  return upserted.map((row) => ({
    guestDocumentId: row.guestDocumentId,
    guestId: row.guestId,
    frontImageUrl: row.frontImageUrl,
    ocrApplied: row.ocrApplied,
    localUri: row.localUri,
  }));
}
