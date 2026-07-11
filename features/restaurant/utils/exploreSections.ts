import type { HotelKitchenMenuItemWithImages } from '@/lib/hotelKitchenMenu';
import { coverImageUrl } from '@/lib/hotelKitchenMenu';

export type ExploreSectionId =
  | 'popular'
  | 'chef'
  | 'trending'
  | 'recent'
  | 'breakfast'
  | 'coffee'
  | 'desserts'
  | 'healthy';

export type ExploreSection = {
  id: ExploreSectionId;
  titleKey: string;
  items: HotelKitchenMenuItemWithImages[];
};

function withCover(items: HotelKitchenMenuItemWithImages[]) {
  return items.filter((it) => !!coverImageUrl(it));
}

function matchCategory(items: HotelKitchenMenuItemWithImages[], ...needles: string[]) {
  return items.filter((it) => {
    const c = it.category_title.toLowerCase();
    return needles.some((n) => c.includes(n));
  });
}

function sortRecent(items: HotelKitchenMenuItemWithImages[]) {
  return [...items].sort((a, b) => {
    const ta = new Date(a.created_at ?? 0).getTime();
    const tb = new Date(b.created_at ?? 0).getTime();
    return tb - ta;
  });
}

export function buildExploreSections(items: HotelKitchenMenuItemWithImages[]): ExploreSection[] {
  const available = items.filter((it) => it.is_available);
  const sections: ExploreSection[] = [];

  const popular = withCover(available).slice(0, 10);
  if (popular.length >= 2) {
    sections.push({ id: 'popular', titleKey: 'restaurantExplorePopular', items: popular });
  }

  const chef = withCover([...available].sort((a, b) => a.sort_order - b.sort_order)).slice(0, 8);
  if (chef.length >= 2) {
    sections.push({ id: 'chef', titleKey: 'restaurantExploreChef', items: chef });
  }

  const recent = sortRecent(withCover(available)).slice(0, 8);
  if (recent.length >= 2) {
    sections.push({ id: 'recent', titleKey: 'restaurantExploreRecent', items: recent });
  }

  const breakfast = matchCategory(available, 'kahvalt', 'breakfast').slice(0, 8);
  if (breakfast.length >= 1) {
    sections.push({ id: 'breakfast', titleKey: 'restaurantExploreBreakfast', items: breakfast });
  }

  const coffee = matchCategory(available, 'kahve', 'coffee', 'içecek', 'icecek', 'drink').slice(0, 8);
  if (coffee.length >= 1) {
    sections.push({ id: 'coffee', titleKey: 'restaurantExploreCoffee', items: coffee });
  }

  const desserts = matchCategory(available, 'tatlı', 'tatli', 'dessert').slice(0, 8);
  if (desserts.length >= 1) {
    sections.push({ id: 'desserts', titleKey: 'restaurantExploreDesserts', items: desserts });
  }

  const healthy = matchCategory(available, 'salata', 'salad', 'vegan', 'vejetaryen').slice(0, 8);
  if (healthy.length >= 1) {
    sections.push({ id: 'healthy', titleKey: 'restaurantExploreHealthy', items: healthy });
  }

  const trending = withCover(available)
    .filter((it) => (it.image_count ?? it.images.length) >= 2)
    .slice(0, 8);
  if (trending.length >= 2) {
    sections.push({ id: 'trending', titleKey: 'restaurantExploreTrending', items: trending });
  }

  return sections;
}
