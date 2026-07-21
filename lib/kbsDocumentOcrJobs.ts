import { supabase } from '@/lib/supabase';
import { withPromiseTimeout } from '@/lib/edgeInvokeTimeout';
import { log } from '@/lib/logger';
import type { ParsedDocument } from '@/lib/scanner/types';
import type { KbsCaptureSide } from '@/lib/kbsCaptureOcr';

/** Zayıf ağda takılı RPC, OCR kuyruğunu (Android'de tek slot) süresiz kilitlemesin. */
const OCR_RPC_TIMEOUT_MS = 20_000;
/** Sunucu OCR işlemi uzun sürebilir; yine de sonsuz bekleme olmasın. */
const SERVER_OCR_TIMEOUT_MS = 60_000;

function boundedRpc<T>(query: PromiseLike<T>, label: string): Promise<T> {
  return withPromiseTimeout(query, OCR_RPC_TIMEOUT_MS, label);
}

export type KbsOcrStrategy = 'device_fast' | 'device_deep' | 'server_fallback';

export type DocumentOcrJobRow = {
  id: string;
  hotel_id: string;
  guest_document_id: string;
  guest_id: string | null;
  image_url: string | null;
  strategy: KbsOcrStrategy;
  status: string;
  attempt: number;
  max_attempts: number;
  requested_side: KbsCaptureSide;
  pipeline_version: string;
  missing_fields?: string[] | null;
};

type RpcEnvelope<T> = {
  ok?: boolean;
  data?: T;
  error?: { code?: string; message?: string };
};

export async function enqueueDocumentOcrJob(opts: {
  guestDocumentId: string;
  strategy?: KbsOcrStrategy;
  requestedSide?: KbsCaptureSide;
  force?: boolean;
}): Promise<{ ok: true; job: DocumentOcrJobRow | null } | { ok: false; message: string }> {
  let data: unknown;
  let error: { message: string } | null;
  try {
    const res = await boundedRpc(
      supabase.rpc('enqueue_document_ocr_job', {
        p_guest_document_id: opts.guestDocumentId,
        p_strategy: opts.strategy ?? 'device_fast',
        p_requested_side: opts.requestedSide ?? 'front',
        p_pipeline_version: 'v1',
        p_force: opts.force === true,
      }),
      'enqueue_document_ocr_job'
    );
    data = res.data;
    error = res.error;
  } catch (e) {
    error = { message: e instanceof Error ? e.message : 'RPC zaman aşımı' };
  }
  if (error) {
    // Migration henüz yoksa soft-fail — bellek kuyruğu devam eder.
    log.warn('kbsDocumentOcrJobs', 'enqueue rpc failed', { error: error.message });
    return { ok: false, message: error.message };
  }
  const env = data as RpcEnvelope<DocumentOcrJobRow>;
  if (env?.ok === false) {
    return { ok: false, message: env.error?.message ?? 'Enqueue failed' };
  }
  return { ok: true, job: (env?.data as DocumentOcrJobRow) ?? null };
}

export async function claimDocumentOcrJob(opts: {
  lockedBy: string;
  strategies?: KbsOcrStrategy[];
  leaseSeconds?: number;
}): Promise<DocumentOcrJobRow | null> {
  let data: unknown;
  try {
    const res = await boundedRpc(
      supabase.rpc('claim_document_ocr_job', {
        p_locked_by: opts.lockedBy,
        p_strategies: opts.strategies ?? ['device_fast', 'device_deep'],
        p_lease_seconds: opts.leaseSeconds ?? 120,
      }),
      'claim_document_ocr_job'
    );
    if (res.error) {
      log.warn('kbsDocumentOcrJobs', 'claim rpc failed', { error: res.error.message });
      return null;
    }
    data = res.data;
  } catch (e) {
    log.warn('kbsDocumentOcrJobs', 'claim rpc timeout', { e });
    return null;
  }
  const env = data as RpcEnvelope<DocumentOcrJobRow | null>;
  if (!env?.ok) return null;
  return env.data ?? null;
}

export async function applyDocumentOcrResultRpc(opts: {
  jobId?: string | null;
  guestDocumentId: string;
  parsed: ParsedDocument;
  scanConfidence?: number | null;
  ocrEngine?: string | null;
  expectedRevision?: number | null;
  outcome?: 'auto' | 'manual';
}): Promise<{ ok: true; coreReady: boolean; ocrStatus: string } | { ok: false; message: string }> {
  let data: unknown;
  try {
    const res = await boundedRpc(
      supabase.rpc('apply_document_ocr_result', {
        p_job_id: opts.jobId ?? null,
        p_guest_document_id: opts.guestDocumentId,
        p_parsed: opts.parsed,
        p_scan_confidence: opts.scanConfidence ?? null,
        p_ocr_engine: opts.ocrEngine ?? null,
        p_expected_revision: opts.expectedRevision ?? null,
        p_outcome: opts.outcome ?? 'auto',
      }),
      'apply_document_ocr_result'
    );
    if (res.error) return { ok: false, message: res.error.message };
    data = res.data;
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'RPC zaman aşımı' };
  }
  const env = data as RpcEnvelope<{
    coreReady?: boolean;
    ocrStatus?: string;
  }>;
  if (env?.ok === false) {
    return { ok: false, message: env.error?.message ?? 'Apply failed' };
  }
  return {
    ok: true,
    coreReady: env?.data?.coreReady === true,
    ocrStatus: String(env?.data?.ocrStatus ?? ''),
  };
}

export async function saveDocumentManualFieldsRpc(opts: {
  guestDocumentId: string;
  fields: Record<string, unknown>;
  lockedFields?: string[];
}): Promise<{ ok: true; coreReady: boolean } | { ok: false; message: string }> {
  let data: unknown;
  try {
    const res = await boundedRpc(
      supabase.rpc('save_document_manual_fields', {
        p_guest_document_id: opts.guestDocumentId,
        p_fields: opts.fields,
        p_locked_fields: opts.lockedFields ?? null,
      }),
      'save_document_manual_fields'
    );
    if (res.error) return { ok: false, message: res.error.message };
    data = res.data;
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'RPC zaman aşımı' };
  }
  const env = data as RpcEnvelope<{ coreReady?: boolean }>;
  if (env?.ok === false) {
    return { ok: false, message: env.error?.message ?? 'Save failed' };
  }
  return { ok: true, coreReady: env?.data?.coreReady === true };
}

export async function recoverStuckDocumentOcr(limit = 40): Promise<number> {
  let data: unknown;
  try {
    const res = await boundedRpc(
      supabase.rpc('recover_stuck_document_ocr', { p_limit: limit }),
      'recover_stuck_document_ocr'
    );
    if (res.error) {
      log.warn('kbsDocumentOcrJobs', 'recover rpc failed', { error: res.error.message });
      return 0;
    }
    data = res.data;
  } catch (e) {
    log.warn('kbsDocumentOcrJobs', 'recover rpc timeout', { e });
    return 0;
  }
  const env = data as RpcEnvelope<{
    enqueued?: number;
    leaseRecovered?: number;
    staleCleared?: number;
  }>;
  return (
    Number(env?.data?.enqueued ?? 0) +
    Number(env?.data?.leaseRecovered ?? 0) +
    Number(env?.data?.staleCleared ?? 0)
  );
}

export async function scanDocumentMissingFieldsRpc(
  guestDocumentId: string
): Promise<{ ok: true; missingFields: string[]; coreReady: boolean } | { ok: false; message: string }> {
  let data: unknown;
  try {
    const res = await boundedRpc(
      supabase.rpc('scan_document_missing_fields', {
        p_guest_document_id: guestDocumentId,
      }),
      'scan_document_missing_fields'
    );
    if (res.error) return { ok: false, message: res.error.message };
    data = res.data;
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'RPC zaman aşımı' };
  }
  const env = data as RpcEnvelope<{ missingFields?: string[]; coreReady?: boolean }>;
  if (env?.ok === false) {
    return { ok: false, message: env.error?.message ?? 'Scan failed' };
  }
  const missing = Array.isArray(env?.data?.missingFields)
    ? (env!.data!.missingFields as string[])
    : [];
  return { ok: true, missingFields: missing, coreReady: env?.data?.coreReady === true };
}

/** Sunucu OCR fallback — Edge Function. */
export async function requestServerOcrFallback(opts: {
  guestDocumentId: string;
  jobId?: string | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { ok: false, message: 'Oturum gerekli' };

  let data: unknown;
  try {
    const res = await withPromiseTimeout(
      supabase.functions.invoke('kbs-ocr-worker', {
        body: {
          action: 'process',
          guestDocumentId: opts.guestDocumentId,
          jobId: opts.jobId ?? null,
        },
      }),
      SERVER_OCR_TIMEOUT_MS,
      'kbs-ocr-worker'
    );
    if (res.error) return { ok: false, message: (res.error as Error).message };
    data = res.data;
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Sunucu OCR zaman aşımı' };
  }
  const body = data as { ok?: boolean; error?: { message?: string } } | null;
  if (body && body.ok === false) {
    return { ok: false, message: body.error?.message ?? 'Sunucu OCR başarısız' };
  }
  return { ok: true };
}
