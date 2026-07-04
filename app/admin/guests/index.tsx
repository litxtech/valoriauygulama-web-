import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Animated,
  Platform,
} from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { invokeEdgeWithAuth } from '@/lib/invokeEdgeWithAuth';
import { getEdgeFunctionErrorMessage } from '@/lib/functionsError';
import { useAuthStore } from '@/stores/authStore';
import { CachedImage } from '@/components/CachedImage';
import { adminTheme } from '@/constants/adminTheme';
import { formatDateTime } from '@/lib/date';
import {
  ADMIN_LIST_PERF,
  ADMIN_SCREEN_FOCUS_TTL_MS,
  createDebouncedRunner,
  getAdminScreenCache,
  setAdminScreenCache,
} from '@/lib/adminPerf';

const BAN_DURATIONS = [
  { label: '1 saat', hours: 1 },
  { label: '24 saat', hours: 24 },
  { label: '1 hafta', hours: 24 * 7 },
  { label: '1 ay', hours: 24 * 30 },
  { label: '1 yıl', hours: 24 * 365 },
];

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  pending: { label: 'Giriş bekliyor', color: '#a16207', bg: '#fef3c7', icon: 'time-outline' },
  checked_in: { label: 'Odada', color: '#166534', bg: '#dcfce7', icon: 'bed-outline' },
  checked_out: { label: 'Çıkış yaptı', color: '#475569', bg: '#f1f5f9', icon: 'log-out-outline' },
};

const AVATAR_GRADS: [string, string][] = [
  ['#0ea5e9', '#6366f1'],
  ['#10b981', '#059669'],
  ['#f59e0b', '#ea580c'],
  ['#ec4899', '#8b5cf6'],
  ['#14b8a6', '#0891b2'],
];

type Guest = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  status: string;
  created_at: string;
  room_id: string | null;
  rooms: { room_number: string } | null;
  auth_user_id?: string | null;
  banned_until?: string | null;
  deleted_at?: string | null;
  last_login_device_id?: string | null;
  photo_url?: string | null;
  last_login_platform?: string | null;
  last_login_at?: string | null;
  auth_user_created_at?: string | null;
};

function formatPlatform(platform: string | null | undefined): string {
  if (!platform) return '';
  const m: Record<string, string> = { android: 'Android', ios: 'iOS', web: 'Web' };
  return m[platform] ?? platform;
}

function avatarGradForId(id: string): [string, string] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * 17) % AVATAR_GRADS.length;
  return AVATAR_GRADS[h]!;
}

function registrationAt(g: Guest): string {
  return g.auth_user_created_at || g.created_at;
}

const GuestRow = memo(function GuestRow({
  item,
  isRisky,
  onBan,
  onUnban,
  onDelete,
}: {
  item: Guest;
  isRisky: boolean;
  onBan: () => void;
  onUnban: () => void;
  onDelete: () => void;
}) {
  const status = STATUS_META[item.status] ?? STATUS_META.pending;
  const [gradA, gradB] = avatarGradForId(item.id);
  const regAt = registrationAt(item);
  const isBanned = Boolean(item.banned_until && new Date(item.banned_until) > new Date());

  return (
    <View style={styles.card}>
      <Link href={`/admin/guests/${item.id}`} asChild>
        <TouchableOpacity style={styles.cardInner} activeOpacity={0.85}>
          <LinearGradient colors={[gradA, gradB]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatarRing}>
            {item.photo_url ? (
              <CachedImage uri={item.photo_url} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarLetter}>{(item.full_name || '?').charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </LinearGradient>

          <View style={styles.cardBody}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {item.full_name}
              </Text>
              {item.rooms?.room_number ? (
                <LinearGradient colors={['#1d4ed8', '#2563eb']} style={styles.roomPill}>
                  <Ionicons name="bed" size={12} color="#fff" />
                  <Text style={styles.roomPillText}>Oda {item.rooms.room_number}</Text>
                </LinearGradient>
              ) : null}
            </View>

            {(item.phone || item.email) && (
              <Text style={styles.meta} numberOfLines={1}>
                {item.phone || item.email}
              </Text>
            )}

            <View style={styles.chipRow}>
              <View style={[styles.statusChip, { backgroundColor: status.bg }]}>
                <Ionicons name={status.icon} size={13} color={status.color} />
                <Text style={[styles.statusChipText, { color: status.color }]}>{status.label}</Text>
              </View>
              {item.deleted_at ? (
                <View style={[styles.miniChip, { backgroundColor: adminTheme.colors.errorLight }]}>
                  <Text style={styles.miniChipText}>Silindi</Text>
                </View>
              ) : null}
              {isBanned ? (
                <View style={[styles.miniChip, { backgroundColor: adminTheme.colors.warningLight }]}>
                  <Text style={styles.miniChipText}>Banlı</Text>
                </View>
              ) : null}
              {isRisky ? (
                <View style={[styles.miniChip, { backgroundColor: '#fef3c7' }]}>
                  <Text style={styles.miniChipText}>Riskli</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={13} color="#6366f1" />
              <Text style={styles.regText}>Kayıt: {formatDateTime(regAt)}</Text>
            </View>

            {item.last_login_at ? (
              <View style={styles.metaRow}>
                <Ionicons name="log-in-outline" size={13} color="#64748b" />
                <Text style={styles.subMeta}>
                  Son giriş: {formatDateTime(item.last_login_at)}
                  {item.last_login_platform ? ` · ${formatPlatform(item.last_login_platform)}` : ''}
                </Text>
              </View>
            ) : item.last_login_platform ? (
              <Text style={styles.subMeta}>{formatPlatform(item.last_login_platform)}</Text>
            ) : null}
          </View>

          <Ionicons name="chevron-forward" size={20} color={adminTheme.colors.textMuted} />
        </TouchableOpacity>
      </Link>

      {!item.deleted_at && item.auth_user_id ? (
        <View style={styles.actionRow}>
          {isBanned ? (
            <TouchableOpacity style={styles.actionBtnSoft} onPress={onUnban}>
              <Ionicons name="checkmark-circle-outline" size={18} color={adminTheme.colors.success} />
              <Text style={styles.actionBtnSoftText}>Ban kaldır</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.actionIconBtn} onPress={onBan}>
              <Ionicons name="ban-outline" size={18} color={adminTheme.colors.warning} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.actionIconBtn} onPress={onDelete}>
            <Ionicons name="trash-outline" size={18} color={adminTheme.colors.error} />
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
});

function LivePulse() {
  const opacity = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    if (Platform.OS === 'android') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  if (Platform.OS === 'android') {
    return <View style={[styles.liveDot, { opacity: 1 }]} />;
  }
  return <Animated.View style={[styles.liveDot, { opacity }]} />;
}

type GuestsScreenCache = { guests: Guest[]; riskyIds: string[] };

export default function GuestsList() {
  const currentStaffId = useAuthStore((s) => s.staff?.id);
  const [filter, setFilter] = useState<'pending' | 'all'>('all');
  const guestsCacheKey = (f: 'pending' | 'all') => `admin-guests:${f}`;
  const initialCached = getAdminScreenCache<GuestsScreenCache>(guestsCacheKey('all'), ADMIN_SCREEN_FOCUS_TTL_MS);
  const [guests, setGuests] = useState<Guest[]>(initialCached?.guests ?? []);
  const [riskyDeviceIds, setRiskyDeviceIds] = useState<Set<string>>(
    () => new Set(initialCached?.riskyIds ?? [])
  );
  const [loading, setLoading] = useState(!(initialCached?.guests?.length));
  const [refreshing, setRefreshing] = useState(false);
  const riskyDeviceIdsRef = useRef(riskyDeviceIds);
  riskyDeviceIdsRef.current = riskyDeviceIds;
  const realtimeDebounce = useRef(createDebouncedRunner(1_200)).current;
  const [deleteTarget, setDeleteTarget] = useState<Guest | null>(null);
  const [adminReason, setAdminReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [banTarget, setBanTarget] = useState<Guest | null>(null);
  const [banHours, setBanHours] = useState(24);
  const [banReason, setBanReason] = useState('');
  const [banning, setBanning] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async (opts?: { silent?: boolean; force?: boolean }) => {
    const cacheKey = guestsCacheKey(filter);
    if (!opts?.force && !opts?.silent) {
      const hit = getAdminScreenCache<GuestsScreenCache>(cacheKey, ADMIN_SCREEN_FOCUS_TTL_MS);
      if (hit?.guests) {
        setGuests(hit.guests);
        setRiskyDeviceIds(new Set(hit.riskyIds));
        setLoadError(null);
        setLoading(false);
        setRefreshing(false);
        return;
      }
    }
    if (!opts?.silent) setLoading(true);
    const now = new Date().toISOString();
    try {
      const { data: guestRows, error: guestError } = await supabase.rpc('admin_list_guests', {
        p_filter: filter === 'pending' ? 'pending' : 'all',
      });
      if (guestError) {
        // Geçici hatada (özellikle sessiz realtime yeniden yüklemede) mevcut listeyi silme.
        setLoadError(guestError.message);
        return;
      }
      setLoadError(null);
      const list = (guestRows ?? []) as Array<{
        id: string;
        full_name: string;
        phone: string | null;
        email: string | null;
        status: string;
        created_at: string;
        room_id: string | null;
        room_number: string | null;
        auth_user_id?: string | null;
        banned_until?: string | null;
        deleted_at?: string | null;
        last_login_device_id?: string | null;
        photo_url?: string | null;
        last_login_platform?: string | null;
        last_login_at?: string | null;
        auth_user_created_at?: string | null;
      }>;
      const mapped: Guest[] = list.map((row) => ({
        id: row.id,
        full_name: row.full_name,
        phone: row.phone,
        email: row.email,
        status: row.status,
        created_at: row.created_at,
        room_id: row.room_id,
        rooms: row.room_number ? { room_number: row.room_number } : null,
        auth_user_id: row.auth_user_id,
        banned_until: row.banned_until,
        deleted_at: row.deleted_at,
        last_login_device_id: row.last_login_device_id,
        photo_url: row.photo_url,
        last_login_platform: row.last_login_platform,
        last_login_at: row.last_login_at,
        auth_user_created_at: row.auth_user_created_at,
      }));
      setGuests(mapped);

      // Risk cihaz sorguları ağır — yalnızca tam yükleme / pull-to-refresh
      let riskyIds: string[] = [...riskyDeviceIdsRef.current];
      if (!opts?.silent || opts?.force) {
        const [staffDeleted, staffBanned, guestsDeleted, guestsBanned] = await Promise.all([
          supabase.from('staff').select('last_login_device_id').not('deleted_at', 'is', null).limit(200),
          supabase.from('staff').select('last_login_device_id').gt('banned_until', now).limit(200),
          supabase.from('guests').select('last_login_device_id').not('deleted_at', 'is', null).limit(200),
          supabase.from('guests').select('last_login_device_id').gt('banned_until', now).limit(200),
        ]);
        const ids = new Set<string>();
        for (const r of [
          ...(staffDeleted.data ?? []),
          ...(staffBanned.data ?? []),
          ...(guestsDeleted.data ?? []),
          ...(guestsBanned.data ?? []),
        ]) {
          const d = (r as { last_login_device_id?: string | null }).last_login_device_id;
          if (d && String(d).trim()) ids.add(String(d).trim());
        }
        riskyIds = [...ids];
        setRiskyDeviceIds(ids);
      }

      setAdminScreenCache(cacheKey, { guests: mapped, riskyIds } satisfies GuestsScreenCache);
    } catch (e) {
      setLoadError((e as Error)?.message ?? 'Liste yüklenemedi');
      setGuests([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel('admin-guests-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guests' }, () => {
        realtimeDebounce.schedule(() => {
          void load({ silent: true });
        });
      })
      .subscribe();
    return () => {
      realtimeDebounce.cancel();
      supabase.removeChannel(channel);
    };
  }, [load, realtimeDebounce]);

  const isRisky = useCallback(
    (g: Guest) => {
      const did = g.last_login_device_id?.trim();
      if (!did || !riskyDeviceIds.has(did)) return false;
      const created = new Date(g.created_at).getTime();
      return created >= Date.now() - 30 * 24 * 60 * 60 * 1000;
    },
    [riskyDeviceIds]
  );

  const stats = useMemo(() => {
    const pending = guests.filter((g) => g.status === 'pending').length;
    const inHouse = guests.filter((g) => g.status === 'checked_in').length;
    return { total: guests.length, pending, inHouse };
  }, [guests]);

  const filteredGuests = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    if (!q) return guests;
    return guests.filter((g) => {
      const name = (g.full_name || '').toLocaleLowerCase('tr-TR');
      const phone = (g.phone || '').toLocaleLowerCase('tr-TR');
      const email = (g.email || '').toLocaleLowerCase('tr-TR');
      const room = (g.rooms?.room_number || '').toLocaleLowerCase('tr-TR');
      return name.includes(q) || phone.includes(q) || email.includes(q) || room.includes(q);
    });
  }, [guests, search]);

  const confirmDelete = async () => {
    if (!deleteTarget || !adminReason.trim() || !deleteTarget.auth_user_id) {
      Alert.alert('Eksik', 'Silme nedeni girin. Sadece uygulama ile giriş yapmış misafir silinebilir.');
      return;
    }
    setDeleting(true);
    try {
      const { data, error } = await invokeEdgeWithAuth('delete-user-account', {
        mode: 'admin',
        target_auth_id: deleteTarget.auth_user_id,
        user_type: 'guest',
        admin_reason: adminReason.trim(),
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      setDeleteTarget(null);
      setAdminReason('');
      await load({ silent: true, force: true });
      Alert.alert('Başarılı', 'Hesap silindi.');
    } catch (e) {
      const msg = await getEdgeFunctionErrorMessage(e);
      Alert.alert('Hata', msg || 'Silinemedi.');
    } finally {
      setDeleting(false);
    }
  };

  const confirmBan = async () => {
    if (!banTarget || !currentStaffId) return;
    setBanning(true);
    try {
      const until = new Date(Date.now() + banHours * 60 * 60 * 1000).toISOString();
      await supabase
        .from('guests')
        .update({ banned_until: until, banned_by: currentStaffId, ban_reason: banReason.trim() || null })
        .eq('id', banTarget.id);
      setBanTarget(null);
      setBanReason('');
      setBanHours(24);
      await load({ silent: true, force: true });
      Alert.alert('Başarılı', 'Misafir banlandı.');
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Ban uygulanamadı.');
    } finally {
      setBanning(false);
    }
  };

  const unban = async (g: Guest) => {
    try {
      await supabase.from('guests').update({ banned_until: null, banned_by: null, ban_reason: null }).eq('id', g.id);
      await load({ silent: true, force: true });
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Ban kaldırılamadı.');
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    void load({ silent: true, force: true });
  };

  const listHeader = (
    <>
      <LinearGradient colors={['#0f766e', '#0891b2', '#6366f1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.liveBadge}>
            <LivePulse />
            <Text style={styles.liveText}>Canlı</Text>
          </View>
          <TouchableOpacity style={styles.heroRefresh} onPress={onRefresh} disabled={loading && !refreshing}>
            <Ionicons name="refresh" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        <Text style={styles.heroTitle}>Misafirler</Text>
        <Text style={styles.heroSub}>Kayıt tarihi, oda ve durum anlık güncellenir</Text>
        <View style={styles.statRow}>
          <View style={styles.statBox}>
            <Text style={styles.statVal}>{stats.total}</Text>
            <Text style={styles.statLbl}>Toplam</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statVal}>{stats.inHouse}</Text>
            <Text style={styles.statLbl}>Odada</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statVal}>{stats.pending}</Text>
            <Text style={styles.statLbl}>Bekleyen</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, filter === 'all' && styles.tabActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.tabText, filter === 'all' && styles.tabTextActive]}>Tümü</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, filter === 'pending' && styles.tabActive]}
          onPress={() => setFilter('pending')}
        >
          <Text style={[styles.tabText, filter === 'pending' && styles.tabTextActive]}>Onay bekleyen</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={adminTheme.colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="İsim, telefon, e-posta veya oda…"
          placeholderTextColor={adminTheme.colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search.length > 0 ? (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={12}>
            <Ionicons name="close-circle" size={18} color={adminTheme.colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {loadError ? (
        <View style={styles.errorBanner}>
          <Ionicons name="warning-outline" size={20} color={adminTheme.colors.error} />
          <Text style={styles.errorText}>{loadError}</Text>
          <TouchableOpacity onPress={() => load()}>
            <Text style={styles.errorRetry}>Tekrar dene</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </>
  );

  return (
    <View style={styles.container}>
      {loading && guests.length === 0 ? (
        <View style={styles.loadingWrap}>
          {listHeader}
          <ActivityIndicator size="large" color="#0891b2" style={{ marginTop: 24 }} />
          <Text style={styles.loadingText}>Misafirler yükleniyor…</Text>
        </View>
      ) : (
        <FlatList
          data={filteredGuests}
          keyExtractor={(g) => g.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={listHeader}
          initialNumToRender={ADMIN_LIST_PERF.initialNumToRender}
          maxToRenderPerBatch={ADMIN_LIST_PERF.maxToRenderPerBatch}
          windowSize={ADMIN_LIST_PERF.windowSize}
          updateCellsBatchingPeriod={ADMIN_LIST_PERF.updateCellsBatchingPeriod}
          removeClippedSubviews={ADMIN_LIST_PERF.removeClippedSubviews}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0891b2" colors={['#0891b2']} />
          }
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <GuestRow
              item={item}
              isRisky={isRisky(item)}
              onBan={() => setBanTarget(item)}
              onUnban={() => unban(item)}
              onDelete={() => setDeleteTarget(item)}
            />
          )}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.empty}>
                <Ionicons name="people-outline" size={44} color={adminTheme.colors.textMuted} />
                <Text style={styles.emptyText}>{search.trim() ? 'Arama sonucu yok' : 'Misafir bulunamadı'}</Text>
              </View>
            ) : null
          }
        />
      )}

      <Modal visible={!!banTarget} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Misafiri banla</Text>
            {banTarget && <Text style={styles.modalSubtitle}>{banTarget.full_name}</Text>}
            <View style={styles.durationRow}>
              {BAN_DURATIONS.map((d) => (
                <TouchableOpacity
                  key={d.label}
                  style={[styles.durationChip, banHours === d.hours && styles.durationChipActive]}
                  onPress={() => setBanHours(d.hours)}
                >
                  <Text style={[styles.durationChipText, banHours === d.hours && styles.durationChipTextActive]}>{d.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.modalLabel}>Neden (isteğe bağlı)</Text>
            <TextInput
              style={styles.modalInputShort}
              value={banReason}
              onChangeText={setBanReason}
              placeholder="Ban nedeni..."
              placeholderTextColor={adminTheme.colors.textMuted}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => {
                  setBanTarget(null);
                  setBanReason('');
                  setBanHours(24);
                }}
              >
                <Text style={styles.modalCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, banning && styles.modalConfirmDisabled]}
                onPress={confirmBan}
                disabled={banning}
              >
                {banning ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalConfirmText}>Banla</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!deleteTarget} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Misafir hesabını sil</Text>
            {deleteTarget && (
              <Text style={styles.modalSubtitle}>
                {deleteTarget.full_name} — Uygulama açtığında "Hesabınız silindi" görüp lobiye dönecek.
              </Text>
            )}
            <Text style={styles.modalLabel}>Silme nedeni (zorunlu)</Text>
            <TextInput
              style={styles.modalInput}
              value={adminReason}
              onChangeText={setAdminReason}
              placeholder="Neden..."
              placeholderTextColor={adminTheme.colors.textMuted}
              multiline
              numberOfLines={2}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => {
                  setDeleteTarget(null);
                  setAdminReason('');
                }}
              >
                <Text style={styles.modalCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, deleting && styles.modalConfirmDisabled]}
                onPress={confirmDelete}
                disabled={deleting || !adminReason.trim()}
              >
                {deleting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalConfirmText}>Sil</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  hero: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 20,
    padding: 18,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#0f766e', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16 },
      android: { elevation: 6 },
    }),
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ade80' },
  liveText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  heroRefresh: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: 24, fontWeight: '800', color: '#fff' },
  heroSub: { marginTop: 4, fontSize: 13, color: 'rgba(255,255,255,0.88)', fontWeight: '500' },
  statRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  statBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  statVal: { fontSize: 20, fontWeight: '800', color: '#fff' },
  statLbl: { marginTop: 2, fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  tabs: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 14, gap: 8 },
  tab: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: adminTheme.colors.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  tabActive: { backgroundColor: '#0f766e', borderColor: '#0f766e' },
  tabText: { color: adminTheme.colors.textSecondary, fontWeight: '700', fontSize: 14 },
  tabTextActive: { color: '#fff' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  searchInput: { flex: 1, fontSize: 15, color: adminTheme.colors.text, paddingVertical: 0 },
  list: { paddingBottom: 28 },
  loadingWrap: { flex: 1 },
  loadingText: { textAlign: 'center', marginTop: 12, color: adminTheme.colors.textMuted, fontWeight: '600' },
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#0f172a', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10 },
      android: { elevation: 2 },
    }),
  },
  cardInner: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  avatarRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: { width: 52, height: 52, borderRadius: 26 },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { fontSize: 22, fontWeight: '800', color: '#fff' },
  cardBody: { flex: 1, minWidth: 0, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  name: { fontSize: 17, fontWeight: '800', color: adminTheme.colors.text, flexShrink: 1 },
  roomPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  roomPillText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  meta: { fontSize: 13, color: adminTheme.colors.textSecondary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusChipText: { fontSize: 12, fontWeight: '700' },
  miniChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  miniChipText: { fontSize: 11, fontWeight: '700', color: adminTheme.colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  regText: { fontSize: 12, fontWeight: '600', color: '#4338ca', flex: 1 },
  subMeta: { fontSize: 11, color: adminTheme.colors.textMuted, flex: 1 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: adminTheme.colors.borderLight,
  },
  actionIconBtn: { padding: 8, borderRadius: 10, backgroundColor: adminTheme.colors.surfaceTertiary },
  actionBtnSoft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.successLight,
  },
  actionBtnSoftText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.success },
  empty: { alignItems: 'center', paddingTop: 40, gap: 10 },
  emptyText: { fontSize: 15, fontWeight: '600', color: adminTheme.colors.textMuted },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox: { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '100%', maxWidth: 400 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1a202c', marginBottom: 8 },
  modalSubtitle: { fontSize: 14, color: '#64748b', marginBottom: 16 },
  modalLabel: { fontSize: 14, fontWeight: '600', color: '#475569', marginBottom: 8 },
  modalInputShort: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 12, fontSize: 14, marginBottom: 16 },
  modalInput: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 12, fontSize: 14, minHeight: 60, textAlignVertical: 'top', marginBottom: 16 },
  durationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  durationChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f1f5f9' },
  durationChipActive: { backgroundColor: adminTheme.colors.primary },
  durationChipText: { fontSize: 14, fontWeight: '600', color: '#1a202c' },
  durationChipTextActive: { color: '#fff' },
  modalActions: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
  modalCancel: { paddingVertical: 10, paddingHorizontal: 20 },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: '#64748b' },
  modalConfirm: { backgroundColor: adminTheme.colors.error, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, minWidth: 80, alignItems: 'center' },
  modalConfirmDisabled: { opacity: 0.7 },
  modalConfirmText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    padding: 14,
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: adminTheme.colors.errorLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.error,
  },
  errorText: { flex: 1, fontSize: 14, color: '#1a202c' },
  errorRetry: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.primary },
});
