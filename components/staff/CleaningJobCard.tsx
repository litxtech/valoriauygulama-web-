import { View, Text, StyleSheet, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';
import { RoomsToCleanBoard } from '@/components/staff/RoomsToCleanBoard';
import { PressableScale } from '@/components/premium/PressableScale';
import type {
  CleaningPlanRow,
  CleaningPlanRoomRow,
  CleaningRoomMeta,
} from '@/lib/cleaningPlanLoad';
import type { usePersonelDesign } from '@/hooks/usePersonelDesign';

const ACCENT = '#0d9488';

type Props = {
  plan: CleaningPlanRow;
  planRooms: CleaningPlanRoomRow[];
  roomMetaByRoomId: Record<string, CleaningRoomMeta>;
  assignedNames?: string[];
  note: string;
  onNoteChange: (v: string) => void;
  onSubmit: () => void;
  saving: boolean;
  locale: string;
  t: TFunction;
  pds: ReturnType<typeof usePersonelDesign>;
  isNight: boolean;
};

export function CleaningJobCard({
  plan,
  planRooms,
  roomMetaByRoomId,
  assignedNames = [],
  note,
  onNoteChange,
  onSubmit,
  saving,
  locale,
  t,
  pds,
  isNight,
}: Props) {
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
      <Text style={[styles.sectionTitle, { color: pds.text }]}>{t('cleaningPage_roomsToClean')}</Text>

      <RoomsToCleanBoard
        plan={plan}
        planRooms={planRooms}
        roomMetaByRoomId={roomMetaByRoomId}
        locale={locale}
        t={t}
        pds={pds}
        isNight={isNight}
      />

      <View style={[styles.assigneeBox, { backgroundColor: isNight ? 'rgba(20,184,166,0.1)' : '#f0fdfa' }]}>
        <Ionicons name="people" size={16} color={ACCENT} />
        <View style={styles.assigneeCol}>
          <Text style={styles.assigneeLabel}>{t('cleaningPage_assignees')}</Text>
          {assignedNames.length === 0 ? (
            <Text style={[styles.assigneeText, { color: pds.subtext }]}>{t('cleaningPage_assigneesNone')}</Text>
          ) : (
            <View style={styles.assigneeChips}>
              {assignedNames.map((n) => (
                <View
                  key={n}
                  style={[styles.assigneeChip, { borderColor: isNight ? 'rgba(20,184,166,0.35)' : '#99f6e4' }]}
                >
                  <Ionicons name="person" size={11} color={ACCENT} />
                  <Text style={[styles.assigneeChipText, { color: pds.text }]}>{n}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>

      {!!plan.note && (
        <View style={[styles.adminNote, { backgroundColor: isNight ? 'rgba(20,184,166,0.1)' : '#f0fdfa' }]}>
          <Ionicons name="document-text-outline" size={16} color={ACCENT} />
          <View style={styles.adminNoteCol}>
            <Text style={styles.adminNoteLabel}>{t('cleaningPage_adminNote')}</Text>
            <Text style={[styles.adminNoteText, { color: pds.text }]}>{plan.note}</Text>
          </View>
        </View>
      )}

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
        disabled={saving}
        style={[styles.submitBtn, saving && styles.submitDisabled]}
        haptic
      >
        <Ionicons name="checkmark-circle" size={18} color="#fff" />
        <Text style={styles.submitText}>{saving ? t('cleaningPage_bulkSubmitting') : t('cleaningPage_bulkSubmit')}</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginBottom: 12,
    gap: 4,
  },
  cardShadow: {
    shadowColor: '#0f766e',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  sectionTitle: { fontSize: 17, fontWeight: '800', marginBottom: 8, letterSpacing: -0.2 },
  adminNote: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  adminNoteCol: { flex: 1 },
  adminNoteLabel: { fontSize: 11, fontWeight: '700', color: ACCENT, marginBottom: 2 },
  adminNoteText: { fontSize: 14, lineHeight: 20 },
  assigneeBox: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    marginTop: 10,
  },
  assigneeCol: { flex: 1 },
  assigneeLabel: { fontSize: 11, fontWeight: '700', color: ACCENT, marginBottom: 6 },
  assigneeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  assigneeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  assigneeChipText: { fontSize: 12, fontWeight: '600' },
  noteInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 56,
    fontSize: 14,
    marginTop: 12,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 12,
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
