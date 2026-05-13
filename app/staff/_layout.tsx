import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter, Stack, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { useStaffNotificationStore } from '@/stores/staffNotificationStore';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useTranslation } from 'react-i18next';
import { feedSharedText } from '@/lib/feedSharedI18n';
import { isPostgrestSchemaCacheError, sleepMs } from '@/lib/supabaseTransientErrors';
import { PersonnelWarningGate } from '@/components/staff/PersonnelWarningGate';

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
  const { t } = useTranslation();
  const { staff, loading, signOut } = useAuthStore();
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  const isBanned = staff?.banned_until && new Date(staff.banned_until) > new Date();
  const isDeleted = !!staff?.deleted_at;

  useStaffPresence(isBanned || isDeleted ? undefined : staff?.id);

  // Root _layout'ta initAuthListener zaten loadSession çağırıyor; burada tekrar çağırmak
  // loading: true yapıp layout'u null döndürüyor ve arkadaki lobi görünüyordu.
  useEffect(() => {
    if (loading) return;
    if (!staff) {
      router.replace('/');
      return;
    }
  }, [loading, staff]);

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
      router.replace('/');
    };
    doConfirm();
  }, [staff?.id, isDeleted]);

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

  // null döndürmek Stack'te arkadaki lobiyi gösteriyordu; aynı arka planla dolu ekran göster
  if (loading || !staff) {
    return <View style={[styles.blockScreen, { backgroundColor: theme.colors.backgroundSecondary }]} />;
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

  const renderStaffDocumentDetailBack = () => (
    <TouchableOpacity
      onPress={() => {
        if (navigation.canGoBack()) {
          router.back();
        } else {
          router.replace('/staff/documents/all' as never);
        }
      }}
      style={{ marginLeft: 8, padding: 8 }}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityLabel={t('back')}
    >
      <Ionicons name="arrow-back" size={24} color="#1a1d21" />
    </TouchableOpacity>
  );

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

  return (
    <>
      <PersonnelWarningGate staffId={staff.id} subjectDisplayName={staff.full_name} />
      <Stack screenOptions={{ headerShown: true, headerStyle: { backgroundColor: '#fff' }, headerTintColor: '#1a1d21' }}>
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
      <Stack.Screen name="demirbaslar" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[id]" options={{ title: t('screenChat'), headerBackTitle: t('back') }} />
      <Stack.Screen name="new-group" options={{ title: t('screenNewGroup'), headerBackTitle: t('back') }} />
      <Stack.Screen name="feed/new" options={{ title: t('screenNewPost'), headerBackTitle: t('back') }} />
      <Stack.Screen name="expenses" options={{ headerShown: false }} />
      <Stack.Screen name="debts" options={{ headerShown: false }} />
      <Stack.Screen name="profile/[id]" options={{ headerShown: false }} />
      <Stack.Screen
        name="staff-posts/[id]"
        options={{ title: t('profileFeedPostsSection'), headerBackTitle: t('back') }}
      />
      <Stack.Screen name="profile/edit" options={{ title: t('screenEditProfile'), headerBackTitle: t('back') }} />
      <Stack.Screen name="profile/blocked-users" options={{ headerBackTitle: t('back') }} />
      <Stack.Screen name="profile/notifications" options={{ headerBackTitle: t('back') }} />
      <Stack.Screen
        name="profile/app-links"
        options={{ title: t('screenAppsAndWeb'), headerBackTitle: t('back') }}
      />
      <Stack.Screen
        name="profile/passports"
        options={{ title: t('staffPassportsTitle'), headerBackTitle: t('back') }}
      />
      <Stack.Screen name="evaluation" options={{ headerBackTitle: t('back') }} />
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
      <Stack.Screen name="incident-reports/index" options={{ title: t('screenIncidentReports'), headerBackTitle: t('back') }} />
      <Stack.Screen name="incident-reports/new" options={{ title: t('screenIncidentReportNew'), headerBackTitle: t('back') }} />
      <Stack.Screen name="incident-reports/[id]" options={{ title: t('screenIncidentReportDetail'), headerBackTitle: t('back') }} />
      <Stack.Screen name="missing-items/index" options={{ title: t('screenMissingItems'), headerBackTitle: t('back') }} />
      <Stack.Screen name="internal-complaints/new" options={{ title: 'Yönetime Not/Öneri', headerBackTitle: t('back') }} />
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
        name="mrz-scan"
        options={{ title: t('kbsNavScanSerial'), headerBackTitle: t('back') }}
      />
      <Stack.Screen name="meal-menu" options={{ title: 'Yemek listesi', headerBackTitle: t('back') }} />
      <Stack.Screen name="breakfast-confirm/index" options={{ title: feedSharedText('staffBreakfastConfirm'), headerBackTitle: t('back') }} />
      <Stack.Screen name="breakfast-confirm/list" options={{ title: feedSharedText('staffBreakfastList'), headerBackTitle: t('back') }} />
      <Stack.Screen name="attendance/index" options={{ title: 'Mesai Takibi', headerBackTitle: t('back') }} />
      <Stack.Screen name="cleaning-plan" options={{ title: 'Temizlik', headerBackTitle: t('back') }} />
      <Stack.Screen name="cleaning-history" options={{ title: 'Geçmiş Temizlikler', headerBackTitle: t('back') }} />
      <Stack.Screen name="transfer-tour" options={{ headerShown: false }} />
      <Stack.Screen name="dining-venues" options={{ headerShown: false }} />
      <Stack.Screen name="local-area-guide/index" options={{ title: t('localAreaGuideScreenTitle'), headerBackTitle: t('back') }} />
      <Stack.Screen name="local-area-guide/[id]" options={{ title: t('localAreaGuideScreenTitle'), headerBackTitle: t('back') }} />
      <Stack.Screen name="emergency" options={{ title: t('screenEmergencyButton'), headerBackTitle: t('back') }} />
      <Stack.Screen name="technical-assets" options={{ headerShown: false }} />
      <Stack.Screen name="warnings" options={{ title: 'Resmi uyarılar', headerBackTitle: t('back') }} />
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
