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

const OCR_GAP_MS = Platform.OS === 'android' ? 40 : 0;
const OCR_JOB_TIMEOUT_MS = Platform.OS === 'android' ? 90_000 : 75_000;
const OCR_DOWNLOAD_TIMEOUT_MS = 20_000;
/** iOS 2; Android 1 — deep OCR bellek baskısını azalt. */
const OCR_MAX_CONCURRENT = Platform.OS === 'android' ? 1 : 2;

let jobs: KbsCaptureOcrJob[] = [];
let activeCount = 0;
const queuedOrActiveDocIds = new Set<string>();
/** Çalışan + bekleyen işler — persistentJobId geç bağlansın diye. */
const trackedJobsByDocId = new Map<string, KbsCaptureOcrJob>();
const ocrPrewarmByUri = new Map<string, Promise<KbsOcrResult>>();
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
    if (prewarmed) return prewarmed;
    return parseIdCardImageUriForUpload(local, {
      captureSide: job.captureSide ?? 'front',
      galleryDeep: false,
    });
  }

  // device_deep: maximum / gallery deep + MRZ
  const preparedFast = await parseIdCardImageUriProfessional(local, {
    captureSide: job.captureSide ?? 'front',
    imagePrepared: false,
    fast: false,
  });
  const mrzPass = await parseIdCardImageUriProfessional(local, {
    captureSide: 'mrz_back',
    imagePrepared: true,
    fast: false,
  });
  let best = pickBetterKbsOcrResult(preparedFast, mrzPass);
  try {
    const { parseIdCardImageUriMaximum } = await import('@/lib/kbsCaptureGalleryDeepOcr');
    const deep = await parseIdCardImageUriMaximum(local, {
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
    if (rpc.coreReady || rpc.ocrStatus === 'succeeded') return 'succeeded';
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
  if (coreComplete) return 'succeeded';
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
  while (jobs.length > 0 && activeCount < OCR_MAX_CONCURRENT) {
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
  parsed_payload?: unknown;
  ocr_status?: string | null;
};

/**
 * Geçmiş listesindeki boş / eksik / takılı kayıtları bir kez okumaya alır.
 * İkinci turda hâlâ bayat "Okunuyor" ise kesin duruma (manuel / okunamadı) çeker.
 */
export function kickUnreadCapturesOcr(rows: KbsUnreadCaptureRow[], limit = 10): number {
  let enqueued = 0;
  for (const row of rows) {
    if (enqueued >= limit) break;
    const imageUrl = (row.front_image_url ?? '').trim();
    if (!imageUrl) continue;

    const parsed = enrichKbsParsedFromSources(row.parsed_payload);
    if (!needsKbsCaptureOcrRead(parsed, { ocrStatus: row.ocr_status })) {
      continue;
    }

    if (isKbsDocInOcrQueue(row.id)) {
      historyOcrAttemptedDocIds.add(row.id);
      continue;
    }

    // Aynı kayıt: bir kez denendi. Bayat Okunuyor → kesin durum; tekrar kuyruğa alma.
    if (historyOcrAttemptedDocIds.has(row.id)) {
      if (
        isKbsOcrInProgress(parsed) ||
        row.ocr_status === 'queued' ||
        row.ocr_status === 'processing' ||
        row.ocr_status === 'retry_wait'
      ) {
        void markKbsCaptureOcrState(
          row.id,
          kbsCaptureHasReadableData(parsed) ? 'manual_review' : 'failed'
        );
      }
      continue;
    }

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
      strategy: 'device_deep',
    });
    if (ok) enqueued += 1;
  }
  return enqueued;
}

/** Kalıcı kuyruktan cihaz işlerini claim et (açılış / history). */
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

/** Stuck recovery + claim döngüsü — history ekranı / app focus. */
export async function kickKbsOcrRecovery(): Promise<void> {
  await recoverStuckDocumentOcr(40);
  await pollPersistentDeviceOcrJobs(6);
}

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
