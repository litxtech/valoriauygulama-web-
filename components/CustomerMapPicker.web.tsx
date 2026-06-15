/**
 * Web: Sadece ValoriaMapView. react-native-maps hiç import edilmez.
 */

import ValoriaMapView from '@/components/ValoriaMapView';
import type { Poi } from '@/lib/map/pois';
import type { MapUserMarker, MapPostMarker } from '@/lib/map/types';

export type CustomerMapPickerProps = {
  initialLat?: number;
  initialLng?: number;
  initialZoom?: number;
  latitude?: number;
  longitude?: number;
  zoom?: number;
  pois?: Poi[];
  routeCoordinates?: { lat: number; lng: number }[];
  hotelMarker?: { lat: number; lng: number; title: string };
  userMarkers?: MapUserMarker[];
  postMarkers?: MapPostMarker[];
  onPoiPress?: (poi: Poi) => void;
  onHotelPress?: () => void;
  onPostPress?: (postId: string) => void;
  onUserPress?: (marker: MapUserMarker) => void;
  onRegionChangeComplete?: (center: { lat: number; lng: number }) => void;
  onRegionChange?: (center: { lat: number; lng: number }) => void;
  style?: object;
};

export default function CustomerMapPicker(props: CustomerMapPickerProps) {
  return (
    <ValoriaMapView
      latitude={props.latitude ?? props.initialLat}
      longitude={props.longitude ?? props.initialLng}
      zoom={props.zoom ?? props.initialZoom ?? 15}
      pois={props.pois}
      routeCoordinates={props.routeCoordinates}
      hotelMarker={props.hotelMarker}
      userMarkers={props.userMarkers}
      postMarkers={props.postMarkers}
      onPoiPress={props.onPoiPress}
      onHotelPress={props.onHotelPress}
      onPostPress={props.onPostPress}
      onUserPress={props.onUserPress}
      onRegionChange={props.onRegionChange ?? props.onRegionChangeComplete}
      style={props.style}
    />
  );
}
