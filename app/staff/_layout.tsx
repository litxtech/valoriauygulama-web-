import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, BackHandler, InteractionManager } from 'react-native';
import { useRouter, Stack, useNavigation, usePathname, useRootNavigationState } from 'expo-router';
import { safeRouterReplace } from '@/lib/safeRouter';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { useStaffNotificationStore } from '@/stores/staffNotificationStore';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useTranslation } from 'react-i18next';
import { feedSharedText } from '@/lib/feedSharedI18n';
import { staffTipText } from '@/lib/staffTipsI18n';
import { isPostgrestSchemaCacheError, sleepMs } from '@/lib/supabaseTransientErrors';
import { PersonnelWarningGate } from '@/components/staff/PersonnelWarningGate';
import { StaffLiveLocationBootstrap } from '@/components/staff/StaffLiveLocationBootstrap';
import {
  StaffStackBackButton,
  STAFF_TABS_FALLBACK,
  navigateStaffBack,
  staffStackGestureForNavigation,
  staffStackScrollSafeGestureOptions,
} from '@/lib/staffStackBack';
import { prefetchStaffMealMenuBrowse } from '@/lib/staffMealMenuCache';
import { StaffHamburgerNavigationHost } from '@/components/header/StaffHamburgerNavigationHost';
import { useStaffAccountStatusRealtime } from '@/hooks/useStaffAccountStatusRealtime';

function useStaffPresence(staffId: string | undefined) {
  useEffect(() => {
    if (!staffId) return;

    let preferOffline = false;
    let cancelled = false;

    const setOnline = (online: boolean) => {
      (async () => {
        if (cancelled) return;
        const max = 3;
        for (let a = 1; a <= max; a++) {
          const { error } = await supabase
            .from('staff')
            .update({
              is_online: online,
              last_active: new Date().toISOString(),
            })
            .eq('id', staffId);
          if (!error) return;
          if (isPostgrestSchemaCacheError(error) && a < max) {
            await sleepMs(300 * a);
            continue;
          }
          if (!isPostgrestSchemaCacheError(error)) {
            console.warn('Staff presence update failed', error.message);
          }
          return;
        }
      })().catch(() => {});
    };

    (async () => {
      // Personel profilindeki manuel "çevrimdışı" tercihini koru.
      const { data } = await supabase.from('staff').select('work_status').eq('id', staffId).maybeSingle();
      preferOffline = data?.work_status === 'off' || data?.work_status === 'offline';
      if (!preferOffline) setOnline(true);
    })().catch(() => {
      // Okuma başarısızsa mevcut davranışa dön.
      setOnline(true);
    });

    return () => {
      cancelled = true;
      // Personel oturumdan cikinca/ekran kapaninca offline'a cek.
      setOnline(false);
    };
  }, [staffId]);
}

export default function StaffLayout() {
  const router = useRouter();
  const navigation = useNavigation();
  const pathname = usePathname();
  const rootNavigationState = useRootNavigationState();
  const navigationReady = rootNavigationState?.key != null;
  const { t } = useTranslation();
  const { staff, loading, staffCheckComplete, signOut } = useAuthStore();
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  const isBanned = staff?.banned_until && new Date(staff.banned_until) > new Date();
  const isDeleted = !!staff?.deleted_at;
  const isAccountLocked = staff?.account_locked === true;

  useStaffAccountStatusRealtime();
  useStaffPresence(isBanned || isDeleted || isAccountLocked ? undefined : staff?.id);

  // MRZ modülü yalnızca KBS ekranlarında lazy yüklenir (staff/kbs/*, scan.tsx).

  useEffect(() => {
    if (!staff?.organization_id) return;
    if (Platform.OS === 'android') {
      const task = InteractionManager.runAfterInteractions(() => {
        setTimeout(() => prefetchStaffMealMenuBrowse(staff.organization_id!), 8000);
      });
      return () => task.cancel();
    }
    const t = setTimeout(() => prefetchStaffMealMenuBrowse(staff.organization_id!), 4000);
    return () => clearTimeout(t);
  }, [staff?.organization_id]);

  // Root _layout'ta initAuthListener zaten loadSession çağırıyor; burada tekrar çağırmak
  // loading: true yapıp layout'u null döndürüyor ve arkadaki lobi görünüyordu.
  useEffect(() => {
    if (!navigationReady) return;
    if (loading) return;
    if (!staffCheckComplete) return;
    if (!staff) {
      safeRouterReplace(router, '/');
    }
  }, [navigationReady, loading, staff, staffCheckComplete, router]);

  useEffect(() => {
    if (!staff?.id || !isDeleted) return;
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
      safeRouterReplace(router, '/');
    };
    doConfirm();
  }, [staff?.id, isDeleted, router, signOut]);

  // Beğeni/yorum bildirimleri anında badge güncellensin (tüm hook'lar erken return'den önce çağrılmalı)
  useEffect(() => {
    if (!staff?.id) return;
    const channel = supabase
      .channel('staff_notifications_live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `staff_id=eq.${staff.id}` },
        () => {
          useStaffNotificationStore.getState().refresh();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [staff?.id]);

  const handleStaffSubScreenBack = useCallback(() => {
    navigateStaffBack(router, navigation, pathname, STAFF_TABS_FALLBACK);
  }, [navigation, router, pathname]);

  const renderStaffSubScreenBack = useCallback(
    () => <StaffStackBackButton accessibilityLabel={t('back')} />,
    [t]
  );

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const p = pathname ?? '';
    if (p.startsWith('/staff/(tabs)') || p === '/staff') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleStaffSubScreenBack();
      return true;
    });
    return () => sub.remove();
  }, [pathname, handleStaffSubScreenBack]);

  const renderStaffDocumentDetailBack = () => (
    <StaffStackBackButton accessibilityLabel={t('back')} fallback="/staff/documents/all" />
  );

  if (loading || !staffCheckComplete || !staff) {
    return (
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="payments" options={{ headerShown: false }} />
      </Stack>
    );
  }

  if (isDeleted) {
    return (
      <View style={styles.blockScreen}>
        <View style={styles.blockCard}>
          <Text style={styles.blockEmoji}>🚫</Text>
          <Text style={styles.blockTitle}>{t('accountDeletedTitle')}</Text>
          <Text style={styles.blockMessage}>{t('accountDeletedMessage')}</Text>
          {confirmingLogout ? <Text style={styles.blockSub}>{t('signingOut')}</Text> : (
            <TouchableOpacity style={styles.blockBtn} onPress={() => router.replace('/')}>
              <Text style={styles.blockBtnText}>{t('goToLobby')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  if (isBanned) {
    const until = staff.banned_until ? new Date(staff.banned_until).toLocaleString() : '';
    return (
      <View style={styles.blockScreen}>
        <View style={styles.blockCard}>
          <Text style={styles.blockEmoji}>⛔</Text>
          <Text style={styles.blockTitle}>{t('accountBannedTitle')}</Text>
          <Text style={styles.blockMessage}>{t('accountBannedMessage', { until })}</Text>
          <TouchableOpacity style={styles.blockBtn} onPress={() => router.replace('/')}>
            <Text style={styles.blockBtnText}>{t('goToLobby')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (isAccountLocked) {
    return (
      <View style={styles.blockScreen}>
        <View style={styles.blockCard}>
          <Text style={styles.blockEmoji}>🔒</Text>
          <Text style={styles.blockTitle}>{t('accountLockedTitle')}</Text>
          <Text style={styles.blockMessage}>{t('accountLockedMessage')}</Text>
          <TouchableOpacity style={styles.blockBtn} onPress={() => router.replace('/')}>
            <Text style={styles.blockBtnText}>{t('goToLobby')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <>
      <PersonnelWarningGate staffId={staff.id} subjectDisplayName={staff.full_name} />
      <StaffLiveLocationBootstrap />
      <StaffHamburgerNavigationHost />
      <Stack
        screenOptions={({ navigation: nav }) => ({
          headerShown: true,
          headerStyle: { backgroundColor: '#fff' },
          headerTintColor: '#1a1d21',
          headerTitleAlign: 'center',
          headerTitleStyle: { fontWeight: '700', fontSize: 17 },
          ...staffStackGestureForNavigation(nav),
          headerBackVisible: false,
          headerLeft: renderStaffSubScreenBack,
        })}
      >
      {/* iOS: grup adı "(tabs)" bazen üstte/geri başlığında kod gibi görünüyor — tüm başlık alanlarını temizle */}
      <Stack.Screen
        name="(tabs)"
        options={{
          headerShown: false,
          title: '',
          headerTitle: '',
          headerBackTitle: ' ',
          headerBackTitleVisible: false,
        }}
      />
      <Stack.Screen name="stock" options={{ headerShown: false }} />
      <Stack.Screen name="kitchen-ops" options={{ headerShown: false }} />
      <Stack.Screen name="demirbaslar" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[id]" options={{ title: t('screenChat'), headerBackTitle: t('back') }} />
      <Stack.Screen name="chat/group-members" options={{ title: t('groupMembersGroupInfo'), headerBackTitle: t('back') }} />
      <Stack.Screen name="new-chat" options={{ title: t('screenNewChat'), headerBackTitle: t('back') }} />
      <Stack.Screen name="new-group" options={{ title: t('screenNewGroup'), headerBackTitle: t('back') }} />
      <Stack.Screen name="feed/new" options={{ title: t('screenNewPost'), headerBackTitle: t('back') }} />
      <Stack.Screen name="expenses" options={{ headerShown: false }} />
      <Stack.Screen name="debts" options={{ headerShown: false }} />
      <Stack.Screen name="payments" options={{ headerShown: false }} />
      <Stack.Screen name="tips/index" options={{ title: staffTipText('tipStaffTipsScreenTitle'), headerBackTitle: t('back') }} />
      <Stack.Screen
        name="profile/[id]"
        options={{ headerShown: false, ...staffStackScrollSafeGestureOptions }}
      />
      <Stack.Screen
        name="staff-posts/[id]"
        options={{ title: t('profileFeedPostsSection'), headerBackTitle: t('back') }}
      />
      <Stack.Screen
        name="profile/edit"
        options={{ title: t('screenEditProfile'), headerBackTitle: t('back'), ...staffStackScrollSafeGestureOptions }}
      />
      <Stack.Screen name="profile/account" options={{ ...staffStackScrollSafeGestureOptions }} />
      <Stack.Screen
        name="profile/blocked-users"
        options={{ headerBackTitle: t('back'), ...staffStackScrollSafeGestureOptions }}
      />
      <Stack.Screen
        name="profile/notifications"
        options={{ headerBackTitle: t('back'), ...staffStackScrollSafeGestureOptions }}
      />
      <Stack.Screen name="operations/index" options={{ title: t('staffOperationsTasks'), headerBackTitle: t('back') }} />
      <Stack.Screen name="smart-ops/[id]" options={{ title: t('staffSmartOpsConfirm'), headerBackTitle: t('back') }} />
      <Stack.Screen
        name="profile/app-links"
        options={{ title: t('screenAppsAndWeb'), headerBackTitle: t('back'), ...staffStackScrollSafeGestureOptions }}
      />
      <Stack.Screen
        name="profile/passports"
        options={{
          title: '',
          headerTitle: '',
          headerTransparent: true,
          headerShadowVisible: false,
          headerStyle: { backgroundColor: 'transparent' },
          headerTintColor: '#fff',
          headerBackTitle: t('back'),
          headerLeft: () => <StaffStackBackButton tintColor="#fff" accessibilityLabel={t('back')} />,
          contentStyle: { backgroundColor: '#fffbeb' },
        }}
      />
      <Stack.Screen name="evaluation" options={{ headerBackTitle: t('back') }} />
      <Stack.Screen name="performance/index" options={{ title: t('perfDashboardScreenTitle'), headerBackTitle: t('back') }} />
      <Stack.Screen name="points/index" options={{ title: 'Alınan puanlarım', headerBackTitle: t('back') }} />
      <Stack.Screen
        name="admin-notes/index"
        options={{
          title: 'Not Al',
          headerBackTitle: t('back'),
          headerShadowVisible: false,
          headerStyle: { backgroundColor: '#F9FAFB' },
          contentStyle: { backgroundColor: '#F9FAFB' },
        }}
      />
      <Stack.Screen
        name="admin-notes/new"
        options={{
          title: 'Yeni not',
          headerBackTitle: t('back'),
          headerShadowVisible: false,
          headerStyle: { backgroundColor: '#F9FAFB' },
          contentStyle: { backgroundColor: '#F9FAFB' },
        }}
      />
      <Stack.Screen
        name="admin-notes/[id]"
        options={{
          title: 'Not',
          headerBackTitle: t('back'),
          headerShadowVisible: false,
          headerStyle: { backgroundColor: '#F9FAFB' },
          contentStyle: { backgroundColor: '#F9FAFB' },
        }}
      />
      <Stack.Screen
        name="admin-notes/edit/[id]"
        options={{
          title: 'Düzenle',
          headerBackTitle: t('back'),
          headerShadowVisible: false,
          headerStyle: { backgroundColor: '#F9FAFB' },
          contentStyle: { backgroundColor: '#F9FAFB' },
        }}
      />
      <Stack.Screen name="documents/index" options={{ title: t('screenDocumentManagement'), headerBackTitle: t('back') }} />
      <Stack.Screen name="documents/all" options={{ title: feedSharedText('staffStackDocAll'), headerBackTitle: t('back') }} />
      <Stack.Screen name="documents/categories" options={{ title: t('adminDocumentsCategories'), headerBackTitle: t('back') }} />
      <Stack.Screen name="documents/pending" options={{ title: t('adminDocumentsPending'), headerBackTitle: t('back') }} />
      <Stack.Screen name="documents/expiring" options={{ title: feedSharedText('staffStackDocExpiring'), headerBackTitle: t('back') }} />
      <Stack.Screen name="documents/expired" options={{ title: feedSharedText('staffStackDocExpired'), headerBackTitle: t('back') }} />
      <Stack.Screen name="documents/archive" options={{ title: feedSharedText('staffStackDocArchive'), headerBackTitle: t('back') }} />
      <Stack.Screen name="documents/logs" options={{ title: feedSharedText('staffStackDocLogs'), headerBackTitle: t('back') }} />
      <Stack.Screen name="documents/settings" options={{ title: feedSharedText('staffStackDocSettings'), headerBackTitle: t('back') }} />
      <Stack.Screen name="documents/new" options={{ title: feedSharedText('staffStackDocNew'), headerBackTitle: t('back') }} />
      <Stack.Screen name="managed-contracts" options={{ headerShown: false }} />
      <Stack.Screen name="department-rules" options={{ headerShown: false }} />
      <Stack.Screen name="incident-reports/index" options={{ title: t('screenIncidentReports'), headerBackTitle: t('back') }} />
      <Stack.Screen name="incident-reports/new" options={{ title: t('screenIncidentReportNew'), headerBackTitle: t('back') }} />
      <Stack.Screen name="incident-reports/[id]" options={{ title: t('screenIncidentReportDetail'), headerBackTitle: t('back') }} />
      <Stack.Screen name="missing-items/index" options={{ title: t('screenMissingItems'), headerBackTitle: t('back') }} />
      <Stack.Screen
        name="missing-items/[area]"
        options={({ route }) => {
          const area = (route.params as { area?: string })?.area;
          const areaTitle =
            area === 'kitchen'
              ? t('missArea_kitchen_title')
              : area === 'hotel'
                ? t('missArea_hotel_title')
                : '';
          const title = areaTitle
            ? t('staffMissingAreaTitle', { area: areaTitle })
            : t('screenMissingItems');
          return { title, headerBackTitle: t('back') };
        }}
      />
      <Stack.Screen name="missing-items/report/[id]" options={{ title: t('staffMissingDetailTitle'), headerBackTitle: t('back') }} />
      <Stack.Screen name="missing-items/legacy/[id]" options={{ title: t('staffMissingDetailTitle'), headerBackTitle: t('back') }} />
      <Stack.Screen name="missing-items/history" options={{ title: t('missingItemsHistoryTitle'), headerBackTitle: t('back') }} />
      <Stack.Screen name="lost-found/index" options={{ title: t('screenLostFound'), headerBackTitle: t('back') }} />
      <Stack.Screen name="lost-found/new" options={{ title: t('lfNewRecord'), headerBackTitle: t('back') }} />
      <Stack.Screen name="lost-found/[id]" options={{ title: t('lfDetailTitle'), headerBackTitle: t('back') }} />
      <Stack.Screen
        name="blacklist/index"
        options={{ headerShown: false, contentStyle: { backgroundColor: '#0B1120' } }}
      />
      <Stack.Screen
        name="blacklist/[id]"
        options={{ headerShown: false, contentStyle: { backgroundColor: '#0B1120' } }}
      />
      <Stack.Screen name="facility-journal/index" options={{ title: t('staffFacilityJournal'), headerBackTitle: t('back') }} />
      <Stack.Screen name="facility-journal/new" options={{ title: t('staffFacilityJournalNew'), headerBackTitle: t('back') }} />
      <Stack.Screen name="facility-journal/[id]" options={{ title: t('staffFacilityJournalDetail'), headerBackTitle: t('back') }} />
      <Stack.Screen name="internal-complaints/new" options={{ title: t('profileUiStaffComplaint'), headerBackTitle: t('back') }} />
      <Stack.Screen name="guest-complaints/index" options={{ title: t('staffGuestComplaints'), headerBackTitle: t('back') }} />
      <Stack.Screen name="guest-service-requests/index" options={{ title: 'Misafir talepleri', headerBackTitle: t('back') }} />
      <Stack.Screen
        name="documents/[id]"
        options={{ title: t('adminDocumentsDetail'), headerBackTitle: t('back'), headerLeft: renderStaffDocumentDetailBack }}
      />
      <Stack.Screen name="delete-account" options={{ title: t('screenDeleteAccount'), headerBackTitle: t('back') }} />
      <Stack.Screen name="map" options={{ headerShown: false }} />
      <Stack.Screen name="cameras" options={{ headerShown: false }} />
      <Stack.Screen name="guests/index" options={{ title: t('adminGuests'), headerBackTitle: t('back') }} />
      <Stack.Screen name="guests/[id]" options={{ title: t('screenGuestProfile'), headerShown: false }} />
      <Stack.Screen name="kbs" options={{ headerShown: false }} />
      <Stack.Screen
        name="meal-menu"
        options={{ title: t('staffMealMenuTitle'), headerBackTitle: t('back'), ...staffStackScrollSafeGestureOptions }}
      />
      <Stack.Screen name="hotel-menu" options={{ headerShown: false }} />
      <Stack.Screen name="fnb-hub" options={{ headerShown: false }} />
      <Stack.Screen
        name="meal-menu-edit"
        options={{ title: t('staffMealMenuEditTitle'), headerBackTitle: t('back'), ...staffStackScrollSafeGestureOptions }}
      />
      <Stack.Screen
        name="meal-menu-history"
        options={{ title: t('staffMealHistoryTitle'), headerBackTitle: t('back'), ...staffStackScrollSafeGestureOptions }}
      />
      <Stack.Screen name="salary-history" options={{ title: t('salaryHistory'), headerBackTitle: t('back') }} />
      <Stack.Screen name="breakfast-confirm/index" options={{ title: feedSharedText('staffBreakfastConfirm'), headerBackTitle: t('back') }} />
      <Stack.Screen name="breakfast-confirm/list" options={{ title: feedSharedText('staffBreakfastList'), headerBackTitle: t('back') }} />
      <Stack.Screen name="breakfast-briefing" options={{ headerShown: false }} />
      <Stack.Screen name="breakfast-partners" options={{ headerShown: false }} />
      <Stack.Screen name="attendance/index" options={{ title: t('staffAttendanceNavTitle'), headerBackTitle: t('back') }} />
      <Stack.Screen name="cleaning-plan" options={{ title: t('staffCleaningNavTitle'), headerBackTitle: t('back') }} />
      <Stack.Screen name="cleaning-history" options={{ title: t('staffCleaningHistoryTitle'), headerBackTitle: t('back') }} />
      <Stack.Screen name="transfer-tour" options={{ headerShown: false }} />
      <Stack.Screen name="dining-venues" options={{ headerShown: false }} />
      <Stack.Screen name="local-area-guide/index" options={{ title: t('localAreaGuideScreenTitle'), headerBackTitle: t('back') }} />
      <Stack.Screen name="local-area-guide/[id]" options={{ title: t('localAreaGuideScreenTitle'), headerBackTitle: t('back') }} />
      <Stack.Screen name="emergency" options={{ title: t('screenEmergencyButton'), headerBackTitle: t('back') }} />
      <Stack.Screen name="occupancy" options={{ headerShown: false }} />
      <Stack.Screen name="technical-assets" options={{ headerShown: false }} />
      <Stack.Screen name="warnings" options={{ title: t('staffOfficialWarningsNavTitle'), headerBackTitle: t('back') }} />
      <Stack.Screen name="board" options={{ title: t('staffBoardTitle'), headerBackTitle: t('back') }} />
      <Stack.Screen name="announcement-action" options={{ headerShown: false }} />
    </Stack>
    </>
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
  blockSub: { fontSize: 14, color: theme.colors.textMuted, marginBottom: 16 },
  blockBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  blockBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
