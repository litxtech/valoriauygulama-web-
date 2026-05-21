/**
 * Ortak medya yükleme yardımcıları.
 * URI veya data URI üzerinden ArrayBuffer'a çevirir. Android content:// ve base64 güvenli.
 * SDK 54+ için readAsStringAsync legacy API kullanılır.
 * Android content:// için copyAsync ile cache'e kopyalama fallback'i vardır.
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';

/** Data URI (data:image/jpeg;base64,...) içindeki base64 kısmını çıkarır ve decode eder. */
function dataUriToArrayBuffer(uri: string): ArrayBuffer {
  const comma = uri.indexOf(',');
  if (comma === -1) {
    console.warn('[uploadMedia] dataUri: virgül yok');
    throw new Error('Geçersiz data URI');
  }
  const base64 = uri.slice(comma + 1).trim();
  if (!base64) throw new Error('Data URI içinde base64 bulunamadı');
  return decode(base64);
}

export type UriToArrayBufferOptions = {
  /** Video için base64 okuma yolu kullanılmaz (çok yavaş / bellek); `content://` kopyası .mp4 olur */
  mediaKind?: 'image' | 'video';
};

const LARGE_FOR_BASE64 = 4 * 1024 * 1024;

/** Yerel dosyayı fetch ile oku; `response.ok` bazı RN sürümlerinde file:// için yanlış olabildiğinden sadece boyuta bakılır. */
async function tryFetchLocalToArrayBuffer(uri: string): Promise<ArrayBuffer | null> {
  const candidates: string[] = [];
  const u = uri.trim();
  if (u.startsWith('file://')) {
    candidates.push(u);
  } else if (u.startsWith('/')) {
    candidates.push(`file://${u}`, u);
  } else {
    candidates.push(u);
  }
  for (const cand of candidates) {
    try {
      const response = await fetch(cand);
      const buf = await response.arrayBuffer();
      if (buf.byteLength > 0) return buf;
    } catch {
      /* deneme */
    }
  }
  return null;
}

/** Yerel (file://, content://), data URI veya uzak URI'yi ArrayBuffer'a çevirir. */
export async function uriToArrayBuffer(uri: string, options?: UriToArrayBufferOptions): Promise<ArrayBuffer> {
  const mediaKind = options?.mediaKind ?? 'image';
  const forbidBase64 = mediaKind === 'video';

  const normalized = (uri || '').trim();
  if (!normalized) throw new Error('URI boş');

  if (normalized.startsWith('data:')) {
    return dataUriToArrayBuffer(normalized);
  }

  if (normalized.startsWith('file://') || normalized.startsWith('content://')) {
    let uriToRead = normalized;

    if (Platform.OS === 'android' && normalized.startsWith('content://')) {
      try {
        /** content://…/video/… çoğu zaman .mp4 içermez; video için her zaman .mp4 kopyala */
        const ext = mediaKind === 'video' ? '.mp4' : '.jpg';
        const tempPath = `${FileSystem.cacheDirectory}upload_temp_${Date.now()}${ext}`;
        await FileSystem.copyAsync({ from: normalized, to: tempPath });
        uriToRead = tempPath;
      } catch (e) {
        console.warn('[uploadMedia] content:// copyAsync hatası, doğrudan okumayı deniyoruz:', (e as Error)?.message);
      }
    }

    const cleanupTemp = async () => {
      if (uriToRead !== normalized) {
        try {
          await FileSystem.deleteAsync(uriToRead, { idempotent: true });
        } catch (_) {}
      }
    };

    const fromFetch = await tryFetchLocalToArrayBuffer(uriToRead);
    if (fromFetch) {
      await cleanupTemp();
      return fromFetch;
    }

    /** file:// öneki olmayan cache yolu */
    if (!uriToRead.startsWith('file://') && !uriToRead.startsWith('content://')) {
      const again = await tryFetchLocalToArrayBuffer(uriToRead);
      if (again) {
        await cleanupTemp();
        return again;
      }
    }

    let fileSize = 0;
    try {
      const info = await FileSystem.getInfoAsync(uriToRead);
      if (info.exists && 'size' in info && typeof info.size === 'number') fileSize = info.size;
    } catch {
      /* yok say */
    }

    const tooLargeForBase64 = fileSize > LARGE_FOR_BASE64;

    if (forbidBase64 || tooLargeForBase64) {
      const last = await tryFetchLocalToArrayBuffer(normalized);
      if (last) {
        await cleanupTemp();
        return last;
      }
      await cleanupTemp();
      throw new Error(
        forbidBase64
          ? 'Video dosyası okunamadı. Galeriden yeniden seçin veya daha kısa bir video deneyin.'
          : 'Dosya çok büyük ve okunamadı. Daha küçük bir dosya seçin.'
      );
    }

    const encoding = (FileSystem.EncodingType && (FileSystem.EncodingType as Record<string, string>).Base64) ?? 'base64';
    try {
      const base64 = await FileSystem.readAsStringAsync(uriToRead, {
        encoding: encoding as 'base64',
      });
      await cleanupTemp();
      if (typeof base64 !== 'string' || !base64) {
        throw new Error('Dosya okunamadı');
      }
      return decode(base64);
    } catch (e1) {
      await cleanupTemp();
      console.warn('[uploadMedia] FileSystem.readAsStringAsync hatası:', (e1 as Error)?.message);
      try {
        const response = await fetch(normalized);
        const blob = await response.blob();
        return await new Response(blob).arrayBuffer();
      } catch (e2) {
        console.error('[uploadMedia] fetch fallback hatası:', (e2 as Error)?.message);
        throw new Error('Medya okunamadı. Lütfen dosyayı tekrar seçin.');
      }
    }
  }

  const response = await fetch(normalized);
  const blob = await response.blob();
  return await new Response(blob).arrayBuffer();
}

/**
 * Android'de galeri `content://` URI'leri çoğu zaman önizlemede görünmez; cache'e kopyalanmış `file://` yolu kullanın.
 * Görev eki önizlemesi (CachedImage / Video) ve tutarlı yükleme için seçim sonrası çağrılabilir.
 */
export async function copyAndroidContentUriToCacheForPreview(uri: string, kind: 'image' | 'video'): Promise<string> {
  const normalized = (uri || '').trim();
  if (Platform.OS !== 'android' || !normalized.startsWith('content://')) {
    return normalized;
  }
  return copyUriToCacheForUpload(normalized, kind);
}

/** Galeri/kamera URI → cache `file://` (iOS ph://, Android content:// dahil). */
export async function copyUriToCacheForUpload(uri: string, kind: 'image' | 'video'): Promise<string> {
  const normalized = (uri || '').trim();
  if (!normalized) return normalized;
  if (normalized.startsWith('file://')) return normalized;
  if (Platform.OS === 'android' && normalized.startsWith('/') && !normalized.startsWith('content://')) {
    return `file://${normalized}`;
  }
  if (Platform.OS === 'web') return normalized;

  const base = FileSystem.cacheDirectory;
  if (!base) {
    throw new Error('Önbellek dizini yok. Uygulamayı yeniden başlatıp tekrar deneyin.');
  }
  const ext = kind === 'video' ? 'mp4' : 'jpg';
  const name = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 11)}.${ext}`;
  const dest = `${base}${name}`;
  await FileSystem.copyAsync({ from: normalized, to: dest });
  return dest.startsWith('file://') ? dest : `file://${dest}`;
}

/** Yerel dosyadan doğrudan Storage REST yüklemesi mümkün mü? */
export function isLocalFileUriForUpload(uri: string): boolean {
  const u = (uri || '').trim();
  if (Platform.OS === 'web') return u.startsWith('file://') || u.startsWith('blob:');
  return u.startsWith('file://') || (Platform.OS === 'android' && u.startsWith('/'));
}

/** URI veya dosya adından MIME ve uzantı tahmini. */
export function getMimeAndExt(
  uriOrFileName: string,
  kind: 'image' | 'video' | 'audio' = 'image'
): { mime: string; ext: string } {
  const lower = uriOrFileName.toLowerCase();
  if (lower.startsWith('data:')) {
    const semicolon = uriOrFileName.indexOf(';');
    if (semicolon > 5) {
      const mime = lower.slice(5, semicolon).trim();
      if (mime.startsWith('image/')) {
        const subtype = mime.slice(6).split('+')[0];
        const extMap: Record<string, string> = { png: 'png', jpeg: 'jpg', jpg: 'jpg', webp: 'webp', gif: 'gif' };
        return { mime: mime.includes('jpeg') ? 'image/jpeg' : mime, ext: extMap[subtype] ?? 'jpg' };
      }
      if (mime.startsWith('video/')) return { mime: 'video/mp4', ext: 'mp4' };
    }
  }
  if (kind === 'video' || lower.includes('.mp4') || lower.includes('.mov') || lower.includes('video')) {
    if (lower.includes('.mov')) return { mime: 'video/quicktime', ext: 'mov' };
    return { mime: 'video/mp4', ext: 'mp4' };
  }
  if (kind === 'audio' || lower.includes('.m4a') || lower.includes('audio')) {
    return { mime: 'audio/m4a', ext: 'm4a' };
  }
  if (lower.includes('.png')) return { mime: 'image/png', ext: 'png' };
  if (lower.includes('.webp')) return { mime: 'image/webp', ext: 'webp' };
  return { mime: 'image/jpeg', ext: 'jpg' };
}
