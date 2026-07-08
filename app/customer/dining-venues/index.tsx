import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  useWindowDimensions,
  Alert,
  Platform,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import {
  type DiningVenueRow,
  type VenueType,
  venueRowFromDb,
  priceLevelLabel,
  haversineKm,
  venueAvatarUrl,
} from '@/lib/diningVenues';
import { LinearGradient } from 'expo-linear-gradient';
import { useCachedList } from '@/hooks/useCachedList';
import { CUSTOMER_FLASH_DRAW_DISTANCE, CUSTOMER_LIST_PERF, CUSTOMER_ROW_HEIGHT } from '@/lib/customerPerf';

type TypeFilter = 'all' | VenueType;
type PriceFilter = 'all' | 1 | 2 | 3;
type OpenFilter = 'all' | 'open' | 'closed';
type ScopeFilter = 'all' | 'on_premises' | 'off_premises';
type DistFilter = 'all' | '2' | '5' | '20';

type Props = { guestDetailStack?: 'customer' | 'staff' };

export default function CustomerDiningVenuesList({ guestDetailStack = 'customer' }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cardW = width - 32;

  const detailPath: Href =
    guestDetailStack === 'staff'
      ? ('/staff/dining-venues/guest/[id]' as const)
      : ('/customer/dining-venues/[id]' as const);

  const cacheKey =
    guestDetailStack === 'staff' ? 'staff-dining-venues-guest-list' : 'customer-dining-venues-list';

  const fetchItems = useCallback(async () => {
    const { data, error } = await supabase
      .from('dining_venues')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) return [];
    return (data ?? []).map((r) => venueRowFromDb(r as Record<string, unknown>));
  }, []);

  const { items, loading, refreshing, refresh } = useCachedList<DiningVenueRow>({
    cacheKey,
    fetchItems,
  });

  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [priceFilter, setPriceFilter] = useState<PriceFilter>('all');
  const [openFilter, setOpenFilter] = useState<OpenFilter>('all');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [distFilter, setDistFilter] = useState<DistFilter>('all');
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locLoading, setLocLoading] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const requestLocation = useCallback(async (): Promise<boolean> => {
    setLocLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('diningVenuesLocationDeniedTitle'), t('diningVenuesLocationDeniedBody'));
        return false;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      return true;
    } catch {
      Alert.alert(t('error'), t('diningVenuesLocationError'));
      return false;
    } finally {
      setLocLoading(false);
    }
  }, [t]);

  const setDistanceFilter = useCallback(
    async (item: DistFilter) => {
      if (item === 'all') {
        setDistFilter('all');
        return;
      }
      const ok = userPos ? true : await requestLocation();
      if (ok) setDistFilter(item);
    },
    [userPos, requestLocation]
  );

  const extraFilterCount = useMemo(() => {
    let n = 0;
    if (priceFilter !== 'all') n++;
    if (openFilter !== 'all') n++;
    if (scopeFilter !== 'all') n++;
    if (distFilter !== 'all') n++;
    return n;
  }, [priceFilter, openFilter, scopeFilter, distFilter]);

  const resetExtraFilters = useCallback(() => {
    setPriceFilter('all');
    setOpenFilter('all');
    setScopeFilter('all');
    setDistFilter('all');
  }, []);

  const withDistance = useMemo(() => {
    if (!userPos) return items.map((v) => ({ v, km: null as number | null }));
    return items.map((v) => {
      if (v.lat == null || v.lng == null || !Number.isFinite(v.lat) || !Number.isFinite(v.lng)) {
        return { v, km: null as number | null };
      }
      return { v, km: haversineKm(userPos, { lat: v.lat, lng: v.lng }) };
    });
  }, [items, userPos]);

  const filtered = useMemo(() => {
    const qe = q.trim().toLowerCase();
    return withDistance.filter(({ v, km }) => {
      if (typeFilter !== 'all' && v.venue_type !== typeFilter) return false;
      if (priceFilter !== 'all' && v.price_level !== priceFilter) return false;
      if (openFilter === 'open' && !v.is_open_now) return false;
      if (openFilter === 'closed' && v.is_open_now) return false;
      if (scopeFilter !== 'all' && v.location_scope !== scopeFilter) return false;
      if (distFilter !== 'all' && userPos) {
        if (km == null) return false;
        const max = distFilter === '2' ? 2 : distFilter === '5' ? 5 : 20;
        if (km > max) return false;
      }
      if (!qe) return true;
      const typeStr = t(`diningVenuesType_${v.venue_type}`).toLowerCase();
      const tags = (v.cuisine_tags ?? []).join(' ').toLowerCase();
      const menuHay = (v.menu_items ?? [])
        .map((m) => `${m.name} ${m.description ?? ''}`)
        .join(' ')
        .toLowerCase();
      const addr = (v.address ?? '').toLowerCase();
      const name = (v.name ?? '').toLowerCase();
      const pl = priceLevelLabel(v.price_level);
      const hay = `${name} ${tags} ${addr} ${typeStr} ${pl} ${menuHay}`.toLowerCase();
      return hay.includes(qe);
    });
  }, [withDistance, typeFilter, priceFilter, openFilter, scopeFilter, distFilter, userPos, q, t]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    if (userPos && distFilter !== 'all') {
      rows.sort((a, b) => {
        const ak = a.km ?? 9999;
        const bk = b.km ?? 9999;
        return ak - bk;
      });
    }
    return rows;
  }, [filtered, userPos, distFilter]);

  const TYPE_OPTIONS: TypeFilter[] = ['all', 'restaurant', 'cafe', 'buffet'];
  const typeLabel = (k: TypeFilter) => (k === 'all' ? t('diningVenuesFilterAll') : t(`diningVenuesType_${k}`));

  const listHeader = useMemo(
    () => (
      <View>
        <LinearGradient
          colors={['#2c1810', '#4a2c2a', '#1e3d2f']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Text style={styles.heroTitle}>{t('diningVenuesHeroTitle')}</Text>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color="rgba(255,255,255,0.85)" style={{ marginRight: 8 }} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder={t('diningVenuesSearchPlaceholder')}
              placeholderTextColor="rgba(255,255,255,0.5)"
              style={styles.searchIn}
              returnKeyType="search"
            />
          </View>
        </LinearGradient>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.typeRow}
          style={styles.typeScroll}
        >
          {TYPE_OPTIONS.map((item) => {
            const on = typeFilter === item;
            return (
              <TouchableOpacity
                key={item}
                onPress={() => setTypeFilter(item)}
                style={[styles.typeChip, on && styles.typeChipOn]}
                activeOpacity={0.85}
              >
                <Text style={[styles.typeChipT, on && styles.typeChipTOn]} numberOfLines={1}>
                  {typeLabel(item)}
                </Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={[styles.filterBtn, extraFilterCount > 0 && styles.filterBtnActive]}
            onPress={() => setFilterOpen(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="options-outline" size={16} color={extraFilterCount > 0 ? '#fff' : theme.colors.text} />
            <Text style={[styles.filterBtnT, extraFilterCount > 0 && styles.filterBtnTOn]}>
              {t('diningVenuesMoreFilters')}
            </Text>
            {extraFilterCount > 0 ? (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeT}>{extraFilterCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </ScrollView>
        {locLoading ? <Text style={styles.mutedSmall}>{t('diningVenuesLocating')}</Text> : null}
        {distFilter !== 'all' && !userPos && !locLoading ? (
          <TouchableOpacity onPress={requestLocation} style={styles.locBtn}>
            <Ionicons name="location-outline" size={16} color={theme.colors.primary} />
            <Text style={styles.locBtnT}>{t('diningVenuesUseMyLocation')}</Text>
          </TouchableOpacity>
        ) : null}
        {loading && items.length === 0 ? <Text style={styles.muted}>{t('loading')}</Text> : null}
      </View>
    ),
    [
      TYPE_OPTIONS,
      distFilter,
      extraFilterCount,
      items.length,
      loading,
      locLoading,
      q,
      requestLocation,
      t,
      typeFilter,
      typeLabel,
      userPos,
    ]
  );

  const renderItem = useCallback(
    ({ item: { v, km } }: { item: { v: DiningVenueRow; km: number | null } }) => {
      const cover = v.cover_image || v.images?.[0];
      const listAvatar = venueAvatarUrl(v);
      const tagLine = (v.cuisine_tags ?? []).slice(0, 4).join(' · ') || t(`diningVenuesType_${v.venue_type}`);
      const menuPeek = (v.menu_items ?? [])
        .map((m) => m.name?.trim())
        .filter(Boolean)
        .slice(0, 5);
      return (
        <View style={[styles.card, { width: cardW }]}>
          <View style={styles.coverWrap}>
            {cover ? (
              <CachedImage uri={cover} style={styles.cover} contentFit="cover" />
            ) : (
              <View style={[styles.cover, styles.coverPh]}>
                <Ionicons name="restaurant" size={44} color={theme.colors.textMuted} />
              </View>
            )}
            {listAvatar ? (
              <View style={styles.listAvatar} accessible accessibilityLabel={v.name}>
                <CachedImage uri={listAvatar} style={styles.listAvatarImg} contentFit="cover" />
              </View>
            ) : null}
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {v.name}
            </Text>
            {menuPeek.length > 0 ? (
              <View style={styles.menuPeek}>
                <Text style={styles.menuPeekLabel}>{t('diningVenuesMenuPeek')}</Text>
                <Text style={styles.menuPeekText} numberOfLines={2}>
                  {menuPeek.join(' · ')}
                </Text>
              </View>
            ) : null}
            <Text style={styles.desc} numberOfLines={2}>
              {(v.description ?? '').trim() || '—'}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {tagLine}
            </Text>
            <View style={styles.row}>
              <Text style={styles.price}>
                {t('diningVenuesPrice')}: {priceLevelLabel(v.price_level)}
              </Text>
              {km != null ? (
                <Text style={styles.kmText}>
                  {km < 1
                    ? t('diningVenuesMeters', { m: Math.round(km * 1000) })
                    : t('diningVenuesKm', { n: km.toFixed(1) })}
                </Text>
              ) : null}
            </View>
            <View style={styles.badges}>
              {v.is_open_now ? (
                <View style={[styles.pill, styles.pillOk]}>
                  <Text style={styles.pillT}>{t('diningVenuesOpenNow')}</Text>
                </View>
              ) : (
                <View style={[styles.pill, styles.pillNo]}>
                  <Text style={styles.pillT}>{t('diningVenuesClosedNow')}</Text>
                </View>
              )}
              {v.location_scope === 'on_premises' ? (
                <View style={styles.pill}>
                  <Text style={styles.pillT2}>{t('diningVenuesScope_on_premises')}</Text>
                </View>
              ) : null}
            </View>
            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={() => router.push({ pathname: detailPath, params: { id: v.id } })}
            >
              <Text style={styles.btnPrimaryT}>{t('diningVenuesShowDetails')}</Text>
              <Ionicons name="chevron-forward" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      );
    },
    [cardW, detailPath, router, t]
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + 6 }]}>
      <FlashList
        data={loading ? [] : sorted}
        estimatedItemSize={CUSTOMER_ROW_HEIGHT.diningVenue}
        drawDistance={CUSTOMER_FLASH_DRAW_DISTANCE}
        keyExtractor={(i) => i.v.id}
        ListHeaderComponent={listHeader}
        contentContainerStyle={{ paddingBottom: insets.bottom + 28, paddingTop: 0 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListEmptyComponent={!loading ? <Text style={styles.muted}>{t('diningVenuesNoResults')}</Text> : null}
        renderItem={renderItem}
        {...CUSTOMER_LIST_PERF}
      />

      <Modal
        visible={filterOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setFilterOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setFilterOpen(false)}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('diningVenuesFilterSheetTitle')}</Text>
              <TouchableOpacity onPress={resetExtraFilters} hitSlop={12}>
                <Text style={styles.modalReset}>{t('diningVenuesResetFilters')}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalSec}>{t('diningVenuesFieldPrice')}</Text>
              <View style={styles.modalChips}>
                {(['all', '1', '2', '3'] as const).map((item) => {
                  const on = priceFilter === (item === 'all' ? 'all' : (parseInt(item, 10) as 1 | 2 | 3));
                  return (
                    <TouchableOpacity
                      key={item}
                      onPress={() => setPriceFilter(item === 'all' ? 'all' : (parseInt(item, 10) as 1 | 2 | 3))}
                      style={[styles.mChip, on && styles.mChipOn]}
                    >
                      <Text style={[styles.mChipT, on && styles.mChipTOn]}>
                        {item === 'all' ? t('diningVenuesPriceAll') : '₺'.repeat(parseInt(item, 10))}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.modalSec}>{t('diningVenuesOpenAll')}</Text>
              <View style={styles.modalChips}>
                {(['all', 'open', 'closed'] as const).map((item) => {
                  const on = openFilter === item;
                  return (
                    <TouchableOpacity key={item} onPress={() => setOpenFilter(item)} style={[styles.mChip, on && styles.mChipOn]}>
                      <Text style={[styles.mChipT, on && styles.mChipTOn]}>
                        {item === 'all' ? t('diningVenuesFilterAll') : item === 'open' ? t('diningVenuesOpenNow') : t('diningVenuesClosedNow')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.modalSec}>{t('diningVenuesFieldLocationScope')}</Text>
              <View style={styles.modalChips}>
                {(['all', 'on_premises', 'off_premises'] as const).map((item) => {
                  const on = scopeFilter === item;
                  return (
                    <TouchableOpacity key={item} onPress={() => setScopeFilter(item)} style={[styles.mChip, on && styles.mChipOn]}>
                      <Text style={[styles.mChipT, on && styles.mChipTOn]}>
                        {item === 'all' ? t('diningVenuesFilterAll') : t(`diningVenuesScope_${item}`)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.modalSec}>{t('diningVenuesDistanceAll')}</Text>
              <View style={styles.modalChips}>
                {(['all', '2', '5', '20'] as const).map((item) => {
                  const on = distFilter === item;
                  return (
                    <TouchableOpacity
                      key={item}
                      onPress={() => {
                        void setDistanceFilter(item);
                      }}
                      style={[styles.mChip, on && styles.mChipOn]}
                    >
                      <Text style={[styles.mChipT, on && styles.mChipTOn]}>
                        {item === 'all' ? t('diningVenuesFilterAll') : t('diningVenuesDistanceKm', { n: item })}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
            <TouchableOpacity style={styles.modalDone} onPress={() => setFilterOpen(false)}>
              <Text style={styles.modalDoneT}>{t('close')}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  hero: { marginHorizontal: 12, borderRadius: 16, padding: 12, marginBottom: 6 },
  heroTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 8, letterSpacing: -0.2 },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 10, paddingHorizontal: 10 },
  searchIn: { flex: 1, color: '#fff', paddingVertical: Platform.OS === 'ios' ? 8 : 6, fontSize: 15 },
  typeScroll: { maxHeight: 48, marginBottom: 4 },
  typeRow: { paddingHorizontal: 12, paddingVertical: 6, gap: 6, alignItems: 'center' },
  typeChip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 14, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.borderLight },
  typeChipOn: { backgroundColor: '#3d2a22', borderColor: '#3d2a22' },
  typeChipT: { fontSize: 12, color: theme.colors.text, fontWeight: '700' },
  typeChipTOn: { color: '#fff' },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: theme.colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  filterBtnActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  filterBtnT: { fontSize: 12, fontWeight: '800', color: theme.colors.text },
  filterBtnTOn: { color: '#fff' },
  filterBadge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
  filterBadgeT: { fontSize: 10, fontWeight: '800', color: '#fff' },
  muted: { textAlign: 'center', color: theme.colors.textMuted, marginTop: 12, marginBottom: 8, paddingHorizontal: 20 },
  mutedSmall: { textAlign: 'center', color: theme.colors.textMuted, fontSize: 11, marginBottom: 4 },
  locBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 4 },
  locBtnT: { color: theme.colors.primary, fontWeight: '600', fontSize: 13 },
  card: {
    alignSelf: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.borderLight,
  },
  coverWrap: { position: 'relative' },
  cover: { width: '100%', height: 228 },
  listAvatar: {
    position: 'absolute',
    left: 12,
    bottom: 10,
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#fff',
    backgroundColor: theme.colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  listAvatarImg: { width: '100%', height: '100%' },
  coverPh: { backgroundColor: theme.colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' },
  cardBody: { padding: 14, gap: 4 },
  cardTitle: { fontSize: 20, fontWeight: '800', color: theme.colors.text, letterSpacing: -0.2 },
  menuPeek: { marginTop: 2, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: theme.colors.backgroundSecondary, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.borderLight },
  menuPeekLabel: { fontSize: 10, fontWeight: '800', color: theme.colors.textMuted, letterSpacing: 0.6, marginBottom: 2 },
  menuPeekText: { fontSize: 14, fontWeight: '700', color: theme.colors.text, lineHeight: 20 },
  desc: { fontSize: 13, color: theme.colors.textSecondary, lineHeight: 19, marginTop: 2 },
  meta: { fontSize: 13, color: theme.colors.text, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  price: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: '600' },
  kmText: { fontSize: 12, color: theme.colors.primary, fontWeight: '700' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: theme.colors.backgroundSecondary },
  pillOk: { backgroundColor: 'rgba(16, 185, 129, 0.15)' },
  pillNo: { backgroundColor: 'rgba(239, 68, 68, 0.12)' },
  pillT: { fontSize: 10, fontWeight: '700', color: theme.colors.text },
  pillT2: { fontSize: 10, fontWeight: '600', color: theme.colors.textSecondary },
  btnPrimary: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.colors.primary,
    paddingVertical: 11,
    borderRadius: 12,
  },
  btnPrimaryT: { color: '#fff', fontWeight: '800', fontSize: 15 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '78%', paddingHorizontal: 16, paddingTop: 12 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.text },
  modalReset: { fontSize: 15, fontWeight: '700', color: theme.colors.primary },
  modalScroll: { maxHeight: 400 },
  modalSec: { fontSize: 12, fontWeight: '800', color: theme.colors.textSecondary, marginTop: 10, marginBottom: 6 },
  modalChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: theme.colors.backgroundSecondary, borderWidth: 1, borderColor: theme.colors.borderLight },
  mChipOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  mChipT: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  mChipTOn: { color: '#fff' },
  modalDone: { marginTop: 12, paddingVertical: 14, alignItems: 'center', backgroundColor: theme.colors.backgroundSecondary, borderRadius: 12 },
  modalDoneT: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
});
