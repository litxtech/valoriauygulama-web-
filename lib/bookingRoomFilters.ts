import type { BookableRoom } from '@/lib/onlineBooking';
import type { RoomFiltersState, RoomSizeBucket } from '@/components/booking/BookingRoomFilters';

function matchesSize(area: number | null, bucket: RoomSizeBucket): boolean {
  if (bucket === 'any') return true;
  if (area == null || !Number.isFinite(area)) return false;
  if (bucket === 's') return area < 25;
  if (bucket === 'm') return area >= 25 && area < 40;
  return area >= 40;
}

/** Misafir oda listesi: filtre + sıralama */
export function filterAndSortBookableRooms(
  rooms: BookableRoom[],
  filters: RoomFiltersState
): BookableRoom[] {
  let list = rooms.filter((r) => {
    if (filters.guestsMin != null) {
      const max = r.max_guests;
      if (max == null || max < filters.guestsMin) return false;
    }
    if (!matchesSize(r.area_sqm, filters.size)) return false;
    if (filters.amenities.length) {
      const set = new Set(r.amenities);
      if (!filters.amenities.every((a) => set.has(a))) return false;
    }
    return true;
  });

  const availRank = (r: BookableRoom) => (r.is_available_for_stay === false ? 1 : 0);

  list = [...list].sort((a, b) => {
    const av = availRank(a) - availRank(b);
    if (av !== 0) return av;

    switch (filters.sort) {
      case 'sold':
        return (b.sold_count ?? 0) - (a.sold_count ?? 0);
      case 'price_asc': {
        const pa = a.price_per_night ?? Number.POSITIVE_INFINITY;
        const pb = b.price_per_night ?? Number.POSITIVE_INFINITY;
        return pa - pb;
      }
      case 'price_desc': {
        const pa = a.price_per_night ?? -1;
        const pb = b.price_per_night ?? -1;
        return pb - pa;
      }
      case 'size_desc':
        return (b.area_sqm ?? 0) - (a.area_sqm ?? 0);
      case 'recommended':
      default: {
        // Popüler + müsait + fiyat dengesi
        const score = (r: BookableRoom) =>
          (r.sold_count ?? 0) * 3 +
          (r.cover_image_url ? 2 : 0) +
          (r.video_url ? 1 : 0) -
          (r.price_per_night ?? 99999) / 10000;
        return score(b) - score(a);
      }
    }
  });

  return list;
}

/** En çok satılanlar (üst % veya min 1 satış) */
export function popularRoomIds(rooms: BookableRoom[], limit = 3): Set<string> {
  const ranked = [...rooms]
    .filter((r) => (r.sold_count ?? 0) > 0)
    .sort((a, b) => (b.sold_count ?? 0) - (a.sold_count ?? 0))
    .slice(0, limit);
  return new Set(ranked.map((r) => r.id));
}
