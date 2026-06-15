/**
 * Native: iOS'ta CustomerMapNative (react-native-maps), diğerlerinde ValoriaMapView.
 * Bu dosya sadece native bundle'da kullanılır.
 */

import { Platform } from 'react-native';
import CustomerMapNative from '@/components/CustomerMapNative';
import ValoriaMapView from '@/components/ValoriaMapView';
import type { Poi } from '@/lib/map/pois';
import type { MapUserMarker, MapPostMarker, MapDiningMarker, MapTransferTourMarker } from '@/lib/map/types';

export type { MapUserMarker, MapPostMarker, MapDiningMarker, MapTransferTourMarker };

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
  diningMarkers?: MapDiningMarker[];
  transferTourMarkers?: MapTransferTourMarker[];
  onPoiPress?: (poi: Poi) => void;
  onHotelPress?: () => void;
  onPostPress?: (postId: string) => void;
  onDiningPress?: (venueId: string) => void;
  onTransferTourPress?: (serviceId: string) => void;
  onUserPress?: (marker: MapUserMarker) => void;
  onRegionChangeComplete?: (center: { lat: number; lng: number }) => void;
  onRegionChange?: (center: { lat: number; lng: number }) => void;
  autoFitUserMarkers?: boolean;
  showUserNameLabels?: boolean;
  style?: object;
};

export default function CustomerMapPicker(props: CustomerMapPickerProps) {
  if (Platform.OS === 'ios') {
    return (
      <CustomerMapNative
        initialLat={props.initialLat ?? props.latitude}
        initialLng={props.initialLng ?? props.longitude}
        initialZoom={props.initialZoom ?? props.zoom ?? 15}
        pois={props.pois}
        routeCoordinates={props.routeCoordinates}
        hotelMarker={props.hotelMarker}
        userMarkers={props.userMarkers}
        postMarkers={props.postMarkers}
        diningMarkers={props.diningMarkers}
        onPoiPress={props.onPoiPress}
        onHotelPress={props.onHotelPress}
        onPostPress={props.onPostPress}
        onDiningPress={props.onDiningPress}
        onRegionChangeComplete={props.onRegionChangeComplete ?? props.onRegionChange}
        onUserPress={props.onUserPress}
        autoFitUserMarkers={props.autoFitUserMarkers}
        showUserNameLabels={props.showUserNameLabels}
        style={props.style}
      />
    );
  }
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
      diningMarkers={props.diningMarkers}
      transferTourMarkers={props.transferTourMarkers}
      onPoiPress={props.onPoiPress}
      onHotelPress={props.onHotelPress}
      onPostPress={props.onPostPress}
      onDiningPress={props.onDiningPress}
      onTransferTourPress={props.onTransferTourPress}
      onUserPress={props.onUserPress}
      onRegionChange={props.onRegionChange ?? props.onRegionChangeComplete}
      autoFitUserMarkers={props.autoFitUserMarkers}
      showUserNameLabels={props.showUserNameLabels}
      style={props.style}
    />
  );
}
