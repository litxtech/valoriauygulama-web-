/**
 * Admin ana panel giriş performansı — buradaki sabitleri ihtiyaca göre ayarlayın.
 *
 * - ADMIN_HOME_LIVE_OPS_STRIP: false → canlı metrik / kişi listesi yüklenmez
 * - ADMIN_HOME_LIVE_PEOPLE: false → yalnızca metrik şeridi (kişi listesi yok)
 * - ADMIN_HOME_DEFER_MS: ilk çizimden sonra ağır içerik gecikmesi
 * - adminDashboardCache.ts → ADMIN_DASHBOARD_FOCUS_REFRESH_MS: rozet sayıları ne sıklıkla yenilensin
 */

/** Canlı operasyon şeridi (doluluk, görev) ana panelde açılsın mı */
export const ADMIN_HOME_LIVE_OPS_STRIP = true;

/** Canlı kişi listesi — ek sorgu + avatar; ana panelde kapalı tutun */
export const ADMIN_HOME_LIVE_PEOPLE = false;

/** Panel açılışında ağır sorguları ilk paint sonrasına erteleme (ms) */
export const ADMIN_HOME_DEFER_MS = 120;

/** Canlı kişi listesi poll — önbellek varken seyrek yenile */
export const ADMIN_HOME_LIVE_PEOPLE_POLL_MS = 90_000;

/** Canlı metrik şeridi poll — arka planda çalışmaz (AppState kontrolü hook içinde). */
export const ADMIN_HOME_METRICS_POLL_MS = 180_000;

/** Canlı şerit oturum önbelleği (ms) */
export const ADMIN_HOME_LIVE_OPS_SESSION_TTL_MS = 5 * 60_000;
