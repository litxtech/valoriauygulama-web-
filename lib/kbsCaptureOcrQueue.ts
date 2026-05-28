import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { parseIdCardImageUri } from '@/lib/kbsCaptureOcr';
import { applyKbsCaptureOcrResult, markKbsCaptureOcrState } from '@/lib/kbsCaptureHistory';

export type KbsCaptureOcrJob = {
  docId: string;
  guestId: string;
  imageUrl: string;
  /** Kayıt sonrası yerel dosya — ağdan indirme atlanır. */
  localUri?: string | null;
};

const OCR_GAP_MS = Platform.OS === 'android' ? 500 : 280;

let jobs: KbsCaptureOcrJob[] = [];
let draining = false;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function downloadImage(url: string, docId: string): Promise<string> {
  const local = `${FileSystem.cacheDirectory ?? ''}kbs-ocr-${docId}.jpg`;
  const res = await FileSystem.downloadAsync(url, local);
  return res.uri;
}

async function runJob(job: KbsCaptureOcrJob): Promise<void> {
  await markKbsCaptureOcrState(job.docId, 'processing');
  try {
    let local = job.localUri?.trim() || '';
    if (local) {
      const info = await FileSystem.getInfoAsync(local);
      if (!info.exists) local = '';
    }
    if (!local) {
      local = await downloadImage(job.imageUrl, job.docId);
    }
    const ocr = await parseIdCardImageUri(local);
    const res = await applyKbsCaptureOcrResult(
      job.docId,
      job.guestId,
      ocr.parsed,
      ocr.parsed.confidence,
      ocr.engine
    );
    if (!res.ok) {
      await markKbsCaptureOcrState(job.docId, 'failed');
    }
  } catch {
    await markKbsCaptureOcrState(job.docId, 'failed');
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
  const exists = jobs.some((j) => j.docId === job.docId);
  if (!exists) jobs.push(job);
  void drainQueue();
}

export function enqueueKbsCaptureOcrBatch(batch: KbsCaptureOcrJob[]): void {
  for (const job of batch) enqueueKbsCaptureOcr(job);
}

export function kbsCaptureOcrQueueSize(): number {
  return jobs.length;
}
