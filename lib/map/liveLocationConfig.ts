import * as Location from 'expo-location';

/** Harita canlı konum — düşük pil/ısı profili (BestForNavigation yerine). */
export const LIVE_MAP_LOCATION_WATCH: Location.LocationOptions = {
  accuracy: Location.Accuracy.Balanced,
  timeInterval: 15_000,
  distanceInterval: 30,
};

type Coords = { lat: number; lng: number };
const listeners = new Set<(coords: Coords) => void>();

let mapScreenActive = false;

export function setLiveMapScreenActive(active: boolean): void {
  mapScreenActive = active;
}

export function isLiveMapScreenActive(): boolean {
  return mapScreenActive;
}

export function broadcastLiveMapLocation(lat: number, lng: number): void {
  const coords = { lat, lng };
  for (const fn of listeners) fn(coords);
}

export function subscribeLiveMapLocation(listener: (coords: Coords) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
