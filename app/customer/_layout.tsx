import { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useTranslation } from 'react-i18next';
import { complaintsText } from '@/lib/complaintsI18n';

type GuestStatusRow = {
  guest_id: string;
  deleted_at: string | null;
  banned_until: string | null;
  ban_reason: string | null;
  deletion_reason: string | null;
};

export default function CustomerLayout() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, staff, staffCheckComplete, signOut } = useAuthStore();
  const [guestStatus, setGuestStatus] = useState<GuestStatusRow | null | undefined>(undefined);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  /** Zustand gecikse bile (anonim misafir) Supabase istemci oturumu varsa müşteri yığınını aç. */
  const [clientSession, setClientSession] = useState<Session | null | undefined>(undefined);
  const authAlertShown = useRef(false);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (alive) setClientSession(session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setClientSession(session);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const sessionResolved = clientSession !== undefined;
  const hasAuth = !!(user ?? clientSession?.user);

  useEffect(() => {
    if (!sessionResolved) return;
    if (!staffCheckComplete) return;
    if (staff) {
      router.replace('/staff');
      return;
    }
    if (!hasAuth) {
      if (!authAlertShown.current) {
        authAlertShown.current = true;
        Alert.alert(
          t('authRegisterRequiredTitle'),
          t('authRegisterRequiredMessage'),
          [{ text: t('ok'), onPress: () => router.replace('/') }]
        );
      }
    } else {
      authAlertShown.current = false;
    }
  }, [sessionResolved, hasAuth, staff, staffCheckComplete, t, router]);

  useEffect(() => {
    if (!staffCheckComplete) return;
    if (staff) {
      setGuestStatus(null);
      return;
    }
    if (!hasAuth) {
      setGuestStatus(null);
      return;
    }
    (async () => {
      const { data, error } = await supabase.rpc('get_my_guest_status');
      if (error || !data?.length) {
        setGuestStatus(null);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      setGuestStatus({
        guest_id: row?.guest_id,
        deleted_at: row?.deleted_at ?? null,
        banned_until: row?.banned_until ?? null,
        ban_reason: row?.ban_reason ?? null,
        deletion_reason: row?.deletion_reason ?? null,
      });
    })();
  }, [user?.id, clientSession?.user?.id, staff, staffCheckComplete, hasAuth]);

  const guestDeleted = !!guestStatus && !!guestStatus.deleted_at;
  const guestBanned = !!(guestStatus && guestStatus.banned_until && new Date(guestStatus.banned_until) > new Date());

  useEffect(() => {
    if (!guestDeleted) return;
    const doConfirm = async () => {
      setConfirmingLogout(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          await supabase.functions.invoke('confirm-deleted-logout', {
            body: {},
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
        }
      } catch (_) {}
      await signOut();
      setConfirmingLogout(false);
      router.replace('/');
    };
    doConfirm();
  }, [guestDeleted]);

  if (!sessionResolved || !staffCheckComplete) {
    return (
      <View style={[styles.blockScreen, { flex: 1 }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }
  if (staff) return <View style={[styles.blockScreen, { flex: 1 }]} />;
  if (!hasAuth) return <View style={[styles.blockScreen, { flex: 1 }]} />;

  if (guestDeleted) {
    const delReason = guestStatus?.deletion_reason?.trim();
    return (
      <View style={styles.blockScreen}>
        <View style={styles.blockCard}>
          <Text style={styles.blockEmoji}>🚫</Text>
          <Text style={styles.blockTitle}>{t('accountDeletedTitle')}</Text>
          <Text style={styles.blockMessage}>{t('accountDeletedMessage')}</Text>
          {delReason ? <Text style={[styles.blockMessage, styles.blockReason]}>{t('accountStatusReason', { reason: delReason })}</Text> : null}
          {confirmingLogout ? <Text style={styles.blockSub}>{t('signingOut')}</Text> : (
            <TouchableOpacity style={styles.blockBtn} onPress={() => router.replace('/')}>
              <Text style={styles.blockBtnText}>{t('goToLobby')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  if (guestBanned) {
    const until = guestStatus?.banned_until ? new Date(guestStatus.banned_until).toLocaleString() : '';
    const banReason = guestStatus?.ban_reason?.trim();
    return (
      <View style={styles.blockScreen}>
        <View style={styles.blockCard}>
          <Text style={styles.blockEmoji}>⛔</Text>
          <Text style={styles.blockTitle}>{t('accountBannedTitle')}</Text>
          <Text style={styles.blockMessage}>{t('accountBannedMessage', { until })}</Text>
          {banReason ? <Text style={[styles.blockMessage, styles.blockReason]}>{t('accountStatusReason', { reason: banReason })}</Text> : null}
          <TouchableOpacity style={styles.blockBtn} onPress={() => router.replace('/')}>
            <Text style={styles.blockBtnText}>{t('goToLobby')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.backgroundSecondary },
        animation: 'slide_from_right',
        fullScreenGestureEnabled: true,
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { fontSize: 17, fontWeight: '600' },
      }}
    >
      <Stack.Screen
        name="(tabs)"
        options={{
          title: '',
          headerTitle: '',
          headerBackTitle: ' ',
          headerBackTitleVisible: false,
        }}
      />
      <Stack.Screen name="staff/[id]" options={{ headerShown: false }} />
      <Stack.Screen
        name="staff-posts/[id]"
        options={{
          headerShown: true,
          title: t('profileFeedPostsSection'),
          headerBackTitle: t('back'),
        }}
      />
      <Stack.Screen
        name="hotel/index"
        options={{
          headerShown: true,
          title: t('screenHotel'),
          headerBackTitle: t('back'),
        }}
      />
      <Stack.Screen
        name="hotel/map"
        options={{
          headerShown: true,
          title: t('screenHotelMap'),
          headerBackTitle: t('back'),
        }}
      />
      <Stack.Screen
        name="surroundings"
        options={{
          headerShown: true,
          title: t('screenSurroundingsGuide'),
          headerBackTitle: t('back'),
        }}
      />
      <Stack.Screen
        name="emergency"
        options={{
          headerShown: true,
          title: t('screenEmergency'),
          headerBackTitle: t('back'),
        }}
      />
      <Stack.Screen
        name="room-service/index"
        options={{
          headerShown: true,
          title: t('screenRoomService'),
          headerBackTitle: t('back'),
        }}
      />
      <Stack.Screen
        name="hotel-menu/index"
        options={{
          headerShown: true,
          title: t('screenHotelKitchenMenu'),
          headerBackTitle: t('back'),
        }}
      />
      <Stack.Screen
        name="hotel-menu/[id]"
        options={{
          headerShown: true,
          title: t('screenHotelKitchenMenu'),
          headerBackTitle: t('back'),
        }}
      />
      <Stack.Screen
        name="chat/[id]"
        options={{
          headerShown: true,
          title: t('screenChat'),
          headerBackTitle: t('back'),
        }}
      />
      <Stack.Screen
        name="new-chat"
        options={{
          headerShown: true,
          title: t('screenNewChat'),
          headerBackTitle: t('back'),
        }}
      />
      <Stack.Screen
        name="map/poi/[id]"
        options={{
          headerShown: true,
          title: t('screenBusiness'),
          headerBackTitle: t('back'),
        }}
      />
      <Stack.Screen
        name="map/directions"
        options={{
          headerShown: true,
          title: t('screenDirections'),
          headerBackTitle: t('back'),
        }}
      />
      <Stack.Screen
        name="feed/new"
        options={{
          headerShown: true,
          title: t('screenNewPost'),
          headerBackTitle: t('back'),
        }}
      />
      <Stack.Screen
        name="feed/[id]"
        options={{
          headerShown: true,
          title: t('screenPost'),
          headerBackTitle: t('back'),
        }}
      />
      <Stack.Screen
        name="carbon/index"
        options={{
          headerShown: true,
          title: t('screenCarbonFootprint'),
          headerBackTitle: t('back'),
        }}
      />
      <Stack.Screen
        name="complaints/new"
        options={{
          headerShown: true,
          title: complaintsText('newScreenTitle'),
          headerBackTitle: t('back'),
        }}
      />
      <Stack.Screen
        name="transfer-tour/index"
        options={{
          headerShown: true,
          title: t('transferTourNavTitle'),
          headerBackTitle: t('back'),
        }}
      />
      <Stack.Screen
        name="transfer-tour/[id]"
        options={{
          headerShown: true,
          title: t('transferTourNavTitle'),
          headerBackTitle: t('back'),
        }}
      />
      <Stack.Screen
        name="dining-venues/index"
        options={{
          headerShown: true,
          title: t('diningVenuesNavTitle'),
          headerBackTitle: t('back'),
        }}
      />
      <Stack.Screen
        name="dining-venues/[id]"
        options={{
          headerShown: true,
          title: t('diningVenuesNavTitle'),
          headerBackTitle: t('back'),
        }}
      />
      <Stack.Screen
        name="local-area-guide/index"
        options={{
          headerShown: true,
          title: t('localAreaGuideScreenTitle'),
          headerBackTitle: t('back'),
        }}
      />
      <Stack.Screen
        name="local-area-guide/[id]"
        options={{
          headerShown: true,
          title: t('localAreaGuideScreenTitle'),
          headerBackTitle: t('back'),
        }}
      />
      <Stack.Screen
        name="convert-to-full-account"
        options={{
          headerShown: true,
          title: t('screenConvertToFullAccount'),
          headerBackTitle: t('back'),
        }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  blockScreen: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  blockCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 24,
    maxWidth: 360,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  blockEmoji: { fontSize: 48, marginBottom: 16 },
  blockTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.text, marginBottom: 12, textAlign: 'center' },
  blockMessage: { fontSize: 15, color: theme.colors.textSecondary, textAlign: 'center', marginBottom: 20, lineHeight: 22 },
  blockReason: { fontSize: 14, color: theme.colors.text, marginTop: 4, marginBottom: 8 },
  blockSub: { fontSize: 14, color: theme.colors.textMuted, marginBottom: 16 },
  blockBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  blockBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
