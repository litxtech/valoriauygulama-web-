/** Supabase embed bazen tek nesne bazen tek elemanlı dizi döner. */
export function unwrapFeedRelation<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null;
  return value;
}

export type FeedStaffEmbed = {
  full_name?: string | null;
  department?: string | null;
  position?: string | null;
  profile_image?: string | null;
  verification_badge?: 'blue' | 'yellow' | null;
  profile_hidden_by_admin?: boolean | null;
  deleted_at?: string | null;
  organization?:
    | { name?: string | null; kind?: string | null }
    | { name?: string | null; kind?: string | null }[]
    | null;
};

export type FeedGuestEmbed = {
  full_name?: string | null;
  photo_url?: string | null;
  deleted_at?: string | null;
};

export function parseFeedStaffEmbed(
  raw: FeedStaffEmbed | FeedStaffEmbed[] | null | undefined
): (FeedStaffEmbed & { organization?: { name?: string | null; kind?: string | null } | null }) | null {
  const row = unwrapFeedRelation(raw);
  if (!row) return null;
  const organization = unwrapFeedRelation(row.organization ?? null);
  return { ...row, organization };
}

export function parseFeedGuestEmbed(
  raw: FeedGuestEmbed | FeedGuestEmbed[] | null | undefined
): FeedGuestEmbed | null {
  return unwrapFeedRelation(raw);
}

export function buildStaffAvatarLookup(
  rows: { id: string; profile_image?: string | null }[]
): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const row of rows) {
    const url = (row.profile_image ?? '').trim();
    if (url) map.set(row.id, url);
  }
  return map;
}

/** Gönderi kartı avatarı: embed + isteğe bağlı personel listesi yedeklemesi. */
export function resolveFeedAuthorAvatarUrl(params: {
  staff?: FeedStaffEmbed | FeedStaffEmbed[] | null;
  guest?: FeedGuestEmbed | FeedGuestEmbed[] | null;
  staffId?: string | null;
  staffAvatarById?: Map<string, string | null>;
}): string | null {
  const staffInfo = parseFeedStaffEmbed(params.staff ?? null);
  const guestInfo = parseFeedGuestEmbed(params.guest ?? null);
  let url = (staffInfo?.profile_image ?? guestInfo?.photo_url ?? '').trim();
  if (!url && params.staffId && params.staffAvatarById) {
    url = (params.staffAvatarById.get(params.staffId) ?? '').trim();
  }
  return url || null;
}
