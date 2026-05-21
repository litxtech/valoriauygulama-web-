import type { TFunction } from 'i18next';

/** Teknik Mux/HTTP metinlerini kullanıcıya gösterme. */
export function storyVideoShareErrorMessage(t: TFunction, raw: unknown): string {
  const msg = ((raw as Error)?.message ?? '').trim();
  if (!msg) return t('storyShareFailed');
  if (
    /mux/i.test(msg) ||
    /http\s*\d{3}/i.test(msg) ||
    /oluşturulamadı|yüklenemedi|zaman aşımı/i.test(msg) ||
    /valoria/i.test(msg) ||
    /upload_track_failed|mux_upload_failed/i.test(msg)
  ) {
    return t('storyShareFailed');
  }
  if (msg === 'Oturum gerekli.' || msg === 'Oturum gerekli') {
    return msg;
  }
  return t('storyShareFailed');
}
