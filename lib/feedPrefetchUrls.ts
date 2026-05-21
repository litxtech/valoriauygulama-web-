/** Feed listesi için önbellek ısıtma URL’leri (video poster + görseller). */
export function collectFeedPostPrefetchUrls(
  posts: {
    media_type?: string | null;
    media_url?: string | null;
    thumbnail_url?: string | null;
    media_items?: {
      media_type: 'image' | 'video';
      media_url: string;
      thumbnail_url?: string | null;
    }[];
  }[]
): string[] {
  const urls: string[] = [];
  const push = (u: string | null | undefined) => {
    const t = (u ?? '').trim();
    if (t.length > 4) urls.push(t);
  };

  for (const p of posts) {
    if (p.media_items && p.media_items.length > 0) {
      for (const m of p.media_items) {
        if (m.media_type === 'video') push(m.thumbnail_url);
        else push(m.thumbnail_url || m.media_url);
      }
    } else {
      if (p.media_type === 'video') push(p.thumbnail_url);
      else push(p.thumbnail_url || p.media_url);
    }
  }
  return urls;
}
