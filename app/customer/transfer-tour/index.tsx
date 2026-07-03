import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import {
  type TransferServiceRow,
  type TransferServiceType,
  type VehicleSize,
  serviceRowFromDb,
  pickLocalizedString,
  parseRoutes,
  type I18nJson,
} from '@/lib/transferTour';
import { LinearGradient } from 'expo-linear-gradient';
import { useCachedList } from '@/hooks/useCachedList';

const TYPE_FILTER: (TransferServiceType | 'all')[] = ['all', 'transfer', 'tour', 'vip', 'custom_route'];
const SIZE_FILTER: (VehicleSize | 'all')[] = ['all', 'small', 'medium', 'large', 'vip'];

export type CustomerTransferTourListProps = {
  /** Personel (yetkisiz) yığınında misafir detay ekranına yönlendirme */
  guestDetailStack?: 'customer' | 'staff';
};

export default function CustomerTransferTourList({ guestDetailStack = 'customer' }: CustomerTransferTourListProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cardW = width - 32;
  const detailPath =
    guestDetailStack === 'staff'
      ? ('/staff/transfer-tour/guest/[id]' as const)
      : ('/customer/transfer-tour/[id]' as const);

  const cacheKey =
    guestDetailStack === 'staff' ? 'staff-transfer-tour-guest-list' : 'customer-transfer-tour-list';

  const fetchItems = useCallback(async () => {
    const { data, error } = await supabase
      .from('transfer_services')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (error) return [];
    return (data ?? []).map((r) => {
      const o = r as Record<string, unknown>;
      return serviceRowFromDb({ ...o, routes: parseRoutes(o.routes) });
    });
  }, []);

  const { items, loading, refreshing, refresh } = useCachedList<TransferServiceRow>({
    cacheKey,
    fetchItems,
  });

  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState<TransferServiceType | 'all'>('all');
  const [sizeFilter, setSizeFilter] = useState<VehicleSize | 'all'>('all');

  const filtered = useMemo(() => {
    return items.filter((s) => {
      if (typeFilter !== 'all' && s.service_type !== typeFilter) return false;
      if (sizeFilter !== 'all' && s.vehicle_size !== sizeFilter) return false;
      if (!q.trim()) return true;
      const title = pickLocalizedString(s.title as I18nJson, lang, '');
      const brand = (s.brand ?? '').toLowerCase();
      const model = (s.model ?? '').toLowerCase();
      const op = (s.tour_operator_name ?? '').toLowerCase();
      const rest = s.routes
        .map(
          (r) =>
            `${pickLocalizedString(r.from, lang, '')} ${pickLocalizedString(r.to, lang, '')}`.toLowerCase()
        )
        .join(' ');
      const hay = `${title} ${brand} ${model} ${op} ${rest}`.toLowerCase();
      return hay.includes(q.trim().toLowerCase());
    });
  }, [items, typeFilter, sizeFilter, q, lang]);

  const typeLabel = (k: string) => {
    const map: Record<string, string> = {
      all: t('transferTourFilterAll'),
      transfer: t('transferTourTypeTransfer'),
      vehicle_rental: t('transferTourTypeVehicleRental'),
      tour: t('transferTourTypeTour'),
      vip: t('transferTourTypeVip'),
      custom_route: t('transferTourTypeCustomRoute'),
    };
    return map[k] ?? k;
  };

  const sizeLabel = (k: string) => {
    const map: Record<string, string> = {
      all: t('transferTourFilterAll'),
      small: t('transferTourSizeSmall'),
      medium: t('transferTourSizeMedium'),
      large: t('transferTourSizeLarge'),
      vip: t('transferTourSizeVip'),
    };
    return map[k] ?? k;
  };

  const priceLabel = (s: TransferServiceRow) => {
    if (s.pricing_type === 'quote') return t('transferTourPriceQuote');
    if (s.pricing_type === 'per_person') {
      return s.price != null ? `${s.price} ${s.currency} ${t('transferTourPricePerPerson')}` : t('transferTourPricePerPerson');
    }
    return s.price != null ? `${s.price} ${s.currency}` : '—';
  };

  /** Personel stack’inde üstte zaten navigation header var; çift boşluk olmasın */
  const listTopPad = guestDetailStack === 'staff' ? 8 : insets.top + 8;

  return (
    <View style={[styles.root, { paddingTop: listTopPad }]}>
      <LinearGradient
        colors={['#1e3a5f', '#0f766e', '#134e4a']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Text style={styles.heroTitle}>{t('transferTourHeroTitle')}</Text>
        <Text style={styles.heroSub}>{t('transferTourHeroSubtitle')}</Text>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={20} color="rgba(255,255,255,0.85)" style={{ marginRight: 8 }} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder={t('transferTourSearchPlaceholder')}
            placeholderTextColor="rgba(255,255,255,0.5)"
            style={styles.searchIn}
            returnKeyType="search"
          />
        </View>
      </LinearGradient>

      <View style={styles.chips}>
        <FlatList
          horizontal
          data={TYPE_FILTER}
          keyExtractor={(x) => x}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          renderItem={({ item }) => {
            const on = typeFilter === item;
            return (
              <TouchableOpacity
                onPress={() => setTypeFilter(item as TransferServiceType | 'all')}
                style={[styles.chip, on && styles.chipOn]}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
                  {typeLabel(item)}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>
      <View style={styles.chips}>
        <FlatList
          horizontal
          data={SIZE_FILTER}
          keyExtractor={(x) => x}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          renderItem={({ item }) => {
            const on = sizeFilter === item;
            return (
              <TouchableOpacity
                onPress={() => setSizeFilter(item as VehicleSize | 'all')}
                style={[styles.chip, on && styles.chipOn2]}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
                  {sizeLabel(item)}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {loading && items.length === 0 ? (
        <Text style={styles.muted}>{t('loading')}</Text>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          ListEmptyComponent={<Text style={styles.muted}>{t('transferTourNoResults')}</Text>}
          renderItem={({ item: s }) => {
            const title = pickLocalizedString(s.title as I18nJson, lang, t('transferTourNavTitle'));
            const cover = s.cover_image || s.images?.[0];
            const leg0 = s.routes[0];
            const from0 = leg0 ? pickLocalizedString(leg0.from, lang, '') : '';
            const to0 = leg0 ? pickLocalizedString(leg0.to, lang, '') : '';
            const routeText =
              from0.trim() && to0.trim()
                ? `${from0} → ${to0}`
                : (from0 || to0).trim() || t('transferTourListRouteShort');
            return (
              <View style={[styles.card, { width: cardW }]}>
                {cover ? (
                  <CachedImage uri={cover} style={styles.cover} contentFit="cover" />
                ) : (
                  <View style={[styles.cover, styles.coverPh]}>
                    <Ionicons name="car-sport" size={48} color={theme.colors.textMuted} />
                  </View>
                )}
                <View style={styles.cardBody}>
                  {s.tour_operator_name || s.tour_operator_logo ? (
                    <View style={styles.opRow}>
                      {s.tour_operator_logo ? (
                        <CachedImage uri={s.tour_operator_logo} style={styles.opAvatar} contentFit="cover" />
                      ) : (
                        <View style={[styles.opAvatar, styles.opAvatarPh]}>
                          <Ionicons name="business-outline" size={20} color={theme.colors.textMuted} />
                        </View>
                      )}
                      {s.tour_operator_name ? (
                        <Text style={styles.opName} numberOfLines={2}>
                          {s.tour_operator_name}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {title}
                  </Text>
                  {s.brand || s.model ? (
                    <Text style={styles.meta}>
                      {[s.brand, s.model].filter(Boolean).join(' · ')}
                    </Text>
                  ) : null}
                  <View style={styles.row}>
                    <Ionicons name="people-outline" size={16} color={theme.colors.textSecondary} />
                    <Text style={styles.metaSmall}> {t('transferTourPassengers', { n: s.capacity })}</Text>
                    <Text style={styles.metaSmall}> · </Text>
                    <Text style={styles.metaSmall}>{t('transferTourLuggage', { n: s.luggage_capacity })}</Text>
                  </View>
                  {routeText ? (
                    <Text style={styles.route} numberOfLines={2}>
                      {routeText}
                    </Text>
                  ) : null}
                  <View style={styles.cardFooter}>
                    <Text style={styles.price}>{priceLabel(s)}</Text>
                    <View style={styles.btnRow}>
                      <TouchableOpacity
                        style={styles.btnGhost}
                        onPress={() => router.push({ pathname: detailPath as Href, params: { id: s.id } })}
                      >
                        <Text style={styles.btnGhostT}>{t('transferTourShowDetails')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.btnPrimary}
                        onPress={() =>
                          router.push({ pathname: detailPath as Href, params: { id: s.id, request: '1' } })
                        }
                      >
                        <Text style={styles.btnPrimaryT}>{t('transferTourRequest')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  hero: { marginHorizontal: 16, borderRadius: 20, padding: 20, marginBottom: 8 },
  heroTitle: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 6 },
  heroSub: { color: 'rgba(255,255,255,0.88)', fontSize: 14, lineHeight: 20, marginBottom: 14 },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 12, paddingHorizontal: 12 },
  searchIn: { flex: 1, color: '#fff', paddingVertical: 10, fontSize: 16 },
  chips: { marginBottom: 4 },
  chipRow: { paddingHorizontal: 16, gap: 8, paddingVertical: 6 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.borderLight },
  chipOn: { backgroundColor: '#0f766e' },
  chipOn2: { backgroundColor: theme.colors.primary },
  chipText: { fontSize: 13, color: theme.colors.text, fontWeight: '600' },
  chipTextOn: { color: '#fff' },
  muted: { textAlign: 'center', color: theme.colors.textMuted, marginTop: 24, paddingHorizontal: 24 },
  card: {
    alignSelf: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  cover: { width: '100%', height: 180 },
  coverPh: { backgroundColor: theme.colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' },
  cardBody: { padding: 16 },
  opRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  opAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.backgroundSecondary },
  opAvatarPh: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.borderLight },
  opName: { flex: 1, fontSize: 14, fontWeight: '700', color: theme.colors.primaryDark },
  cardTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
  meta: { marginTop: 4, color: theme.colors.textSecondary, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  metaSmall: { fontSize: 13, color: theme.colors.textSecondary },
  route: { marginTop: 8, color: theme.colors.text, fontSize: 14, lineHeight: 20 },
  cardFooter: { marginTop: 12 },
  price: { fontSize: 17, fontWeight: '800', color: theme.colors.primaryDark },
  btnRow: { flexDirection: 'row', marginTop: 12, gap: 10 },
  btnGhost: { flex: 1, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center' },
  btnGhostT: { fontWeight: '700', color: theme.colors.text },
  btnPrimary: { flex: 1, paddingVertical: 12, borderRadius: 14, backgroundColor: theme.colors.primary, alignItems: 'center' },
  btnPrimaryT: { fontWeight: '800', color: '#fff' },
});
