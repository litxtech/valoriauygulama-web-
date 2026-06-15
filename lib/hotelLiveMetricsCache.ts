export type HotelLiveMetrics = {
  activeStaff: number;
  occupancyPercent: number;
  pendingTasks: number;
  checkInsToday: number;
  checkOutsToday: number;
  vacantRooms: number;
  emergencyActive: number;
  weatherLabel: string;
  loading: boolean;
};

const TTL_MS = 90_000;
export const HOTEL_LIVE_METRICS_FOCUS_REFRESH_MS = 5 * 60_000;

let entry: { key: string; metrics: HotelLiveMetrics; at: number } | null = null;

export function hotelLiveMetricsCacheKey(orgId: string): string {
  return orgId;
}

export function getHotelLiveMetricsCache(key: string, allowStale = false): HotelLiveMetrics | null {
  if (!entry || entry.key !== key) return null;
  if (!allowStale && Date.now() - entry.at > TTL_MS) return null;
  return entry.metrics;
}

export function setHotelLiveMetricsCache(key: string, metrics: HotelLiveMetrics): void {
  entry = { key, metrics, at: Date.now() };
}

export function getHotelLiveMetricsCacheAgeMs(key: string): number | null {
  if (!entry || entry.key !== key) return null;
  return Date.now() - entry.at;
}
