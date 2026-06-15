/**
 * Admin ana panel giriş performansı — buradaki sabitleri ihtiyaca göre ayarlayın.
 *
 * - ADMIN_HOME_LIVE_OPS_STRIP: false → canlı metrik / kişi listesi / harita önizlemesi yüklenmez
 * - ADMIN_HOME_DEFER_MS: ilk çizimden sonra istatistik + canlı şerit gecikmesi
 * - adminDashboardCache.ts → ADMIN_DASHBOARD_FOCUS_REFRESH_MS: rozet sayıları ne sıklıkla yenilensin
 */

/** Canlı operasyon şeridi (doluluk, görev, çevrimiçi personel) ana panelde açılsın mı */
export const ADMIN_HOME_LIVE_OPS_STRIP = true;

/** Panel açılışında ağır sorguları ilk paint sonrasına erteleme (ms) */
export const ADMIN_HOME_DEFER_MS = 400;

/** Canlı kişi listesi poll — önbellek varken seyrek yenile */
export const ADMIN_HOME_LIVE_PEOPLE_POLL_MS = 60_000;

/** Canlı metrik şeridi poll */
export const ADMIN_HOME_METRICS_POLL_MS = 90_000;

/** Canlı şerit oturum önbelleği (ms) */
export const ADMIN_HOME_LIVE_OPS_SESSION_TTL_MS = 5 * 60_000;
