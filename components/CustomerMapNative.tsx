/**
 * iOS için native MapKit (react-native-maps).
 * Zoom/pan state'i native tarafta kalır, geri dönmez.
 */

import { useRef, useCallback, useEffect, memo } from 'react';
import { View, StyleSheet, Platform, Image, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, AnimatedRegion } from 'react-native-maps';
import type { Poi } from '@/lib/map/pois';
import type { MapUserMarker, MapPostMarker, MapDiningMarker, MapTransferTourMarker } from '@/lib/map/types';

const DEFAULT_LAT = 40.6144;
const DEFAULT_LON = 40.31188;

const USER_AVATAR_SIZE = 40;

export type CustomerMapNativeProps = {
  initialLat?: number;
  initialLng?: number;
  initialZoom?: number;
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
  /** Tüm kullanıcı işaretçilerini kadraja sığdır */
  autoFitUserMarkers?: boolean;
  /** Avatar altında isim etiketi (admin takip) */
  showUserNameLabels?: boolean;
  style?: object;
};

const latLngToDelta = (zoom: number) => {
  const d = 360 / Math.pow(2, zoom);
  return { latitudeDelta: d / 2, longitudeDelta: d };
};

const POST_AVATAR_SIZE = 36;
/** Avatar merkezinin marker koordinatında kalması için, altında etiket varken anchor Y */
const ANCHOR_Y_WITH_LABEL = (POST_AVATAR_SIZE / 2) / (POST_AVATAR_SIZE + 3 + 34);

const AnimatedMapMarker = Marker.Animated;

type UserMarkerProps = {
  u: MapUserMarker;
  showUserNameLabels: boolean;
  onUserPress?: (marker: MapUserMarker) => void;
};

const UserMapMarker = memo(function UserMapMarker({ u, showUserNameLabels, onUserPress }: UserMarkerProps) {
  const hasLabel = showUserNameLabels && !!(u.displayName ?? '').trim();
  const markerAnchor = hasLabel ? { x: 0.5, y: 0.32 } : { x: 0.5, y: 0.5 };
  const animateMove = u.isLiveGps === true || u.isMe === true;
  const region = useRef(
    new AnimatedRegion({
      latitude: u.lat,
      longitude: u.lng,
      latitudeDelta: 0,
      longitudeDelta: 0,
    }),
  ).current;

  useEffect(() => {
    if (!animateMove) {
      region.setValue({ latitude: u.lat, longitude: u.lng, latitudeDelta: 0, longitudeDelta: 0 });
      return;
    }
    region
      .timing({
        latitude: u.lat,
        longitude: u.lng,
        duration: 550,
        useNativeDriver: false,
      } as never)
      .start();
  }, [animateMove, region, u.lat, u.lng]);

  const avatarEl = u.avatarUrl ? (
    <View
      pointerEvents="none"
      style={[
        styles.userAvatarWrap,
        u.isMe && styles.userAvatarMe,
        u.userType === 'staff' && styles.userAvatarStaff,
        u.userType === 'guest' && styles.userAvatarGuest,
        u.isLiveGps && styles.userAvatarLive,
      ]}
    >
      <Image source={{ uri: u.avatarUrl }} style={styles.userAvatar} />
    </View>
  ) : (
    <View
      pointerEvents="none"
      style={[
        styles.userAvatarWrap,
        styles.userAvatarPlaceholder,
        u.isMe && styles.userAvatarMe,
        u.userType === 'staff' && styles.userAvatarStaff,
        u.userType === 'guest' && styles.userAvatarGuest,
        u.isLiveGps && styles.userAvatarLive,
      ]}
    >
      <Ionicons name="person" size={20} color="#666" />
    </View>
  );

  const markerBody = hasLabel ? (
    <View pointerEvents="none" style={styles.userMarkerColumn}>
      {avatarEl}
      <Text style={styles.userMarkerLabel} numberOfLines={1}>
        {(u.displayName ?? '').trim()}
      </Text>
    </View>
  ) : (
    avatarEl
  );

  const MarkerComponent = animateMove ? AnimatedMapMarker : Marker;
  const coordinate = animateMove
    ? (region as unknown as { latitude: number; longitude: number })
    : { latitude: u.lat, longitude: u.lng };

  return (
    <MarkerComponent
      coordinate={coordinate}
      title={u.displayName ?? undefined}
      identifier={`user-${u.id}`}
      tracksViewChanges={false}
      anchor={markerAnchor}
      onPress={() => {
        if (!u.isMe) onUserPress?.(u);
      }}
    >
      {markerBody}
    </MarkerComponent>
  );
});

export default function CustomerMapNative({
  initialLat = DEFAULT_LAT,
  initialLng = DEFAULT_LON,
  initialZoom = 15,
  pois = [],
  routeCoordinates = [],
  hotelMarker,
  userMarkers = [],
  postMarkers = [],
  diningMarkers = [],
  transferTourMarkers = [],
  onPoiPress,
  onHotelPress,
  onPostPress,
  onDiningPress,
  onTransferTourPress,
  onUserPress,
  onRegionChangeComplete,
  autoFitUserMarkers = false,
  showUserNameLabels = false,
  style,
}: CustomerMapNativeProps) {
  const mapRef = useRef<MapView>(null);
  const { latitudeDelta, longitudeDelta } = latLngToDelta(initialZoom);
  const hasMeMarker = userMarkers.some((m) => m.isMe);

  useEffect(() => {
    if (!autoFitUserMarkers || userMarkers.length === 0 || Platform.OS !== 'ios') return;
    const coords = userMarkers.map((m) => ({ latitude: m.lat, longitude: m.lng }));
    if (hotelMarker) {
      coords.push({ latitude: hotelMarker.lat, longitude: hotelMarker.lng });
    }
    if (coords.length === 0) return;
    const t = setTimeout(() => {
      if (coords.length === 1) {
        mapRef.current?.animateToRegion(
          {
            latitude: coords[0].latitude,
            longitude: coords[0].longitude,
            latitudeDelta: 0.012,
            longitudeDelta: 0.012,
          },
          400,
        );
        return;
      }
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 64, right: 48, bottom: 120, left: 48 },
        animated: true,
      });
    }, 320);
    return () => clearTimeout(t);
    // Yalnızca açıkça istendiğinde bir kez kadrajla; marker güncellemelerinde tekrarlama.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- userMarkers bilerek dışarıda
  }, [autoFitUserMarkers, hotelMarker]);

  const initialRegion = {
    latitude: initialLat,
    longitude: initialLng,
    latitudeDelta,
    longitudeDelta,
  };

  const onRegionChangeCompleteHandler = useCallback(
    (e: { latitude: number; longitude: number }) => {
      onRegionChangeComplete?.({ lat: e.latitude, lng: e.longitude });
    },
    [onRegionChangeComplete]
  );

  if (Platform.OS !== 'ios') {
    return null;
  }

  return (
    <View style={[styles.wrap, style]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        mapType="standard"
        showsUserLocation={!hasMeMarker}
        showsCompass
        onRegionChangeComplete={onRegionChangeCompleteHandler}
        provider={PROVIDER_DEFAULT}
      >
        {hotelMarker && (
          <Marker
            coordinate={{ latitude: hotelMarker.lat, longitude: hotelMarker.lng }}
            title={hotelMarker.title}
            identifier="hotel"
            onPress={() => onHotelPress?.()}
          />
        )}
        {pois.map((poi) => (
          <Marker
            key={poi.id}
            coordinate={{ latitude: poi.lat, longitude: poi.lng }}
            title={poi.name}
            identifier={poi.id}
            onPress={() => onPoiPress?.(poi)}
          />
        ))}
        {userMarkers.map((u) => (
          <UserMapMarker key={u.id} u={u} showUserNameLabels={showUserNameLabels} onUserPress={onUserPress} />
        ))}
        {postMarkers.map((p) => (
          <Marker
            key={`post-${p.id}`}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            title={p.displayName ?? undefined}
            identifier={`post-${p.id}`}
            tracksViewChanges={false}
            anchor={{ x: 0.5, y: 0.5 }}
            onPress={() => onPostPress?.(p.id)}
          >
            {p.avatarUrl ? (
              <View style={styles.postAvatarWrap}>
                <Image source={{ uri: p.avatarUrl }} style={styles.postAvatar} />
              </View>
            ) : (
              <View style={[styles.postAvatarWrap, styles.postAvatarPlaceholder]}>
                <Ionicons name="image-outline" size={18} color="#666" />
              </View>
            )}
          </Marker>
        ))}
        {diningMarkers.map((d) => (
          <Marker
            key={`dining-${d.id}`}
            coordinate={{ latitude: d.lat, longitude: d.lng }}
            title={d.displayName ?? undefined}
            identifier={`dining-${d.id}`}
            tracksViewChanges={false}
            anchor={{ x: 0.5, y: 0.5 }}
            onPress={() => onDiningPress?.(d.id)}
          >
            {d.avatarUrl ? (
              <View style={styles.diningAvatarWrap}>
                <Image source={{ uri: d.avatarUrl }} style={styles.diningAvatar} />
              </View>
            ) : (
              <View style={[styles.diningAvatarWrap, styles.diningAvatarPlaceholder]}>
                <Ionicons name="restaurant-outline" size={18} color="#5c4a2a" />
              </View>
            )}
          </Marker>
        ))}
        {transferTourMarkers.map((d) => (
          <Marker
            key={`tt-${d.id}`}
            coordinate={{ latitude: d.lat, longitude: d.lng }}
            title={d.displayName ?? undefined}
            identifier={`tt-${d.id}`}
            tracksViewChanges={false}
            anchor={{ x: 0.5, y: 0.5 }}
            onPress={() => onTransferTourPress?.(d.id)}
          >
            {d.avatarUrl ? (
              <View style={styles.ttAvatarWrap}>
                <Image source={{ uri: d.avatarUrl }} style={styles.ttAvatar} />
              </View>
            ) : (
              <View style={[styles.ttAvatarWrap, styles.ttAvatarPlaceholder]}>
                <Ionicons name="bus-outline" size={18} color="#1e3a5f" />
              </View>
            )}
          </Marker>
        ))}
        {routeCoordinates.length >= 2 && (
          <Polyline
            coordinates={routeCoordinates.map((c) => ({ latitude: c.lat, longitude: c.lng }))}
            strokeColor="#b8860b"
            strokeWidth={4}
          />
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, overflow: 'hidden' },
  map: { width: '100%', height: '100%' },
  userAvatarWrap: {
    width: USER_AVATAR_SIZE,
    height: USER_AVATAR_SIZE,
    borderRadius: USER_AVATAR_SIZE / 2,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: '#e0e0e0',
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, shadowOpacity: 0.3 } }),
  },
  userAvatarMe: {
    borderColor: '#b8860b',
    borderWidth: 4,
  },
  userAvatarStaff: {
    borderColor: '#6366f1',
    borderWidth: 3,
  },
  userAvatarGuest: {
    borderColor: '#10b981',
    borderWidth: 3,
  },
  userAvatarLive: {
    borderColor: '#22c55e',
    borderWidth: 3,
    ...Platform.select({
      ios: {
        shadowColor: '#22c55e',
        shadowOffset: { width: 0, height: 0 },
        shadowRadius: 6,
        shadowOpacity: 0.55,
      },
    }),
  },
  userAvatar: {
    width: '100%',
    height: '100%',
  },
  userAvatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  userMarkerColumn: {
    alignItems: 'center',
    maxWidth: 96,
  },
  userMarkerLabel: {
    marginTop: 2,
    maxWidth: 96,
    fontSize: 9,
    fontWeight: '800',
    color: '#1a1a1a',
    textAlign: 'center',
    textShadowColor: 'rgba(255,255,255,0.95)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3,
  },
  postAvatarWrap: {
    width: POST_AVATAR_SIZE,
    height: POST_AVATAR_SIZE,
    borderRadius: POST_AVATAR_SIZE / 2,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#0d9488',
    backgroundColor: '#e0e0e0',
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, shadowOpacity: 0.3 } }),
  },
  postAvatar: {
    width: '100%',
    height: '100%',
  },
  postAvatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  postDiningLabelColumn: {
    alignItems: 'center',
    maxWidth: 120,
  },
  mapMarkerVenueLabel: {
    marginTop: 3,
    maxWidth: 120,
    fontSize: 10,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
    lineHeight: 13,
    textShadowColor: 'rgba(255,255,255,0.95)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3,
  },
  diningAvatarWrap: {
    width: POST_AVATAR_SIZE,
    height: POST_AVATAR_SIZE,
    borderRadius: POST_AVATAR_SIZE / 2,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#b8860b',
    backgroundColor: '#f5f0e6',
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, shadowOpacity: 0.3 } }),
  },
  diningAvatar: {
    width: '100%',
    height: '100%',
  },
  diningAvatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  ttAvatarWrap: {
    width: POST_AVATAR_SIZE,
    height: POST_AVATAR_SIZE,
    borderRadius: POST_AVATAR_SIZE / 2,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#1e3a5f',
    backgroundColor: '#e8eef5',
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, shadowOpacity: 0.3 } }),
  },
  ttAvatar: {
    width: '100%',
    height: '100%',
  },
  ttAvatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
