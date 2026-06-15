import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Switch, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { staffSetConversationMuted } from '@/lib/messagingApi';
import {
  NOTIFICATION_SOUND_FEATURES,
  type NotificationSoundFeatureDef,
} from '@/lib/notificationSoundCatalog';
import {
  STAFF_NOTIFICATION_DELIVERY_TOGGLES,
  staffNotifPrefDbKey,
  staffNotifSoundDbKey,
  type StaffNotifPrefEntry,
} from '@/lib/staffNotificationPrefsCatalog';

const STAFF_ROOM_CLEANING_SOUND_PREF_KEY = 'staff_notif_room_cleaning_mark_sound_enabled';
const STAFF_FEATURE_SOUND_PREF_KEY_PREFIX = 'staff_notif_sound_enabled:';
const STAFF_SOUND_MASTER_KEY = 'staff_notif_sounds_master_enabled';

function soundFeaturesForStaffProfile(): NotificationSoundFeatureDef[] {
  return NOTIFICATION_SOUND_FEATURES.filter(
    (f) =>
      f.userCanMuteSound &&
      (f.audiences.includes('staff') || f.audiences.includes('admin') || f.audiences.includes('all'))
  );
}

export default function StaffNotificationPrefsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const authStaff = useAuthStore((s) => s.staff);
  const [allStaffConvId, setAllStaffConvId] = useState<string | null>(null);
  const [allStaffMessagesEnabled, setAllStaffMessagesEnabled] = useState(true);
  const [feedNotificationsEnabled, setFeedNotificationsEnabled] = useState(true);
  const [roomCleaningMarkSoundEnabled, setRoomCleaningMarkSoundEnabled] = useState(true);
  const [soundFeaturePrefs, setSoundFeaturePrefs] = useState<Record<string, boolean>>({});
  const [soundMasterEnabled, setSoundMasterEnabled] = useState(true);
  const [featurePrefs, setFeaturePrefs] = useState<Record<string, boolean>>({});
  const [ready, setReady] = useState(false);

  const deliveryToggles = STAFF_NOTIFICATION_DELIVERY_TOGGLES;
  const soundToggles = useMemo(() => soundFeaturesForStaffProfile(), []);

  const saveStaffPreference = useCallback(
    async (prefKey: string, enabled: boolean): Promise<{ error: string | null }> => {
      if (!authStaff?.id) return { error: 'staff yok' };
      const nowIso = new Date().toISOString();
      const baseRow = {
        staff_id: authStaff.id,
        pref_key: prefKey,
        enabled,
        updated_at: nowIso,
      };
      const { data: existing, error: findError } = await supabase
        .from('notification_preferences')
        .select('id')
        .eq('staff_id', authStaff.id)
        .eq('pref_key', prefKey)
        .maybeSingle();
      if (findError) return { error: findError.message };

      if (existing?.id) {
        const { error: updateError } = await supabase
          .from('notification_preferences')
          .update({ enabled, updated_at: nowIso })
          .eq('id', existing.id);
        return { error: updateError?.message ?? null };
      }

      const { error: insertError } = await supabase.from('notification_preferences').insert(baseRow);
      return { error: insertError?.message ?? null };
    },
    [authStaff?.id]
  );

  const load = useCallback(async () => {
    if (!authStaff?.id) return;
    const { data: allStaffConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('type', 'group')
      .eq('name', 'Tüm Çalışanlar')
      .maybeSingle();
    if (allStaffConv?.id) {
      setAllStaffConvId(allStaffConv.id);
      const { data: part } = await supabase
        .from('conversation_participants')
        .select('is_muted')
        .eq('conversation_id', allStaffConv.id)
        .eq('participant_id', authStaff.id)
        .in('participant_type', ['staff', 'admin'])
        .maybeSingle();
      const isMuted = !!(part as { is_muted?: boolean } | null)?.is_muted;
      setAllStaffMessagesEnabled(!isMuted);
    }

    const { data: feedPref } = await supabase
      .from('notification_preferences')
      .select('enabled')
      .eq('staff_id', authStaff.id)
      .eq('pref_key', 'mute_feed_notifications')
      .maybeSingle();
    setFeedNotificationsEnabled(!(feedPref as { enabled?: boolean } | null)?.enabled);

    const { data: roomCleaningSoundPref } = await supabase
      .from('notification_preferences')
      .select('enabled')
      .eq('staff_id', authStaff.id)
      .eq('pref_key', 'staff_notif_room_cleaning_mark_sound')
      .maybeSingle();
    const roomCleaningSoundEnabled = (roomCleaningSoundPref as { enabled?: boolean } | null)?.enabled ?? true;
    setRoomCleaningMarkSoundEnabled(roomCleaningSoundEnabled);
    await AsyncStorage.setItem(STAFF_ROOM_CLEANING_SOUND_PREF_KEY, roomCleaningSoundEnabled ? '1' : '0');

    const soundPrefKeys = [
      ...soundToggles.map((f) => staffNotifSoundDbKey(f.featureKey)),
      'staff_notif_sounds_master',
    ];
    const { data: soundPrefRows } = await supabase
      .from('notification_preferences')
      .select('pref_key, enabled')
      .eq('staff_id', authStaff.id)
      .in('pref_key', soundPrefKeys);

    const masterRow = (soundPrefRows ?? []).find((r) => r.pref_key === 'staff_notif_sounds_master');
    const masterEnabled = masterRow ? !!(masterRow as { enabled?: boolean }).enabled : true;
    setSoundMasterEnabled(masterEnabled);
    await AsyncStorage.setItem(STAFF_SOUND_MASTER_KEY, masterEnabled ? '1' : '0');

    const nextSound: Record<string, boolean> = {};
    soundToggles.forEach((f) => {
      const dbKey = staffNotifSoundDbKey(f.featureKey);
      const row = (soundPrefRows ?? []).find((r) => r.pref_key === dbKey);
      const enabled = row ? !!(row as { enabled?: boolean }).enabled : true;
      nextSound[f.featureKey] = enabled;
      void AsyncStorage.setItem(`${STAFF_FEATURE_SOUND_PREF_KEY_PREFIX}${f.featureKey}`, enabled ? '1' : '0');
    });
    setSoundFeaturePrefs(nextSound);

    const prefKeys = deliveryToggles.map((item) => staffNotifPrefDbKey(item.prefKey));
    const { data: prefRows, error: prefsError } = await supabase
      .from('notification_preferences')
      .select('pref_key, enabled')
      .eq('staff_id', authStaff.id)
      .in('pref_key', prefKeys);

    if (!prefsError) {
      const next: Record<string, boolean> = {};
      deliveryToggles.forEach((item) => {
        const dbKey = staffNotifPrefDbKey(item.prefKey);
        const row = (prefRows ?? []).find((r) => r.pref_key === dbKey);
        next[item.prefKey] = row ? !!(row as { enabled?: boolean }).enabled : true;
      });
      setFeaturePrefs(next);
    }
    setReady(true);
  }, [authStaff?.id, deliveryToggles, soundToggles]);

  useEffect(() => {
    load();
  }, [load]);

  const setSoundFeaturePref = useCallback(
    async (featureKey: string, enabled: boolean) => {
      if (!authStaff?.id) return;
      const prev = soundFeaturePrefs[featureKey] ?? true;
      setSoundFeaturePrefs((c) => ({ ...c, [featureKey]: enabled }));
      await AsyncStorage.setItem(`${STAFF_FEATURE_SOUND_PREF_KEY_PREFIX}${featureKey}`, enabled ? '1' : '0');
      const { error } = await saveStaffPreference(staffNotifSoundDbKey(featureKey), enabled);
      if (error) {
        setSoundFeaturePrefs((c) => ({ ...c, [featureKey]: prev }));
        await AsyncStorage.setItem(`${STAFF_FEATURE_SOUND_PREF_KEY_PREFIX}${featureKey}`, prev ? '1' : '0');
        Alert.alert(t('error'), error);
      }
    },
    [authStaff?.id, saveStaffPreference, soundFeaturePrefs, t]
  );

  const setFeaturePref = useCallback(
    async (entry: StaffNotifPrefEntry, enabled: boolean) => {
      if (!authStaff?.id) return;
      const prev = featurePrefs[entry.prefKey] ?? true;
      setFeaturePrefs((current) => ({ ...current, [entry.prefKey]: enabled }));
      const { error } = await saveStaffPreference(staffNotifPrefDbKey(entry.prefKey), enabled);
      if (error) {
        setFeaturePrefs((current) => ({ ...current, [entry.prefKey]: prev }));
        Alert.alert(t('error'), error);
      }
    },
    [authStaff?.id, featurePrefs, saveStaffPreference, t]
  );

  const renderToggleRow = (
    key: string,
    title: string,
    hint: string,
    value: boolean,
    onChange: (v: boolean) => void,
    disabled: boolean,
    isLast?: boolean
  ) => (
    <View key={key} style={[styles.row, isLast && styles.rowLast]}>
      <View style={styles.textCol}>
        <Text style={styles.label}>{title}</Text>
        <Text style={styles.hint}>{hint}</Text>
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ false: theme.colors.borderLight, true: theme.colors.primary }}
        thumbColor={theme.colors.surface}
      />
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: t('notificationPrefsShort'), headerBackTitle: t('back') }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>{t('staffNotifPrefsIntro')}</Text>

        <Text style={styles.sectionTitle}>{t('staffNotifGeneralSection')}</Text>
        <View style={styles.card}>
          {renderToggleRow(
            'all-staff',
            t('staffNotifAllStaffGroupTitle'),
            t('staffNotifAllStaffGroupHint'),
            allStaffMessagesEnabled,
            async (v) => {
              if (!authStaff?.id || !allStaffConvId) return;
              const { error } = await staffSetConversationMuted(allStaffConvId, authStaff.id, !v);
              if (error) Alert.alert(t('error'), error);
              else setAllStaffMessagesEnabled(v);
            },
            !ready || !authStaff?.id || !allStaffConvId
          )}
          {renderToggleRow(
            'feed',
            t('staffNotifPostsTitle'),
            t('staffNotifPostsHint'),
            feedNotificationsEnabled,
            async (v) => {
              if (!authStaff?.id) return;
              setFeedNotificationsEnabled(v);
              const { error } = await saveStaffPreference('mute_feed_notifications', !v);
              if (error) {
                setFeedNotificationsEnabled(!v);
                Alert.alert(t('error'), error);
              }
            },
            !ready || !authStaff?.id,
            true
          )}
        </View>

        <Text style={styles.sectionTitle}>{t('staffNotifMandatoryOpen')}</Text>
        <View style={styles.card}>
          {renderToggleRow(
            'msg-mandatory',
            t('staffNotifMessagesTitle'),
            t('staffNotifMessagesHint'),
            true,
            () => {},
            true
          )}
          {renderToggleRow(
            'admin-mandatory',
            t('staffNotifAdminAnnouncementsTitle'),
            t('staffNotifAdminAnnouncementsHint'),
            true,
            () => {},
            true
          )}
          {renderToggleRow(
            'emergency-mandatory',
            t('staffNotifSoundEmergencyTitle'),
            t('staffNotifSoundEmergencyHint'),
            true,
            () => {},
            true,
            true
          )}
        </View>

        <Text style={styles.sectionTitle}>{t('staffNotifFeatureBasedTitle')}</Text>
        <Text style={styles.sectionHint}>{t('staffNotifFeatureBasedSubtitle')}</Text>
        <View style={styles.card}>
          {deliveryToggles.map((item, index) =>
            renderToggleRow(
              item.prefKey,
              t(item.titleKey),
              t(item.hintKey),
              featurePrefs[item.prefKey] ?? true,
              (v) => {
                void setFeaturePref(item, v);
              },
              !ready || !authStaff?.id,
              index === deliveryToggles.length - 1
            )
          )}
        </View>

        <Text style={styles.sectionTitle}>{t('staffNotifSoundPrefsTitle')}</Text>
        <Text style={styles.sectionHint}>{t('staffNotifSoundPrefsSubtitle')}</Text>
        <View style={styles.card}>
          {renderToggleRow(
            'sound-master',
            t('staffNotifSoundMasterTitle'),
            t('staffNotifSoundMasterHint'),
            soundMasterEnabled,
            async (v) => {
              if (!authStaff?.id) return;
              setSoundMasterEnabled(v);
              await AsyncStorage.setItem(STAFF_SOUND_MASTER_KEY, v ? '1' : '0');
              const { error } = await saveStaffPreference('staff_notif_sounds_master', v);
              if (error) {
                setSoundMasterEnabled(!v);
                await AsyncStorage.setItem(STAFF_SOUND_MASTER_KEY, !v ? '1' : '0');
                Alert.alert(t('error'), error);
              }
            },
            !ready || !authStaff?.id
          )}
          {soundToggles.map((f, index) =>
            renderToggleRow(
              `sound-${f.featureKey}`,
              t(`staffNotifSoundFeat_${f.featureKey}_title`, { defaultValue: f.titleTr }),
              t(`staffNotifSoundFeat_${f.featureKey}_hint`, { defaultValue: f.descriptionTr }),
              soundFeaturePrefs[f.featureKey] ?? true,
              (v) => {
                void setSoundFeaturePref(f.featureKey, v);
              },
              !ready || !authStaff?.id || !soundMasterEnabled,
              index === soundToggles.length - 1
            )
          )}
        </View>

        <Text style={styles.sectionTitle}>{t('staffNotifSoundsTitle')}</Text>
        <View style={styles.card}>
          {renderToggleRow(
            'room-cleaning-sound',
            t('staffNotifRoomCleaningMarkSoundTitle'),
            t('staffNotifRoomCleaningMarkSoundHint'),
            roomCleaningMarkSoundEnabled,
            async (v) => {
              if (!authStaff?.id) return;
              const prev = roomCleaningMarkSoundEnabled;
              setRoomCleaningMarkSoundEnabled(v);
              const { error } = await saveStaffPreference('staff_notif_room_cleaning_mark_sound', v);
              if (error) {
                setRoomCleaningMarkSoundEnabled(prev);
                await AsyncStorage.setItem(STAFF_ROOM_CLEANING_SOUND_PREF_KEY, prev ? '1' : '0');
                Alert.alert(t('error'), error);
                return;
              }
              await AsyncStorage.setItem(STAFF_ROOM_CLEANING_SOUND_PREF_KEY, v ? '1' : '0');
            },
            !ready || !authStaff?.id,
            true
          )}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: theme.spacing.lg },
  intro: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: theme.spacing.md, lineHeight: 20 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  sectionTitle: {
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sectionHint: {
    marginTop: -4,
    marginBottom: theme.spacing.sm,
    fontSize: 12,
    color: theme.colors.textMuted,
    lineHeight: 17,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
    gap: 12,
  },
  rowLast: { borderBottomWidth: 0 },
  textCol: { flex: 1, minWidth: 0, paddingRight: 8 },
  label: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  hint: { marginTop: 3, fontSize: 12, color: theme.colors.textMuted, lineHeight: 17 },
});
