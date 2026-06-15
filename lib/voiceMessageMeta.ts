/** Sesli mesaj süresini content alanında taşır (voice:12). Eski 🎤 mesajlarıyla uyumlu. */
export function encodeVoiceContent(durationSec: number): string {
  const sec = Math.max(1, Math.round(durationSec));
  return `voice:${sec}`;
}

export function parseVoiceDuration(content: string | null | undefined): number | null {
  if (!content) return null;
  const match = content.match(/^voice:(\d+)$/);
  if (match) return parseInt(match[1], 10);
  return null;
}

export function formatVoiceTime(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Ses dosyası URL'si — content'teki voice:12 meta değerini yok sayar. */
export function resolveVoiceMediaUrl(
  mediaUrl: string | null | undefined,
  content: string | null | undefined
): string | null {
  const url = (mediaUrl || '').trim();
  if (isPlayableMediaUri(url)) return normalizeLocalUri(url);
  const c = (content || '').trim();
  if (isPlayableMediaUri(c)) return normalizeLocalUri(c);
  return null;
}

function isPlayableMediaUri(value: string): boolean {
  if (!value) return false;
  if (value.startsWith('voice:')) return false;
  return (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('file://') ||
    value.startsWith('blob:') ||
    value.startsWith('/')
  );
}

function normalizeLocalUri(uri: string): string {
  if (uri.startsWith('/') && !uri.startsWith('//')) return `file://${uri}`;
  return uri;
}
