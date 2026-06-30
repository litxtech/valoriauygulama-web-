import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { sendBulkToStaff } from '@/lib/notificationService';
import { GlassSurface } from '@/components/premium/GlassSurface';
import { CleaningJobCard } from '@/components/staff/CleaningJobCard';
import { usePersonelDesign } from '@/hooks/usePersonelDesign';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';
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

function applyBundleToState(
  bundle: CleaningPlanBundle,
  setters: {
    setAssignments: (v: CleaningAssignmentRow[]) => void;
    setPlansById: (v: Record<string, CleaningPlanRow>) => void;
    setPlanRoomsByPlanId: (v: Record<string, CleaningPlanRoomRow[]>) => void;
    setRoomMetaByRoomId: (v: Record<string, CleaningRoomMeta>) => void;
    setNotesByAssignmentId: (v: Record<string, string>) => void;
    setStaffNamesByPlanId: (v: Record<string, string[]>) => void;
  }
) {
  setters.setAssignments(bundle.assignments);
  setters.setPlansById(bundle.plansById);
  setters.setPlanRoomsByPlanId(bundle.planRoomsByPlanId);
  setters.setRoomMetaByRoomId(bundle.roomMetaByRoomId);
  setters.setStaffNamesByPlanId(bundle.staffNamesByPlanId ?? {});
  setters.setNotesByAssignmentId(
    Object.fromEntries(bundle.assignments.map((a) => [a.id, a.staff_note || '']))
  );
}

export default function StaffCleaningPlanScreen() {
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
  const [staffNamesByPlanId, setStaffNamesByPlanId] = useState<Record<string, string[]>>({});

  const planIdSet = useMemo(() => new Set(assignments.map((a) => a.plan_id)), [assignments]);

  const applyBundle = useCallback((bundle: CleaningPlanBundle) => {
    applyBundleToState(bundle, {
      setAssignments,
      setPlansById,
      setPlanRoomsByPlanId,
      setRoomMetaByRoomId,
      setNotesByAssignmentId,
      setStaffNamesByPlanId,
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
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [staff?.id, planIdSet, loadData]);

  async function submitCompletion(assignment: CleaningAssignmentRow) {
    if (!staff?.id) {
      Alert.alert(t('error'), t('assignPage_errSession'));
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
        { text: t('cleaningPage_confirmYes'), onPress: () => void executeCompletion(assignment, planRooms) },
      ]
    );
  }

  async function executeCompletion(assignment: CleaningAssignmentRow, planRooms: CleaningPlanRoomRow[]) {
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

  const pageBg = isNight ? pds.pageBg : '#f8fafc';

  if (loading && assignments.length === 0) {
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
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {activeAssignments.length === 0 ? (
        <GlassSurface style={styles.emptyCard} borderRadius={14}>
          <Ionicons name="bed-outline" size={32} color={pds.muted} />
          <Text style={[styles.emptyText, { color: pds.subtext }]}>{t('cleaningPage_emptyActive')}</Text>
        </GlassSurface>
      ) : (
        activeAssignments.map((a) => {
          const plan = plansById[a.plan_id];
          if (!plan) return null;
          const planRooms = planRoomsByPlanId[a.plan_id] ?? [];

          return (
            <CleaningJobCard
              key={a.id}
              plan={plan}
              planRooms={planRooms}
              roomMetaByRoomId={roomMetaByRoomId}
              assignedNames={staffNamesByPlanId[a.plan_id] ?? []}
              note={notesByAssignmentId[a.id] ?? ''}
              onNoteChange={(v) => setNotesByAssignmentId((prev) => ({ ...prev, [a.id]: v }))}
              onSubmit={() => void submitCompletion(a)}
              saving={savingId === a.id}
              locale={locale}
              t={t}
              pds={pds}
              isNight={isNight}
            />
          );
        })
      )}

      {completedAssignments.length > 0 ? (
        <>
          <Text style={[styles.completedSectionTitle, { color: pds.text }]}>{t('cleaningPage_completedSection')}</Text>
          {completedAssignments.map((a) => {
            const plan = plansById[a.plan_id];
            const planRooms = planRoomsByPlanId[a.plan_id] ?? [];
            const dateLabel = formatPlanDate(plan?.target_date, locale) || t('cleaningPage_dateUnknown');
            const roomNumbers = planRooms
              .map((r) => roomMetaByRoomId[r.room_id]?.room_number)
              .filter(Boolean)
              .join(', ');

            return (
              <View
                key={`completed-${a.id}`}
                style={[
                  styles.completedCard,
                  { borderColor: pds.cardBorder, backgroundColor: isNight ? pds.cardBg : '#fff' },
                ]}
              >
                <View style={styles.completedHeader}>
                  <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
                  <Text style={[styles.completedDate, { color: pds.text }]}>{dateLabel}</Text>
                </View>
                <Text style={[styles.completedRooms, { color: pds.text }]}>{roomNumbers}</Text>
                {(staffNamesByPlanId[a.plan_id] ?? []).length > 0 ? (
                  <Text style={[styles.completedAssignees, { color: pds.subtext }]}>
                    {t('cleaningPage_assignees')}: {(staffNamesByPlanId[a.plan_id] ?? []).join(', ')}
                  </Text>
                ) : null}
                {(a.staff_note || '').trim() ? (
                  <Text style={[styles.completedNote, { color: pds.subtext }]}>{a.staff_note}</Text>
                ) : null}
              </View>
            );
          })}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 14 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyCard: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  emptyText: { fontSize: 14, textAlign: 'center', paddingHorizontal: 20 },
  completedSectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 8, marginBottom: 10 },
  completedCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginBottom: 8,
    gap: 4,
  },
  completedHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  completedDate: { fontSize: 14, fontWeight: '700' },
  completedRooms: { fontSize: 15, fontWeight: '600', marginTop: 2 },
  completedAssignees: { fontSize: 13, marginTop: 4, fontWeight: '500' },
  completedNote: { fontSize: 13, marginTop: 4, fontStyle: 'italic' },
});
