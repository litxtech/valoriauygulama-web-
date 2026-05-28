import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { useTranslation } from 'react-i18next';
import { sendNotification } from '@/lib/notificationService';
import { FastPress } from '@/components/ui/FastPress';

type StaffOption = { id: string; full_name: string | null; department: string | null };

const FREQUENCY_OPTIONS = [
  { id: 'once', label: 'Bir kez oldu', icon: 'flash-outline' as const },
  { id: 'sometimes', label: 'Ara ara', icon: 'time-outline' as const },
  { id: 'often', label: 'Sık sık', icon: 'repeat-outline' as const },
  { id: 'everyday', label: 'Neredeyse her gün', icon: 'calendar-outline' as const },
];

const TOPIC_OPTIONS = [
  { id: 'suggestion', label: 'Öneri', icon: 'bulb-outline' as const, tint: '#0d9488' },
  { id: 'problem', label: 'Sorun', icon: 'alert-circle-outline' as const, tint: '#dc2626' },
  { id: 'daily', label: 'Günlük', icon: 'today-outline' as const, tint: '#2563eb' },
  { id: 'memory', label: 'Hatıra', icon: 'bookmark-outline' as const, tint: '#7c3aed' },
] as const;

function Section({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIconWrap}>
          <Ionicons name={icon} size={18} color={theme.colors.primary} />
        </View>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

export default function StaffInternalComplaintNewScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { staff } = useAuthStore();
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(true);
  const [targetId, setTargetId] = useState('');
  const [topicType, setTopicType] = useState<(typeof TOPIC_OPTIONS)[number]['id']>('suggestion');
  const [topicTitle, setTopicTitle] = useState('');
  const [whatHappened, setWhatHappened] = useState('');
  const [frequency, setFrequency] = useState('sometimes');
  const [continues, setContinues] = useState<'yes' | 'no'>('yes');
  const [effect, setEffect] = useState('');
  const [detailNote, setDetailNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!staff?.organization_id || !staff?.id) return;
    setLoadingAdmins(true);
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
      setLoadingAdmins(false);
    })();
  }, [staff?.organization_id, staff?.id]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const canSubmit = useMemo(
    () =>
      !!targetId &&
      topicTitle.trim().length > 2 &&
      whatHappened.trim().length > 3 &&
      detailNote.trim().length > 8,
    [targetId, topicTitle, whatHappened, detailNote]
  );

  const detailChars = detailNote.trim().length;
  const detailMin = 9;

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

    Keyboard.dismiss();
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
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          Platform.OS === 'android' && keyboardHeight > 0 ? { paddingBottom: keyboardHeight + 32 } : null,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="chatbox-ellipses" size={28} color={theme.colors.primary} />
          </View>
          <Text style={styles.heroTitle}>{t('profileUiStaffComplaint')}</Text>
          <Text style={styles.heroHint}>{t('internalComplaintHint')}</Text>
          <View style={styles.heroBadge}>
            <Ionicons name="lock-closed" size={12} color={theme.colors.primaryDark} />
            <Text style={styles.heroBadgeText}>Yalnızca seçilen yönetici görür</Text>
          </View>
        </View>

        <Section title="Konu tipi" subtitle="Notunuzun amacını seçin" icon="pricetag-outline">
          <View style={styles.topicGrid}>
            {TOPIC_OPTIONS.map((x) => {
              const active = topicType === x.id;
              return (
                <FastPress
                  key={x.id}
                  style={[styles.topicCard, active && { borderColor: x.tint, backgroundColor: `${x.tint}12` }]}
                  onPress={() => setTopicType(x.id)}
                >
                  <View style={[styles.topicIcon, { backgroundColor: `${x.tint}18` }]}>
                    <Ionicons name={x.icon} size={20} color={x.tint} />
                  </View>
                  <Text style={[styles.topicLabel, active && { color: x.tint, fontWeight: '800' }]}>{x.label}</Text>
                </FastPress>
              );
            })}
          </View>
        </Section>

        <Section title="Konu başlığı" subtitle="Kısa ve net bir başlık" icon="text-outline">
          <TextInput
            style={styles.input}
            value={topicTitle}
            onChangeText={setTopicTitle}
            placeholder="Örn: Gece vardiyası önerim"
            placeholderTextColor={theme.colors.textMuted}
            maxLength={120}
          />
        </Section>

        <Section title="Otel sorumlusu" subtitle="Notunuz kime iletilecek" icon="person-outline">
          {loadingAdmins ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={styles.loadingText}>Yöneticiler yükleniyor…</Text>
            </View>
          ) : staffList.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="people-outline" size={28} color={theme.colors.textMuted} />
              <Text style={styles.emptyText}>Aktif yönetici bulunamadı. Lütfen daha sonra tekrar deneyin.</Text>
            </View>
          ) : (
            <View style={styles.managerList}>
              {staffList.map((s) => {
                const active = targetId === s.id;
                return (
                  <FastPress
                    key={s.id}
                    style={[styles.managerRow, active && styles.managerRowActive]}
                    onPress={() => setTargetId(s.id)}
                  >
                    <View style={[styles.managerAvatar, active && styles.managerAvatarActive]}>
                      <Text style={[styles.managerInitial, active && styles.managerInitialActive]}>
                        {(s.full_name || '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.managerInfo}>
                      <Text style={[styles.managerName, active && styles.managerNameActive]}>
                        {s.full_name || t('staffTab')}
                      </Text>
                      {s.department ? <Text style={styles.managerDept}>{s.department}</Text> : null}
                    </View>
                    <Ionicons
                      name={active ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={active ? theme.colors.primary : theme.colors.textMuted}
                    />
                  </FastPress>
                );
              })}
            </View>
          )}
        </Section>

        <Section title="Ana mesaj" subtitle="Ne paylaşmak istiyorsunuz?" icon="document-text-outline">
          <TextInput
            style={[styles.input, styles.textAreaSm]}
            value={whatHappened}
            onChangeText={setWhatHappened}
            placeholder="Kısa özet yazın…"
            placeholderTextColor={theme.colors.textMuted}
            multiline
            textAlignVertical="top"
          />
        </Section>

        <Section title={t('internalComplaintQ2')} icon="pulse-outline">
          <View style={styles.freqRow}>
            {FREQUENCY_OPTIONS.map((f) => {
              const active = frequency === f.id;
              return (
                <FastPress
                  key={f.id}
                  style={[styles.freqChip, active && styles.freqChipActive]}
                  onPress={() => setFrequency(f.id)}
                >
                  <Ionicons
                    name={f.icon}
                    size={14}
                    color={active ? '#fff' : theme.colors.textSecondary}
                  />
                  <Text style={[styles.freqText, active && styles.freqTextActive]}>{f.label}</Text>
                </FastPress>
              );
            })}
          </View>
        </Section>

        <Section title={t('internalComplaintQ3')} icon="help-circle-outline">
          <View style={styles.segment}>
            <FastPress
              style={[styles.segmentBtn, continues === 'yes' && styles.segmentBtnActive]}
              onPress={() => setContinues('yes')}
            >
              <Ionicons
                name="checkmark"
                size={16}
                color={continues === 'yes' ? '#fff' : theme.colors.textSecondary}
              />
              <Text style={[styles.segmentText, continues === 'yes' && styles.segmentTextActive]}>{t('yes')}</Text>
            </FastPress>
            <FastPress
              style={[styles.segmentBtn, continues === 'no' && styles.segmentBtnActive]}
              onPress={() => setContinues('no')}
            >
              <Ionicons
                name="close"
                size={16}
                color={continues === 'no' ? '#fff' : theme.colors.textSecondary}
              />
              <Text style={[styles.segmentText, continues === 'no' && styles.segmentTextActive]}>{t('no')}</Text>
            </FastPress>
          </View>
        </Section>

        <Section title={t('internalComplaintQ4')} subtitle="Opsiyonel" icon="trending-up-outline">
          <TextInput
            style={[styles.input, styles.textAreaSm]}
            value={effect}
            onChangeText={setEffect}
            placeholder={t('internalComplaintQ4Placeholder')}
            placeholderTextColor={theme.colors.textMuted}
            multiline
            textAlignVertical="top"
          />
        </Section>

        <Section title={t('internalComplaintDetailLabel')} subtitle="Tarih, tanık ve somut detaylar" icon="create-outline">
          <TextInput
            style={[styles.input, styles.textArea]}
            value={detailNote}
            onChangeText={setDetailNote}
            placeholder={t('internalComplaintDetailPlaceholder')}
            placeholderTextColor={theme.colors.textMuted}
            multiline
            textAlignVertical="top"
            maxLength={2000}
          />
          <Text style={[styles.charHint, detailChars >= detailMin && styles.charHintOk]}>
            {detailChars < detailMin
              ? `En az ${detailMin} karakter (${detailMin - detailChars} kaldı)`
              : `${detailChars} karakter`}
          </Text>
        </Section>

        <FastPress
          style={[styles.submitBtn, (!canSubmit || saving) && styles.submitBtnDisabled]}
          onPress={submit}
          disabled={!canSubmit || saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="paper-plane" size={18} color="#fff" />
              <Text style={styles.submitText}>{t('internalComplaintSubmit')}</Text>
            </>
          )}
        </FastPress>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: theme.spacing.lg, paddingBottom: 48 },

  hero: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: `${theme.colors.primary}18`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
  },
  heroTitle: { ...theme.typography.titleSmall, color: theme.colors.text },
  heroHint: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.textSecondary,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: theme.spacing.md,
    alignSelf: 'flex-start',
    backgroundColor: `${theme.colors.primary}14`,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
  },
  heroBadgeText: { fontSize: 12, fontWeight: '600', color: theme.colors.primaryDark },

  section: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: theme.spacing.md },
  sectionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: `${theme.colors.primary}14`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderText: { flex: 1 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text },
  sectionSubtitle: { marginTop: 2, fontSize: 12, color: theme.colors.textMuted, lineHeight: 16 },

  topicGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  topicCard: {
    width: '47%',
    flexGrow: 1,
    borderWidth: 1.5,
    borderColor: theme.colors.borderLight,
    borderRadius: theme.radius.md,
    padding: 12,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  topicIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  topicLabel: { fontSize: 13, fontWeight: '700', color: theme.colors.text },

  input: {
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.backgroundSecondary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.colors.text,
    fontSize: 15,
  },
  textAreaSm: { minHeight: 88 },
  textArea: { minHeight: 128 },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  loadingText: { fontSize: 14, color: theme.colors.textSecondary },
  emptyCard: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  emptyText: { fontSize: 13, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 18 },

  managerList: { gap: 8 },
  managerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  managerRowActive: {
    borderColor: theme.colors.primary,
    backgroundColor: `${theme.colors.primary}10`,
  },
  managerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  managerAvatarActive: { backgroundColor: theme.colors.primary },
  managerInitial: { fontSize: 16, fontWeight: '800', color: theme.colors.textSecondary },
  managerInitialActive: { color: '#fff' },
  managerInfo: { flex: 1 },
  managerName: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  managerNameActive: { color: theme.colors.primaryDark },
  managerDept: { marginTop: 2, fontSize: 12, color: theme.colors.textMuted },

  freqRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  freqChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  freqChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  freqText: { fontSize: 12, fontWeight: '600', color: theme.colors.text },
  freqTextActive: { color: '#fff' },

  segment: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: theme.radius.md,
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: theme.radius.sm,
  },
  segmentBtnActive: { backgroundColor: theme.colors.primary },
  segmentText: { fontSize: 14, fontWeight: '700', color: theme.colors.textSecondary },
  segmentTextActive: { color: '#fff' },

  charHint: { marginTop: 8, fontSize: 12, color: theme.colors.textMuted, textAlign: 'right' },
  charHintOk: { color: theme.colors.success, fontWeight: '600' },

  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: 15,
    ...theme.shadows.md,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
