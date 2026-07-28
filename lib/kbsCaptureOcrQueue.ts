import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {
  hasKbsOcrApplyableData,
  kbsOcrQualityScore,
  parseIdCardImageUriForUpload,
  parseIdCardImageUriProfessional,
} from '@/lib/kbsCaptureProfessionalOcr';
import {
  enrichKbsParsedFromSources,
  isKbsCaptureOcrCoreComplete,
  isKbsOcrInProgress,
  isKbsOcrManualReview,
  listCoreMissingIdFields,
  kbsCaptureHasReadableData,
  needsKbsCaptureOcrRead,
  withMissingFieldWarnings,
} from '@/lib/kbsCaptureParsedFields';
import type { KbsCaptureSide } from '@/lib/kbsCaptureOcr';
import { applyKbsCaptureOcrResult, markKbsCaptureOcrState } from '@/lib/kbsCaptureHistory';
import { isMrzChecksumSuspicious } from '@/lib/kbsMrzSuspicion';
import { log } from '@/lib/logger';
import type { KbsOcrResult } from '@/lib/kbsCaptureProfessionalOcr';
import {
  applyDocumentOcrResultRpc,
  claimDocumentOcrJob,
  enqueueDocumentOcrJob,
  recoverStuckDocumentOcr,
  requestServerOcrFallback,
  type DocumentOcrJobRow,
  type KbsOcrStrategy,
} from '@/lib/kbsDocumentOcrJobs';
import { pickBetterKbsOcrResult } from '@/lib/kbsCaptureProfessionalOcr';
import { mergeKbsOcrPassResults } from '@/lib/kbsCaptureOcrMerge';

export type KbsCaptureOcrJob = {
  docId: string;
  guestId: string;
  imageUrl: string;
  /** Kayıt sonrası yerel dosya — ağdan indirme atlanır. */
  localUri?: string | null;
  captureSide?: KbsCaptureSide;
  captureSource?: 'camera' | 'gallery';
  strategy?: KbsOcrStrategy;
  persistentJobId?: string | null;
};

const OCR_GAP_MS = Platform.OS === 'android' ? 20 : 0;
const OCR_JOB_TIMEOUT_MS = Platform.OS === 'android' ? 90_000 : 75_000;
const OCR_DOWNLOAD_TIMEOUT_MS = 20_000;
/** Paralel OCR — varsayılan. */
const OCR_MAX_CONCURRENT_DEFAULT = Platform.OS === 'android' ? 2 : 3;
/** Toplu galeri: hâlâ paralel ama daha düşük (fast-first; Maximum seyrek). */
const OCR_MAX_CONCURRENT_BULK = Platform.OS === 'android' ? 2 : 2;
let ocrMaxConcurrent = OCR_MAX_CONCURRENT_DEFAULT;

/** Toplu galeri kaydı sırasında OCR paralelliğini sınırla (OOM önleme). */
export function setKbsOcrBulkMode(enabled: boolean): void {
  ocrMaxConcurrent = enabled ? OCR_MAX_CONCURRENT_BULK : OCR_MAX_CONCURRENT_DEFAULT;
}

let jobs: KbsCaptureOcrJob[] = [];
let activeCount = 0;
const queuedOrActiveDocIds = new Set<string>();
/** Çalışan + bekleyen işler — persistentJobId geç bağlansın diye. */
const trackedJobsByDocId = new Map<string, KbsCaptureOcrJob>();
const ocrPrewarmByUri = new Map<string, Promise<KbsOcrResult>>();
/**
 * Prewarm OCR slot’tan bağımsız ateşleniyordu → çoklu pasaportta
 * birkaç Maximum OCR üst üste binip Android OOM çökmesi yapıyordu.
 */
const OCR_PREWARM_MAX_ACTIVE = 1;
let ocrPrewarmActive = 0;
const ocrPrewarmWaiters: Array<() => void> = [];

function acquireOcrPrewarmSlot(): Promise<void> {
  if (ocrPrewarmActive < OCR_PREWARM_MAX_ACTIVE) {
    ocrPrewarmActive += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    ocrPrewarmWaiters.push(() => {
      ocrPrewarmActive += 1;
      resolve();
    });
  });
}

function releaseOcrPrewarmSlot(): void {
  ocrPrewarmActive = Math.max(0, ocrPrewarmActive - 1);
  const next = ocrPrewarmWaiters.shift();
  if (next) next();
}

let workerId = `device-${Platform.OS}-${Date.now().toString(36)}`;
let claimLoopStarted = false;
/** History’de bir kez okumaya alındı — tekrar tekrar "Okunuyor" döngüsü yok. */
const historyOcrAttemptedDocIds = new Set<string>();
const queueListeners = new Set<() => void>();

function notifyKbsOcrQueueListeners(): void {
  for (const listener of queueListeners) {
    try {
      listener();
    } catch {
      /* ignore */
    }
  }
}

/** Kuyruk değişince UI (Okunuyor rozeti) — listeyi yenilemeden. */
export function subscribeKbsOcrQueue(listener: () => void): () => void {
  queueListeners.add(listener);
  return () => {
    queueListeners.delete(listener);
  };
}

/** Çekim sonrası onay beklerken OCR’yi önceden başlat (aynı anda en fazla 1). */
export function startKbsCaptureOcrPrewarm(
  localUri: string,
  opts?: { captureSide?: KbsCaptureSide; captureSource?: 'camera' | 'gallery' }
): void {
  const key = localUri.trim();
  if (!key || ocrPrewarmByUri.has(key)) return;
  ocrPrewarmByUri.set(
    key,
    (async () => {
      await acquireOcrPrewarmSlot();
      try {
        return await parseIdCardImageUriForUpload(key, {
          captureSide: opts?.captureSide ?? 'front',
          // Kamera: hızlı yol; galeri/fotokopi: derin
          galleryDeep: opts?.captureSource === 'gallery',
        });
      } catch (e) {
        ocrPrewarmByUri.delete(key);
        throw e;
      } finally {
        releaseOcrPrewarmSlot();
      }
    })()
  );
}

/** Toplu eklemede bekleyen prewarm sonuçlarını düşür (bellek). Çalışan OCR slot’ta biter. */
export function clearKbsCaptureOcrPrewarmAll(): void {
  ocrPrewarmByUri.clear();
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
  const res = await withTimeout(
    FileSystem.downloadAsync(url, local),
    OCR_DOWNLOAD_TIMEOUT_MS,
    'kbs_ocr_download'
  );
  return res.uri;
}

function isHealthyKbsOcrRead(parsed: import('@/lib/scanner/types').ParsedDocument): boolean {
  if (!isKbsCaptureOcrCoreComplete(parsed)) return false;
  // MRZ checksum geçerli → güvenilir (görsel doğrulama uyarısı bonus)
  if (parsed.rawMrz && parsed.checksumsValid === true) return true;
  // TC kimlik görsel — core tamam ise kabul
  const tc = (parsed.documentNumber ?? '').replace(/\D/g, '');
  if (
    tc.length === 11 &&
    (parsed.nationalityCode === 'TUR' ||
      parsed.nationalityCode === 'TR' ||
      parsed.nationalityCode === 'TC')
  ) {
    return true;
  }
  // A: MRZ şüpheli (checksum fail / fallback / uncertain) → derin / sunucu
  if (isMrzChecksumSuspicious(parsed)) return false;
  // Görsel tamam, MRZ yok — pasaport için yetersiz say (deep dene)
  if (!parsed.rawMrz && parsed.documentType === 'passport') return false;
  return true;
}

async function runDeviceOcr(job: KbsCaptureOcrJob, strategy: KbsOcrStrategy): Promise<KbsOcrResult> {
  let local = job.localUri?.trim() || '';
  if (local) {
    try {
      const info = await withTimeout(FileSystem.getInfoAsync(local), 8_000, 'kbs_ocr_local_info');
      if (!info.exists) local = '';
    } catch {
      local = '';
    }
  }
  if (!local) {
    local = await downloadImage(job.imageUrl, job.docId);
  }

  if (strategy === 'device_fast') {
    const prewarmed = await consumeKbsCaptureOcrPrewarm(local);
    if (prewarmed && isHealthyKbsOcrRead(prewarmed.parsed)) {
      return prewarmed;
    }
    // Hızlı yol: Maximum’a düşme — eksikte kuyruk device_deep enqueue eder.
    const fast = await parseIdCardImageUriForUpload(local, {
      captureSide: job.captureSide ?? 'front',
      galleryDeep: false,
    });
    if (prewarmed) return pickBetterKbsOcrResult(prewarmed, fast);
    return fast;
  }

  // Derin yol: ön + MRZ paralel; sağlıklı değilse Maximum
  const { prepareProfessionalKbsOcrUri } = await import('@/lib/kbsOcrImageEnhance');
  const prepared = await prepareProfessionalKbsOcrUri(local);

  const [frontPass, mrzPass] = await Promise.all([
    parseIdCardImageUriProfessional(prepared, {
      captureSide: job.captureSide ?? 'front',
      imagePrepared: true,
      fast: false,
      galleryDeep: false,
    }),
    parseIdCardImageUriProfessional(prepared, {
      captureSide: 'mrz_back',
      imagePrepared: true,
      fast: false,
      galleryDeep: false,
    }),
  ]);
  let best = pickBetterKbsOcrResult(frontPass, mrzPass);

  if (isHealthyKbsOcrRead(best.parsed)) {
    return best;
  }

  try {
    const { parseIdCardImageUriMaximum } = await import('@/lib/kbsCaptureGalleryDeepOcr');
    const deep = await parseIdCardImageUriMaximum(prepared, {
      captureSide: job.captureSide ?? 'front',
    });
    const merged = mergeKbsOcrPassResults([
      { parsed: best.parsed, engine: best.engine },
      { parsed: deep.parsed, engine: deep.engine },
    ]);
    best = {
      parsed: merged.parsed,
      missingFields: merged.missingFields,
      engine: deep.engine || best.engine,
    };
  } catch (e) {
    log.warn('kbsCaptureOcrQueue', 'deep ocr failed', { docId: job.docId, e });
  }
  return best;
}

async function persistOcrResult(
  job: KbsCaptureOcrJob,
  ocr: KbsOcrResult,
  strategy: KbsOcrStrategy
): Promise<'succeeded' | 'partial' | 'failed' | 'manual_review'> {
  const coreComplete = isKbsCaptureOcrCoreComplete(ocr.parsed);
  const canApply = hasKbsOcrApplyableData(ocr) || kbsCaptureHasReadableData(ocr.parsed);

  if (!canApply) {
    await markKbsCaptureOcrState(job.docId, 'failed');
    if (job.persistentJobId) {
      await applyDocumentOcrResultRpc({
        jobId: job.persistentJobId,
        guestDocumentId: job.docId,
        parsed: { ...ocr.parsed, warnings: [...(ocr.parsed.warnings ?? []), 'ocr_failed'] },
        scanConfidence: ocr.parsed.confidence,
        ocrEngine: ocr.engine,
        outcome: 'auto',
      }).catch(() => null);
    }
    return 'failed';
  }

  const rpc = await applyDocumentOcrResultRpc({
    jobId: job.persistentJobId ?? null,
    guestDocumentId: job.docId,
    parsed: withMissingFieldWarnings(ocr.parsed),
    scanConfidence: ocr.parsed.confidence,
    ocrEngine: ocr.engine,
    outcome: 'auto',
  });

  if (rpc.ok) {
    if (rpc.coreReady || rpc.ocrStatus === 'succeeded') {
      // A: sağlıksız / şüpheli “tamam” → sonraki strateji (deep → sunucu → manuel)
      if (!isHealthyKbsOcrRead(ocr.parsed)) {
        if (strategy === 'device_fast' || strategy === 'device_deep') {
          await markKbsCaptureOcrState(job.docId, 'partial');
          return 'partial';
        }
        await markKbsCaptureOcrState(job.docId, 'manual_review');
        return 'manual_review';
      }
      return 'succeeded';
    }
    if (rpc.ocrStatus === 'manual_review') return 'manual_review';
    return 'partial';
  }

  // RPC yok / migration yok — legacy apply
  const res = await applyKbsCaptureOcrResult(
    job.docId,
    job.guestId,
    withMissingFieldWarnings(ocr.parsed),
    ocr.parsed.confidence,
    ocr.engine
  );
  if (!res.ok) {
    await markKbsCaptureOcrState(job.docId, 'failed');
    return 'failed';
  }
  if (coreComplete) {
    if (!isHealthyKbsOcrRead(ocr.parsed)) {
      if (strategy === 'device_fast' || strategy === 'device_deep') {
        await markKbsCaptureOcrState(job.docId, 'partial');
        return 'partial';
      }
      await markKbsCaptureOcrState(job.docId, 'manual_review');
      return 'manual_review';
    }
    return 'succeeded';
  }
  // Kısmi: pending'e GERİ alma — "Okunuyor"da takılı kalıyordu.
  // Sonraki strateji kuyruğa alınırken partial / manual_review yaz.
  if (strategy === 'device_fast') {
    await markKbsCaptureOcrState(job.docId, 'partial');
    return 'partial';
  }
  if (strategy === 'device_deep') {
    await markKbsCaptureOcrState(job.docId, 'partial');
    return 'partial';
  }
  await markKbsCaptureOcrState(
    job.docId,
    kbsCaptureHasReadableData(ocr.parsed) ? 'manual_review' : 'failed'
  );
  return kbsCaptureHasReadableData(ocr.parsed) ? 'manual_review' : 'failed';
}

async function runJob(job: KbsCaptureOcrJob): Promise<void> {
  const strategy: KbsOcrStrategy = job.strategy ?? 'device_fast';
  try {
    await markKbsCaptureOcrState(job.docId, 'processing');

    if (strategy === 'server_fallback') {
      const server = await requestServerOcrFallback({
        guestDocumentId: job.docId,
        jobId: job.persistentJobId,
      });
      if (!server.ok) {
        log.warn('kbsCaptureOcrQueue', 'server fallback failed', {
          docId: job.docId,
          message: server.message,
        });
        await markKbsCaptureOcrState(job.docId, 'failed');
      } else {
        // Edge apply bayrakları temizlemezse "Okunuyor"da kalmasın — kısa süre sonra kesinleştir.
        setTimeout(() => {
          if (isKbsDocInOcrQueue(job.docId)) return;
          void (async () => {
            try {
              const { supabase } = await import('@/lib/supabase');
              const { data } = await supabase
                .schema('ops')
                .from('guest_documents')
                .select('parsed_payload, ocr_status')
                .eq('id', job.docId)
                .maybeSingle();
              const payload = (data?.parsed_payload ??
                {}) as import('@/lib/scanner/types').ParsedDocument;
              const status = String(data?.ocr_status ?? '').toLowerCase();
              if (isKbsCaptureOcrCoreComplete(payload) || status === 'succeeded') return;
              if (
                !isKbsOcrInProgress(payload) &&
                status !== 'queued' &&
                status !== 'processing' &&
                status !== 'retry_wait'
              ) {
                return;
              }
              await markKbsCaptureOcrState(
                job.docId,
                kbsCaptureHasReadableData(payload) ? 'manual_review' : 'failed'
              );
            } catch {
              /* ignore */
            }
          })();
        }, 8_000);
      }
      return;
    }

    const ocr = await withTimeout(runDeviceOcr(job, strategy), OCR_JOB_TIMEOUT_MS, 'kbs_ocr');

    log.info('kbsOcrDebug', 'FINAL applied result', {
      docId: job.docId,
      strategy,
      captureSide: job.captureSide ?? 'front',
      engine: ocr.engine,
      firstName: ocr.parsed.firstName,
      lastName: ocr.parsed.lastName,
      documentNumber: ocr.parsed.documentNumber,
      score: kbsOcrQualityScore(ocr),
      coreMissing: listCoreMissingIdFields(ocr.parsed),
    });

    const outcome = await persistOcrResult(job, ocr, strategy);
    const missing = listCoreMissingIdFields(ocr.parsed);

    // DB tarafında da eksik alan taraması (kalıcı etiket)
    try {
      const { scanDocumentMissingFieldsRpc } = await import('@/lib/kbsDocumentOcrJobs');
      await scanDocumentMissingFieldsRpc(job.docId);
    } catch {
      /* migration yoksa yoksay */
    }

    log.info('kbsOcrDebug', 'missing field scan', {
      docId: job.docId,
      strategy,
      outcome,
      missing,
    });

    if (outcome === 'partial' && strategy === 'device_fast') {
      // Deneme 2: deep — eksik alan varsa zorunlu
      enqueueKbsCaptureOcr({
        ...job,
        strategy: 'device_deep',
        persistentJobId: job.persistentJobId,
      });
      void enqueueDocumentOcrJob({
        guestDocumentId: job.docId,
        strategy: 'device_deep',
        requestedSide: job.captureSide ?? 'front',
      });
      return;
    }

    if (outcome === 'partial' && strategy === 'device_deep') {
      // Deneme 3: sunucu — özellikle pasaport MRZ / uyruk / tarih eksikse
      void enqueueDocumentOcrJob({
        guestDocumentId: job.docId,
        strategy: 'server_fallback',
        requestedSide: job.captureSide ?? 'front',
      });
      enqueueKbsCaptureOcr({
        ...job,
        strategy: 'server_fallback',
        persistentJobId: job.persistentJobId,
      });
      // Sunucu sonucu gelmezse kısa süre sonra manuel kontrole düş
      setTimeout(() => {
        if (isKbsDocInOcrQueue(job.docId)) return;
        void markKbsCaptureOcrState(
          job.docId,
          missing.length > 0 ? 'manual_review' : 'failed'
        );
      }, 45_000);
    }
  } catch (e) {
    log.warn('kbsCaptureOcrQueue', 'runJob failed', { docId: job.docId, e });
    await markKbsCaptureOcrState(job.docId, 'failed');
  } finally {
    const waiting = jobs.find((j) => j.docId === job.docId);
    if (waiting) {
      trackedJobsByDocId.set(job.docId, waiting);
    } else {
      trackedJobsByDocId.delete(job.docId);
      queuedOrActiveDocIds.delete(job.docId);
    }
    notifyKbsOcrQueueListeners();
  }
}

async function drainQueue(): Promise<void> {
  while (jobs.length > 0 && activeCount < ocrMaxConcurrent) {
    const job = jobs.shift()!;
    trackedJobsByDocId.set(job.docId, job);
    activeCount += 1;
    void runJob(job).finally(() => {
      activeCount -= 1;
      if (jobs.length > 0) {
        if (OCR_GAP_MS > 0) {
          setTimeout(() => void drainQueue(), OCR_GAP_MS);
        } else {
          void drainQueue();
        }
      } else if (activeCount === 0) {
        // Toplu mod bitti — tekli çekimlerde varsayılan paralelliğe dön.
        setKbsOcrBulkMode(false);
      }
    });
  }
}

/** Kayıt sonrası OCR — kalıcı job + cihaz hızlandırıcı. */
export function enqueueKbsCaptureOcr(job: KbsCaptureOcrJob): void {
  if (!job.imageUrl?.trim()) return;
  if (isKbsDocInOcrQueue(job.docId) && !job.strategy) return;
  // Aynı doc farklı stratejiyle gelebilir — processing değilse izin ver.
  if (queuedOrActiveDocIds.has(job.docId) && jobs.some((j) => j.docId === job.docId)) {
    const existing = jobs.find((j) => j.docId === job.docId);
    if (existing && job.strategy && existing.strategy !== job.strategy) {
      existing.strategy = job.strategy;
      if (job.persistentJobId) existing.persistentJobId = job.persistentJobId;
    }
    return;
  }
  // Aktif iş varsa stratejiyi yükselt / job id bağla
  const tracked = trackedJobsByDocId.get(job.docId);
  if (tracked && !jobs.some((j) => j.docId === job.docId)) {
    if (job.persistentJobId) tracked.persistentJobId = job.persistentJobId;
    if (job.strategy && job.strategy !== tracked.strategy) {
      // Aktif bittikten sonra yeni strateji kuyruğa alınacak — aşağıda push
    } else {
      return;
    }
  }
  queuedOrActiveDocIds.add(job.docId);
  jobs.push(job);
  trackedJobsByDocId.set(job.docId, job);
  notifyKbsOcrQueueListeners();
  void drainQueue();

  if (job.persistentJobId) return;

  void enqueueDocumentOcrJob({
    guestDocumentId: job.docId,
    strategy: job.strategy ?? 'device_fast',
    requestedSide: job.captureSide ?? 'front',
  }).then((res) => {
    if (res.ok && res.job?.id) {
      const live = trackedJobsByDocId.get(job.docId) ?? jobs.find((j) => j.docId === job.docId);
      if (live) live.persistentJobId = res.job.id;
      job.persistentJobId = res.job.id;
    }
  });
}

export function enqueueKbsCaptureOcrBatch(batch: KbsCaptureOcrJob[]): void {
  for (const job of batch) enqueueKbsCaptureOcr(job);
}

export function kbsCaptureOcrQueueSize(): number {
  return jobs.length;
}

/**
 * DB’de ocr_pending/processing kalmış ama bellek kuyruğu boşsa (app kill / timeout sonrası)
 * işi yeniden kuyruğa alır.
 */
export function requeueStuckKbsCaptureOcr(job: KbsCaptureOcrJob): boolean {
  if (!job.imageUrl?.trim()) return false;
  if (isKbsDocInOcrQueue(job.docId)) return false;
  enqueueKbsCaptureOcr({
    ...job,
    strategy: job.strategy ?? 'device_deep',
    captureSide: job.captureSide ?? 'front',
  });
  return true;
}

export type KbsUnreadCaptureRow = {
  id: string;
  guest_id: string;
  front_image_url?: string | null;
  parsed_payload?: Record<string, unknown> | null;
  ocr_status?: string | null;
};

/**
 * Okunmamış / eksik çekimleri bir kez derin OCR’ye alır (trafik sınırlı).
 * Bayat "Okunuyor" ikinci turda kesin duruma çekilir.
 */
export function kickUnreadCapturesOcr(rows: KbsUnreadCaptureRow[], limit = 8): number {
  let enqueued = 0;
  for (const row of rows) {
    if (enqueued >= limit) break;
    const imageUrl = (row.front_image_url ?? '').trim();
    if (!imageUrl) continue;
    if (isKbsDocInOcrQueue(row.id)) {
      historyOcrAttemptedDocIds.add(row.id);
      continue;
    }

    const parsed = enrichKbsParsedFromSources(row.parsed_payload);
    if (isKbsCaptureOcrCoreComplete(parsed) || isKbsOcrManualReview(parsed)) continue;

    const ocrStatus = (row.ocr_status ?? '').trim().toLowerCase();
    if (ocrStatus === 'succeeded' || ocrStatus === 'manual_review') continue;

    // Aynı kayıt ikinci kez: OCR yok — etiketle
    if (historyOcrAttemptedDocIds.has(row.id)) {
      if (
        isKbsOcrInProgress(parsed) ||
        ocrStatus === 'queued' ||
        ocrStatus === 'processing' ||
        ocrStatus === 'retry_wait' ||
        !kbsCaptureHasReadableData(parsed)
      ) {
        void markKbsCaptureOcrState(
          row.id,
          kbsCaptureHasReadableData(parsed) ? 'manual_review' : 'failed'
        );
      }
      continue;
    }

    if (!needsKbsCaptureOcrRead(parsed, { ocrStatus: row.ocr_status })) continue;

    historyOcrAttemptedDocIds.add(row.id);
    const sideWarn = Array.isArray(parsed?.warnings)
      ? parsed!.warnings!.find((w) => typeof w === 'string' && w.startsWith('kbs_side:'))
      : null;
    const captureSide = sideWarn === 'kbs_side:mrz_back' ? ('mrz_back' as const) : ('front' as const);

    const ok = requeueStuckKbsCaptureOcr({
      docId: row.id,
      guestId: row.guest_id,
      imageUrl,
      captureSide,
      captureSource: 'gallery',
      strategy: 'device_fast',
    });
    if (ok) enqueued += 1;
  }
  return enqueued;
}

/** Kalıcı kuyruktan cihaz işlerini claim et — yalnız manuel / çekim sonrası. */
export async function pollPersistentDeviceOcrJobs(limit = 4): Promise<number> {
  let claimed = 0;
  for (let i = 0; i < limit; i += 1) {
    const row = await claimDocumentOcrJob({
      lockedBy: workerId,
      strategies: ['device_fast', 'device_deep'],
      leaseSeconds: 150,
    });
    if (!row) break;
    claimed += 1;
    if (isKbsDocInOcrQueue(row.guest_document_id)) continue;
    enqueueKbsCaptureOcr({
      docId: row.guest_document_id,
      guestId: row.guest_id ?? '',
      imageUrl: row.image_url ?? '',
      captureSide: row.requested_side ?? 'front',
      strategy: row.strategy,
      persistentJobId: row.id,
      captureSource: 'gallery',
    });
  }
  return claimed;
}

/** Stuck recovery + claim — manuel tetik; history otomatik çağırmaz. */
export async function kickKbsOcrRecovery(): Promise<void> {
  await recoverStuckDocumentOcr(40);
  await pollPersistentDeviceOcrJobs(6);
}

/** Claim döngüsü — varsayılan kapalı (trafik). Manuel retry / kayıt sonrası kuyruk yeter. */
export function startKbsOcrClaimLoop(): void {
  if (claimLoopStarted) return;
  claimLoopStarted = true;
  const tick = () => {
    void pollPersistentDeviceOcrJobs(3).finally(() => {
      setTimeout(tick, 12_000);
    });
  };
  setTimeout(tick, 2_500);
}

export function mapPersistentJobToMemory(row: DocumentOcrJobRow): KbsCaptureOcrJob {
  return {
    docId: row.guest_document_id,
    guestId: row.guest_id ?? '',
    imageUrl: row.image_url ?? '',
    captureSide: row.requested_side ?? 'front',
    strategy: row.strategy,
    persistentJobId: row.id,
    captureSource: 'gallery',
  };
}
