export type KitchenMenuPromoVideo = {
  id: string;
  title: string;
  videoUrl?: string | null;
  muxPlaybackId?: string | null;
  posterUrl?: string | null;
};

export function newKitchenMenuPromoVideoId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `pv-${Date.now().toString(36)}`;
}

export function parseKitchenMenuPromoVideos(raw: unknown): KitchenMenuPromoVideo[] {
  if (!Array.isArray(raw)) return [];
  const out: KitchenMenuPromoVideo[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const o = row as Record<string, unknown>;
    const title = typeof o.title === 'string' ? o.title.trim() : '';
    const videoUrl = typeof o.videoUrl === 'string' ? o.videoUrl.trim() : '';
    const muxPlaybackId = typeof o.muxPlaybackId === 'string' ? o.muxPlaybackId.trim() : '';
    const posterUrl = typeof o.posterUrl === 'string' ? o.posterUrl.trim() : '';
    const id =
      typeof o.id === 'string' && o.id.trim()
        ? o.id.trim()
        : newKitchenMenuPromoVideoId();
    if (!videoUrl && !muxPlaybackId) continue;
    out.push({
      id,
      title: title || 'Restoran tanıtımı',
      videoUrl: videoUrl || null,
      muxPlaybackId: muxPlaybackId || null,
      posterUrl: posterUrl || null,
    });
  }
  return out;
}

export function kitchenMenuPromoVideosToPayload(videos: KitchenMenuPromoVideo[]): KitchenMenuPromoVideo[] {
  return videos
    .map((v) => ({
      id: v.id,
      title: v.title.trim() || 'Restoran tanıtımı',
      videoUrl: v.videoUrl?.trim() || null,
      muxPlaybackId: v.muxPlaybackId?.trim() || null,
      posterUrl: v.posterUrl?.trim() || null,
    }))
    .filter((v) => v.videoUrl || v.muxPlaybackId);
}

export function resolvePromoVideoPlayUrl(video: KitchenMenuPromoVideo): string | null {
  const direct = video.videoUrl?.trim();
  if (direct) return direct;
  const mux = video.muxPlaybackId?.trim();
  if (mux) return `https://stream.mux.com/${mux}.m3u8`;
  return null;
}

export function resolvePromoVideoPoster(video: KitchenMenuPromoVideo): string | null {
  const poster = video.posterUrl?.trim();
  if (poster) return poster;
  const mux = video.muxPlaybackId?.trim();
  if (mux) return `https://image.mux.com/${mux}/thumbnail.jpg?width=720&time=1`;
  return null;
}
