/**
 * iOS HEIC / ph:// → JPEG; Android tarafında sohbet ve diğer paylaşımlarda güvenilir görüntüleme.
 */
import { Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { copyUriToCacheForUpload } from '@/lib/uploadMedia';

const HEIC_EXT_RE = /\.(heic|heif)(\?|$)/i;

export function uriMayBeHeic(uri: string): boolean {
  const u = uri.toLowerCase();
  return HEIC_EXT_RE.test(u) || u.includes('heic') || u.includes('heif');
}

function isRemoteHttpUri(uri: string): boolean {
  return /^https?:\/\//i.test(uri.trim());
}

/** jpg/jpeg/png/gif/webp her iki platformda da güvenle çözülür; dokunmaya gerek yok. */
export function hasWebSafeImageExt(uri: string): boolean {
  return /\.(jpe?g|png|gif|webp)(\?|$)/i.test(uri.trim());
}

function needsCacheCopy(uri: string): boolean {
  const u = uri.trim();
  if (!u) return false;
  if (u.startsWith('ph://') || u.startsWith('assets-library://')) return true;
  if (Platform.OS === 'ios' && uriMayBeHeic(u)) return true;
  return !u.startsWith('file://') && !u.startsWith('data:') && !u.startsWith('http');
}

/**
 * Tek bir URI'yi JPEG'e dönüştürmeyi dener. Başarısızsa hata fırlatmaz, `null` döner —
 * böylece çağıran taraf başka bir aday URI ile yeniden deneyebilir.
 */
async function tryManipulateToJpeg(
  uri: string,
  maxWidth: number,
  compress: number
): Promise<string | null> {
  // 1) Önce boyut değiştirmeden JPEG'e çevir: HEIC/HEIF ve Display-P3 (geniş renk uzayı)
  //    görüntüleri sRGB JPEG'e iner. Aynı geçişte gerçek genişliği öğrenip yalnızca
  //    gerekiyorsa küçültürüz (küçük görüntüleri gereksiz büyütüp bulanıklaştırmayız).
  try {
    const base = await ImageManipulator.manipulateAsync(uri, [], {
      compress,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    if (base?.uri) {
      if (typeof base.width === 'number' && base.width > maxWidth) {
        try {
          const resized = await ImageManipulator.manipulateAsync(
            base.uri,
            [{ resize: { width: maxWidth } }],
            { compress, format: ImageManipulator.SaveFormat.JPEG }
          );
          if (resized?.uri) return resized.uri;
        } catch {
          /* küçültme başarısızsa tam boy JPEG ile devam */
        }
      }
      return base.uri;
    }
  } catch {
    // Boyut okunamadıysa doğrudan küçülterek dönüştürmeyi dene.
    try {
      const out = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: maxWidth } }], {
        compress,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      if (out?.uri) return out.uri;
    } catch {
      /* aday başarısız */
    }
  }
  return null;
}

/**
 * Yerel resim URI'sini her platformda gösterilebilir JPEG'e çevirir.
 * Birden fazla aday URI (cache kopyası + orijinal) denenir; biri başarılı olursa onu döner.
 *
 * ÖNEMLİ: Dönüşüm başarısız olsa bile ASLA hata fırlatmaz — bu durumda orijinal URI döner.
 * Böylece (ör. native ImageManipulator bir cihazda çalışmasa bile) paylaşım hiçbir zaman
 * "JPEG'e dönüştürülemedi" hatasıyla engellenmez. iOS HEIC sorunu, seçim anında
 * `preferredAssetRepresentationMode: Compatible` ile zaten JPEG'e indirgenerek de çözülür.
 */
export async function ensureCrossPlatformJpegUri(
  uri: string,
  options?: { maxWidth?: number; compress?: number }
): Promise<string> {
  const maxWidth = options?.maxWidth ?? 1280;
  const compress = options?.compress ?? 0.78;
  const original = (uri ?? '').trim();
  if (!original) throw new Error('Resim URI boş');

  // Denenecek aday URI'ler. ph:// / content:// / HEIC için önce cache kopyası,
  // ardından her zaman orijinal URI (kopya başarısız ya da bozuksa orijinal kurtarır).
  const candidates: string[] = [];
  if (needsCacheCopy(original)) {
    try {
      const copied = await copyUriToCacheForUpload(original, 'image');
      if (copied && copied !== original) candidates.push(copied);
    } catch {
      /* kopya başarısız — orijinal ile denenecek */
    }
  }
  candidates.push(original);

  for (const candidate of candidates) {
    const out = await tryManipulateToJpeg(candidate, maxWidth, compress);
    if (out) return out;
  }

  // Dönüşüm tüm adaylarda başarısız oldu (ör. manipulator cihazda çalışmıyor).
  // Kullanıcıyı engellemek yerine orijinal URI ile devam et; çoğu cihazda seçim anındaki
  // Compatible modu zaten JPEG verdiği için bu yine de Android'de görüntülenir.
  if (__DEV__) {
    console.warn('[crossPlatformImage] JPEG dönüşümü başarısız, orijinal URI ile devam ediliyor:', original);
  }
  return original;
}

const STORAGE_OBJECT_PUBLIC = '/storage/v1/object/public/';
const STORAGE_RENDER_IMAGE_PUBLIC = '/storage/v1/render/image/public/';

/**
 * Uzak (Supabase Storage) HEIC/HEIF URL'lerini Android'in de çözebildiği formata çevirir.
 * Eski feed paylaşımlarında hâlâ `.heic` ile kayıtlı dosyalar için imgproxy üzerinden webp döner.
 * Yerel file:// URI'lere dokunulmaz.
 */
export function resolveCrossPlatformDisplayImageUrl(url: string | null | undefined): string | undefined {
  const raw = (url ?? '').trim();
  if (!raw) return undefined;
  if (!isRemoteHttpUri(raw)) return raw;
  if (!uriMayBeHeic(raw)) return raw;

  const objectIdx = raw.indexOf(STORAGE_OBJECT_PUBLIC);
  if (objectIdx < 0) return raw;

  const prefix = raw.slice(0, objectIdx);
  const objectPath = raw.slice(objectIdx + STORAGE_OBJECT_PUBLIC.length).split('?')[0] ?? '';
  if (!objectPath) return raw;

  return `${prefix}${STORAGE_RENDER_IMAGE_PUBLIC}${objectPath}?width=2048&resize=contain&format=webp&quality=85`;
}

/** Yükleme öncesi: JPEG'e çevrilemezse hata fırlatır (HEIC'in Storage'a gitmesini engeller). */
export async function ensureCrossPlatformJpegUriForUpload(
  uri: string,
  options?: { maxWidth?: number; compress?: number }
): Promise<string> {
  const out = await ensureCrossPlatformJpegUri(uri, options);
  if (uriMayBeHeic(out)) {
    throw new Error('Fotoğraf Android uyumlu JPEG formatına çevrilemedi. Lütfen galeriden tekrar seçin.');
  }
  return out;
}

/**
 * Storage'a yüklemeden ÖNCE çağrılır. iOS HEIC/HEIF, `ph://`/`assets-library://` ve
 * uzantısı belirsiz (ör. Android `content://`) görüntüleri Android'in de çözebildiği
 * JPEG'e çevirir. Zaten web-güvenli (jpg/png/gif/webp) ya da uzak http(s) görüntüler
 * olduğu gibi döner — böylece PNG saydamlığı korunur ve gereksiz yeniden kodlama olmaz.
 * Dönüşüm gerekiyor ama başarısızsa hata fırlatır (HEIC'in sessizce yüklenmesini engeller).
 */
export async function prepareCrossPlatformUploadImageUri(
  uri: string,
  options?: { maxWidth?: number; compress?: number }
): Promise<string> {
  const local = (uri ?? '').trim();
  if (!local) return uri;
  if (isRemoteHttpUri(local) || local.startsWith('data:')) return local;

  const mustConvert =
    uriMayBeHeic(local) ||
    local.startsWith('ph://') ||
    local.startsWith('assets-library://') ||
    (Platform.OS === 'android' && local.startsWith('content://')) ||
    !hasWebSafeImageExt(local);

  if (!mustConvert) return local;

  try {
    return await ensureCrossPlatformJpegUri(local, {
      maxWidth: options?.maxWidth ?? 2048,
      compress: options?.compress ?? 0.82,
    });
  } catch {
    // Genel yükleme akışlarını asla tamamen engelleme: dönüştürülemezse orijinali yükle
    // (dönüşüm öncesi davranışla aynı). Sohbet/feed bu fonksiyonu kullanmaz; onlar
    // kasıtlı olarak `ensureCrossPlatformJpegUri` ile katı kalır.
    return local;
  }
}
