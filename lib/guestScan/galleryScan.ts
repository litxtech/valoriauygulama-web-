import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Image } from 'react-native';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { ocrLinesFromImage } from '@/lib/scanner/ocrLinesFromImage';
import { analyzeOcrLinesForMrzLive } from '@/lib/scanner/mrzLiveEngine';
import {
  parseIdCardFromOcrLines,
  enrichParsedWithIdCardOcr,
  galleryParsedHasMinimumFields,
} from '@/lib/guestScan/idCardOcrParser';
import { normalizeOcrLines } from '@/lib/guestScan/ocrLineNormalize';
import type { GuestScanLockPayload } from '@/lib/guestScan/types';

export type GalleryScanResult =
  | { ok: true; payload: GuestScanLockPayload }
  | { ok: false; code: 'cancelled' | 'permission' | 'quality' | 'no_document'; message: string };

const MIN_GALLERY_WIDTH = 1200;
const TARGET_OCR_WIDTH = 2000;

async function prepareGalleryImage(uri: string): Promise<string> {
  try {
    const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      Image.getSize(uri, (w, h) => resolve({ width: w, height: h }), reject);
    });
    const actions: { resize: { width?: number; height?: number } }[] = [];
    if (width < TARGET_OCR_WIDTH && height < TARGET_OCR_WIDTH) {
      actions.push(width >= height ? { resize: { width: TARGET_OCR_WIDTH } } : { resize: { height: TARGET_OCR_WIDTH } });
    } else if (width > 3200 || height > 3200) {
      actions.push(width >= height ? { resize: { width: 2800 } } : { resize: { height: 2800 } });
    }
    if (!actions.length) return uri;
    const out = await manipulateAsync(uri, actions, { compress: 0.96, format: SaveFormat.JPEG });
    return out.uri;
  } catch {
    return uri;
  }
}

async function imageQualityOk(uri: string): Promise<boolean> {
  try {
    const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      Image.getSize(uri, (w, h) => resolve({ width: w, height: h }), reject);
    });
    return width >= MIN_GALLERY_WIDTH && height >= 800;
  } catch {
    return true;
  }
}

function buildGalleryPayload(
  parsed: GuestScanLockPayload['parsed'],
  lines: string[],
  mrz: string | null
): GuestScanLockPayload {
  const normalized = normalizeOcrLines(lines);
  const enriched = enrichParsedWithIdCardOcr(parsed, normalized.length ? normalized : lines);
  return {
    parsed: enriched,
    mrz,
    sourceType: 'gallery',
    rawOcr: lines,
  };
}

/** Galeriden tek belge seç → MRZ veya kimlik OCR; geçici dosya silinir. */
export async function scanDocumentFromGallery(): Promise<GalleryScanResult> {
  const ok = await ensureMediaLibraryPermission({
    title: 'Galeri izni',
    message: 'Seçtiğiniz pasaport veya kimlik fotoğrafını okumak için galeri erişimi gereklidir.',
  });
  if (!ok) return { ok: false, code: 'permission', message: 'Galeri izni verilmedi.' };

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 1,
    allowsEditing: false,
    selectionLimit: 1,
  });

  if (result.canceled || !result.assets?.[0]?.uri) {
    return { ok: false, code: 'cancelled', message: '' };
  }

  const rawUri = result.assets[0].uri;
  const uri = await prepareGalleryImage(rawUri);
  try {
    if (!(await imageQualityOk(uri))) {
      return {
        ok: false,
        code: 'quality',
        message: 'Fotoğraf çok küçük veya bulanık. Belgenin tamamı net görünsün (en az 1200px genişlik).',
      };
    }

    const { lines: rawLines } = await ocrLinesFromImage(uri, { document: true });
    const lines = normalizeOcrLines(rawLines);
    if (!lines.length) {
      return {
        ok: false,
        code: 'no_document',
        message: 'Belgede okunabilir metin bulunamadı. Daha net ve düz çekilmiş bir fotoğraf seçin.',
      };
    }

    const mrz = analyzeOcrLinesForMrzLive(rawLines);
    let payload: GuestScanLockPayload;

    if (mrz.phase === 'locking' && mrz.locked) {
      payload = buildGalleryPayload(mrz.locked.parsed, rawLines, mrz.locked.mrz);
    } else {
      const idParsed = parseIdCardFromOcrLines(rawLines);
      if (!idParsed.documentNumber && (idParsed.confidence ?? 0) < 0.4) {
        return {
          ok: false,
          code: 'no_document',
          message: 'Kimlik veya pasaport bilgileri okunamadı. Belgeyi düz, iyi ışıkta ve tam kadrajda çekin.',
        };
      }
      payload = buildGalleryPayload(idParsed, rawLines, null);
    }

    if (!galleryParsedHasMinimumFields(payload.parsed)) {
      const idRetry = parseIdCardFromOcrLines(rawLines);
      payload = buildGalleryPayload(
        { ...payload.parsed, ...idRetry, documentType: payload.parsed.documentType },
        rawLines,
        payload.mrz
      );
      if (!galleryParsedHasMinimumFields(payload.parsed)) {
        return {
          ok: false,
          code: 'no_document',
          message:
            'Ad, soyad veya belge numarası okunamadı. Ön yüz + MRZ şeridi görünecek şekilde net bir fotoğraf seçin.',
        };
      }
    }

    return { ok: true, payload };
  } finally {
    if (uri !== rawUri) {
      void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    }
  }
}
