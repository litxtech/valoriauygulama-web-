import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { sendBulkToStaff } from '@/lib/notificationService';
import { GlassSurface } from '@/components/premium/GlassSurface';
import { PressableScale } from '@/components/premium/PressableScale';
import { CleaningJobCard } from '@/components/staff/CleaningJobCard';
import { usePersonelDesign } from '@/hooks/usePersonelDesign';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';
import {
  ROOM_CLEANING_CHECKLIST_KEYS,
  cleaningChecklistLabel,
  emptyCleaningChecklist,
  isCleaningChecklistComplete,
  parseCleaningChecklist,
  type RoomCleaningChecklistKey,
} from '@/lib/roomCleaningChecklist';
import {
  fetchStaffCleaningPlanBundle,
  type CleaningAssignmentRow,
  type CleaningPlanRow,
  type CleaningPlanRoomRow,
  type CleaningRoomMeta,
  type CleaningPlanBundle,
} from '@/lib/cleaningPlanLoad';
import {
  getCleaningPlanSessionCacheStale,
  isCleaningPlanCacheFresh,
  setCleaningPlanSessionCache,
  invalidateCleaningPlanSessionCache,
} from '@/lib/cleaningPlanCache';

const CLEANING_ACCENT = '#0d9488';

function formatPlanDate(iso: string | undefined, locale: string): string {
  if (!iso) return '';
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
    });
  } catch {
    return iso;
  }
}

function LivePulse({ label }: { label: string }) {
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={liveStyles.wrap}>
      <Animated.View style={[liveStyles.dot, { opacity: pulse, transform: [{ scale: pulse }] }]} />
      <Text style={liveStyles.text}>{label}</Text>
    </View>
  );
}

function applyBundleToState(
  bundle: CleaningPlanBundle,
  setters: {
    setAssignments: (v: CleaningAssignmentRow[]) => void;
    setPlansById: (v: Record<string, CleaningPlanRow>) => void;
    setPlanRoomsByPlanId: (v: Record<string, CleaningPlanRoomRow[]>) => void;
    setRoomMetaByRoomId: (v: Record<string, CleaningRoomMeta>) => void;
    setNotesByAssignmentId: (v: Record<string, string>) => void;
    setChecklistByAssignmentId: (v: Record<string, Record<RoomCleaningChecklistKey, boolean>>) => void;
  }
) {
  setters.setAssignments(bundle.assignments);
  setters.setPlansById(bundle.plansById);
  setters.setPlanRoomsByPlanId(bundle.planRoomsByPlanId);
  setters.setRoomMetaByRoomId(bundle.roomMetaByRoomId);
  setters.setNotesByAssignmentId(
    Object.fromEntries(bundle.assignments.map((a) => [a.id, a.staff_note || '']))
  );
  setters.setChecklistByAssignmentId(
    Object.fromEntries(
      bundle.assignments.map((a) => [
        a.id,
        a.completed_at ? parseCleaningChecklist(a.completion_checklist) : emptyCleaningChecklist(),
      ])
    )
  );
}

export default function StaffCleaningPlanScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const pds = usePersonelDesign();
  const { isNight } = usePremiumTheme();
  const staff = useAuthStore((s) => s.staff);
  const locale = (i18n.language || 'tr').split('-')[0];

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<CleaningAssignmentRow[]>([]);
  const [plansById, setPlansById] = useState<Record<string, CleaningPlanRow>>({});
  const [planRoomsByPlanId, setPlanRoomsByPlanId] = useState<Record<string, CleaningPlanRoomRow[]>>({});
  const [roomMetaByRoomId, setRoomMetaByRoomId] = useState<Record<string, CleaningRoomMeta>>({});
  const [notesByAssignmentId, setNotesByAssignmentId] = useState<Record<string, string>>({});
  const [checklistByAssignmentId, setChecklistByAssignmentId] = useState<
    Record<string, Record<RoomCleaningChecklistKey, boolean>>
  >({});
  const [liveConnected, setLiveConnected] = useState(false);

  const planIdSet = useMemo(() => new Set(assignments.map((a) => a.plan_id)), [assignments]);

  const applyBundle = useCallback((bundle: CleaningPlanBundle) => {
    applyBundleToState(bundle, {
      setAssignments,
      setPlansById,
      setPlanRoomsByPlanId,
      setRoomMetaByRoomId,
      setNotesByAssignmentId,
      setChecklistByAssignmentId,
    });
  }, []);

  const loadData = useCallback(
    async (silent = false) => {
      if (!staff?.id) {
        setLoading(false);
        setRefreshing(false);
        return;
      }
      if (!silent) {
        const stale = getCleaningPlanSessionCacheStale(staff.id);
        if (!stale) setLoading(true);
      }
      const bundle = await fetchStaffCleaningPlanBundle(staff.id);
      if (bundle) {
        applyBundle(bundle);
        setCleaningPlanSessionCache(staff.id, bundle);
      }
      setLoading(false);
      setRefreshing(false);
    },
    [staff?.id, applyBundle]
  );

  useFocusEffect(
    useCallback(() => {
      if (!staff?.id) return;
      const stale = getCleaningPlanSessionCacheStale(staff.id);
      if (stale) {
        applyBundle(stale);
        setLoading(false);
      }
      if (!isCleaningPlanCacheFresh(staff.id)) {
        void loadData(!!stale);
      }
    }, [staff?.id, applyBundle, loadData])
  );

  useEffect(() => {
    if (!staff?.id) return;
    const channel = supabase
      .channel(`staff_cleaning_live_${staff.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_cleaning_plan_rooms' },
        (payload) => {
          const row = (payload.new ?? payload.old) as CleaningPlanRoomRow | undefined;
          if (!row?.plan_id || !planIdSet.has(row.plan_id)) return;
          if (payload.eventType === 'DELETE') {
            invalidateCleaningPlanSessionCache();
            void loadData(true);
            return;
          }
          const updated = payload.new as CleaningPlanRoomRow;
          setPlanRoomsByPlanId((prev) => {
            const list = prev[updated.plan_id];
            if (!list?.some((r) => r.id === updated.id)) return prev;
            return {
              ...prev,
              [updated.plan_id]: list.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)),
            };
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'room_cleaning_plan_assignments',
          filter: `staff_id=eq.${staff.id}`,
        },
        () => {
          invalidateCleaningPlanSessionCache();
          void loadData(true);
        }
      )
      .subscribe((status) => {
        setLiveConnected(status === 'SUBSCRIBED');
      });
    return () => {
      setLiveConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [staff?.id, planIdSet, loadData]);

  const toggleChecklistItem = (assignmentId: string, key: RoomCleaningChecklistKey) => {
    setChecklistByAssignmentId((prev) => ({
      ...prev,
      [assignmentId]: {
        ...(prev[assignmentId] ?? emptyCleaningChecklist()),
        [key]: !(prev[assignmentId]?.[key] ?? false),
      },
    }));
  };

  async function submitBulkCompletion(assignment: CleaningAssignmentRow) {
    if (!staff?.id) {
      Alert.alert(t('error'), t('assignPage_errSession'));
      return;
    }
    const checklist = checklistByAssignmentId[assignment.id] ?? emptyCleaningChecklist();
    if (!isCleaningChecklistComplete(checklist)) {
      Alert.alert(t('cleaningPage_step2Title'), t('cleaningPage_checklistIncomplete'));
      return;
    }

    const planRooms = planRoomsByPlanId[assignment.plan_id] ?? [];
    if (planRooms.length === 0) {
      Alert.alert(t('error'), t('cleaningPage_emptyActive'));
      return;
    }

    Alert.alert(
      t('cleaningPage_confirmTitle'),
      t('cleaningPage_confirmBody', { count: planRooms.length }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('cleaningPage_confirmYes'),
          onPress: () => void executeBulkCompletion(assignment, checklist, planRooms),
        },
      ]
    );
  }

  async function executeBulkCompletion(
    assignment: CleaningAssignmentRow,
    checklist: Record<RoomCleaningChecklistKey, boolean>,
    planRooms: CleaningPlanRoomRow[]
  ) {
    if (!staff?.id) return;

    const plan = plansById[assignment.plan_id];
    setSavingId(assignment.id);
    const now = new Date().toISOString();
    const staffNote = (notesByAssignmentId[assignment.id] || '').trim() || null;

    const { error: roomsErr } = await supabase
      .from('room_cleaning_plan_rooms')
      .update({
        is_done: true,
        done_at: now,
        done_by_staff_id: staff.id,
      })
      .eq('plan_id', assignment.plan_id);

    if (roomsErr) {
      setSavingId(null);
      Alert.alert(t('error'), roomsErr.message);
      return;
    }

    const { error: assignErr } = await supabase
      .from('room_cleaning_plan_assignments')
      .update({
        staff_note: staffNote,
        completed_at: now,
        completion_checklist: checklist,
      })
      .eq('id', assignment.id);

    setSavingId(null);
    if (assignErr) {
      Alert.alert(t('error'), assignErr.message);
      return;
    }

    const roomLabels = planRooms
      .map((r) => roomMetaByRoomId[r.room_id]?.room_number)
      .filter(Boolean)
      .join(', ');
    const dateLabel = plan?.target_date || t('cleaningPage_dateUnknown');

    void sendBulkToStaff({
      target: 'all_staff',
      title: t('cleaningPage_bulkNotifyTitle'),
      body: t('cleaningPage_bulkNotifyBody', {
        date: dateLabel,
        count: planRooms.length,
        rooms: roomLabels,
      }),
      createdByStaffId: staff.id,
      notificationType: 'staff_room_cleaning_plan_completed',
      category: 'staff',
      data: {
        url: '/staff/cleaning-plan',
        planId: assignment.plan_id,
        roomCount: planRooms.length,
        completedAt: now,
      },
    });

    invalidateCleaningPlanSessionCache();
    Alert.alert(
      t('cleaningPage_bulkSuccessTitle'),
      t('cleaningPage_bulkSuccessBody', { count: planRooms.length })
    );
    await loadData(true);
  }

  const sortedAssignments = useMemo(
    () =>
      [...assignments].sort((a, b) => {
        const ad = plansById[a.plan_id]?.target_date || '';
        const bd = plansById[b.plan_id]?.target_date || '';
        return bd.localeCompare(ad);
      }),
    [assignments, plansById]
  );

  const isPlanCompleted = (assignment: CleaningAssignmentRow) => {
    if (!assignment.completed_at) return false;
    const planRooms = planRoomsByPlanId[assignment.plan_id] ?? [];
    return planRooms.length > 0 && planRooms.every((r) => r.is_done);
  };

  const activeAssignments = sortedAssignments.filter((a) => !isPlanCompleted(a));
  const completedAssignments = sortedAssignments.filter((a) => isPlanCompleted(a));

  const pageBg = isNight ? pds.pageBg : '#f0fdfa';
  const hasContent = assignments.length > 0 || !loading;

  if (loading && !hasContent) {
    return (
      <View style={[styles.centered, { backgroundColor: pageBg }]}>
        <ActivityIndicator size="large" color={CLEANING_ACCENT} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: pageBg }]}
      contentContainerStyle={[styles.content, { paddingBottom: 28 + insets.bottom }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            invalidateCleaningPlanSessionCache();
            void loadData(true);
          }}
          tintColor={CLEANING_ACCENT}
          title={refreshing ? t('cleaningPage_pullRefresh') : undefined}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.heroIconWrap}>
            <Ionicons name="sparkles" size={20} color="#fff" />
          </View>
          <View style={styles.heroTextCol}>
            <Text style={styles.heroTitle}>{t('staffCleaningNavTitle')}</Text>
            <Text style={styles.heroSub}>{t('cleaningPage_subtitle')}</Text>
          </View>
          <View style={styles.heroActions}>
            {liveConnected ? <LivePulse label={t('cleaningPage_live')} /> : null}
            <PressableScale
              onPress={() => router.push('/staff/cleaning-history' as never)}
              style={styles.historyChip}
              haptic
            >
              <Ionicons name="time-outline" size={14} color="#fff" />
            </PressableScale>
          </View>
        </View>
      </View>

      {activeAssignments.length === 0 ? (
        <GlassSurface style={styles.emptyCard} borderRadius={14}>
          <Ionicons name="checkmark-done-circle-outline" size={36} color={CLEANING_ACCENT} />
          <Text style={[styles.emptyText, { color: pds.subtext }]}>{t('cleaningPage_emptyActive')}</Text>
        </GlassSurface>
      ) : (
        activeAssignments.map((a) => {
          const plan = plansById[a.plan_id];
          if (!plan) return null;
          const planRooms = planRoomsByPlanId[a.plan_id] ?? [];
          const checklistReady = isCleaningChecklistComplete(checklistByAssignmentId[a.id]);

          return (
            <CleaningJobCard
              key={a.id}
              plan={plan}
              planRooms={planRooms}
              roomMetaByRoomId={roomMetaByRoomId}
              checklist={checklistByAssignmentId[a.id] ?? emptyCleaningChecklist()}
              note={notesByAssignmentId[a.id] ?? ''}
              onNoteChange={(v) => setNotesByAssignmentId((prev) => ({ ...prev, [a.id]: v }))}
              onToggleCheck={(key) => toggleChecklistItem(a.id, key)}
              onSubmit={() => void submitBulkCompletion(a)}
              saving={savingId === a.id}
              checklistReady={checklistReady}
              locale={locale}
              t={t}
              pds={pds}
              isNight={isNight}
            />
          );
        })
      )}

      <Text style={[styles.completedSectionTitle, { color: pds.text }]}>{t('cleaningPage_completedSection')}</Text>
      {completedAssignments.length === 0 ? (
        <GlassSurface style={styles.emptyCard} borderRadius={14}>
          <Ionicons name="archive-outline" size={32} color={pds.muted} />
          <Text style={[styles.emptyText, { color: pds.subtext }]}>{t('cleaningPage_noCompleted')}</Text>
        </GlassSurface>
      ) : (
        completedAssignments.map((a) => {
          const plan = plansById[a.plan_id];
          const planRooms = planRoomsByPlanId[a.plan_id] ?? [];
          const dateLabel = formatPlanDate(plan?.target_date, locale) || t('cleaningPage_dateUnknown');
          const savedChecklist = parseCleaningChecklist(a.completion_checklist);
          return (
            <GlassSurface key={`completed-${a.id}`} style={styles.completedCard} borderRadius={14}>
              <Text style={[styles.completedCardTitle, { color: pds.text }]}>
                {t('cleaningPage_planTitle', { date: dateLabel })}
              </Text>
              <Text style={[styles.completedCardSub, { color: pds.subtext }]}>
                {t('cleaningPage_progress', { done: planRooms.length, total: planRooms.length })}
              </Text>
              <View style={[styles.doneStrip, { backgroundColor: isNight ? 'rgba(34,197,94,0.12)' : '#ecfdf5' }]}>
                <Text style={styles.doneStripText}>
                  {planRooms.map((r) => roomMetaByRoomId[r.room_id]?.room_number || '-').join(' · ')}
                </Text>
              </View>
              <View style={styles.checklistDone}>
                {ROOM_CLEANING_CHECKLIST_KEYS.filter((k) => savedChecklist[k]).map((k) => (
                  <View key={k} style={styles.checklistDoneRow}>
                    <Ionicons name="checkmark" size={14} color="#16a34a" />
                    <Text style={[styles.checklistDoneText, { color: pds.text }]}>{cleaningChecklistLabel(k)}</Text>
                  </View>
                ))}
              </View>
              <View style={[styles.savedNoteWrap, { borderColor: pds.cardBorder }]}>
                <Text style={[styles.savedNoteTitle, { color: pds.subtext }]}>{t('cleaningPage_savedNote')}</Text>
                <Text style={[styles.savedNoteText, { color: pds.text }]}>
                  {(a.staff_note || '').trim() || t('cleaningPage_noNote')}
                </Text>
              </View>
            </GlassSurface>
          );
        })
      )}
    </ScrollView>
  );
}

const liveStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4ade80' },
  text: { fontSize: 9, fontWeight: '700', color: '#ecfdf5', letterSpacing: 0.4 },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 14, gap: 2 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hero: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    backgroundColor: CLEANING_ACCENT,
  },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  heroActions: { alignItems: 'flex-end', gap: 6 },
  heroIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTextCol: { flex: 1, minWidth: 0 },
  heroTitle: { fontSize: 18, fontWeight: '800', color: '#fff', letterSpacing: -0.2 },
  heroSub: { fontSize: 12, lineHeight: 17, color: 'rgba(255,255,255,0.82)', marginTop: 3 },
  historyChip: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: { alignItems: 'center', paddingVertical: 24, gap: 8, marginBottom: 10 },
  emptyText: { fontSize: 13, textAlign: 'center', paddingHorizontal: 16 },
  doneStrip: { borderRadius: 8, padding: 8, marginTop: 6 },
  doneStripText: { fontSize: 12, color: '#166534', fontWeight: '600', lineHeight: 16 },
  checklistDone: { marginTop: 8, gap: 4 },
  checklistDoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  checklistDoneText: { fontSize: 12, flex: 1 },
  completedSectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 6, marginBottom: 8 },
  completedCard: { padding: 12, marginBottom: 8, gap: 4 },
  completedCardTitle: { fontSize: 14, fontWeight: '700' },
  completedCardSub: { fontSize: 12 },
  savedNoteWrap: { marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  savedNoteTitle: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  savedNoteText: { fontSize: 13, lineHeight: 18 },
});
