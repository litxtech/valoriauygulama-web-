import type { ParsedDocument } from '@/lib/scanner/types';
import { upsertGuestDocumentLocal } from '@/lib/kbsDocumentUpsertLocal';
import { prepareKbsCaptureImageUri } from '@/lib/kbsCaptureUpload';
import { uploadPassportPrivateFromUri } from '@/lib/uploadPassportPrivate';
import { assignKbsRoomsBatch, type KbsOpsRoom } from '@/lib/kbsStaffOpsEdge';
import {
  awaitKbsCapturePrewarm,
  getKbsCaptureOpsContext,
  type KbsCapturePrewarmReady,
} from '@/lib/kbsCapturePrewarm';
import { type KbsCaptureSide } from '@/lib/kbsCaptureOcr';
import { isUsablePersonName, sanitizePersonName } from '@/lib/guestScan/personNameUtils';

export type KbsCaptureSaveItem = {
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

export type KbsCaptureSaveResult = {
  guestDocumentId: string;
  guestId: string;
  frontImageUrl: string;
  localUri: string;
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

  type Pack = {
    index: number;
    preparedUri: string;
    upload: { publicUrl: string };
  };

  const packs: Pack[] = await Promise.all(
    items.map(async (item, index) => {
      const clientId = item.clientId;
      let prewarm: KbsCapturePrewarmReady | null = null;
      if (clientId) {
        prewarm = await awaitKbsCapturePrewarm(clientId);
      }

      if (prewarm) {
        return {
          index,
          preparedUri: prewarm.preparedUri,
          upload: prewarm.upload,
        };
      }

      const preparedUri = await prepareKbsCaptureImageUri(item.imageUri);
      const upload = await uploadPassportPrivateFromUri({ uri: preparedUri, subfolder: 'kbs-documents' });
      return { index, preparedUri, upload };
    })
  );

  onProgress?.(`Kayıtlar oluşturuluyor…`);
  const upserted = await Promise.all(
    items.map(async (item, index) => {
      const pack = packs.find((x) => x.index === index)!;
      const fallback = buildFallbackParsed(item.index, String(room.room_number), {
        firstName: item.firstName,
        lastName: item.lastName,
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
    localUri: row.localUri,
  }));
}
