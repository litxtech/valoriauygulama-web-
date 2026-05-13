import { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { useTranslation } from 'react-i18next';
import { sendNotification } from '@/lib/notificationService';

type StaffOption = { id: string; full_name: string | null; department: string | null };

const FREQUENCY_OPTIONS = [
  { id: 'once', label: 'Bir kez oldu' },
  { id: 'sometimes', label: 'Ara ara oluyor' },
  { id: 'often', label: 'Sık sık oluyor' },
  { id: 'everyday', label: 'Neredeyse her gün oluyor' },
];

const TOPIC_OPTIONS = [
  { id: 'suggestion', label: 'Öneri' },
  { id: 'problem', label: 'Sorun' },
  { id: 'daily', label: 'Günlük' },
  { id: 'memory', label: 'Hatıra Notu' },
] as const;

export default function StaffInternalComplaintNewScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { staff } = useAuthStore();
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [targetId, setTargetId] = useState('');
  const [topicType, setTopicType] = useState<(typeof TOPIC_OPTIONS)[number]['id']>('suggestion');
  const [topicTitle, setTopicTitle] = useState('');
  const [whatHappened, setWhatHappened] = useState('');
  const [frequency, setFrequency] = useState('sometimes');
  const [continues, setContinues] = useState<'yes' | 'no'>('yes');
  const [effect, setEffect] = useState('');
  const [detailNote, setDetailNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!staff?.organization_id || !staff?.id) return;
    (async () => {
      const { data } = await supabase
        .from('staff')
        .select('id, full_name, department')
        .eq('organization_id', staff.organization_id)
        .eq('role', 'admin')
        .eq('is_active', true)
        .is('deleted_at', null)
        .neq('id', staff.id)
        .order('full_name', { ascending: true });
      const rows = (data ?? []) as StaffOption[];
      setStaffList(rows);
      if (rows[0]?.id) setTargetId(rows[0].id);
    })();
  }, [staff?.organization_id, staff?.id]);

  const canSubmit = useMemo(
    () =>
      !!targetId &&
      topicTitle.trim().length > 2 &&
      whatHappened.trim().length > 3 &&
      detailNote.trim().length > 8,
    [targetId, topicTitle, whatHappened, detailNote]
  );

  const submit = async () => {
    if (!staff?.id || !staff?.organization_id) {
      Alert.alert(t('error'), t('staffEmergencySessionMissing'));
      return;
    }
    if (!canSubmit) {
      Alert.alert(t('missingInfo'), t('internalComplaintRequiredFields'));
      return;
    }
    const topicLabel = TOPIC_OPTIONS.find((x) => x.id === topicType)?.label ?? topicType;
    const frequencyLabel = FREQUENCY_OPTIONS.find((x) => x.id === frequency)?.label ?? frequency;
    const note = [
      `Konu tipi: ${topicLabel}`,
      `Konu başlığı: ${topicTitle.trim()}`,
      `Detay: ${whatHappened.trim()}`,
      `Sıklık: ${frequencyLabel}`,
      `Durum devam ediyor mu?: ${continues === 'yes' ? 'Evet' : 'Hayır'}`,
      `Etkisi: ${effect.trim() || '-'}`,
      `Not:`,
      detailNote.trim(),
    ].join('\n');

    setSaving(true);
    const { error } = await supabase.from('staff_internal_complaints').insert({
      organization_id: staff.organization_id,
      complainant_staff_id: staff.id,
      complained_staff_id: targetId,
      note,
    });
    setSaving(false);
    if (error) {
      Alert.alert(t('error'), error.message);
      return;
    }
    await sendNotification({
      staffId: targetId,
      title: 'Yeni personel notu',
      body: `${staff.full_name ?? 'Personel'}: ${topicTitle.trim()} (${topicLabel})`,
      notificationType: 'staff_internal_note_new',
      category: 'admin',
      data: {
        screen: '/admin/staff-complaints',
        kind: topicType,
        authorStaffId: staff.id,
      },
      createdByStaffId: staff.id,
    });
    Alert.alert(t('sent'), t('internalComplaintSentBody'), [
      { text: t('ok'), onPress: () => router.back() },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={92}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="none"
      >
        <Text style={styles.title}>Yöneticiye Not / Öneri / Sorun</Text>
        <Text style={styles.hint}>Yazdıklarınız otel sorumlusuna gider, kayıt olarak saklanır.</Text>

      <Text style={styles.label}>Konu tipi</Text>
      <View style={styles.chips}>
        {TOPIC_OPTIONS.map((x) => (
          <TouchableOpacity key={x.id} style={[styles.chip, topicType === x.id && styles.chipActive]} onPress={() => setTopicType(x.id)}>
            <Text style={[styles.chipText, topicType === x.id && styles.chipTextActive]}>{x.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Konu başlığı</Text>
      <TextInput
        style={styles.input}
        value={topicTitle}
        onChangeText={setTopicTitle}
        placeholder="Örn: Gece vardiyası önerim"
        placeholderTextColor={theme.colors.textMuted}
      />

      <Text style={styles.label}>Otel sorumlusu</Text>
      <View style={styles.chips}>
        {staffList.map((s) => (
          <TouchableOpacity key={s.id} style={[styles.chip, targetId === s.id && styles.chipActive]} onPress={() => setTargetId(s.id)}>
            <Text style={[styles.chipText, targetId === s.id && styles.chipTextActive]}>
              {(s.full_name || t('staffTab')) + (s.department ? ` · ${s.department}` : '')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Ana mesaj</Text>
      <TextInput
        style={[styles.input, styles.textAreaSmall]}
        value={whatHappened}
        onChangeText={setWhatHappened}
        placeholder="Ne paylaşmak istiyorsunuz?"
        placeholderTextColor={theme.colors.textMuted}
        multiline
      />

      <Text style={styles.label}>{t('internalComplaintQ2')}</Text>
      <View style={styles.chips}>
        {FREQUENCY_OPTIONS.map((f) => (
          <TouchableOpacity key={f.id} style={[styles.chip, frequency === f.id && styles.chipActive]} onPress={() => setFrequency(f.id)}>
            <Text style={[styles.chipText, frequency === f.id && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>{t('internalComplaintQ3')}</Text>
      <View style={styles.row}>
        <TouchableOpacity style={[styles.optionBtn, continues === 'yes' && styles.optionBtnActive]} onPress={() => setContinues('yes')}>
          <Text style={[styles.optionText, continues === 'yes' && styles.optionTextActive]}>{t('yes')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.optionBtn, continues === 'no' && styles.optionBtnActive]} onPress={() => setContinues('no')}>
          <Text style={[styles.optionText, continues === 'no' && styles.optionTextActive]}>{t('no')}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>{t('internalComplaintQ4')}</Text>
      <TextInput
        style={[styles.input, styles.textAreaSmall]}
        value={effect}
        onChangeText={setEffect}
        placeholder={t('internalComplaintQ4Placeholder')}
        placeholderTextColor={theme.colors.textMuted}
        multiline
      />

      <Text style={styles.label}>{t('internalComplaintDetailLabel')}</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={detailNote}
        onChangeText={setDetailNote}
        placeholder={t('internalComplaintDetailPlaceholder')}
        placeholderTextColor={theme.colors.textMuted}
        multiline
      />

        <TouchableOpacity style={[styles.submitBtn, (!canSubmit || saving) && styles.disabled]} onPress={submit} disabled={!canSubmit || saving}>
          <Text style={styles.submitText}>{saving ? t('staffEmergencySending') : t('internalComplaintSubmit')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, paddingBottom: 180 },
  title: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  hint: { marginTop: 6, marginBottom: 12, color: theme.colors.textSecondary, fontSize: 12 },
  label: { marginTop: 10, marginBottom: 6, fontSize: 13, fontWeight: '700', color: theme.colors.text },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: theme.colors.text,
    textAlignVertical: 'top',
  },
  textAreaSmall: { minHeight: 64 },
  textArea: { minHeight: 120 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: theme.colors.surface,
  },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: 12, color: theme.colors.text, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  row: { flexDirection: 'row', gap: 8 },
  optionBtn: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: theme.colors.surface,
  },
  optionBtnActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  optionText: { color: theme.colors.textSecondary, fontWeight: '700' },
  optionTextActive: { color: '#fff' },
  submitBtn: {
    marginTop: 16,
    backgroundColor: '#b45309',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 13,
  },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  disabled: { opacity: 0.6 },
});

