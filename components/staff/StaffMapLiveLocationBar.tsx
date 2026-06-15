import { MapLiveLocationToggle } from '@/components/map/MapLiveLocationToggle';

type Props = { embedded?: boolean };

export function StaffMapLiveLocationBar({ embedded }: Props) {
  return <MapLiveLocationToggle embedded={embedded} variant="staff" />;
}
