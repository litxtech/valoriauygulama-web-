import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {
  hasKbsOcrApplyableData,
  kbsOcrQualityScore,
  parseIdCardImageUriForUpload,
} from '@/lib/kbsCaptureProfessionalOcr';
import { listCoreMissingIdFields, kbsCaptureHasReadableData } from '@/lib/kbsCaptureParsedFields';
import type { KbsCaptureSide } from '@/lib/kbsCaptureOcr';
import { applyKbsCaptureOcrResult, markKbsCaptureOcrState } from '@/lib/kbsCaptureHistory';
import { log } from '@/lib/logger';
import type { KbsOcrResult } from '@/lib/kbsCaptureProfessionalOcr';

export type KbsCaptureOcrJob = {
  docId: string;
  guestId: string;
  imageUrl: string;
  /** Kayıt sonrası yerel dosya — ağdan indirme atlanır. */
  localUri?: string | null;
  captureSide?: KbsCaptureSide;
  captureSource?: 'camera' | 'gallery';
};

const OCR_GAP_MS = Platform.OS === 'android' ? 200 : 80;
const OCR_JOB_TIMEOUT_MS = Platform.OS === 'android' ? 90_000 : 75_000;

let jobs: KbsCaptureOcrJob[] = [];
let draining = false;
const queuedOrActiveDocIds = new Set<string>();
const ocrPrewarmByUri = new Map<string, Promise<KbsOcrResult>>();

/** Çekim sonrası onay beklerken OCR’yi önceden başlat. */
export function startKbsCaptureOcrPrewarm(
  localUri: string,
  opts?: { captureSide?: KbsCaptureSide; captureSource?: 'camera' | 'gallery' }
): void {
  const key = localUri.trim();
  if (!key || ocrPrewarmByUri.has(key)) return;
  ocrPrewarmByUri.set(
    key,
    parseIdCardImageUriForUpload(key, {
      captureSide: opts?.captureSide ?? 'front',
      galleryDeep: opts?.captureSource === 'gallery',
    }).catch((e) => {
      ocrPrewarmByUri.delete(key);
      throw e;
    })
  );
}

async function consumeKbsCaptureOcrPrewarm(localUri: string): Promise<KbsOcrResult | null> {
  const key = localUri.trim();
  const pending = ocrPrewarmByUri.get(key);
  if (!pending) return null;
  ocrPrewarmByUri.delete(key);
  try {
    return await pending;
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}_TIMEOUT`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

export function isKbsDocInOcrQueue(docId: string): boolean {
  return queuedOrActiveDocIds.has(docId) || jobs.some((j) => j.docId === docId);
}

async function downloadImage(url: string, docId: string): Promise<string> {
  const local = `${FileSystem.cacheDirectory ?? ''}kbs-ocr-${docId}.jpg`;
  const res = await FileSystem.downloadAsync(url, local);
  return res.uri;
}

async function runJob(job: KbsCaptureOcrJob): Promise<void> {
  try {
    let local = job.localUri?.trim() || '';
    if (local) {
      const info = await FileSystem.getInfoAsync(local);
      if (!info.exists) local = '';
    }
    if (!local) {
      local = await downloadImage(job.imageUrl, job.docId);
    }

    const prewarmed = await consumeKbsCaptureOcrPrewarm(local);
    const ocr = await withTimeout(
      prewarmed ??
        parseIdCardImageUriForUpload(local, {
          captureSide: job.captureSide ?? 'front',
          galleryDeep: job.captureSource === 'gallery',
        }),
      OCR_JOB_TIMEOUT_MS,
      'kbs_ocr'
    );

    log.info('kbsOcrDebug', 'FINAL applied result', {
      docId: job.docId,
      captureSide: job.captureSide ?? 'front',
      engine: ocr.engine,
      firstName: ocr.parsed.firstName,
      lastName: ocr.parsed.lastName,
      documentNumber: ocr.parsed.documentNumber,
      documentSeries: ocr.parsed.documentSeries,
      birthDate: ocr.parsed.birthDate,
      expiryDate: ocr.parsed.expiryDate,
      nationalityCode: ocr.parsed.nationalityCode,
      gender: ocr.parsed.gender,
      hasMrz: !!ocr.parsed.rawMrz,
    });

    const canApply = hasKbsOcrApplyableData(ocr) || kbsCaptureHasReadableData(ocr.parsed);

    if (!canApply) {
      log.warn('kbsCaptureOcrQueue', 'no applyable ocr data', {
        docId: job.docId,
        score: kbsOcrQualityScore(ocr),
        coreMissing: listCoreMissingIdFields(ocr.parsed),
      });
      await markKbsCaptureOcrState(job.docId, 'failed');
      return;
    }

    const res = await applyKbsCaptureOcrResult(
      job.docId,
      job.guestId,
      ocr.parsed,
      ocr.parsed.confidence,
      ocr.engine
    );
    if (!res.ok) {
      log.warn('kbsCaptureOcrQueue', 'apply failed', { docId: job.docId, message: res.message });
      await markKbsCaptureOcrState(job.docId, 'failed');
      return;
    }
  } catch (e) {
    log.warn('kbsCaptureOcrQueue', 'runJob failed', { docId: job.docId, e });
    await markKbsCaptureOcrState(job.docId, 'failed');
  } finally {
    queuedOrActiveDocIds.delete(job.docId);
  }
}

async function drainQueue(): Promise<void> {
  if (draining) return;
  draining = true;
  while (jobs.length > 0) {
    const job = jobs.shift()!;
    await runJob(job);
    if (jobs.length > 0) await sleep(OCR_GAP_MS);
  }
  draining = false;
}

/** Kayıt sonrası sırayla OCR (uygulamayı yormadan). */
export function enqueueKbsCaptureOcr(job: KbsCaptureOcrJob): void {
  if (!job.imageUrl?.trim()) return;
  if (isKbsDocInOcrQueue(job.docId)) return;
  queuedOrActiveDocIds.add(job.docId);
  jobs.push(job);
  void drainQueue();
}

export function enqueueKbsCaptureOcrBatch(batch: KbsCaptureOcrJob[]): void {
  for (const job of batch) enqueueKbsCaptureOcr(job);
}

export function kbsCaptureOcrQueueSize(): number {
  return jobs.length;
}
