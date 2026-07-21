import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { theme } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { KbsBrowseTabBar } from '@/components/kbs/KbsBrowseTabBar';
import { KbsHotelFilterBar } from '@/components/kbs/KbsHotelFilterBar';
import {
  buildNationalityFilterOptions,
  fetchKbsBrowseDocuments,
  fetchKbsCaptureStats,
  fetchPassportHotelBreakdown,
  listAccessibleHotels,
  nationalityCodeOf,
  resolveKbsMultiHotelContext,
  type KbsCaptureStats,
  type KbsOpsHotel,
  type PassportHotelBreakdown,
} from '@/lib/kbsMultiHotelCaptures';
import {
  capturedAtTs,
  displayCapturedName,
  filterKbsCapturesForViewer,
  type KbsCapturedDocumentRow,
} from '@/lib/kbsCaptureHistory';
import { enrichKbsParsedFromSources, kbsCaptureCardStatus } from '@/lib/kbsCaptureParsedFields';
import { formatIcao3ForTr } from '@/lib/scanner/mrzIssuingLabel';
import type { ParsedDocument } from '@/lib/scanner/types';
import { isAbortLikeError, toSupabaseUserMessage } from '@/lib/supabaseTransientErrors';
import { useTranslation } from 'react-i18next';

type RangeKey = 'all' | 'today' | 'week';

function detailRoute(id: string): Href {
  return `/staff/kbs/capture/${id}` as Href;
}

function inRange(ts: string, key: RangeKey): boolean {
  if (key === 'all') return true;
  const t = new Date(ts).getTime();
  const now = Date.now();
  if (key === 'today') return now - t <= 24 * 60 * 60 * 1000;
  const day = (new Date().getDay() + 6) % 7;
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - day);
  weekStart.setHours(0, 0, 0, 0);
  return t >= weekStart.getTime();
}

function asParsed(row: KbsCapturedDocumentRow): ParsedDocument | null {
  const p = row.parsed_payload;
  if (!p || typeof p !== 'object') return null;
  return enrichKbsParsedFromSources(p) as ParsedDocument;
}

function matchesQuery(row: KbsCapturedDocumentRow, q: string): boolean {
  if (!q) return true;
  const parsed = asParsed(row);
  const haystack = [
    displayCapturedName(row),
    row.hotel_name ?? '',
    row.room_number ?? '',
    parsed?.documentNumber ?? '',
    nationalityCodeOf(row),
  ]
    .join(' ')
    .toLocaleLowerCase('tr-TR');
  return haystack.includes(q.toLocaleLowerCase('tr-TR'));
}

export default function KbsPassportExploreScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const user = useAuthStore((s) => s.user);
  const authId = user?.id ?? staff?.auth_id;

  const [hotels, setHotels] = useState<KbsOpsHotel[]>([]);
  const [canViewAllHotels, setCanViewAllHotels] = useState(false);
  const [hotelFilter, setHotelFilter] = useState('all');
  const [nationalityFilter, setNationalityFilter] = useState('all');
  const [range, setRange] = useState<RangeKey>('all');
  const [rows, setRows] = useState<KbsCapturedDocumentRow[]>([]);
  const [stats, setStats] = useState<KbsCaptureStats>({ total: 0, today: 0, week: 0 });
  const [breakdown, setBreakdown] = useState<PassportHotelBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const reloadSeqRef = useRef(0);

  const reload = useCallback(async () => {
    if (!authId) return;
    const seq = ++reloadSeqRef.current;
    try {
      setError(null);
      const ctx = await resolveKbsMultiHotelContext(authId);
      if (!ctx.ok) throw new Error(ctx.message);
      if (seq !== reloadSeqRef.current) return;

      const hotelList = await listAccessibleHotels();
      setHotels(hotelList);
      setCanViewAllHotels(ctx.canViewAllHotels);

      const fetchHotelId =
        hotelFilter === 'all' ? (ctx.canViewAllHotels ? null : ctx.hotelId) : hotelFilter;

      const [data, exactStats, hotelBreakdown] = await Promise.all([
        fetchKbsBrowseDocuments(authId, {
          hotelId: fetchHotelId,
          documentType: 'passport',
          limit: ctx.canViewAllHotels && hotelFilter === 'all' ? 400 : 300,
        }),
        fetchKbsCaptureStats({ hotelId: fetchHotelId, documentType: 'passport' }),
        ctx.canViewAllHotels && hotelFilter === 'all'
          ? fetchPassportHotelBreakdown(hotelList)
          : Promise.resolve([] as PassportHotelBreakdown[]),
      ]);

      if (seq !== reloadSeqRef.current) return;
      const scoped = filterKbsCapturesForViewer(data, staff, authId);
      setRows(scoped);
      setStats(exactStats);
      setBreakdown(hotelBreakdown);
      setNationalityFilter('all');
    } catch (e) {
      if (seq !== reloadSeqRef.current) return;
      if (isAbortLikeError(e) && rows.length > 0) return;
      setError(toSupabaseUserMessage(e, 'Pasaport listesi yüklenemedi'));
    } finally {
      if (seq !== reloadSeqRef.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, [authId, hotelFilter, rows.length, staff, t]);

  useFocusEffect(
    useCallback(() => {
      void reload();
      return () => {
        reloadSeqRef.current += 1;
      };
    }, [reload])
  );

  useEffect(() => {
    if (!authId) return;
    setRefreshing(true);
    void reload();
  }, [hotelFilter, authId, reload]);

  const nationalityOptions = useMemo(() => buildNationalityFilterOptions(rows), [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (!inRange(capturedAtTs(r), range)) return false;
        if (nationalityFilter !== 'all' && nationalityCodeOf(r) !== nationalityFilter) return false;
        if (!matchesQuery(r, query.trim())) return false;
        return true;
      }),
    [rows, range, nationalityFilter, query]
  );

  const showBreakdown = hotelFilter === 'all' && canViewAllHotels && breakdown.length > 0;

  if (loading && rows.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Pasaportlar yükleniyor…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <KbsBrowseTabBar active="passports" />

      <KbsHotelFilterBar
        hotels={hotels}
        canViewAll={canViewAllHotels}
        value={hotelFilter}
        onChange={setHotelFilter}
      />

      <View style={styles.statsRow}>
        {([
          ['today', 'Bugün', stats.today],
          ['week', 'Bu hafta', stats.week],
          ['all', 'Toplam', stats.total],
        ] as const).map(([k, label, num]) => (
          <TouchableOpacity
            key={k}
            style={[styles.statChip, range === k && styles.statChipOn]}
            onPress={() => setRange((r) => (r === k ? 'all' : k))}
          >
            <Text style={[styles.statNum, range === k && styles.statNumOn]}>{num}</Text>
            <Text style={[styles.statLabel, range === k && styles.statLabelOn]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {nationalityOptions.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.natScroll}>
          <View style={styles.natRow}>
            <TouchableOpacity
              style={[styles.chip, nationalityFilter === 'all' && styles.chipOn]}
              onPress={() => setNationalityFilter('all')}
            >
              <Text style={[styles.chipText, nationalityFilter === 'all' && styles.chipTextOn]}>
                Tümü ({rows.length})
              </Text>
            </TouchableOpacity>
            {nationalityOptions.slice(0, 10).map((n) => (
              <TouchableOpacity
                key={n.code}
                style={[styles.chip, nationalityFilter === n.code && styles.chipOn]}
                onPress={() => setNationalityFilter(n.code)}
              >
                <Text style={[styles.chipText, nationalityFilter === n.code && styles.chipTextOn]}>
                  {n.label} ({n.count})
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      ) : null}

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={theme.colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Ad, pasaport no, uyruk, otel ara…"
          placeholderTextColor={theme.colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void reload(); }} />}
        ListHeaderComponent={
          showBreakdown ? (
            <View style={styles.breakdownBox}>
              <Text style={styles.breakdownTitle}>Hangi otelde kaç pasaport bildirildi</Text>
              <Text style={styles.breakdownSub}>İşletmeye dokunarak filtreleyin</Text>
              <View style={styles.breakdownGrid}>
                {breakdown.map((b) => (
                  <TouchableOpacity
                    key={b.hotelId}
                    style={styles.breakdownCard}
                    onPress={() => setHotelFilter(b.hotelId)}
                  >
                    <Text style={styles.breakdownHotel}>{b.hotelName}</Text>
                    <Text style={styles.breakdownCount}>{b.count}</Text>
                    <Text style={styles.breakdownUnit}>pasaport</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {query.trim() ? 'Seçime uygun pasaport yok.' : 'Henüz bildirilen pasaport yok.'}
          </Text>
        }
        renderItem={({ item }) => {
          const parsed = asParsed(item);
          const status = kbsCaptureCardStatus(parsed, { ocrStatus: item.ocr_status });
          const nat = nationalityCodeOf(item);
          return (
            <Pressable style={styles.card} onPress={() => router.push(detailRoute(item.id))}>
              {item.front_image_url ? (
                <Image source={{ uri: item.front_image_url }} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={styles.thumbMask}>
                  <Ionicons name="document-text-outline" size={24} color="#94a3b8" />
                </View>
              )}
              <View style={styles.cardBody}>
                <Text style={styles.name} numberOfLines={1}>
                  {displayCapturedName(item)}
                </Text>
                {parsed?.documentNumber ? (
                  <Text style={styles.metaMono}>{parsed.documentNumber}</Text>
                ) : null}
                {nat !== '—' ? <Text style={styles.meta}>{formatIcao3ForTr(nat)}</Text> : null}
                {item.hotel_name ? <Text style={styles.metaHotel}>🏨 {item.hotel_name}</Text> : null}
                {item.room_number ? <Text style={styles.meta}>Oda {item.room_number}</Text> : null}
                {status ? <Text style={styles.status}>{status.label}</Text> : null}
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary, padding: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: theme.colors.textSecondary },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  statChip: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    paddingVertical: 10,
    alignItems: 'center',
  },
  statChipOn: { backgroundColor: '#eff6ff', borderColor: theme.colors.primary },
  statNum: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  statNumOn: { color: theme.colors.primary },
  statLabel: { fontSize: 11, fontWeight: '700', color: theme.colors.textSecondary, marginTop: 2 },
  statLabelOn: { color: theme.colors.primary },
  natScroll: { marginBottom: 8, maxHeight: 44 },
  natRow: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  chipOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary },
  chipTextOn: { color: '#fff' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: theme.colors.text },
  errorText: { color: theme.colors.error, marginBottom: 8, fontSize: 13 },
  breakdownBox: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    padding: 14,
    marginBottom: 12,
  },
  breakdownTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text },
  breakdownSub: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4, marginBottom: 10 },
  breakdownGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  breakdownCard: {
    minWidth: '30%',
    flexGrow: 1,
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    padding: 12,
  },
  breakdownHotel: { fontSize: 13, fontWeight: '800', color: theme.colors.text },
  breakdownCount: { fontSize: 22, fontWeight: '800', color: theme.colors.primary, marginTop: 4 },
  breakdownUnit: { fontSize: 10, color: theme.colors.textMuted, textTransform: 'uppercase' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  thumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: '#e2e8f0' },
  thumbMask: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '800', color: theme.colors.text },
  meta: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  metaMono: { fontSize: 12, fontWeight: '700', color: theme.colors.text, marginTop: 2 },
  metaHotel: { fontSize: 12, color: '#0d9488', marginTop: 2, fontWeight: '700' },
  status: { fontSize: 11, color: '#059669', marginTop: 4, fontWeight: '700' },
  empty: { textAlign: 'center', color: theme.colors.textSecondary, marginTop: 24, fontSize: 14 },
});
