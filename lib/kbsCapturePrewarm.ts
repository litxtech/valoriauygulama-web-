import type { KbsCaptureSide } from '@/lib/kbsCaptureOcr';
import { prepareKbsCaptureImageUri } from '@/lib/kbsCaptureUpload';
import { uploadPassportPrivateFromUri } from '@/lib/uploadPassportPrivate';
import { resolveOpsHotelIdForCaller } from '@/lib/resolveOpsHotelId';

export type KbsCapturePrewarmReady = {
  preparedUri: string;
  upload: { publicUrl: string };
};

type Entry = {
  promise: Promise<KbsCapturePrewarmReady>;
  cancelled: boolean;
};

const entries = new Map<string, Entry>();

let opsCtxPromise: ReturnType<typeof resolveOpsHotelIdForCaller> | null = null;

/** İlk çekimde otel bağlamını ısıt — onayda tekrar beklenmesin. */
export function warmKbsCaptureOpsContext(): void {
  if (!opsCtxPromise) {
    opsCtxPromise = resolveOpsHotelIdForCaller();
  }
}

export async function getKbsCaptureOpsContext() {
  warmKbsCaptureOpsContext();
  const ctx = await opsCtxPromise!;
  if (!ctx.ok) throw new Error(ctx.message);
  return ctx;
}

export function cancelKbsCapturePrewarm(itemId: string): void {
  const e = entries.get(itemId);
  if (e) e.cancelled = true;
  entries.delete(itemId);
}

function runPrewarm(args: { imageUri: string }): Promise<KbsCapturePrewarmReady> {
  warmKbsCaptureOpsContext();

  return (async () => {
    const preparedUri = await prepareKbsCaptureImageUri(args.imageUri);
    const upload = await uploadPassportPrivateFromUri({
      uri: preparedUri,
      subfolder: 'kbs-documents',
    });
    return {
      preparedUri,
      upload: { publicUrl: upload.publicUrl },
    };
  })();
}

/** Çekim anında arka planda: sıkıştır → yükle. Onayda yalnızca DB + oda ataması kalır. */
export function startKbsCapturePrewarm(args: {
  itemId: string;
  imageUri: string;
  captureSide?: KbsCaptureSide;
}): void {
  const existing = entries.get(args.itemId);
  if (existing && !existing.cancelled) return;

  const entry: Entry = {
    cancelled: false,
    promise: runPrewarm(args),
  };
  entries.set(args.itemId, entry);

  void entry.promise.catch(() => {});
}

export async function awaitKbsCapturePrewarm(itemId: string): Promise<KbsCapturePrewarmReady | null> {
  const entry = entries.get(itemId);
  if (!entry || entry.cancelled) return null;
  try {
    const ready = await entry.promise;
    if (entry.cancelled) return null;
    return ready;
  } catch {
    return null;
  }
}

/** Onay öncesi tüm kuyruk öğelerinin hazır olmasını bekle (paralel). */
export async function awaitAllKbsCapturePrewarm(itemIds: string[]): Promise<Map<string, KbsCapturePrewarmReady>> {
  const pairs = await Promise.all(
    itemIds.map(async (id) => {
      const ready = await awaitKbsCapturePrewarm(id);
      return [id, ready] as const;
    })
  );
  const map = new Map<string, KbsCapturePrewarmReady>();
  for (const [id, ready] of pairs) {
    if (ready) map.set(id, ready);
  }
  return map;
}

export function clearKbsCapturePrewarmAll(): void {
  entries.clear();
}
