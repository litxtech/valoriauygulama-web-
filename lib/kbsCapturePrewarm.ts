import type { KbsCaptureSide } from '@/lib/kbsCaptureOcr';
import { prepareKbsCaptureImageUri, prepareKbsCaptureUploadUri } from '@/lib/kbsCaptureUpload';
import { uploadPassportPrivateFromUri } from '@/lib/uploadPassportPrivate';
import { startKbsCaptureOcrPrewarm } from '@/lib/kbsCaptureOcrQueue';
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
export function warmKbsCaptureOpsContext(knownAuthUserId?: string | null): void {
  if (!opsCtxPromise) {
    // Başarısız sonucu önbelleğe ALMA: soğuk açılışta oturum henüz hazır değilse
    // "Oturum yok" sonucu kalıcı olarak yapışıp sonraki tüm çağrıları bozuyordu.
    const p = resolveOpsHotelIdForCaller(knownAuthUserId);
    opsCtxPromise = p;
    void p
      .then((ctx) => {
        if (!ctx.ok && opsCtxPromise === p) opsCtxPromise = null;
      })
      .catch(() => {
        if (opsCtxPromise === p) opsCtxPromise = null;
      });
  }
}

export async function getKbsCaptureOpsContext(knownAuthUserId?: string | null) {
  warmKbsCaptureOpsContext(knownAuthUserId);
  const ctx = await opsCtxPromise!;
  if (!ctx.ok) {
    // Başarısız önbelleği temizle ki bir sonraki deneme yeniden çözülebilsin.
    opsCtxPromise = null;
    throw new Error(ctx.message);
  }
  return ctx;
}

export function cancelKbsCapturePrewarm(itemId: string): void {
  const e = entries.get(itemId);
  if (e) e.cancelled = true;
  entries.delete(itemId);
}

function runPrewarm(args: {
  imageUri: string;
  captureSide?: KbsCaptureSide;
  captureSource?: 'camera' | 'gallery';
}): Promise<KbsCapturePrewarmReady> {
  warmKbsCaptureOpsContext();

  return (async () => {
    const preparedUri = await prepareKbsCaptureImageUri(args.imageUri);
    startKbsCaptureOcrPrewarm(preparedUri, {
      captureSide: args.captureSide ?? 'front',
      captureSource: args.captureSource ?? 'camera',
    });
    // OCR yerel tam kaliteli dosyadan çalışır; ağa küçültülmüş kopya gider (zayıf internet).
    const uploadUri = await prepareKbsCaptureUploadUri(preparedUri);
    const upload = await uploadPassportPrivateFromUri({
      uri: uploadUri,
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
  captureSource?: 'camera' | 'gallery';
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

const PREWARM_AWAIT_MS = 55_000;
/** Zaman aşımında aynı işi beklemeye devam et — paralel ikinci yükleme zayıf interneti ikiye böler. */
const PREWARM_GRACE_MS = 45_000;

function raceWithTimeout(
  entry: Entry,
  ms: number
): Promise<KbsCapturePrewarmReady> {
  return Promise.race([
    entry.promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('kbs_prewarm_TIMEOUT')), ms)
    ),
  ]);
}

export async function awaitKbsCapturePrewarm(itemId: string): Promise<KbsCapturePrewarmReady | null> {
  const entry = entries.get(itemId);
  if (!entry || entry.cancelled) return null;
  try {
    const ready = await raceWithTimeout(entry, PREWARM_AWAIT_MS);
    if (entry.cancelled) return null;
    return ready;
  } catch (e) {
    if (e instanceof Error && e.message === 'kbs_prewarm_TIMEOUT') {
      try {
        const ready = await raceWithTimeout(entry, PREWARM_GRACE_MS);
        if (entry.cancelled) return null;
        return ready;
      } catch {
        // Grace de doldu / iş hata verdi — aşağıda temiz denemeye düş.
      }
    }
    entries.delete(itemId);
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
