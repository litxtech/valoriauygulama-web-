import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  TextInput,
  ActivityIndicator,
  Platform,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import { guestDisplayName } from '@/lib/guestDisplayName';
import { formatDateTime } from '@/lib/date';
import { type StaffGuestListItem } from '@/lib/staffGuestsListCache';
import { useCachedList } from '@/hooks/useCachedList';

const LIST_ROW_HEIGHT = 84;
const INITIAL_LIMIT = 64;
const SEARCH_LIMIT = 48;

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Giriş bekliyor', color: '#a16207', bg: '#fef3c7' },
  checked_in: { label: 'Odada', color: '#166534', bg: '#dcfce7' },
  checked_out: { label: 'Çıkış yaptı', color: '#475569', bg: '#f1f5f9' },
};

type GuestRowRaw = {
  id: string;
  full_name: string | null;
  photo_url: string | null;
  phone: string | null;
  email: string | null;
  banned_until?: string | null;
  room_id?: string | null;
  created_at?: string | null;
  status?: string | null;
};

function escapeIlike(term: string): string {
  return term.replace(/[%_\\]/g, '\\$&');
}

function mapGuestRows(data: GuestRowRaw[] | null, roomById: Record<string, string>): StaffGuestListItem[] {
  const nowIso = new Date().toISOString();
  return (data ?? [])
    .filter((g) => !g.banned_until || g.banned_until < nowIso)
    .map((g) => ({
      id: g.id,
      full_name: g.full_name,
      photo_url: g.photo_url,
      phone: g.phone ?? null,
      email: g.email ?? null,
      room_number: g.room_id ? roomById[g.room_id] ?? null : null,
      created_at: g.created_at ?? null,
      status: g.status ?? null,
    }));
}

async function attachRoomNumbers(rows: GuestRowRaw[]): Promise<Record<string, string>> {
  const roomIds = [...new Set(rows.map((g) => g.room_id).filter((id): id is string => Boolean(id)))];
  if (roomIds.length === 0) return {};
  const { data } = await supabase.from('rooms').select('id, room_number').in('id', roomIds);
  const map: Record<string, string> = {};
  for (const r of data ?? []) {
    const num = (r as { room_number?: string }).room_number;
    if (num) map[(r as { id: string }).id] = String(num);
  }
  return map;
}

const GuestListRow = memo(function GuestListRow({
  item,
  onPress,
  profileMeta,
}: {
  item: StaffGuestListItem;
  onPress: () => void;
  profileMeta: string;
}) {
  const name = guestDisplayName(item.full_name, 'Misafir');
  const contact = item.phone || item.email;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      android_ripple={{ color: theme.colors.borderLight }}
    >
      <View style={styles.avatarRing}>
        {item.photo_url ? (
          <CachedImage uri={item.photo_url} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarLetter}>{name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {contact ? (
          <Text style={styles.contact} numberOfLines={1}>
            {contact}
          </Text>
        ) : (
          <Text style={styles.contactMuted} numberOfLines={1}>
            {profileMeta}
          </Text>
        )}
        <View style={styles.metaChips}>
          {item.room_number ? (
            <LinearGradient colors={['#1d4ed8', '#2563eb']} style={styles.roomChipGrad}>
              <Ionicons name="bed" size={12} color="#fff" />
              <Text style={styles.roomChipGradText}>Oda {item.room_number}</Text>
            </LinearGradient>
          ) : null}
          {item.status && STATUS_LABELS[item.status] ? (
            <View style={[styles.statusChip, { backgroundColor: STATUS_LABELS[item.status]!.bg }]}>
              <Text style={[styles.statusChipText, { color: STATUS_LABELS[item.status]!.color }]}>
                {STATUS_LABELS[item.status]!.label}
              </Text>
            </View>
          ) : null}
        </View>
        {item.created_at ? (
          <View style={styles.regRow}>
            <Ionicons name="calendar-outline" size={12} color="#6366f1" />
            <Text style={styles.regText}>Kayıt: {formatDateTime(item.created_at)}</Text>
          </View>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
    </Pressable>
  );
});

function StaffLiveDot() {
  const opacity = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[styles.liveDot, { opacity }]} />;
}

function SkeletonRows() {
  return (
    <View style={styles.skeletonWrap}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.skeletonRow}>
          <View style={styles.skeletonAvatar} />
          <View style={styles.skeletonLines}>
            <View style={[styles.skeletonLine, { width: '62%' }]} />
            <View style={[styles.skeletonLine, { width: '44%' }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function StaffGuestsIndexScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchGuests, setSearchGuests] = useState<StaffGuestListItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const searchSkipInitial = useRef(true);

  const fetchItems = useCallback(async (): Promise<StaffGuestListItem[]> => {
    const { data, error } = await supabase
      .from('guests')
      .select('id, full_name, photo_url, banned_until, phone, email, room_id, created_at, status')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(INITIAL_LIMIT);
    if (error) throw new Error(error.message || 'Misafirler yüklenemedi.');
    const rows = (data ?? []) as GuestRowRaw[];
    const roomById = await attachRoomNumbers(rows);
    return mapGuestRows(rows, roomById);
  }, []);

  const {
    items: baseGuests,
    loading,
    refreshing,
    refresh,
    load,
  } = useCachedList<StaffGuestListItem>({
    cacheKey: 'staff-guests-list',
    fetchItems,
  });

  const fetchSearchGuests = useCallback(async (searchQuery: string) => {
    const q = searchQuery.trim();
    if (q.length < 2) return;
    const pattern = `%${escapeIlike(q)}%`;
    const { data, error } = await supabase
      .from('guests')
      .select('id, full_name, photo_url, banned_until, phone, email, room_id, created_at, status')
      .is('deleted_at', null)
      .or(`full_name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern}`)
      .order('updated_at', { ascending: false })
      .limit(SEARCH_LIMIT);
    if (error) {
      setLoadError(error.message || 'Misafirler yüklenemedi.');
      return;
    }
    setLoadError(null);
    const rows = (data ?? []) as GuestRowRaw[];
    const roomById = await attachRoomNumbers(rows);
    setSearchGuests(mapGuestRows(rows, roomById));
  }, []);

  const isSearchMode = search.trim().length >= 2;
  const guests = isSearchMode ? (searchGuests ?? []) : baseGuests;

  useEffect(() => {
    const channel = supabase
      .channel('staff-guests-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guests' }, () => {
        if (isSearchMode) void fetchSearchGuests(search);
        else void load({ silent: true });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchSearchGuests, isSearchMode, load, search]);

  useEffect(() => {
    if (searchSkipInitial.current) {
      searchSkipInitial.current = false;
      return;
    }
    const q = search.trim();
    if (q.length < 2) {
      setSearchGuests(null);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      await fetchSearchGuests(q);
      setSearching(false);
    }, 320);
    return () => {
      clearTimeout(timer);
      setSearching(false);
    };
  }, [search, fetchSearchGuests]);

  const filteredGuests = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    if (q.length < 2) return guests;
    return guests.filter((g) => {
      const name = guestDisplayName(g.full_name, '').toLocaleLowerCase('tr-TR');
      const phone = (g.phone || '').toLocaleLowerCase('tr-TR');
      const email = (g.email || '').toLocaleLowerCase('tr-TR');
      const room = (g.room_number || '').toLocaleLowerCase('tr-TR');
      return name.includes(q) || phone.includes(q) || email.includes(q) || room.includes(q);
    });
  }, [guests, search]);

  const profileMeta = t('staffGuestsProfileMeta', { defaultValue: 'Misafir profili' });

  const onRefresh = async () => {
    if (isSearchMode) {
      await fetchSearchGuests(search);
      return;
    }
    refresh();
  };

  const listHeader = (
    <View style={styles.headerBlock}>
      <LinearGradient colors={['#0f766e', '#0891b2', '#6366f1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroGrad}>
        <View style={styles.heroTop}>
          <StaffLiveDot />
          <Text style={styles.liveLbl}>{t('staffGuestsLive', { defaultValue: 'Canlı' })}</Text>
        </View>
        <Text style={styles.heroTitleGrad}>{t('adminGuests')}</Text>
        <Text style={styles.heroSubGrad}>
          {loading && guests.length === 0
            ? t('staffGuestsLoading', { defaultValue: 'Yükleniyor…' })
            : t('staffGuestsCount', {
                defaultValue: '{{count}} kayıt · oda ve kayıt tarihi',
                count: filteredGuests.length,
              })}
        </Text>
      </LinearGradient>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={theme.colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder={t('staffGuestsSearchPlaceholder', { defaultValue: 'Misafir ara…' })}
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searching ? <ActivityIndicator size="small" color={theme.colors.primary} /> : null}
        {search.length > 0 && !searching ? (
          <Pressable onPress={() => setSearch('')} hitSlop={12}>
            <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {search.trim().length === 1 ? (
        <Text style={styles.searchHint}>{t('staffGuestsSearchMinChars')}</Text>
      ) : null}
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredGuests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={8}
        removeClippedSubviews={Platform.OS === 'android'}
        ListHeaderComponent={listHeader}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
        }
        renderItem={({ item }) => (
          <GuestListRow
            item={item}
            profileMeta={profileMeta}
            onPress={() => router.push(`/staff/guests/${item.id}`)}
          />
        )}
        ListEmptyComponent={
          loading && guests.length === 0 ? (
            <SkeletonRows />
          ) : (
            <View style={styles.emptyWrap}>
              <Ionicons name="person-outline" size={40} color={theme.colors.textMuted} />
              <Text style={styles.emptyTitle}>
                {loadError
                  ? t('staffGuestsLoadError', { defaultValue: 'Liste yüklenemedi' })
                  : search.trim().length >= 2
                    ? t('staffGuestsSearchEmpty')
                    : t('staffGuestsListEmpty')}
              </Text>
              {loadError ? (
                <Pressable style={styles.retryBtn} onPress={() => fetchGuests(search.trim().length >= 2 ? search : undefined)}>
                  <Text style={styles.retryText}>{t('retry', { defaultValue: 'Tekrar dene' })}</Text>
                </Pressable>
              ) : null}
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  listContent: { paddingBottom: 28 },
  headerBlock: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, gap: 10 },
  heroGrad: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 4,
    ...Platform.select({
      ios: { shadowColor: '#0f766e', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 12 },
      android: { elevation: 4 },
    }),
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ade80' },
  liveLbl: { color: 'rgba(255,255,255,0.95)', fontSize: 12, fontWeight: '700' },
  heroTitleGrad: { fontSize: 20, fontWeight: '800', color: '#fff' },
  heroSubGrad: { marginTop: 4, fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: theme.colors.text,
    paddingVertical: 0,
  },
  searchHint: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginLeft: 4,
    marginBottom: 2,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: LIST_ROW_HEIGHT - 10,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.md,
  },
  cardPressed: { opacity: 0.92, transform: [{ scale: 0.995 }] },
  avatarRing: {
    padding: 2,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: theme.colors.primary + '33',
  },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: theme.colors.borderLight },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.guestAvatarBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: theme.colors.guestAvatarLetter, fontSize: 20, fontWeight: '800' },
  cardBody: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  contact: { fontSize: 13, color: theme.colors.textSecondary },
  contactMuted: { fontSize: 13, color: theme.colors.textMuted },
  metaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  roomChipGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  roomChipGradText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  statusChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusChipText: { fontSize: 11, fontWeight: '700' },
  regRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  regText: { fontSize: 11, fontWeight: '600', color: '#4338ca', flex: 1 },
  skeletonWrap: { paddingHorizontal: 16, gap: 10, paddingTop: 8 },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  skeletonAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.borderLight,
  },
  skeletonLines: { flex: 1, gap: 8 },
  skeletonLine: { height: 12, borderRadius: 6, backgroundColor: theme.colors.borderLight },
  emptyWrap: { alignItems: 'center', paddingTop: 36, paddingHorizontal: 24, gap: 10 },
  emptyTitle: { textAlign: 'center', color: theme.colors.textMuted, fontSize: 15, fontWeight: '600' },
  retryBtn: {
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: theme.colors.primary + '18',
  },
  retryText: { color: theme.colors.primaryDark, fontWeight: '700', fontSize: 14 },
});
