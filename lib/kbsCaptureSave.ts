import type { ParsedDocument } from '@/lib/scanner/types';
import { upsertGuestDocumentLocal } from '@/lib/kbsDocumentUpsertLocal';
import { prepareKbsCaptureImageUri, prepareKbsCaptureUploadUri } from '@/lib/kbsCaptureUpload';
import { uploadPassportPrivateFromUri } from '@/lib/uploadPassportPrivate';
import { assignKbsRoomsBatch, type KbsOpsRoom } from '@/lib/kbsStaffOpsEdge';
import { checkoutRoomOtherGuests } from '@/lib/hotelInHouse';
import {
  awaitKbsCapturePrewarm,
  getKbsCaptureOpsContext,
  type KbsCapturePrewarmReady,
} from '@/lib/kbsCapturePrewarm';
import { type KbsCaptureSide } from '@/lib/kbsCaptureOcr';
import { kbsCaptureSideWarning } from '@/lib/kbsCaptureSideMeta';
import { enqueueKbsCaptureOcrBatch, type KbsCaptureOcrJob } from '@/lib/kbsCaptureOcrQueue';
import { isUsablePersonName, sanitizePersonName } from '@/lib/guestScan/personNameUtils';
import { isTcFormatValid } from '@/lib/kbsTcValidation';

export type KbsCaptureImageSaveItem = {
  kind: 'image';
  imageUri: string;
  index: number;
  captureSource: 'camera' | 'gallery';
  /** Kuyruk satırı — arka plan ön işleme anahtarı. */
  clientId?: string;
  /** Ön yüz veya MRZ (kimlik arkası / pasaport alt şerit). */
  captureSide?: KbsCaptureSide;
  /** İsteğe bağlı — oda onayunda girilir. */
  firstName?: string | null;
  lastName?: string | null;
  /** İsteğe bağlı — oda onayında girilen müşteri telefon numarası (guest_phone_submitted). */
  guestPhone?: string | null;
};

export type KbsCaptureTcSaveItem = {
  kind: 'tc';
  tcNumber: string;
  index: number;
  clientId?: string;
  fullName?: string | null;
  guestPhone?: string | null;
};

export type KbsCaptureSaveItem = KbsCaptureImageSaveItem | KbsCaptureTcSaveItem;

function buildFallbackParsed(
  _index: number,
  _roomNumber: string,
  optional?: {
    firstName?: string | null;
    lastName?: string | null;
    captureSide?: KbsCaptureSide;
  }
): ParsedDocument {
  const fnTrim = optional?.firstName?.trim() ?? '';
  const lnTrim = optional?.lastName?.trim() ?? '';
  const hasManual = !!(fnTrim || lnTrim);
  const firstName = fnTrim || null;
  const lastName = lnTrim || null;
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || null;
  const side = optional?.captureSide ?? 'front';
  const warnings: string[] = ['manual_capture', 'ocr_pending', kbsCaptureSideWarning(side)];
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

function applyManualNames(
  fallback: ParsedDocument,
  manual?: { firstName?: string | null; lastName?: string | null }
): ParsedDocument {
  const manualFn = manual?.firstName?.trim();
  const manualLn = manual?.lastName?.trim();
  let firstName = fallback.firstName;
  let lastName = fallback.lastName;
  const warnings = [...fallback.warnings];

  if (manualFn && isUsablePersonName(manualFn)) {
    firstName = sanitizePersonName(manualFn);
    if (!warnings.includes('manual_name')) warnings.push('manual_name');
  }
  if (manualLn && isUsablePersonName(manualLn)) {
    lastName = sanitizePersonName(manualLn);
    if (!warnings.includes('manual_name')) warnings.push('manual_name');
  }

  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || null;
  return { ...fallback, firstName, lastName, fullName, warnings };
}

function splitOptionalFullName(fullName?: string | null): { firstName: string | null; lastName: string | null } {
  const trimmed = fullName?.trim() ?? '';
  if (!trimmed) return { firstName: null, lastName: null };
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: sanitizePersonName(parts[0]!), lastName: null };
  return {
    firstName: sanitizePersonName(parts[0]!),
    lastName: sanitizePersonName(parts.slice(1).join(' ')),
  };
}

function buildTcOnlyParsed(tcNumber: string, fullName?: string | null): ParsedDocument {
  const tc = tcNumber.trim();
  const { firstName, lastName } = splitOptionalFullName(fullName);
  const nameJoined = [firstName, lastName].filter(Boolean).join(' ').trim() || null;
  const warnings: string[] = ['tc_only', 'manual_capture'];
  if (nameJoined) warnings.push('manual_name');

  return {
    documentType: 'id_card',
    fullName: nameJoined,
    firstName,
    lastName,
    middleName: null,
    documentNumber: tc,
    personalNumber: tc,
    nationalityCode: 'TUR',
    issuingCountryCode: 'TUR',
    birthDate: null,
    expiryDate: null,
    gender: null,
    rawMrz: null,
    confidence: null,
    checksumsValid: null,
    warnings,
  };
}

export type KbsCaptureSaveResult = {
  guestDocumentId: string;
  guestId: string;
  frontImageUrl: string | null;
  localUri: string | null;
};

/** `ops.guest_documents.mrz_batch_key` — PostgreSQL uuid. */
function newCaptureBatchKey(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Tek kimlik: sıkıştır → yükle → DB → oda. */
export async function saveOneKbsCaptureItem(
  item: KbsCaptureSaveItem,
  room: KbsOpsRoom,
  captureBatchKey?: string | null
): Promise<KbsCaptureSaveResult> {
  const [saved] = await saveKbsCaptureItemsParallel([item], room, undefined, captureBatchKey);
  return saved!;
}

/** Görselleri paralel kaydet; yükleme arka planda hazırlanmış olabilir. */
export async function saveKbsCaptureItemsParallel(
  items: KbsCaptureSaveItem[],
  room: KbsOpsRoom,
  onProgress?: (message: string) => void,
  existingBatchKey?: string | null
): Promise<KbsCaptureSaveResult[]> {
  if (items.length === 0) return [];

  const ctx = await getKbsCaptureOpsContext();

  const batchKey = existingBatchKey ?? (items.length > 1 ? newCaptureBatchKey() : null);
  const total = items.length;
  const capturedAt = new Date().toISOString();

  onProgress?.(`Kayıt tamamlanıyor (0/${total})…`);

  type ImagePack = {
    index: number;
    preparedUri: string;
    upload: { publicUrl: string };
  };

  const imageItems = items.filter((item): item is KbsCaptureImageSaveItem => item.kind === 'image');
  const tcItems = items.filter((item): item is KbsCaptureTcSaveItem => item.kind === 'tc');

  for (const tcItem of tcItems) {
    if (!isTcFormatValid(tcItem.tcNumber.trim())) {
      throw new Error(`Geçersiz T.C. kimlik no: ${tcItem.tcNumber}`);
    }
  }

  const packs: ImagePack[] = await Promise.all(
    imageItems.map(async (item) => {
      const clientId = item.clientId;
      let prewarm: KbsCapturePrewarmReady | null = null;
      if (clientId) {
        prewarm = await awaitKbsCapturePrewarm(clientId);
      }

      if (prewarm) {
        return {
          index: item.index,
          preparedUri: prewarm.preparedUri,
          upload: prewarm.upload,
        };
      }

      // Prewarm yetişmedi/başarısız: hazır dosya önbellekten gelir, ağa küçük kopya gider.
      const preparedUri = await prepareKbsCaptureImageUri(item.imageUri);
      const uploadUri = await prepareKbsCaptureUploadUri(preparedUri);
      const upload = await uploadPassportPrivateFromUri({ uri: uploadUri, subfolder: 'kbs-documents' });
      return { index: item.index, preparedUri, upload };
    })
  );

  onProgress?.(`Kayıtlar oluşturuluyor…`);
  const upserted = await Promise.all(
    items.map(async (item) => {
      if (item.kind === 'tc') {
        const parsed = buildTcOnlyParsed(item.tcNumber, item.fullName);
        const result = await upsertGuestDocumentLocal({
          parsed,
          scanConfidence: null,
          rawMrz: null,
          deferReady: false,
          usageKind: 'konaklama',
          kbsPersonKind: 'tc_citizen',
          mrzBatchKey: batchKey,
          guestPhone: item.guestPhone ?? null,
          frontImageUrl: null,
          backImageUrl: null,
          captureSource: 'tc',
          capturedAt,
          ocrEngine: null,
          opsContext: ctx,
        });
        if (!result.ok) throw new Error(result.message);
        return {
          item,
          guestDocumentId: result.data.guestDocumentId,
          guestId: result.data.guestId,
          frontImageUrl: null as string | null,
          localUri: null as string | null,
        };
      }

      const pack = packs.find((x) => x.index === item.index);
      if (!pack) throw new Error('Görsel yükleme paketi bulunamadı');
      const fallback = buildFallbackParsed(item.index, String(room.room_number), {
        firstName: item.firstName,
        lastName: item.lastName,
        captureSide: item.captureSide ?? 'front',
      });
      const parsed = applyManualNames(fallback, {
        firstName: item.firstName,
        lastName: item.lastName,
      });

      const result = await upsertGuestDocumentLocal({
        parsed,
        scanConfidence: null,
        rawMrz: null,
        deferReady: false,
        usageKind: 'konaklama',
        mrzBatchKey: batchKey,
        guestPhone: item.guestPhone ?? null,
        frontImageUrl: pack.upload.publicUrl,
        backImageUrl: null,
        captureSource: item.captureSource,
        capturedAt,
        ocrEngine: null,
        opsContext: ctx,
      });
      if (!result.ok) throw new Error(result.message);
      return {
        item,
        guestDocumentId: result.data.guestDocumentId,
        guestId: result.data.guestId,
        frontImageUrl: pack.upload.publicUrl,
        localUri: pack.preparedUri,
      };
    })
  );

  const ocrJobs: KbsCaptureOcrJob[] = upserted
    .filter((row) => row.item.kind === 'image' && row.frontImageUrl && row.localUri)
    .map((row) => {
      const imageItem = row.item as KbsCaptureImageSaveItem;
      return {
        docId: row.guestDocumentId,
        guestId: row.guestId,
        imageUrl: row.frontImageUrl!,
        localUri: row.localUri!,
        captureSide: imageItem.captureSide ?? 'front',
        captureSource: imageItem.captureSource,
      };
    });
  if (ocrJobs.length > 0) enqueueKbsCaptureOcrBatch(ocrJobs);

  onProgress?.(`Oda atanıyor…`);
  const assignRes = await assignKbsRoomsBatch({
    roomId: room.id,
    guestDocumentIds: upserted.map((r) => r.guestDocumentId),
  });
  if (!assignRes.ok) throw new Error(assignRes.error.message);

  // Odaya bu çekimde giren misafirler kalır; önceki farklı misafirler otomatik çıkış yapar.
  const keepGuestIds = [...new Set(upserted.map((r) => r.guestId).filter(Boolean))];
  void checkoutRoomOtherGuests(room.id, keepGuestIds).catch(() => {});

  return upserted.map((row) => ({
    guestDocumentId: row.guestDocumentId,
    guestId: row.guestId,
    frontImageUrl: row.frontImageUrl,
    localUri: row.localUri,
  }));
}
