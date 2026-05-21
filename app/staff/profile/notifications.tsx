import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Switch, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { staffSetConversationMuted } from '@/lib/messagingApi';

type FeatureToggleDef = {
  key: string;
  titleKey: string;
  hintKey: string;
};

const STAFF_ROOM_CLEANING_SOUND_PREF_KEY = 'staff_notif_room_cleaning_mark_sound_enabled';
const STAFF_FEATURE_SOUND_PREF_KEY_PREFIX = 'staff_notif_sound_enabled:';

const FEATURE_TOGGLES: FeatureToggleDef[] = [
  {
    key: 'stock_pending_approval',
    titleKey: 'staffNotifStockMovementsTitle',
    hintKey: 'staffNotifStockMovementsHint',
  },
  {
    key: 'staff_assignment',
    titleKey: 'staffNotifAssignmentsTitle',
    hintKey: 'staffNotifAssignmentsHint',
  },
  {
    key: 'feed_like',
    titleKey: 'staffNotifFeedLikesTitle',
    hintKey: 'staffNotifFeedLikesHint',
  },
  {
    key: 'feed_comment',
    titleKey: 'staffNotifFeedCommentsTitle',
    hintKey: 'staffNotifFeedCommentsHint',
  },
  {
    key: 'feed_comment_reply',
    titleKey: 'staffNotifCommentRepliesTitle',
    hintKey: 'staffNotifCommentRepliesHint',
  },
  {
    key: 'story_like',
    titleKey: 'staffNotifStoryLikesTitle',
    hintKey: 'staffNotifStoryLikesHint',
  },
  {
    key: 'story_reply',
    titleKey: 'staffNotifStoryRepliesTitle',
    hintKey: 'staffNotifStoryRepliesHint',
  },
  {
    key: 'group_added',
    titleKey: 'staffNotifGroupAddedTitle',
    hintKey: 'staffNotifGroupAddedHint',
  },
  {
    key: 'salary_deposited',
    titleKey: 'staffNotifSalaryDepositedTitle',
    hintKey: 'staffNotifSalaryDepositedHint',
  },
  {
    key: 'salary_reminder',
    titleKey: 'staffNotifSalaryReminderTitle',
    hintKey: 'staffNotifSalaryReminderHint',
  },
  {
    key: 'report_status',
    titleKey: 'staffNotifReportUpdatesTitle',
    hintKey: 'staffNotifReportUpdatesHint',
  },
  {
    key: 'staff_mention',
    titleKey: 'staffNotifMentionTitle',
    hintKey: 'staffNotifMentionHint',
  },
  {
    key: 'staff_meal_menu_daily',
    titleKey: 'staffNotifMealMenuDailyTitle',
    hintKey: 'staffNotifMealMenuDailyHint',
  },
];

export default function StaffNotificationPrefsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const authStaff = useAuthStore((s) => s.staff);
  const [allStaffConvId, setAllStaffConvId] = useState<string | null>(null);
  const [allStaffMessagesEnabled, setAllStaffMessagesEnabled] = useState(true);
  const [feedNotificationsEnabled, setFeedNotificationsEnabled] = useState(true);
  const [roomCleaningMarkSoundEnabled, setRoomCleaningMarkSoundEnabled] = useState(true);
  const [featurePrefs, setFeaturePrefs] = useState<Record<string, boolean>>({});
  const [ready, setReady] = useState(false);

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
    const feedMuted = !!(feedPref as { enabled?: boolean } | null)?.enabled;
    setFeedNotificationsEnabled(!feedMuted);
    const { data: roomCleaningSoundPref } = await supabase
      .from('notification_preferences')
      .select('enabled')
      .eq('staff_id', authStaff.id)
      .eq('pref_key', 'staff_notif_room_cleaning_mark_sound')
      .maybeSingle();
    const roomCleaningSoundEnabled = (roomCleaningSoundPref as { enabled?: boolean } | null)?.enabled ?? true;
    setRoomCleaningMarkSoundEnabled(roomCleaningSoundEnabled);
    await AsyncStorage.setItem(STAFF_ROOM_CLEANING_SOUND_PREF_KEY, roomCleaningSoundEnabled ? '1' : '0');

    const prefKeys = FEATURE_TOGGLES.map((item) => `staff_notif_${item.key}`);
    const { data: prefRows, error: prefsError } = await supabase
      .from('notification_preferences')
      .select('pref_key, enabled')
      .eq('staff_id', authStaff.id)
      .in('pref_key', prefKeys);
    if (!prefsError) {
      const next: Record<string, boolean> = {};
      FEATURE_TOGGLES.forEach((item) => {
        const row = (prefRows ?? []).find((r: { pref_key?: string }) => r.pref_key === `staff_notif_${item.key}`);
        next[item.key] = row ? !!(row as { enabled?: boolean }).enabled : true;
      });
      setFeaturePrefs(next);
      await Promise.all(
        Object.entries(next).map(([featureKey, enabled]) =>
          AsyncStorage.setItem(`${STAFF_FEATURE_SOUND_PREF_KEY_PREFIX}${featureKey}`, enabled ? '1' : '0')
        )
      );
    }
    setReady(true);
  }, [authStaff?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const setFeaturePref = useCallback(
    async (featureKey: string, enabled: boolean) => {
      if (!authStaff?.id) return;
      const prev = featurePrefs[featureKey] ?? true;
      setFeaturePrefs((current) => ({ ...current, [featureKey]: enabled }));
      await AsyncStorage.setItem(`${STAFF_FEATURE_SOUND_PREF_KEY_PREFIX}${featureKey}`, enabled ? '1' : '0');
      const { error } = await saveStaffPreference(`staff_notif_${featureKey}`, enabled);
      if (error) {
        setFeaturePrefs((current) => ({ ...current, [featureKey]: prev }));
        await AsyncStorage.setItem(`${STAFF_FEATURE_SOUND_PREF_KEY_PREFIX}${featureKey}`, prev ? '1' : '0');
        Alert.alert(t('error'), error);
      }
    },
    [authStaff?.id, featurePrefs, saveStaffPreference, t]
  );

  return (
    <>
      <Stack.Screen options={{ title: t('notificationPrefsShort'), headerBackTitle: t('back') }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>{t('notificationsSection')}</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.textCol}>
              <Text style={styles.label}>{t('staffNotifAllStaffGroupTitle')}</Text>
              <Text style={styles.hint}>{t('staffNotifAllStaffGroupHint')}</Text>
            </View>
            <Switch
              value={allStaffMessagesEnabled}
              disabled={!ready || !authStaff?.id || !allStaffConvId}
              onValueChange={async (v) => {
                if (!authStaff?.id || !allStaffConvId) return;
                const { error } = await staffSetConversationMuted(allStaffConvId, authStaff.id, !v);
                if (error) Alert.alert(t('error'), error);
                else setAllStaffMessagesEnabled(v);
              }}
              trackColor={{ false: theme.colors.borderLight, true: theme.colors.primary }}
              thumbColor={theme.colors.surface}
            />
          </View>
          <View style={[styles.row, styles.rowLast]}>
            <View style={styles.textCol}>
              <Text style={styles.label}>{t('staffNotifPostsTitle')}</Text>
              <Text style={styles.hint}>{t('staffNotifPostsHint')}</Text>
            </View>
            <Switch
              value={feedNotificationsEnabled}
              disabled={!ready || !authStaff?.id}
              onValueChange={async (v) => {
                if (!authStaff?.id) return;
                setFeedNotificationsEnabled(v);
                const { error } = await saveStaffPreference('mute_feed_notifications', !v);
                if (error) {
                  setFeedNotificationsEnabled(!v);
                  Alert.alert(t('error'), error);
                }
              }}
              trackColor={{ false: theme.colors.borderLight, true: theme.colors.primary }}
              thumbColor={theme.colors.surface}
            />
          </View>
        </View>

        <Text style={styles.sectionTitle}>{t('staffNotifSoundsTitle')}</Text>
        <View style={styles.card}>
          <View style={[styles.row, styles.rowLast]}>
            <View style={styles.textCol}>
              <Text style={styles.label}>{t('staffNotifRoomCleaningMarkSoundTitle')}</Text>
              <Text style={styles.hint}>{t('staffNotifRoomCleaningMarkSoundHint')}</Text>
            </View>
            <Switch
              value={roomCleaningMarkSoundEnabled}
              disabled={!ready || !authStaff?.id}
              onValueChange={async (v) => {
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
              }}
              trackColor={{ false: theme.colors.borderLight, true: theme.colors.primary }}
              thumbColor={theme.colors.surface}
            />
          </View>
        </View>

        <Text style={styles.sectionTitle}>{t('staffNotifMandatoryOpen')}</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.textCol}>
              <Text style={styles.label}>{t('staffNotifMessagesTitle')}</Text>
              <Text style={styles.hint}>{t('staffNotifMessagesHint')}</Text>
            </View>
            <Switch value disabled />
          </View>
          <View style={[styles.row, styles.rowLast]}>
            <View style={styles.textCol}>
              <Text style={styles.label}>{t('staffNotifAdminAnnouncementsTitle')}</Text>
              <Text style={styles.hint}>{t('staffNotifAdminAnnouncementsHint')}</Text>
            </View>
            <Switch value disabled />
          </View>
        </View>

        <Text style={styles.sectionTitle}>{t('staffNotifFeatureBasedTitle')}</Text>
        <View style={styles.card}>
          {FEATURE_TOGGLES.map((item, index) => (
            <View key={item.key} style={[styles.row, index === FEATURE_TOGGLES.length - 1 && styles.rowLast]}>
              <View style={styles.textCol}>
                <Text style={styles.label}>{t(item.titleKey)}</Text>
                <Text style={styles.hint}>{t(item.hintKey)}</Text>
              </View>
              <Switch
                value={featurePrefs[item.key] ?? true}
                disabled={!ready || !authStaff?.id}
                onValueChange={(v) => {
                  setFeaturePref(item.key, v).catch(() => {});
                }}
                trackColor={{ false: theme.colors.borderLight, true: theme.colors.primary }}
                thumbColor={theme.colors.surface}
              />
            </View>
          ))}
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
