import { useEffect, useState, useCallback, useRef, useMemo, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { getOrCreateGuestForCaller } from '@/lib/getOrCreateGuestForCaller';
import { getGuestNotificationToken, setGuestNotificationToken } from '@/lib/guestNotificationToken';
import { getExpoPushTokenAsync, savePushTokenForGuest, isExpoGo } from '@/lib/notificationsPush';
import ExpoNotifications from '@/lib/expoNotificationsModule';
import { useGuestNotificationStore } from '@/stores/guestNotificationStore';
import { useGuestMessagingStore } from '@/stores/guestMessagingStore';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import type { PersonelDesignPalette } from '@/constants/personelDesignSystem';
import { usePersonelDesign } from '@/hooks/usePersonelDesign';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { useNotificationLocalization } from '@/hooks/useNotificationLocalization';
import {
  getListCacheAgeMs,
  getListCacheRaw,
  hydrateListCache,
  setListCache,
} from '@/lib/listCache';
import { CUSTOMER_FLASH_DRAW_DISTANCE, CUSTOMER_LIST_PERF, CUSTOMER_ROW_HEIGHT } from '@/lib/customerPerf';

const NOTIF_LIST_TTL_MS = 60_000;

type NotifRow = {
  id: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
  data?: Record<string, unknown> | null;
  category?: string | null;
};

type LoadOpts = { force?: boolean };

type NotifRowItemProps = {
  item: NotifRow;
  title: string;
  body: string;
  locale: string;
  onPress: (item: NotifRow) => void;
  styles: ReturnType<typeof createCustomerNotifStyles>;
};

const NotifRowItem = memo(function NotifRowItem({
  item,
  title,
  body,
  locale,
  onPress,
  styles,
}: NotifRowItemProps) {
  return (
    <TouchableOpacity
      style={[styles.row, item.read_at ? styles.rowRead : null]}
      onPress={() => onPress(item)}
      activeOpacity={0.8}
    >
      <View style={styles.rowContent}>
        {!item.read_at ? <View style={styles.unreadDot} /> : null}
        <View style={styles.rowTextWrap}>
          <Text style={styles.rowTitle}>{title}</Text>
          {body ? (
            <Text style={styles.rowBody} numberOfLines={2}>
              {body}
            </Text>
          ) : null}
          <Text style={styles.rowTime}>
            {new Date(item.created_at).toLocaleString(locale === 'tr' ? 'tr-TR' : locale)}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
});

export default function CustomerNotificationsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const palette = usePersonelDesign();
  const styles = useMemo(() => createCustomerNotifStyles(palette), [palette]);
  const [token, setToken] = useState<string | null>(null);
  const [list, setList] = useState<NotifRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pushPerm, setPushPerm] = useState<'granted' | 'denied' | 'undetermined' | 'unknown'>('unknown');
  const [enablingPush, setEnablingPush] = useState(false);

  const listRef = useRef<NotifRow[]>([]);
  const listMaxCreatedRef = useRef<string | null>(null);
  const lastNotifTokenRef = useRef<string | null>(null);
  const pushPermCheckedRef = useRef(false);
  const lastLoadAtRef = useRef(0);
  const notifCacheKeyRef = useRef('customer-notifications:pending');

  useEffect(() => {
    let cancelled = false;
    void hydrateListCache<NotifRow>(notifCacheKeyRef.current).then((cached) => {
      if (cancelled || !cached?.length) return;
      setList(cached);
      setLoading(false);
      const maxAt = cached.reduce((a, b) => (a > b.created_at ? a : b.created_at), cached[0].created_at);
      listMaxCreatedRef.current = maxAt;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    listRef.current = list;
  }, [list]);

  const refreshPushPerm = useCallback(async () => {
    if (isExpoGo) return;
    try {
      const { status } = await ExpoNotifications.getPermissionsAsync();
      setPushPerm(status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined');
    } catch {
      setPushPerm('unknown');
    }
  }, []);

  const { refresh: refreshNotificationCount, setUnreadCount, setNotificationsScreenFocused } = useGuestNotificationStore();
  const { displayFor } = useNotificationLocalization(list, { guestAppToken: token, enabled: Boolean(token) });

  const load = useCallback(async (opts?: LoadOpts) => {
    const force = opts?.force === true;
    if (!pushPermCheckedRef.current) {
      pushPermCheckedRef.current = true;
      void refreshPushPerm();
    }

    let notifToken = token ?? (await getGuestNotificationToken());
    if (!notifToken) {
      const {
        data: { session: s },
      } = await supabase.auth.getSession();
      if (s?.user) {
        const row = await getOrCreateGuestForCaller(s.user);
        notifToken = row?.app_token ?? null;
        if (notifToken) {
          await setGuestNotificationToken(notifToken);
          await useGuestMessagingStore.getState().setAppToken(notifToken);
        }
      }
    }

    if (lastNotifTokenRef.current !== notifToken) {
      listMaxCreatedRef.current = null;
      lastNotifTokenRef.current = notifToken;
    }

    setToken(notifToken);
    if (!notifToken) {
      setList([]);
      useGuestNotificationStore.getState().setUnreadCount(0);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const cacheKey = `customer-notifications:${notifToken}`;
    notifCacheKeyRef.current = cacheKey;
    const memCached = getListCacheRaw<NotifRow>(cacheKey);
    if (memCached?.length && !force) {
      setList(memCached);
      setLoading(false);
    }

    const cached = listRef.current.length ? listRef.current : memCached ?? [];
    const hadList = cached.length > 0;

    if (force) {
      setRefreshing(true);
    } else if (!hadList) {
      setLoading(true);
    }

    if (!force && hadList) {
      const age = getListCacheAgeMs(cacheKey);
      if (age != null && age < NOTIF_LIST_TTL_MS) {
        setLoading(false);
        setRefreshing(false);
        return;
      }
      const { data: sumData, error: sumErr } = await supabase.rpc('get_guest_notification_summary', {
        p_app_token: notifToken,
      });
      if (!sumErr && sumData && (Array.isArray(sumData) ? sumData.length : 1)) {
        const row = (Array.isArray(sumData) ? sumData[0] : sumData) as {
          latest_created_at?: string | null;
          unread_count?: number | string | null;
        };
        const latest = row?.latest_created_at ?? null;
        const maxLocal = listMaxCreatedRef.current;
        const serverUnread = Number(row?.unread_count ?? 0) || 0;
        if (serverUnread === 0 && latest && maxLocal && new Date(latest) <= new Date(maxLocal)) {
          setUnreadCount(0);
          setLoading(false);
          setRefreshing(false);
          return;
        }
      }
    }

    const { data, error } = await supabase.rpc('get_guest_notifications', { p_app_token: notifToken });
    if (error) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const rows = (data as NotifRow[]) ?? [];

    const { error: markAllErr } = await supabase.rpc('mark_all_guest_notifications_read', { p_app_token: notifToken });
    if (markAllErr) {
      const unreadIds = rows.filter((n) => !n.read_at).map((n) => n.id);
      await Promise.all(
        unreadIds.map((id) =>
          supabase.rpc('mark_guest_notification_read', { p_app_token: notifToken, p_notification_id: id })
        )
      );
    }

    const now = new Date().toISOString();
    const nextList = rows.map((n) => ({ ...n, read_at: n.read_at ?? now }));
    setList(nextList);
    setListCache(cacheKey, nextList);
    lastLoadAtRef.current = Date.now();
    if (rows.length) {
      const maxAt = rows.reduce((a, b) => (a > b.created_at ? a : b.created_at), rows[0].created_at);
      listMaxCreatedRef.current = maxAt;
    } else {
      listMaxCreatedRef.current = null;
    }
    useGuestNotificationStore.getState().setUnreadCount(0);
    setLoading(false);
    setRefreshing(false);
  }, [setUnreadCount, token, refreshPushPerm]);

  useFocusEffect(
    useCallback(() => {
      setUnreadCount(0);
      setNotificationsScreenFocused(true);
      const hadList = listRef.current.length > 0;
      const cacheKey = notifCacheKeyRef.current;
      const age = getListCacheAgeMs(cacheKey);
      const stale = !hadList || age == null || age >= NOTIF_LIST_TTL_MS || Date.now() - lastLoadAtRef.current >= NOTIF_LIST_TTL_MS;
      if (stale) {
        void load({ force: !hadList });
      } else if (hadList) {
        setLoading(false);
      }
      return () => setNotificationsScreenFocused(false);
    }, [setUnreadCount, setNotificationsScreenFocused, load])
  );

  const enablePush = useCallback(async () => {
    if (enablingPush) return;
    if (isExpoGo) {
      Alert.alert(t('guestNotifExpoGoTitle'), t('guestNotifExpoGoBody'), [{ text: t('ok') }]);
      return;
    }
    if (!token) {
      Alert.alert(t('error'), t('guestNotifAccountPreparing'));
      return;
    }
    setEnablingPush(true);
    try {
      const expoPushToken = await getExpoPushTokenAsync();
      if (expoPushToken) {
        await savePushTokenForGuest(token);
        setPushPerm('granted');
      } else {
        const { status } = await ExpoNotifications.getPermissionsAsync();
        setPushPerm(status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined');
        if (status === 'denied') {
          Alert.alert(t('guestNotifPermDeniedTitle'), t('guestNotifPermDeniedBody'), [
            { text: t('cancelAction'), style: 'cancel' },
            { text: t('openAppSettings'), onPress: () => Linking.openSettings() },
          ]);
        }
      }
    } catch (e) {
      Alert.alert(t('error'), t('guestNotifPermError'));
    } finally {
      setEnablingPush(false);
    }
  }, [token, enablingPush, t]);

  const handleNotificationPress = useCallback(
    async (n: NotifRow) => {
      if (!token) return;
      await supabase.rpc('mark_guest_notification_read', {
        p_app_token: token,
        p_notification_id: n.id,
      });
      setList((prev) => prev.map((item) => (item.id === n.id ? { ...item, read_at: new Date().toISOString() } : item)));
      refreshNotificationCount();

      const data = n.data ?? {};
      const url = data.url as string | undefined;
      const postId = data.postId as string | undefined;
      const conversationId =
        typeof data.conversationId === 'string'
          ? data.conversationId.trim()
          : typeof data.conversation_id === 'string'
            ? data.conversation_id.trim()
            : '';

      if (conversationId && url?.startsWith('/customer/chat/')) {
        router.push({ pathname: '/customer/chat/[id]', params: { id: conversationId } });
        return;
      }
      if (url?.startsWith('/customer/chat/')) {
        const idFromUrl = url.slice('/customer/chat/'.length).split('/')[0]?.split('?')[0];
        if (idFromUrl) {
          router.push({ pathname: '/customer/chat/[id]', params: { id: idFromUrl } });
          return;
        }
      }

      const isInternalPath = url && typeof url === 'string' && url.startsWith('/');
      if (isInternalPath) {
        if (postId) {
          if (url.includes('/customer/feed/[id]')) {
            router.push({ pathname: '/customer/feed/[id]', params: { id: postId } });
          } else {
            router.push({ pathname: url, params: { openPostId: postId } });
          }
        } else {
          router.push(url);
        }
      } else if (postId) {
        router.push({ pathname: '/customer/feed/[id]', params: { id: postId } });
      }
    },
    [token, refreshNotificationCount, router]
  );

  const user = useAuthStore((s) => s.user);
  if (!token && !loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('guestNotifScreenTitle')}</Text>
        <View style={styles.emptyCard}>
          {!user ? (
            <>
              <Text style={styles.emptyTitle}>{t('guestNotifEmptyLoginTitle')}</Text>
              <Text style={styles.emptyDesc}>{t('guestNotifEmptyLoginBody')}</Text>
              <TouchableOpacity style={styles.btn} onPress={() => router.push('/auth')}>
                <Text style={styles.btnText}>{t('signIn')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.emptyTitle}>{t('guestNotifAccountFailedTitle')}</Text>
              <Text style={styles.emptyDesc}>{t('guestNotifAccountFailedBody')}</Text>
              <TouchableOpacity
                style={styles.btn}
                onPress={() => {
                  setLoading(true);
                  void load({ force: true });
                }}
              >
                <Text style={styles.btnText}>{t('retry')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  }

  if (!token && loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  const listLoading = loading && list.length === 0 && !refreshing;
  const notifLocale = i18n.language === 'tr' ? 'tr' : i18n.language;

  const listHeader = useMemo(
    () => (
      <View>
        <Text style={styles.title}>{t('guestNotifScreenTitle')}</Text>
        {!isExpoGo && (pushPerm === 'denied' || pushPerm === 'undetermined') && (
          <View style={styles.pushCard}>
            <View style={styles.pushCardRow}>
              <Ionicons name="notifications-outline" size={20} color={theme.colors.primary} />
              <Text style={styles.pushCardTitle}>{t('guestNotifPermCardTitle')}</Text>
            </View>
            <Text style={styles.pushCardDesc}>
              {pushPerm === 'denied' ? t('guestNotifPermDeniedLong') : t('guestNotifPermUndetermined')}
            </Text>
            <View style={styles.pushCardBtnRow}>
              <TouchableOpacity
                style={[styles.pushCardBtn, enablingPush && styles.pushCardBtnDisabled]}
                onPress={enablePush}
                disabled={enablingPush}
                activeOpacity={0.8}
              >
                {enablingPush ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.pushCardBtnText}>
                    {pushPerm === 'denied' ? t('guestNotifBtnRequestAgain') : t('guestNotifBtnGrant')}
                  </Text>
                )}
              </TouchableOpacity>
              {pushPerm === 'denied' && (
                <TouchableOpacity
                  style={styles.pushCardBtnSecondary}
                  onPress={() => Linking.openSettings()}
                  activeOpacity={0.8}
                >
                  <Text style={styles.pushCardBtnSecondaryText}>{t('openAppSettings')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
        {listLoading ? (
          <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginVertical: 24 }} />
        ) : null}
      </View>
    ),
    [enablingPush, enablePush, isExpoGo, listLoading, pushPerm, styles, t]
  );

  const renderItem = useCallback(
    ({ item }: { item: NotifRow }) => {
      const shown = displayFor(item);
      return (
        <NotifRowItem
          item={item}
          title={shown.title}
          body={shown.body ?? ''}
          locale={notifLocale}
          onPress={handleNotificationPress}
          styles={styles}
        />
      );
    },
    [displayFor, handleNotificationPress, notifLocale, styles]
  );

  return (
    <View style={styles.container}>
      <FlashList
        data={list}
        estimatedItemSize={CUSTOMER_ROW_HEIGHT.notification}
        drawDistance={CUSTOMER_FLASH_DRAW_DISTANCE}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void load({ force: true });
            }}
          />
        }
        ListEmptyComponent={
          !listLoading ? <Text style={styles.noList}>{t('guestNotifListEmpty')}</Text> : null
        }
        {...CUSTOMER_LIST_PERF}
      />
    </View>
  );
}

function createCustomerNotifStyles(p: PersonelDesignPalette) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: p.pageBg },
  centered: { justifyContent: 'center', alignItems: 'center', backgroundColor: p.pageBg },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: '700', color: p.text, marginBottom: 16 },
  pushCard: {
    backgroundColor: p.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: p.cardBorder,
    padding: 14,
    marginBottom: 14,
  },
  pushCardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  pushCardTitle: { fontSize: 15, fontWeight: '700', color: p.text },
  pushCardDesc: { fontSize: 13, color: p.subtext, lineHeight: 18 },
  pushCardBtnRow: { marginTop: 12, gap: 10 },
  pushCardBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  pushCardBtnDisabled: { opacity: 0.7 },
  pushCardBtnText: { color: '#fff', fontWeight: '700' },
  pushCardBtnSecondary: {
    marginTop: 6,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  pushCardBtnSecondaryText: { color: theme.colors.primary, fontWeight: '600' },
  emptyCard: {
    backgroundColor: p.cardBg,
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: p.cardBorder,
  },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: p.text, marginBottom: 8 },
  emptyDesc: { fontSize: 14, color: p.subtext, marginBottom: 20 },
  btn: { backgroundColor: theme.colors.primary, padding: 14, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '600' },
  noList: { color: p.muted, fontSize: 14 },
  row: {
    backgroundColor: p.cardBg,
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: p.cardBorder,
  },
  rowRead: { opacity: 0.85 },
  rowContent: { flexDirection: 'row', alignItems: 'center' },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.primary,
    marginRight: 10,
  },
  rowTextWrap: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: p.text, marginBottom: 4 },
  rowBody: { fontSize: 14, color: p.subtext, marginBottom: 8 },
  rowTime: { fontSize: 12, color: p.muted },
  });
}
