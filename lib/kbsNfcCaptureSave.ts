import type { ParsedDocument } from '@/lib/scanner/types';
import { upsertGuestDocumentLocal } from '@/lib/kbsDocumentUpsertLocal';
import { prepareKbsCaptureImageUri } from '@/lib/kbsCaptureUpload';
import { uploadPassportPrivateFromUri } from '@/lib/uploadPassportPrivate';
import { assignKbsRoomsBatch, type KbsOpsRoom } from '@/lib/kbsStaffOpsEdge';
import { checkoutRoomOtherGuests } from '@/lib/hotelInHouse';
import { getKbsCaptureOpsContext } from '@/lib/kbsCapturePrewarm';
import { canSaveMrzDocument } from '@/lib/scanner/mrzScanGate';
import { inferKbsPersonKind } from '@/lib/kbsInferPersonKind';
import { listCoreMissingIdFields } from '@/lib/kbsCaptureParsedFields';

export const KBS_OCR_ENGINE_NFC_CHIP = 'nfc-chip' as const;

export type KbsNfcCaptureSaveItem = {
  index: number;
  clientId?: string;
  parsed: ParsedDocument;
  rawMrz: string | null;
  portraitUri: string;
  guestPhone?: string | null;
};

export type KbsNfcCaptureSaveResult = {
  guestDocumentId: string;
  guestId: string;
  frontImageUrl: string;
  localUri: string;
};

function newCaptureBatchKey(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** NFC çip okumalarını paralel kaydet — OCR kuyruğu yok, parsed doğrudan yazılır. */
export async function saveKbsNfcCaptureItemsParallel(
  items: KbsNfcCaptureSaveItem[],
  room: KbsOpsRoom,
  onProgress?: (message: string) => void,
  existingBatchKey?: string | null
): Promise<KbsNfcCaptureSaveResult[]> {
  if (items.length === 0) return [];

  const ctx = await getKbsCaptureOpsContext();
  const batchKey = existingBatchKey ?? (items.length > 1 ? newCaptureBatchKey() : null);
  const total = items.length;
  const capturedAt = new Date().toISOString();

  onProgress?.(`NFC kayıtları hazırlanıyor (0/${total})…`);

  type Pack = { index: number; preparedUri: string; upload: { publicUrl: string } };

  const packs: Pack[] = await Promise.all(
    items.map(async (item, index) => {
      const preparedUri = await prepareKbsCaptureImageUri(item.portraitUri);
      const upload = await uploadPassportPrivateFromUri({ uri: preparedUri, subfolder: 'kbs-documents' });
      return { index, preparedUri, upload };
    })
  );

  onProgress?.(`Kayıtlar oluşturuluyor…`);
  const upserted = await Promise.all(
    items.map(async (item, index) => {
      const pack = packs.find((x) => x.index === index)!;
      const effectiveRaw = item.parsed.rawMrz ?? item.rawMrz;
      const parsedForSave: ParsedDocument = {
        ...item.parsed,
        rawMrz: effectiveRaw ?? item.parsed.rawMrz,
      };
      const gate = effectiveRaw
        ? canSaveMrzDocument({ rawMrz: effectiveRaw, parsed: parsedForSave })
        : { allowed: true as const };
      const nfcChip = parsedForSave.warnings?.includes('nfc_chip');
      const coreComplete = listCoreMissingIdFields(parsedForSave).length === 0;
      if (!gate.allowed && !(nfcChip && coreComplete)) {
        throw new Error('MRZ doğrulama geçilmedi');
      }

      const result = await upsertGuestDocumentLocal({
        parsed: parsedForSave,
        scanConfidence: parsedForSave.confidence,
        rawMrz: effectiveRaw,
        deferReady: false,
        usageKind: 'konaklama',
        kbsPersonKind: inferKbsPersonKind(parsedForSave),
        mrzBatchKey: batchKey,
        guestPhone: item.guestPhone ?? null,
        frontImageUrl: pack.upload.publicUrl,
        backImageUrl: null,
        captureSource: 'nfc',
        capturedAt,
        ocrEngine: KBS_OCR_ENGINE_NFC_CHIP,
        opsContext: ctx,
      });
      if (!result.ok) throw new Error(result.message);
      return {
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

  const keepGuestIds = [...new Set(upserted.map((r) => r.guestId).filter(Boolean))];
  void checkoutRoomOtherGuests(room.id, keepGuestIds).catch(() => {});

  return upserted;
}
