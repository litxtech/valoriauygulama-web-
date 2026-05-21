/**
 * Valoria Harita - Restoran, eczane, hastane, jandarma vb. tek haritada.
 * Yol tarifi ve detay uygulama içi (Google Maps'e yönlendirme yok).
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  TextInput,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  Keyboard,
  TouchableWithoutFeedback,
  Modal,
  Pressable,
  Linking,
  AppState,
} from 'react-native';
import { usePathname, useRouter, useFocusEffect, type Href } from 'expo-router';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import CustomerMapPicker from '@/components/CustomerMapPicker';
import {
  fetchPoisHybrid,
  getPoiIcon,
  getPoiTypeLabel,
  setPoisCache,
  type Poi,
  type PoiType,
} from '@/lib/map/pois';
import { searchPoisByText } from '@/lib/map/poiSearch';
import { getRoute, formatDuration, formatDistance, estimateWalkingDuration } from '@/lib/map/osrm';
import type { OSRMRoute } from '@/lib/map/osrm';
import { pathLengthMeters, trimRoutePolyline, type LatLng } from '@/lib/map/routePolylineTrim';
import { fetchNearbyMapUsers, upsertMyLocation } from '@/lib/map/userLocations';
import { getOrCreateGuestForCurrentSession } from '@/lib/getOrCreateGuestForCaller';
import { guestDisplayName } from '@/lib/guestDisplayName';
import { theme } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MapUserMarker, MapDiningMarker, MapTransferTourMarker } from '@/lib/map/types';
import MapShareSheet from '@/components/MapShareSheet';
import MapPostDetailSheet from '@/components/MapPostDetailSheet';
import { supabase } from '@/lib/supabase';
import { CachedImage } from '@/components/CachedImage';
import { useTranslation } from 'react-i18next';
import { pickLocalizedString, type I18nJson } from '@/lib/transferTour';
import { venueAvatarUrl } from '@/lib/diningVenues';

const HOTEL_LAT = typeof process.env.EXPO_PUBLIC_HOTEL_LAT !== 'undefined' ? Number(process.env.EXPO_PUBLIC_HOTEL_LAT) : 40.6144;
const HOTEL_LON = typeof process.env.EXPO_PUBLIC_HOTEL_LON !== 'undefined' ? Number(process.env.EXPO_PUBLIC_HOTEL_LON) : 40.31188;

const POI_TYPES: PoiType[] = ['restaurant', 'cafe', 'hotel', 'pharmacy', 'hospital', 'police'];

export default function CustomerMapScreen() {
  const { t, i18n } = useTranslation();
  const appLang = (i18n.language || 'tr').split('-')[0];
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { height: winHeight } = useWindowDimensions();
  const { user, staff } = useAuthStore();
  const [pois, setPois] = useState<Poi[]>([]);
  const [nearbyMapUsers, setNearbyMapUsers] = useState<MapUserMarker[]>([]);
  const [filterTypes, setFilterTypes] = useState<PoiType[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationPermStatus, setLocationPermStatus] = useState<'granted' | 'denied' | 'undetermined' | 'unavailable' | null>(null);
  const [poiCenter, setPoiCenter] = useState({ lat: HOTEL_LAT, lng: HOTEL_LON });
  const [routeData, setRouteData] = useState<{ route: OSRMRoute; toName: string } | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [navigationActive, setNavigationActive] = useState(false);
  const navWatchRef = useRef<Location.LocationSubscription | null>(null);
  const [locationCardVisible, setLocationCardVisible] = useState(false);
  const [locationRequesting, setLocationRequesting] = useState(false);
  const [shareSheetVisible, setShareSheetVisible] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [mapPosts, setMapPosts] = useState<{ id: string; lat: number; lng: number; authorName: string; authorAvatarUrl: string | null; postPreviewUrl: string | null; staffId: string | null; guestId: string | null }[]>([]);
  const [diningMapMarkers, setDiningMapMarkers] = useState<MapDiningMarker[]>([]);
  const [transferTourMapMarkers, setTransferTourMapMarkers] = useState<MapTransferTourMarker[]>([]);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopLiveNavigation = useCallback(() => {
    setNavigationActive(false);
    navWatchRef.current?.remove();
    navWatchRef.current = null;
  }, []);

  const clearRoutePanel = useCallback(() => {
    setRouteData(null);
    setNavigationActive(false);
    navWatchRef.current?.remove();
    navWatchRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      navWatchRef.current?.remove();
      navWatchRef.current = null;
    };
  }, []);

  const loadFeedPostsWithLocation = useCallback(async () => {
    const { data } = await supabase
      .from('feed_posts')
      .select('id, lat, lng, staff_id, guest_id, media_type, thumbnail_url, media_url, staff:staff_id(full_name, profile_image), guest:guest_id(full_name, photo_url)')
      .eq('visibility', 'customers')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50);
    const rows = (data ?? []) as { id: string; lat: number; lng: number; staff_id?: string | null; guest_id?: string | null; media_type?: string; thumbnail_url?: string | null; media_url?: string | null; staff: { full_name: string | null; profile_image?: string | null } | null; guest: { full_name: string | null; photo_url?: string | null } | null }[];
    const posts = rows.map((r) => {
      const staffInfo = Array.isArray(r.staff) ? r.staff[0] : r.staff;
      const guestInfo = Array.isArray(r.guest) ? r.guest[0] : r.guest;
      const authorName = r.staff_id
        ? (staffInfo?.full_name?.trim() || 'Personel')
        : guestDisplayName(guestInfo?.full_name, 'Misafir');
      const authorAvatarUrl = staffInfo?.profile_image ?? guestInfo?.photo_url ?? null;
      const postPreviewUrl = r.thumbnail_url ?? (r.media_type === 'image' ? r.media_url : null) ?? null;
      return { id: r.id, lat: r.lat, lng: r.lng, authorName, authorAvatarUrl, postPreviewUrl, staffId: r.staff_id ?? null, guestId: r.guest_id ?? null };
    });
    setMapPosts(posts);
  }, []);

  const loadDiningMapMarkers = useCallback(async () => {
    if (!user && !staff) {
      setDiningMapMarkers([]);
      return;
    }
    const { data, error } = await supabase
      .from('dining_venues')
      .select('id, name, lat, lng, logo_url, cover_image, images')
      .eq('is_active', true)
      .not('lat', 'is', null)
      .not('lng', 'is', null);
    if (error || !data) {
      setDiningMapMarkers([]);
      return;
    }
    const list: MapDiningMarker[] = (
      data as {
        id: string;
        name: string;
        lat: unknown;
        lng: unknown;
        logo_url: string | null;
        cover_image: string | null;
        images: string[] | null;
      }[]
    ).map((r) => {
      const images = Array.isArray(r.images) ? r.images : [];
      return {
        id: r.id,
        lat: Number(r.lat),
        lng: Number(r.lng),
        displayName: r.name,
        avatarUrl: venueAvatarUrl({
          logo_url: r.logo_url,
          cover_image: r.cover_image,
          images,
        }),
      };
    });
    setDiningMapMarkers(list.filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lng)));
  }, [user, staff]);

  const onDiningVenueMapPress = useCallback(
    (venueId: string) => {
      if (pathname?.startsWith('/staff')) {
        router.push(`/staff/dining-venues/guest/${venueId}` as Href);
      } else {
        router.push(`/customer/dining-venues/${venueId}` as Href);
      }
    },
    [pathname, router]
  );

  const loadTransferTourMapMarkers = useCallback(async () => {
    if (!user && !staff) {
      setTransferTourMapMarkers([]);
      return;
    }
    const { data, error } = await supabase
      .from('transfer_services')
      .select('id, tour_operator_name, tour_operator_logo, map_lat, map_lng, title, cover_image, images')
      .eq('is_active', true)
      .not('map_lat', 'is', null)
      .not('map_lng', 'is', null);
    if (error || !data) {
      setTransferTourMapMarkers([]);
      return;
    }
    const list: MapTransferTourMarker[] = (data as { id: string; tour_operator_name: string | null; tour_operator_logo: string | null; map_lat: unknown; map_lng: unknown; title: unknown; cover_image: string | null; images: string[] | null }[]).map((r) => {
      const im = Array.isArray(r.images) ? r.images : [];
      const titleI18n = (r.title && typeof r.title === 'object' ? r.title : {}) as I18nJson;
      const name =
        (r.tour_operator_name && r.tour_operator_name.trim()) || pickLocalizedString(titleI18n, appLang, t('transferTourNavTitle'));
      return {
        id: r.id,
        lat: Number(r.map_lat),
        lng: Number(r.map_lng),
        displayName: name,
        avatarUrl: r.tour_operator_logo || r.cover_image || im[0] || null,
      };
    });
    setTransferTourMapMarkers(list.filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lng)));
  }, [user, staff, appLang, t]);

  const onTransferTourMapPress = useCallback(
    (serviceId: string) => {
      if (pathname?.startsWith('/staff')) {
        router.push(`/staff/transfer-tour/guest/${serviceId}` as Href);
      } else {
        router.push(`/customer/transfer-tour/${serviceId}` as Href);
      }
    },
    [pathname, router]
  );

  const clearMapPostPin = useCallback((id: string) => {
    setMapPosts((prev) => prev.filter((p) => p.id !== id));
    setSelectedPostId((cur) => (cur === id ? null : cur));
  }, []);

  const loadPois = useCallback(async () => {
    setLoading(true);
    const center = userLocation ?? poiCenter;
    const lat = center.lat;
    const lng = center.lng;
    const list = await fetchPoisHybrid(lat, lng, 3500, { types: filterTypes.length ? filterTypes : undefined }, {
      writeOverpassToDb: !!user,
    });
    setPois(list);
    setLoading(false);
  }, [poiCenter.lat, poiCenter.lng, filterTypes, user, userLocation]);

  const handleRegionChange = useCallback((center: { lat: number; lng: number }) => {
    setPoiCenter(center);
  }, []);

  const avatarUrl = staff?.profile_image ?? (user?.user_metadata?.avatar_url as string | undefined) ?? null;
  const displayName = staff?.full_name ?? (user?.user_metadata?.full_name as string) ?? (user?.user_metadata?.name as string) ?? user?.email?.split('@')[0] ?? null;

  const loadNearbyMapUsers = useCallback(async () => {
    const center = userLocation ?? poiCenter;
    const users = await fetchNearbyMapUsers(center.lat, center.lng);
    const myGuestId = staff ? undefined : (await getOrCreateGuestForCurrentSession())?.guest_id;
    const myStaffId = staff?.id;
    const markers: MapUserMarker[] = users
      .filter((u) => (u.userType === 'guest' && u.userId !== myGuestId) || (u.userType === 'staff' && u.userId !== myStaffId))
      .map((u) => ({
        id: u.id,
        lat: u.lat,
        lng: u.lng,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl,
        isMe: false,
      }));
    setNearbyMapUsers(markers);
  }, [poiCenter.lat, poiCenter.lng, userLocation, staff]);

  const upsertMyMapLocation = useCallback(async () => {
    if (!userLocation) return;
    if (staff) {
      await upsertMyLocation({
        lat: userLocation.lat,
        lng: userLocation.lng,
        userType: 'staff',
        userId: staff.id,
        displayName: staff.full_name ?? null,
        avatarUrl: staff.profile_image ?? null,
      });
    } else {
      const guest = await getOrCreateGuestForCurrentSession();
      if (guest) {
        await upsertMyLocation({
          lat: userLocation.lat,
          lng: userLocation.lng,
          userType: 'guest',
          userId: guest.guest_id,
          displayName: displayName ?? null,
          avatarUrl: avatarUrl ?? null,
        });
      }
    }
  }, [userLocation, staff, displayName, avatarUrl]);

  useEffect(() => {
    const t = setTimeout(loadNearbyMapUsers, 400);
    return () => clearTimeout(t);
  }, [loadNearbyMapUsers, poiCenter.lat, poiCenter.lng]);

  useFocusEffect(
    useCallback(() => {
      void loadFeedPostsWithLocation();
      void loadDiningMapMarkers();
      void loadTransferTourMapMarkers();
    }, [loadFeedPostsWithLocation, loadDiningMapMarkers, loadTransferTourMapMarkers])
  );

  useEffect(() => {
    const ch = supabase
      .channel('map_dining_venues')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dining_venues' }, () => {
        void loadDiningMapMarkers();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [loadDiningMapMarkers]);

  useEffect(() => {
    const ch = supabase
      .channel('map_transfer_services')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transfer_services' }, () => {
        void loadTransferTourMapMarkers();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [loadTransferTourMapMarkers]);

  useEffect(() => {
    const channel = supabase
      .channel('map_feed_posts_pins')
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'feed_posts' },
        (payload) => {
          const id = (payload.old as { id?: string })?.id;
          if (id) setMapPosts((prev) => prev.filter((p) => p.id !== id));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'feed_posts' },
        (payload) => {
          const row = payload.new as { id?: string; lat?: number | null; lng?: number | null; visibility?: string | null };
          if (!row?.id) return;
          const lostPin =
            row.lat == null ||
            row.lng == null ||
            (row.visibility != null && row.visibility !== 'customers');
          if (lostPin) setMapPosts((prev) => prev.filter((p) => p.id !== row.id));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!userLocation || (!user && !staff)) return;
    upsertMyMapLocation();
    const t = setInterval(upsertMyMapLocation, 2 * 60 * 1000);
    return () => clearInterval(t);
  }, [userLocation, user, staff, upsertMyMapLocation]);

  const userMarkers: MapUserMarker[] =
    userLocation && (user || staff)
      ? [
          {
            id: 'me',
            lat: userLocation.lat,
            lng: userLocation.lng,
            displayName: displayName ?? undefined,
            avatarUrl: avatarUrl ?? undefined,
            isMe: true,
          },
          ...nearbyMapUsers,
        ]
      : nearbyMapUsers;

  // Metin araması: Nominatim (OSM) ile tam entegre; filtre: Overpass/DB.
  useEffect(() => {
    const q = searchQuery.trim();
    const hasFilter = filterTypes.length > 0;
    if (!q && !hasFilter) {
      setPois([]);
      return;
    }
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (hasFilter && !q) {
      loadPois();
      return;
    }
    if (q.length >= 2) {
      searchDebounceRef.current = setTimeout(async () => {
        searchDebounceRef.current = null;
        setLoading(true);
        try {
          const center = userLocation ?? poiCenter;
          const results = await searchPoisByText(q, {
            centerLat: center.lat,
            centerLng: center.lng,
            limit: 20,
          });
          setPois(results);
          setPoisCache(results);
        } catch (_) {
          setPois([]);
        } finally {
          setLoading(false);
        }
      }, 350);
    } else {
      setPois([]);
    }
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery, filterTypes, loadPois, userLocation, poiCenter]);

  useEffect(() => {
    setPoisCache(pois);
  }, [pois]);

  const refreshLocationStatus = useCallback(async () => {
    const { status } = await Location.getForegroundPermissionsAsync();
    const st = status as 'granted' | 'denied' | 'undetermined' | 'unavailable';
    setLocationPermStatus(st);
    if (st === 'granted') {
      const loc = await Location.getCurrentPositionAsync({}).catch(() => null);
      if (loc) setUserLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    }
  }, []);

  useEffect(() => {
    refreshLocationStatus().catch(() => {});
  }, [refreshLocationStatus]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshLocationStatus();
    });
    return () => sub.remove();
  }, [refreshLocationStatus]);

  const requestUserLocation = useCallback(async () => {
    setLocationRequesting(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const st = status as 'granted' | 'denied' | 'undetermined' | 'unavailable';
      setLocationPermStatus(st);
      if (st !== 'granted') {
        setUserLocation(null);
        if (st === 'denied') {
          Alert.alert(
            t('mapLocationOffTitle'),
            t('mapLocationOffBody'),
            [
              { text: t('openAppSettings'), onPress: () => Linking.openSettings() },
            ]
          );
        } else {
          Alert.alert(t('mapLocationDeniedTitle'), t('mapLocationDeniedBody'));
        }
        return;
      }
      const loc = await Location.getCurrentPositionAsync({}).catch(() => null);
      if (loc) setUserLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      setLocationCardVisible(false);
    } finally {
      setLocationRequesting(false);
    }
  }, [t]);

  const q = searchQuery.trim();
  const filteredPois =
    q.length >= 2
      ? filterTypes.length > 0
        ? pois.filter((p) => filterTypes.includes(p.type))
        : pois
      : filterTypes.length > 0
        ? pois.filter((p) => filterTypes.includes(p.type))
        : pois;

  const toggleFilter = (type: PoiType) => {
    setFilterTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  };

  const goBack = () => {
    if (pathname.startsWith('/admin')) {
      router.replace('/admin');
      return;
    }
    if (pathname.startsWith('/staff')) {
      router.replace('/staff');
      return;
    }
    router.replace('/customer');
  };

  const showSuggestions = searchQuery.trim().length > 0 || filterTypes.length > 0;
  const fromForDirections = userLocation ?? { lat: HOTEL_LAT, lng: HOTEL_LON };

  const displayRoutePath = useMemo(() => {
    if (!routeData?.route.geometry?.coordinates?.length) return [];
    const full: LatLng[] = routeData.route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
    if (full.length < 2) return full;
    if (!navigationActive || !userLocation) return full;
    return trimRoutePolyline(full, userLocation);
  }, [routeData, navigationActive, userLocation]);

  const remainingPathMeters = useMemo(
    () => (displayRoutePath.length >= 2 ? pathLengthMeters(displayRoutePath) : 0),
    [displayRoutePath]
  );

  const startRouteNavigation = useCallback(async () => {
    if (!routeData) return;
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('mapLocationDeniedTitle'), t('mapLocationDeniedBody'));
      return;
    }
    setLocationPermStatus('granted');
    const cur = await Location.getCurrentPositionAsync({}).catch(() => null);
    if (cur) setUserLocation({ lat: cur.coords.latitude, lng: cur.coords.longitude });
    navWatchRef.current?.remove();
    const sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 2000, distanceInterval: 10 },
      (loc) => {
        setUserLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      }
    );
    navWatchRef.current = sub;
    setNavigationActive(true);
  }, [routeData, t]);

  const showRouteToPoi = (poi: Poi) => {
    Keyboard.dismiss();
    stopLiveNavigation();
    setRouteLoading(true);
    setRouteData(null);
    getRoute(fromForDirections, { lat: poi.lat, lng: poi.lng }).then((r) => {
      setRouteLoading(false);
      setRouteData(r ? { route: r, toName: poi.name } : null);
    });
  };

  const showRouteToHotel = () => {
    Keyboard.dismiss();
    stopLiveNavigation();
    setRouteLoading(true);
    setRouteData(null);
    getRoute(fromForDirections, { lat: HOTEL_LAT, lng: HOTEL_LON }).then((r) => {
      setRouteLoading(false);
      setRouteData(r ? { route: r, toName: 'Valoria Hotel' } : null);
    });
  };

  const dismissSearchAndSuggestions = () => {
    Keyboard.dismiss();
    setSearchQuery('');
    setFilterTypes([]);
  };

  const routeSheetBlockH = navigationActive ? Math.min(320, winHeight * 0.32) : Math.min(420, winHeight * 0.42);
  const shareFabBottom = insets.bottom + 24 + (routeData ? routeSheetBlockH : 0);

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Boşluğa (haritaya) tıklanınca klavye kapansın ve öneriler kaybolsun */}
      <TouchableWithoutFeedback onPress={dismissSearchAndSuggestions} accessible={false}>
        <View style={styles.mapLayer} pointerEvents="box-none">
          <CustomerMapPicker
            initialLat={HOTEL_LAT}
            initialLng={HOTEL_LON}
            initialZoom={15}
            pois={filteredPois}
            routeCoordinates={displayRoutePath}
            hotelMarker={{ lat: HOTEL_LAT, lng: HOTEL_LON, title: t('screenHotel') }}
            userMarkers={userMarkers}
            postMarkers={mapPosts.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, displayName: p.authorName, avatarUrl: p.postPreviewUrl ?? p.authorAvatarUrl }))}
            diningMarkers={diningMapMarkers}
            transferTourMarkers={transferTourMapMarkers}
            onPoiPress={showRouteToPoi}
            onHotelPress={showRouteToHotel}
            onPostPress={(postId) => setSelectedPostId(postId)}
            onDiningPress={onDiningVenueMapPress}
            onTransferTourPress={onTransferTourMapPress}
            onRegionChangeComplete={handleRegionChange}
            style={styles.mapPicker}
          />
        </View>
      </TouchableWithoutFeedback>

      {loading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="small" color={theme.colors.primary} />
        </View>
      )}

      {routeLoading && (
        <View style={[styles.loadingOverlay, { bottom: 200 }]} pointerEvents="none">
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={styles.routeLoadingText}>{t('mapScreenRouteLoading')}</Text>
        </View>
      )}

      {routeData && (
        <View
          style={[
            styles.routeSheet,
            {
              paddingBottom: insets.bottom + 14,
              maxHeight: navigationActive ? '34%' : '44%',
            },
          ]}
        >
          <View style={styles.routeSheetGrab} />
          <View style={styles.routeSheetHeader}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.routeSheetTitle} numberOfLines={1}>
                📍 {routeData.toName}
              </Text>
              {navigationActive ? (
                <Text style={styles.routeLiveBadge}>{t('mapNavLive')}</Text>
              ) : null}
            </View>
            <TouchableOpacity
              style={styles.routeCloseIcon}
              onPress={clearRoutePanel}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel={t('mapScreenClose')}
            >
              <Ionicons name="close" size={26} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <View style={styles.routeMetaRow}>
            {navigationActive && userLocation ? (
              <Text style={styles.routeMetaEmph}>
                📏 {t('mapNavRemaining')}: {formatDistance(remainingPathMeters)}
              </Text>
            ) : (
              <>
                <Text style={styles.routeMeta}>⏱️ {formatDuration(routeData.route.duration)}</Text>
                <Text style={styles.routeMeta}>🚶 ~{formatDuration(estimateWalkingDuration(routeData.route.distance))}</Text>
                <Text style={styles.routeMeta}>📏 {formatDistance(routeData.route.distance)}</Text>
              </>
            )}
          </View>
          {!navigationActive ? (
            <>
              <Text style={styles.routeStepsTitle}>{t('mapScreenRouteSteps')}</Text>
              <ScrollView style={styles.routeStepsScroll} showsVerticalScrollIndicator={false}>
                {routeData.route.steps.map((step, i) => (
                  <View key={i} style={styles.routeStepRow}>
                    <Text style={styles.routeStepNum}>{i + 1}.</Text>
                    <Text style={styles.routeStepText}>
                      {step.maneuver?.instruction ?? step.name ?? t('mapRouteStepFallback')} — {formatDistance(step.distance)}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </>
          ) : (
            <Text style={styles.routeNavHint}>{t('mapNavFollowHint')}</Text>
          )}
          <View style={styles.routeActions}>
            {navigationActive ? (
              <>
                <TouchableOpacity style={styles.routeSecondaryBtn} onPress={stopLiveNavigation} activeOpacity={0.85}>
                  <Ionicons name="stop-circle-outline" size={20} color={theme.colors.primary} />
                  <Text style={styles.routeSecondaryBtnText}>{t('mapNavStopLive')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.routePrimaryBtn} onPress={clearRoutePanel} activeOpacity={0.88}>
                  <Ionicons name="flag" size={20} color="#fff" />
                  <Text style={styles.routePrimaryBtnText}>{t('mapNavEndRoute')}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.routePrimaryBtn}
                  onPress={() => void startRouteNavigation()}
                  activeOpacity={0.88}
                >
                  <Ionicons name="navigate" size={20} color="#fff" />
                  <Text style={styles.routePrimaryBtnText}>{t('mapNavStart')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.routeSecondaryBtn} onPress={clearRoutePanel} activeOpacity={0.85}>
                  <Text style={styles.routeSecondaryBtnText}>{t('mapScreenClose')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      )}

      {locationPermStatus && locationPermStatus !== 'granted' && locationPermStatus !== 'unavailable' && (
        <TouchableOpacity
          style={[styles.locationUseBtn, { bottom: shareFabBottom }]}
          onPress={() => setLocationCardVisible(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="location-outline" size={20} color="#fff" />
          <Text style={styles.locationUseBtnText}>{t('mapScreenUseMyLocation')}</Text>
        </TouchableOpacity>
      )}

      {/* Haritadan paylaşım — artı butonu: haritada kart açılır, sayfa değişmez */}
      {(user || staff) && (
        <TouchableOpacity
          style={[
            styles.shareFab,
            {
              bottom:
                shareFabBottom +
                (locationPermStatus && locationPermStatus !== 'granted' && locationPermStatus !== 'unavailable' ? 72 : 0),
            },
          ]}
          onPress={() => setShareSheetVisible(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      <MapShareSheet
        visible={shareSheetVisible}
        onClose={() => setShareSheetVisible(false)}
        location={userLocation ?? poiCenter}
        onSuccess={loadFeedPostsWithLocation}
      />

      <MapPostDetailSheet
        visible={!!selectedPostId}
        postId={selectedPostId}
        onClose={() => setSelectedPostId(null)}
        onPostDeleted={() => {
          setSelectedPostId(null);
          loadFeedPostsWithLocation();
        }}
        onPostUnavailable={clearMapPostPin}
      />

      <Modal visible={locationCardVisible} transparent animationType="fade" onRequestClose={() => {}}>
        <Pressable style={styles.permCardOverlay}>
          <Pressable style={styles.permCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.permCardHeader}>
              <View style={styles.permCardIconWrap}>
                <Ionicons name="location-outline" size={24} color={theme.colors.primary} />
              </View>
              <View style={styles.permCardTitleWrap}>
                <Text style={styles.permCardTitle}>{t('guestMapLocationTitle')}</Text>
                <Text style={styles.permCardSubtitle}>{t('guestMapLocationHint')}</Text>
              </View>
              <View
                style={[
                  styles.permCardBadge,
                  {
                    backgroundColor:
                      locationPermStatus === 'granted'
                        ? theme.colors.success + '22'
                        : locationPermStatus === 'denied'
                          ? theme.colors.error + '22'
                          : theme.colors.borderLight,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.permCardBadgeText,
                    {
                      color:
                        locationPermStatus === 'granted'
                          ? theme.colors.success
                          : locationPermStatus === 'denied'
                            ? theme.colors.error
                            : theme.colors.textSecondary,
                    },
                  ]}
                >
                  {locationPermStatus === 'granted'
                    ? t('mapLocationStatusGranted')
                    : locationPermStatus === 'denied'
                      ? t('mapLocationStatusDenied')
                      : t('mapLocationStatusNotRequested')}
                </Text>
              </View>
            </View>
            <View style={styles.permCardNotes}>
              <Text style={styles.permCardNote}>{t('mapLocationModalNote1')}</Text>
              <Text style={styles.permCardNote}>{t('mapLocationModalNote2')}</Text>
            </View>
            <TouchableOpacity
              style={[styles.permCardPrimaryBtn, locationRequesting && { opacity: 0.75 }]}
              onPress={() => {
                if (locationPermStatus === 'denied') {
                  Linking.openSettings();
                  setLocationCardVisible(false);
                } else {
                  requestUserLocation();
                }
              }}
              disabled={locationRequesting}
              activeOpacity={0.85}
            >
              {locationRequesting ? (
                <ActivityIndicator size="small" color={theme.colors.white} />
              ) : (
                <>
                  <Ionicons
                    name={locationPermStatus === 'denied' ? 'settings-outline' : 'checkmark-circle-outline'}
                    size={20}
                    color={theme.colors.white}
                  />
                  <Text style={styles.permCardPrimaryText}>
                    {locationPermStatus === 'denied' ? t('openAppSettings') : t('mapContinue')}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <View style={[styles.topBar, { paddingTop: insets.top + 12, paddingBottom: theme.spacing.sm }]} pointerEvents="box-none">
        <View style={styles.topBarContent}>
          <View style={styles.topRow}>
            <TouchableOpacity style={styles.backButton} onPress={goBack} activeOpacity={0.8}>
              <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
            </TouchableOpacity>
            <TextInput
              style={styles.searchInput}
              placeholder={t('mapSearchPlaceholder')}
              placeholderTextColor="rgba(255,255,255,0.6)"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            <TouchableOpacity
              style={[styles.filterDrawerBtn, filterTypes.length > 0 && styles.filterDrawerBtnActive]}
              onPress={() => setFilterDrawerOpen((o) => !o)}
              activeOpacity={0.8}
            >
              <Ionicons name="options-outline" size={22} color={filterTypes.length > 0 ? theme.colors.primary : 'rgba(255,255,255,0.8)'} />
              {filterTypes.length > 0 ? (
                <View style={styles.filterDrawerBadge}>
                  <Text style={styles.filterDrawerBadgeText}>{filterTypes.length}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          </View>
          {mapPosts.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.postAvatarsScroll}
              style={styles.postAvatarsBar}
            >
              {mapPosts.map((p) => {
                const profileHref = p.staffId ? `/customer/staff/${p.staffId}` : p.guestId ? `/customer/guest/${p.guestId}` : null;
                const isGuestPost = !!p.guestId && !p.staffId;
                return (
                <TouchableOpacity
                  key={p.id}
                  style={styles.postAvatarItem}
                  onPress={() => setSelectedPostId(p.id)}
                  onLongPress={profileHref ? () => router.push(profileHref) : undefined}
                  activeOpacity={0.8}
                  delayLongPress={400}
                >
                  <View style={[styles.postAvatarRing, isGuestPost && styles.postAvatarRingGuest]}>
                    {p.postPreviewUrl ? (
                      <CachedImage uri={p.postPreviewUrl} style={styles.postAvatarImg} contentFit="cover" />
                    ) : p.authorAvatarUrl ? (
                      <CachedImage uri={p.authorAvatarUrl} style={styles.postAvatarImg} contentFit="cover" />
                    ) : (
                      <View style={[styles.postAvatarImg, isGuestPost ? styles.postAvatarPlaceholderGuest : styles.postAvatarPlaceholder]}>
                        <Text style={isGuestPost ? styles.postAvatarInitialGuest : styles.postAvatarInitial}>{p.authorName.charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.postAvatarName} numberOfLines={1}>{p.authorName}</Text>
                </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
          {filterDrawerOpen && (
            <View style={styles.filterDrawer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                {POI_TYPES.map((type) => {
                  const active = filterTypes.includes(type);
                  return (
                    <TouchableOpacity
                      key={type}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                      onPress={() => toggleFilter(type)}
                    >
                      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                        {getPoiIcon(type)} {getPoiTypeLabel(type)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
          {showSuggestions && (
            <ScrollView style={styles.suggestionsList} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              {loading && filteredPois.length === 0 ? (
                <Text style={styles.suggestionPlaceholder}>{t('guestMapSearching')}</Text>
              ) : filteredPois.length === 0 ? (
                <View style={styles.emptySuggestions}>
                  <Text style={styles.suggestionPlaceholder}>{t('mapNoVenuesInArea')}</Text>
                  <Text style={styles.suggestionHint}>{t('mapNoVenuesHint')}</Text>
                </View>
              ) : (
                filteredPois.map((poi) => (
                  <View key={poi.id} style={styles.suggestionRow}>
                    <TouchableOpacity
                      style={styles.suggestionRowMain}
                      onPress={() => showRouteToPoi(poi)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.suggestionIcon}>{getPoiIcon(poi.type)}</Text>
                      <View style={styles.suggestionInfo}>
                        <Text style={styles.suggestionName} numberOfLines={1}>{poi.name}</Text>
                        <Text style={styles.suggestionMeta}>{getPoiTypeLabel(poi.type)}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.directionsBtn}
                      onPress={() => showRouteToPoi(poi)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="navigate" size={18} color={theme.colors.primary} />
                      <Text style={styles.directionsBtnText}>{t('mapGetDirections')}</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    minHeight: 0,
    backgroundColor: '#1a1d21',
  },
  mapLayer: {
    flex: 1,
    width: '100%',
    minHeight: 0,
  },
  mapPicker: {
    flex: 1,
    width: '100%',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    gap: 10,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    ...theme.shadows.sm,
  },
  postAvatarsBar: {
    marginBottom: theme.spacing.sm,
  },
  postAvatarsScroll: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 8,
  },
  postAvatarItem: {
    alignItems: 'center',
    marginRight: 16,
  },
  postAvatarRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: theme.colors.primary,
    backgroundColor: 'rgba(0,0,0,0.4)',
    ...theme.shadows.sm,
  },
  postAvatarRingGuest: {
    borderColor: theme.colors.guestAvatarBg,
  },
  postAvatarImg: {
    width: '100%',
    height: '100%',
  },
  postAvatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  postAvatarPlaceholderGuest: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.guestAvatarBg,
  },
  postAvatarInitial: {
    fontSize: 22,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
  },
  postAvatarInitialGuest: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.guestAvatarLetter,
  },
  postAvatarName: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
    maxWidth: 70,
    textAlign: 'center',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: theme.spacing.lg,
  },
  filterDrawerBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterDrawerBtnActive: {
    borderColor: theme.colors.primary,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  filterDrawerBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterDrawerBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  filterDrawer: {
    marginBottom: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    height:40,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: theme.spacing.lg,
    fontSize: 15,
    color: '#fff',
  },
  filterRow: { flexDirection: 'row', gap: 8 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.full,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  filterChipActive: { backgroundColor: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.35)' },
  filterChipText: { fontSize: 12, color: 'rgba(255,255,255,0.8)' },
  filterChipTextActive: { color: '#fff', fontWeight: '600' },
  topBarContent: { maxHeight: 280 },
  suggestionsList: { maxHeight: 200, marginTop: theme.spacing.sm },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: theme.radius.md,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  suggestionRowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  suggestionIcon: { fontSize: 20, marginRight: 10 },
  suggestionInfo: { flex: 1, minWidth: 0 },
  suggestionName: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.95)' },
  suggestionMeta: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  directionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginLeft: 4,
    borderRadius: theme.radius.sm,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  directionsBtnText: { fontSize: 12, fontWeight: '600', color: theme.colors.primary },
  suggestionPlaceholder: { fontSize: 14, color: 'rgba(255,255,255,0.7)', paddingVertical: 12, paddingHorizontal: 4 },
  emptySuggestions: { paddingVertical: 12, paddingHorizontal: 4 },
  suggestionHint: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 6, paddingHorizontal: 4 },
  loadingOverlay: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
    padding: 8,
    borderRadius: theme.radius.full,
    zIndex: 0,
  },
  routeLoadingText: { fontSize: 12, color: 'rgba(255,255,255,0.9)', marginTop: 4 },
  routeSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: 8,
    zIndex: 15,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    ...theme.shadows.lg,
  },
  routeSheetGrab: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.12)',
    marginBottom: 10,
  },
  routeSheetHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  routeCloseIcon: { padding: 2 },
  routeSheetTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text, marginBottom: 2 },
  routeLiveBadge: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.success,
    letterSpacing: 0.2,
  },
  routeMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8, alignItems: 'center' },
  routeMeta: { fontSize: 13, color: theme.colors.textSecondary },
  routeMetaEmph: { fontSize: 14, fontWeight: '800', color: theme.colors.primary, width: '100%' },
  routeStepsTitle: { fontSize: 14, fontWeight: '700', color: theme.colors.text, marginTop: 2, marginBottom: 6 },
  routeStepsScroll: { maxHeight: 150 },
  routeNavHint: { fontSize: 13, color: theme.colors.textSecondary, lineHeight: 19, marginTop: 4, marginBottom: 8 },
  routeStepRow: { flexDirection: 'row', marginBottom: 6 },
  routeStepNum: { fontWeight: '700', width: 22, color: theme.colors.primary, fontSize: 13 },
  routeStepText: { flex: 1, fontSize: 13, color: theme.colors.text },
  routeActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  routePrimaryBtn: {
    flex: 1,
    minWidth: 140,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: theme.colors.primary,
  },
  routePrimaryBtnText: { fontSize: 16, fontWeight: '800', color: theme.colors.white },
  routeSecondaryBtn: {
    flex: 1,
    minWidth: 120,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  routeSecondaryBtnText: { fontSize: 15, fontWeight: '800', color: theme.colors.text },

  shareFab: {
    position: 'absolute',
    right: theme.spacing.lg,
    width: 55,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
    ...theme.shadows.lg,
    shadowColor: '#000',
    shadowOpacity: 0.35,
  },
  locationUseBtn: {
    position: 'absolute',
    left: theme.spacing.lg,
    right: theme.spacing.lg,
    height: 52,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 14,
    backgroundColor: '#0c0c0c',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    zIndex: 20,
    ...theme.shadows.lg,
    shadowColor: '#000',
    shadowOpacity: 0.4,
  },
  locationUseBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  permCardOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 18,
  },
  permCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    ...theme.shadows.md,
  },
  permCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  permCardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: theme.colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.primary + '30',
  },
  permCardTitleWrap: { flex: 1, minWidth: 0 },
  permCardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: 4,
  },
  permCardSubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  permCardBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  permCardBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  permCardNotes: {
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 14,
  },
  permCardNote: {
    fontSize: 12,
    color: theme.colors.textMuted,
    lineHeight: 18,
  },
  permCardPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    ...theme.shadows.sm,
  },
  permCardPrimaryText: {
    color: theme.colors.white,
    fontWeight: '800',
    fontSize: 15,
  },
  permCardSecondaryBtn: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.backgroundSecondary,
    alignItems: 'center',
  },
  permCardSecondaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
});
