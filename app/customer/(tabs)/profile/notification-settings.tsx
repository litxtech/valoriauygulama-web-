import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Linking, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { getGuestNotificationToken, setGuestNotificationToken } from '@/lib/guestNotificationToken';
import { getOrCreateGuestForCaller } from '@/lib/getOrCreateGuestForCaller';
import { GUEST_PREF_KEYS } from '@/lib/notifications';
import { getExpoPushTokenAsync, savePushTokenForGuest, isExpoGo } from '@/lib/notificationsPush';
import ExpoNotifications from '@/lib/expoNotificationsModule';
import { useGuestMessagingStore } from '@/stores/guestMessagingStore';
import { theme } from '@/constants/theme';
import { useTranslation } from 'react-i18next';

const GUEST_PREF_I18N: Record<string, 'guestNotifPrefService' | 'guestNotifPrefCheckin' | 'guestNotifPrefHotel' | 'guestNotifPrefCampaigns' | 'guestNotifPrefMarketing'> = {
  [GUEST_PREF_KEYS.service_updates]: 'guestNotifPrefService',
  [GUEST_PREF_KEYS.checkin_checkout_reminders]: 'guestNotifPrefCheckin',
  [GUEST_PREF_KEYS.hotel_announcements]: 'guestNotifPrefHotel',
  [GUEST_PREF_KEYS.campaigns]: 'guestNotifPrefCampaigns',
  [GUEST_PREF_KEYS.marketing]: 'guestNotifPrefMarketing',
};

export default function CustomerNotificationSettingsScreen() {
  const { t } = useTranslation();
  const [token, setToken] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [pushPerm, setPushPerm] = useState<'granted' | 'denied' | 'undetermined' | 'unknown'>('unknown');
  const [enablingPush, setEnablingPush] = useState(false);

  const load = useCallback(async () => {
    if (!isExpoGo) {
      try {
        const { status } = await ExpoNotifications.getPermissionsAsync();
        setPushPerm(status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined');
      } catch {
        setPushPerm('unknown');
      }
    }
    let notifToken = await getGuestNotificationToken();
    if (!notifToken) {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (s?.user) {
        const row = await getOrCreateGuestForCaller(s.user);
        notifToken = row?.app_token ?? null;
        if (notifToken) {
          await setGuestNotificationToken(notifToken);
          await useGuestMessagingStore.getState().setAppToken(notifToken);
        }
      }
    }
    setToken(notifToken);
    if (!notifToken) {
      setPrefs({});
      setPrefsLoaded(true);
      return;
    }
    const { data: prefsData } = await supabase.rpc('get_guest_notification_preferences', {
      p_app_token: notifToken,
    });
    const map: Record<string, boolean> = {};
    (prefsData as { pref_key: string; enabled: boolean }[] ?? []).forEach((p) => {
      map[p.pref_key] = p.enabled;
    });
    setPrefs(map);
    setPrefsLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const enablePush = useCallback(async () => {
    if (enablingPush) return;
    if (isExpoGo) {
      Alert.alert(t('guestNotifExpoGoTitle'), t('guestNotifExpoGoBody'), [{ text: t('ok') }]);
      return;
    }
    if (!token) {
      Alert.alert(t('error'), t('guestNotifAccountPreparingShort'));
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
      }
    } catch {
      Alert.alert(t('error'), t('notificationPermissionFetchFailed'));
    } finally {
      setEnablingPush(false);
    }
  }, [token, enablingPush, t]);

  const togglePref = async (key: string, enabled: boolean) => {
    if (!token) return;
    await supabase.rpc('set_guest_notification_preference', {
      p_app_token: token,
      p_pref_key: key,
      p_enabled: enabled,
    });
    setPrefs((p) => ({ ...p, [key]: enabled }));
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('guestNotifSettingsScreenTitle')}</Text>
      {!isExpoGo && (pushPerm === 'denied' || pushPerm === 'undetermined') && (
        <View style={styles.pushCard}>
          <View style={styles.pushCardRow}>
            <Ionicons name="notifications-outline" size={20} color={theme.colors.primary} />
            <Text style={styles.pushCardTitle}>{t('guestNotifPermCardTitle')}</Text>
          </View>
          <Text style={styles.pushCardDesc}>
            {pushPerm === 'denied' ? t('guestNotifPermDeniedLong') : t('guestNotifPermUndeterminedShort')}
          </Text>
          <TouchableOpacity
            style={[styles.pushCardBtn, enablingPush && styles.pushCardBtnDisabled]}
            onPress={enablePush}
            disabled={enablingPush}
            activeOpacity={0.8}
          >
            {enablingPush ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.pushCardBtnText}>{t('guestNotifBtnGrant')}</Text>
            )}
          </TouchableOpacity>
          {pushPerm === 'denied' && (
            <TouchableOpacity style={styles.pushCardBtnSecondary} onPress={() => Linking.openSettings()} activeOpacity={0.8}>
              <Text style={styles.pushCardBtnSecondaryText}>{t('openAppSettings')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {prefsLoaded &&
        Object.entries(GUEST_PREF_KEYS).map(([, key]) => (
          <View key={key} style={styles.prefRow}>
            <Text style={styles.prefLabel}>{t(GUEST_PREF_I18N[key] ?? 'guestNotifPrefService')}</Text>
            <TouchableOpacity
              style={[styles.toggle, prefs[key] !== false && styles.toggleOn]}
              onPress={() => togglePref(key, prefs[key] === false)}
            >
              <Text style={styles.toggleText}>{prefs[key] !== false ? t('toggleOn') : t('toggleOff')}</Text>
            </TouchableOpacity>
          </View>
        ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: '700', color: theme.colors.text, marginBottom: 16 },
  pushCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    padding: 14,
    marginBottom: 14,
  },
  pushCardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  pushCardTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  pushCardDesc: { fontSize: 13, color: theme.colors.textSecondary, lineHeight: 18 },
  pushCardBtn: {
    marginTop: 12,
    backgroundColor: theme.colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  pushCardBtnDisabled: { opacity: 0.7 },
  pushCardBtnText: { color: '#fff', fontWeight: '700' },
  pushCardBtnSecondary: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  pushCardBtnSecondaryText: { color: theme.colors.primary, fontWeight: '600' },
  prefRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  prefLabel: { fontSize: 15, color: theme.colors.text, flex: 1, paddingRight: 10 },
  toggle: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.colors.borderLight },
  toggleOn: { backgroundColor: theme.colors.success + '30' },
  toggleText: { fontSize: 13, color: theme.colors.text, fontWeight: '500' },
});
