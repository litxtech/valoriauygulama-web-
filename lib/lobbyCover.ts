import { supabase } from '@/lib/supabase';

export const LOBBY_COVER_SETTING_KEY = 'lobby_cover' as const;
export const LOBBY_MEDIA_BUCKET = 'lobby-media' as const;

export type LobbyCoverMediaType = 'image' | 'video';

export type LobbyCover = {
  mediaType: LobbyCoverMediaType;
  url: string;
};

type LobbyCoverRaw = {
  media_type?: unknown;
  mediaType?: unknown;
  url?: unknown;
};

function asNonEmptyUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

function asMediaType(value: unknown): LobbyCoverMediaType | null {
  if (value === 'image' || value === 'video') return value;
  return null;
}

/** app_settings.value (jsonb) → LobbyCover | null (varsayılan görsel) */
export function parseLobbyCover(raw: unknown): LobbyCover | null {
  if (raw == null || raw === '') return null;

  let obj: LobbyCoverRaw | null = null;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    obj = raw as LobbyCoverRaw;
  } else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        obj = parsed as LobbyCoverRaw;
      }
    } catch {
      return null;
    }
  }
  if (!obj) return null;

  const mediaType = asMediaType(obj.media_type ?? obj.mediaType);
  const url = asNonEmptyUrl(obj.url);
  if (!mediaType || !url) return null;
  return { mediaType, url };
}

export async function fetchLobbyCover(): Promise<LobbyCover | null> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', LOBBY_COVER_SETTING_KEY)
    .maybeSingle();
  if (error) throw error;
  return parseLobbyCover(data?.value);
}

export async function saveLobbyCover(cover: LobbyCover | null): Promise<void> {
  const value =
    cover == null
      ? null
      : {
          media_type: cover.mediaType,
          url: cover.url,
          updated_at: new Date().toISOString(),
        };

  const { error } = await supabase.from('app_settings').upsert(
    {
      key: LOBBY_COVER_SETTING_KEY,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  );
  if (error) throw error;
}
