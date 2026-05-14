import { create } from 'zustand';

/**
 * MRZ tarama oturumunda tek parti (ör. aynı aile): tüm kayıtlar aynı `mrz_batch_key` ile Supabase’e yazılır.
 */
export type MrzQueuedFingerprint = {
  mrzHash: string;
  documentNumber: string | null;
  birthDate: string | null;
  nationalityCode: string | null;
  firstName: string | null;
  lastName: string | null;
};

function normDoc(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = String(s).trim().toUpperCase();
  return t.length ? t : null;
}

function normName(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = String(s).trim().toUpperCase();
  return t.length ? t : null;
}

/** Oturum içi mükerrer (aynı MRZ veya aynı kimlik imzası). */
export function fingerprintFromMrzQueued(args: {
  mrzLine: string;
  documentNumber: string | null | undefined;
  birthDate: string | null | undefined;
  nationalityCode: string | null | undefined;
  firstName: string | null | undefined;
  lastName: string | null | undefined;
}): MrzQueuedFingerprint {
  let h = 0;
  const line = args.mrzLine.trim();
  for (let i = 0; i < line.length; i++) h = (Math.imul(31, h) + line.charCodeAt(i)) | 0;
  return {
    mrzHash: String(h),
    documentNumber: normDoc(args.documentNumber),
    birthDate: args.birthDate && args.birthDate.length >= 10 ? args.birthDate.slice(0, 10) : null,
    nationalityCode: normDoc(args.nationalityCode),
    firstName: normName(args.firstName),
    lastName: normName(args.lastName),
  };
}

function fingerprintConflict(a: MrzQueuedFingerprint, b: MrzQueuedFingerprint): boolean {
  if (a.mrzHash === b.mrzHash) return true;
  if (
    a.documentNumber &&
    a.birthDate &&
    a.nationalityCode &&
    a.lastName &&
    a.documentNumber === b.documentNumber &&
    a.birthDate === b.birthDate &&
    a.nationalityCode === b.nationalityCode &&
    a.lastName === b.lastName &&
    (a.firstName === b.firstName || !a.firstName || !b.firstName)
  ) {
    return true;
  }
  return false;
}

type State = {
  batchKey: string | null;
  queuedCount: number;
  queuedFingerprints: MrzQueuedFingerprint[];
  startSession: () => string;
  bumpQueued: () => void;
  registerQueuedFingerprint: (fp: MrzQueuedFingerprint) => void;
  hasQueuedConflict: (fp: MrzQueuedFingerprint) => boolean;
  resetSession: () => void;
};

function newBatchUuid(): string {
  const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const useKbsMrzBatchStore = create<State>((set, get) => ({
  batchKey: null,
  queuedCount: 0,
  queuedFingerprints: [],
  startSession: () => {
    const existing = get().batchKey;
    if (existing) return existing;
    const k = newBatchUuid();
    set({ batchKey: k, queuedCount: 0, queuedFingerprints: [] });
    return k;
  },
  bumpQueued: () => set((s) => ({ queuedCount: s.queuedCount + 1 })),
  registerQueuedFingerprint: (fp) =>
    set((s) => ({ queuedFingerprints: [...s.queuedFingerprints, fp] })),
  hasQueuedConflict: (fp) => get().queuedFingerprints.some((x) => fingerprintConflict(x, fp)),
  resetSession: () => set({ batchKey: null, queuedCount: 0, queuedFingerprints: [] }),
}));
