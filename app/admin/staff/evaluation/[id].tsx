import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { MgmtEvalStarPicker } from '@/components/MgmtEvalStarPicker';
import { StaffManagementEvaluationCards } from '@/components/StaffManagementEvaluationCards';
import {
  MGMT_EVAL_STAR_KEYS,
  type MgmtEvalStarKey,
  type StaffManagementEvaluationRow,
  defaultMgmtEvalStars,
} from '@/lib/managementEvaluation';

export default function AdminStaffEvaluationScreen() {
  const { id: staffId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const authStaff = useAuthStore((s) => s.staff);
  const authStaffId = authStaff?.id;

  const [loading, setLoading] = useState(true);
  const [staffName, setStaffName] = useState<string>('');
  const [rows, setRows] = useState<StaffManagementEvaluationRow[]>([]);
  const [evaluatorNames, setEvaluatorNames] = useState<Record<string, string | null>>({});

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stars, setStars] = useState<Record<MgmtEvalStarKey, number>>(defaultMgmtEvalStars());
  const [periodTitle, setPeriodTitle] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [managerComment, setManagerComment] = useState('');

  const load = useCallback(async () => {
    if (!staffId) return;
    setLoading(true);
    try {
      const { data: s, error: se } = await supabase.from('staff').select('full_name').eq('id', staffId).single();
      if (se || !s) {
        Alert.alert(t('error'), t('mgmtEvalStaffMissing'));
        router.back();
        return;
      }
      setStaffName((s as { full_name: string | null }).full_name ?? '—');

      const { data: evs, error: ee } = await supabase
        .from('staff_management_evaluations')
        .select('*')
        .eq('staff_id', staffId)
        .order('created_at', { ascending: false });
      if (ee) throw ee;
      const list = (evs ?? []) as StaffManagementEvaluationRow[];
      setRows(list);

      const eids = [...new Set(list.map((r) => r.evaluator_staff_id))];
      if (eids.length) {
        const { data: names } = await supabase.from('staff').select('id, full_name').in('id', eids);
        const map: Record<string, string | null> = {};
        for (const row of names ?? []) {
          const r = row as { id: string; full_name: string | null };
          map[r.id] = r.full_name;
        }
        setEvaluatorNames(map);
      } else {
        setEvaluatorNames({});
      }
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? '');
    }
    setLoading(false);
  }, [staffId, router, t]);

  useEffect(() => {
    load();
  }, [load]);

  const openModal = () => {
    setStars(defaultMgmtEvalStars());
    setPeriodTitle('');
    setPeriodStart('');
    setPeriodEnd('');
    setManagerComment('');
    setModalOpen(true);
  };

  const submit = async () => {
    if (!staffId || !authStaffId) {
      Alert.alert(t('error'), t('mgmtEvalLoginRequired'));
      return;
    }
    if (authStaff?.role !== 'admin') {
      Alert.alert(t('error'), t('mgmtEvalAdminOnly'));
      return;
    }
    if (staffId === authStaffId) {
      Alert.alert(t('error'), t('mgmtEvalSelfNotAllowed'));
      return;
    }
    setSaving(true);
    try {
      const { data: evaluatorId, error: rpcErr } = await supabase.rpc('auth_active_staff_id');
      if (rpcErr) throw rpcErr;
      const resolvedEvaluatorId = (evaluatorId as string | null) ?? authStaffId;
      const payload = {
        staff_id: staffId,
        evaluator_staff_id: resolvedEvaluatorId,
        period_title: periodTitle.trim() || null,
        period_start: periodStart.trim() || null,
        period_end: periodEnd.trim() || null,
        manager_comment: managerComment.trim() || null,
        extra_stars: {},
        ...stars,
      };
      const { error } = await supabase.from('staff_management_evaluations').insert(payload);
      if (error) throw error;
      setModalOpen(false);
      await load();
      Alert.alert(t('mgmtEvalSavedTitle'), t('mgmtEvalSaved'));
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? '');
    }
    setSaving(false);
  };

  const labelFor = (key: MgmtEvalStarKey) => {
    const m: Record<MgmtEvalStarKey, string> = {
      star_teamwork: t('mgmtEvalStarTeamwork'),
      star_discipline: t('mgmtEvalStarDiscipline'),
      star_job_skills: t('mgmtEvalStarJobSkills'),
      star_respect_peers: t('mgmtEvalStarRespectPeers'),
      star_rule_compliance: t('mgmtEvalStarRuleCompliance'),
      star_communication: t('mgmtEvalStarCommunication'),
      star_initiative: t('mgmtEvalStarInitiative'),
      star_guest_focus: t('mgmtEvalStarGuestFocus'),
      star_punctuality: t('mgmtEvalStarPunctuality'),
    };
    return m[key];
  };

  if (!staffId) return null;

  if (loading) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: t('mgmtEvalAdminScreenTitle') }} />
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: t('mgmtEvalAdminScreenTitle') }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.headName}>{staffName}</Text>
        <Text style={styles.sub}>{t('mgmtEvalAdminIntro')}</Text>

        <TouchableOpacity style={styles.primaryBtn} onPress={openModal} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>{t('mgmtEvalNew')}</Text>
        </TouchableOpacity>

        <StaffManagementEvaluationCards rows={rows} evaluatorNames={evaluatorNames} />
      </ScrollView>

      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalCardWrap}
          >
            <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>{t('mgmtEvalNew')}</Text>
              <Text style={styles.modalHint}>{t('mgmtEvalModalHint')}</Text>

              {MGMT_EVAL_STAR_KEYS.map((key) => (
                <MgmtEvalStarPicker
                  key={key}
                  label={labelFor(key)}
                  value={stars[key]}
                  onChange={(n) => setStars((prev) => ({ ...prev, [key]: n }))}
                />
              ))}

              <Text style={styles.fieldLabel}>{t('mgmtEvalPeriodTitle')}</Text>
              <TextInput
                style={styles.input}
                value={periodTitle}
                onChangeText={setPeriodTitle}
                placeholder={t('mgmtEvalPeriodTitlePh')}
                placeholderTextColor={adminTheme.colors.textMuted}
              />
              <Text style={styles.fieldLabel}>{t('mgmtEvalPeriodStart')}</Text>
              <TextInput
                style={styles.input}
                value={periodStart}
                onChangeText={setPeriodStart}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={adminTheme.colors.textMuted}
              />
              <Text style={styles.fieldLabel}>{t('mgmtEvalPeriodEnd')}</Text>
              <TextInput
                style={styles.input}
                value={periodEnd}
                onChangeText={setPeriodEnd}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={adminTheme.colors.textMuted}
              />
              <Text style={styles.fieldLabel}>{t('mgmtEvalManagerComment')}</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={managerComment}
                onChangeText={setManagerComment}
                placeholder={t('mgmtEvalCommentPh')}
                placeholderTextColor={adminTheme.colors.textMuted}
                multiline
              />

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => setModalOpen(false)} disabled={saving}>
                  <Text style={styles.secondaryBtnText}>{t('cancelAction')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryBtnSm} onPress={submit} disabled={saving}>
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>{t('mgmtEvalSubmit')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 20, paddingBottom: 48 },
  headName: { fontSize: 22, fontWeight: '800', color: adminTheme.colors.text, marginBottom: 6 },
  sub: { fontSize: 14, color: adminTheme.colors.textSecondary, marginBottom: 16, lineHeight: 20 },
  primaryBtn: {
    backgroundColor: adminTheme.colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  primaryBtnSm: {
    backgroundColor: adminTheme.colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    minWidth: 120,
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  modalCardWrap: { maxHeight: '92%' },
  modalScroll: {
    backgroundColor: adminTheme.colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 36,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: adminTheme.colors.text, marginBottom: 6 },
  modalHint: { fontSize: 13, color: adminTheme.colors.textMuted, marginBottom: 14 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.textSecondary, marginBottom: 6, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: adminTheme.colors.text,
    marginBottom: 12,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  textArea: { minHeight: 88, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, gap: 12 },
  secondaryBtn: { paddingVertical: 12, paddingHorizontal: 8 },
  secondaryBtnText: { color: adminTheme.colors.textMuted, fontSize: 16, fontWeight: '600' },
});
