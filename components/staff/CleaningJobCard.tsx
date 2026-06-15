import { View, Text, StyleSheet, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { TFunction } from 'i18next';
import { RoomsToCleanBoard } from '@/components/staff/RoomsToCleanBoard';
import { PressableScale } from '@/components/premium/PressableScale';
import {
  ROOM_CLEANING_CHECKLIST_KEYS,
  cleaningChecklistLabel,
  type RoomCleaningChecklistKey,
} from '@/lib/roomCleaningChecklist';
import type {
  CleaningPlanRow,
  CleaningPlanRoomRow,
  CleaningRoomMeta,
} from '@/lib/cleaningPlanLoad';
import type { usePersonelDesign } from '@/hooks/usePersonelDesign';

const ACCENT = '#0d9488';
const ACCENT_LIGHT = '#14b8a6';

function StepHeader({
  step,
  title,
  hint,
  pds,
  done,
}: {
  step: number;
  title: string;
  hint: string;
  pds: ReturnType<typeof usePersonelDesign>;
  done?: boolean;
}) {
  return (
    <View style={stepStyles.head}>
      <View style={[stepStyles.badge, done && stepStyles.badgeDone]}>
        {done ? (
          <Ionicons name="checkmark" size={12} color="#fff" />
        ) : (
          <Text style={stepStyles.badgeNum}>{step}</Text>
        )}
      </View>
      <View style={stepStyles.textCol}>
        <Text style={[stepStyles.title, { color: pds.text }]}>{title}</Text>
        <Text style={[stepStyles.hint, { color: pds.subtext }]} numberOfLines={2}>
          {hint}
        </Text>
      </View>
    </View>
  );
}

type Props = {
  plan: CleaningPlanRow;
  planRooms: CleaningPlanRoomRow[];
  roomMetaByRoomId: Record<string, CleaningRoomMeta>;
  checklist: Record<RoomCleaningChecklistKey, boolean>;
  note: string;
  onNoteChange: (v: string) => void;
  onToggleCheck: (key: RoomCleaningChecklistKey) => void;
  onSubmit: () => void;
  saving: boolean;
  checklistReady: boolean;
  locale: string;
  t: TFunction;
  pds: ReturnType<typeof usePersonelDesign>;
  isNight: boolean;
};

export function CleaningJobCard({
  plan,
  planRooms,
  roomMetaByRoomId,
  checklist,
  note,
  onNoteChange,
  onToggleCheck,
  onSubmit,
  saving,
  checklistReady,
  locale,
  t,
  pds,
  isNight,
}: Props) {
  const checkedCount = ROOM_CLEANING_CHECKLIST_KEYS.filter((k) => checklist[k]).length;
  const checklistTotal = ROOM_CLEANING_CHECKLIST_KEYS.length;
  const progressPct = checklistTotal > 0 ? Math.round((checkedCount / checklistTotal) * 100) : 0;

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: pds.cardBorder,
          backgroundColor: isNight ? pds.cardBg : '#fff',
          ...(isNight ? {} : styles.cardShadow),
        },
      ]}
    >
      <StepHeader
        step={1}
        title={t('cleaningPage_step1Title')}
        hint={t('cleaningPage_step1Hint')}
        pds={pds}
      />
      <RoomsToCleanBoard
        plan={plan}
        planRooms={planRooms}
        roomMetaByRoomId={roomMetaByRoomId}
        locale={locale}
        t={t}
        pds={pds}
        isNight={isNight}
      />

      {!!plan.note && (
        <View style={[styles.adminNote, { backgroundColor: isNight ? 'rgba(20,184,166,0.1)' : '#f0fdfa' }]}>
          <Ionicons name="megaphone-outline" size={14} color={ACCENT} />
          <View style={styles.adminNoteCol}>
            <Text style={styles.adminNoteLabel}>{t('cleaningPage_adminNote')}</Text>
            <Text style={[styles.adminNoteText, { color: pds.text }]}>{plan.note}</Text>
          </View>
        </View>
      )}

      <View style={[styles.divider, { backgroundColor: isNight ? pds.cardBorder : '#f1f5f9' }]} />

      <StepHeader
        step={2}
        title={t('cleaningPage_step2Title')}
        hint={t('cleaningPage_step2Hint')}
        pds={pds}
        done={checklistReady}
      />
      <View style={styles.progressRow}>
        <View style={[styles.progressTrack, { backgroundColor: isNight ? 'rgba(255,255,255,0.08)' : '#e2e8f0' }]}>
          <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
        </View>
        <Text style={[styles.progressLabel, { color: pds.subtext }]}>
          {checkedCount}/{checklistTotal}
        </Text>
      </View>
      <View style={styles.checklist}>
        {ROOM_CLEANING_CHECKLIST_KEYS.map((key) => {
          const on = checklist[key] ?? false;
          return (
            <PressableScale
              key={key}
              onPress={() => onToggleCheck(key)}
              style={[
                styles.checkRow,
                {
                  borderColor: on ? ACCENT + '66' : pds.cardBorder,
                  backgroundColor: on
                    ? isNight
                      ? 'rgba(13,148,136,0.12)'
                      : '#f0fdfa'
                    : isNight
                      ? pds.pageBg
                      : '#fafafa',
                },
              ]}
            >
              <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={on ? ACCENT : pds.muted} />
              <Text style={[styles.checkLabel, { color: pds.text }]} numberOfLines={2}>
                {cleaningChecklistLabel(key)}
              </Text>
            </PressableScale>
          );
        })}
      </View>

      <View style={[styles.divider, { backgroundColor: isNight ? pds.cardBorder : '#f1f5f9' }]} />

      <StepHeader step={3} title={t('cleaningPage_step3Title')} hint={t('cleaningPage_step3Hint')} pds={pds} />
      <TextInput
        style={[
          styles.noteInput,
          { borderColor: pds.cardBorder, backgroundColor: isNight ? pds.pageBg : '#fafafa', color: pds.text },
        ]}
        placeholder={t('cleaningPage_notePh')}
        placeholderTextColor={pds.muted}
        value={note}
        onChangeText={onNoteChange}
        multiline
        textAlignVertical="top"
      />

      <PressableScale
        onPress={onSubmit}
        disabled={saving || !checklistReady}
        style={[styles.submitBtn, (saving || !checklistReady) && styles.submitDisabled]}
      >
        <LinearGradient
          colors={checklistReady ? [ACCENT_LIGHT, ACCENT] : ['#cbd5e1', '#94a3b8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.submitGrad}
        >
          {saving ? (
            <Text style={styles.submitText}>{t('cleaningPage_bulkSubmitting')}</Text>
          ) : (
            <>
              <Ionicons name="shield-checkmark" size={16} color="#fff" />
              <Text style={styles.submitText}>{t('cleaningPage_bulkSubmit')}</Text>
            </>
          )}
        </LinearGradient>
      </PressableScale>
      {!checklistReady ? (
        <Text style={[styles.submitHint, { color: pds.muted }]}>{t('cleaningPage_checklistIncomplete')}</Text>
      ) : null}
    </View>
  );
}

const stepStyles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  badgeDone: { backgroundColor: '#16a34a' },
  badgeNum: { color: '#fff', fontSize: 12, fontWeight: '800' },
  textCol: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  hint: { fontSize: 12, lineHeight: 17, marginTop: 2 },
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 12,
  },
  cardShadow: {
    shadowColor: '#0f766e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  adminNote: {
    flexDirection: 'row',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    marginTop: 10,
  },
  adminNoteCol: { flex: 1 },
  adminNoteLabel: { fontSize: 10, fontWeight: '700', color: ACCENT, textTransform: 'uppercase', letterSpacing: 0.4 },
  adminNoteText: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  divider: { height: 1, marginVertical: 14 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  progressTrack: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2, backgroundColor: ACCENT },
  progressLabel: { fontSize: 11, fontWeight: '700', minWidth: 32, textAlign: 'right' },
  checklist: { gap: 6 },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  checkLabel: { flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 18 },
  noteInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 52,
    fontSize: 14,
    marginBottom: 12,
  },
  submitBtn: { borderRadius: 12, overflow: 'hidden', alignSelf: 'stretch' },
  submitDisabled: { opacity: 0.65 },
  submitGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  submitText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  submitHint: { fontSize: 11, textAlign: 'center', marginTop: 8 },
});
