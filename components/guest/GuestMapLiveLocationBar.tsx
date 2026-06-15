import { MapLiveLocationToggle } from '@/components/map/MapLiveLocationToggle';

type Props = { embedded?: boolean };

export function GuestMapLiveLocationBar({ embedded }: Props) {
  return <MapLiveLocationToggle embedded={embedded} variant="guest" />;
}
