export type FeedPostVisibility =
  | 'all_staff'
  | 'my_team'
  | 'managers_only'
  | 'customers'
  | 'guests_only';

/** Misafir uygulamasında gösterilen paylaşım görünürlükleri */
export const GUEST_FEED_VISIBILITIES: FeedPostVisibility[] = ['customers', 'guests_only'];

export function isGuestVisibleFeedVisibility(v: string | null | undefined): boolean {
  return v === 'customers' || v === 'guests_only';
}

/** Personel paylaşımında misafirlere push / ana sayfa bildirimi gönderilsin mi */
export function shouldNotifyGuestsForStaffPost(v: FeedPostVisibility): boolean {
  return v === 'customers';
}

/** Misafir paylaşımında personele bildirim gönderilsin mi */
export function shouldNotifyStaffForGuestPost(v: FeedPostVisibility): boolean {
  return v === 'customers';
}
