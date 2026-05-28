import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, TextInput, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import type { NotificationTemplateRow } from '@/lib/notifications';
import { AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrganizationQueryScope } from '@/hooks/useAdminOrganizationQueryScope';
import { SMART_OPS_ROLE_LABELS } from '@/lib/smartOps';

const CATEGORY_LABELS: Record<string, string> = {
  info: 'Bilgi',
  warning: 'Uyarı',
  campaign: 'Kampanya',
  event: 'Etkinlik',
  reminder: 'Hatırlatma',
  meeting: 'Toplantı',
  urgent: 'Acil',
};

function TemplateCard({ item }: { item: NotificationTemplateRow }) {
  const router = useRouter();
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={() => {
        const q = new URLSearchParams();
        q.set('audience', item.target_audience);
        q.set('category', item.category);
        q.set('title', item.title_template ?? '');
        q.set('body', item.body_template ?? '');
        router.push(`/admin/notifications/bulk?${q.toString()}`);
      }}
    >
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{item.title_template}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{CATEGORY_LABELS[item.category] ?? item.category}</Text>
        </View>
      </View>
      <Text style={styles.cardBody}>{item.body_template}</Text>
      {item.is_system ? <Text style={styles.systemNote}>Sistem şablonu</Text> : null}
      <Text style={styles.useHint}>Kullan</Text>
    </TouchableOpacity>
  );
}

type ScheduledTemplateRow = {
  id: string;
  title: string | null;
  body: string | null;
  target_role: string;
  send_time: string | null;
  repeat_type: string | null;
  active: boolean;
  last_sent_at: string | null;
};

const TARGET_ROLE_OPTIONS = [
  'all_staff',
  'operations',
  'reception',
  'housekeeping',
  'kitchen',
  'technical',
  'manager',
] as const;

const REPEAT_OPTIONS: { key: string; label: string }[] = [
  { key: 'daily', label: 'Her gün' },
  { key: 'weekdays', label: 'Hafta içi' },
  { key: 'weekend', label: 'Hafta sonu' },
];

function normalizeTimeInput(value: string) {
  return value.replace(/[^\d:]/g, '').slice(0, 5);
}

function isValidTime(value: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

export default function NotificationTemplatesScreen() {
  const { staff, canUseAll, canQuery, orgScoped } = useAdminOrganizationQueryScope();
  const [guestTemplates, setGuestTemplates] = useState<NotificationTemplateRow[]>([]);
  const [staffTemplates, setStaffTemplates] = useState<NotificationTemplateRow[]>([]);
  const [scheduledTemplates, setScheduledTemplates] = useState<ScheduledTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sendTime, setSendTime] = useState('09:00');
  const [targetRole, setTargetRole] = useState<(typeof TARGET_ROLE_OPTIONS)[number]>('all_staff');
  const [repeatType, setRepeatType] = useState('daily');
  const [active, setActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: legacyData }, { data: scheduledData }] = await Promise.all([
      supabase
        .from('notification_templates')
        .select('*')
        .is('organization_id', null)
        .order('sort_order')
        .order('template_key'),
      orgScoped
        ? supabase
            .from('notification_templates')
            .select('id, title, body, target_role, send_time, repeat_type, active, last_sent_at')
            .eq('organization_id', orgScoped)
            .eq('template_kind', 'smart_ops')
            .contains('metadata', { notification_only: true })
            .order('send_time', { ascending: true })
        : Promise.resolve({ data: [] as ScheduledTemplateRow[] }),
    ]);
    const list = (legacyData as NotificationTemplateRow[]) ?? [];
    setScheduledTemplates((scheduledData as ScheduledTemplateRow[]) ?? []);
    setGuestTemplates(list.filter((t) => t.target_audience === 'guest'));
    setStaffTemplates(list.filter((t) => t.target_audience === 'staff'));
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [orgScoped]);

  const canCreate = useMemo(() => Boolean(canQuery && orgScoped), [canQuery, orgScoped]);

  const createScheduledTemplate = async () => {
    setFormError(null);
    setFormSuccess(null);
    const cleanTitle = title.trim();
    const cleanBody = body.trim();
    const cleanTime = sendTime.trim();
    if (!canCreate || !orgScoped) return setFormError('Önce işletme seçin.');
    if (!cleanTitle) return setFormError('Başlık gerekli.');
    if (!cleanBody) return setFormError('Mesaj metni gerekli.');
    if (!isValidTime(cleanTime)) return setFormError('Saat formatı HH:MM olmalı.');

    setSaving(true);
    const { error } = await supabase.from('notification_templates').insert({
      organization_id: orgScoped,
      code: `notif_${Date.now()}`,
      template_kind: 'smart_ops',
      target_audience: 'staff',
      template_key: `scheduled_staff_${Date.now()}`,
      category: 'info',
      title_template: cleanTitle,
      body_template: cleanBody,
      title: cleanTitle,
      body: cleanBody,
      target_role: targetRole,
      active,
      send_time: cleanTime,
      repeat_type: repeatType,
      critical_level: 'normal',
      require_photo: 'off',
      sound_type: 'normal',
      escalation_enabled: false,
      checklist: [],
      metadata: { notification_only: true, source: 'admin_notifications_templates' },
      created_by_staff_id: staff?.id ?? null,
      updated_by_staff_id: staff?.id ?? null,
    });
    setSaving(false);
    if (error) return setFormError(error.message);

    setTitle('');
    setBody('');
    setFormSuccess('Şablon kaydedildi. Belirlenen saatte otomatik gönderilecek.');
    await load();
  };

  const toggleScheduled = async (id: string, next: boolean) => {
    setScheduledTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, active: next } : t)));
    const { error } = await supabase
      .from('notification_templates')
      .update({ active: next, updated_at: new Date().toISOString(), updated_by_staff_id: staff?.id ?? null })
      .eq('id', id);
    if (error) {
      setScheduledTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, active: !next } : t)));
      setFormError(error.message);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <Text style={styles.pageTitle}>Bildirim şablon merkezi</Text>
      <AdminOrganizationPicker canUseAll={canUseAll} ownOrganizationId={staff?.organization_id} />

      <View style={styles.creatorCard}>
        <Text style={styles.creatorTitle}>Saatli otomatik bildirim oluştur</Text>
        {!canCreate ? <Text style={styles.empty}>Önce işletme seçin.</Text> : null}
        <TextInput
          style={styles.input}
          placeholder="Başlık"
          value={title}
          onChangeText={setTitle}
          editable={canCreate}
          placeholderTextColor="#a0aec0"
        />
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Bildirim metni"
          value={body}
          onChangeText={setBody}
          editable={canCreate}
          multiline
          placeholderTextColor="#a0aec0"
        />
        <View style={styles.row}>
          <View style={styles.rowField}>
            <Text style={styles.label}>Saat (HH:MM)</Text>
            <TextInput
              style={styles.input}
              value={sendTime}
              onChangeText={(v) => setSendTime(normalizeTimeInput(v))}
              editable={canCreate}
              keyboardType="numbers-and-punctuation"
              placeholder="09:00"
              placeholderTextColor="#a0aec0"
            />
          </View>
          <View style={styles.rowField}>
            <Text style={styles.label}>Tekrar</Text>
            <View style={styles.chips}>
              {REPEAT_OPTIONS.map((o) => (
                <TouchableOpacity
                  key={o.key}
                  style={[styles.chip, repeatType === o.key && styles.chipActive]}
                  onPress={() => setRepeatType(o.key)}
                  disabled={!canCreate}
                >
                  <Text style={[styles.chipText, repeatType === o.key && styles.chipTextActive]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
        <Text style={styles.label}>Hedef ekip</Text>
        <View style={styles.chips}>
          {TARGET_ROLE_OPTIONS.map((role) => (
            <TouchableOpacity
              key={role}
              style={[styles.chip, targetRole === role && styles.chipActive]}
              onPress={() => setTargetRole(role)}
              disabled={!canCreate}
            >
              <Text style={[styles.chipText, targetRole === role && styles.chipTextActive]}>
                {SMART_OPS_ROLE_LABELS[role] ?? role}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.label}>Aktif</Text>
          <Switch value={active} onValueChange={setActive} disabled={!canCreate} />
        </View>
        {formError ? <Text style={styles.error}>{formError}</Text> : null}
        {formSuccess ? <Text style={styles.success}>{formSuccess}</Text> : null}
        <TouchableOpacity
          style={[styles.saveBtn, (!canCreate || saving) && styles.saveBtnDisabled]}
          onPress={createScheduledTemplate}
          disabled={!canCreate || saving}
        >
          <Text style={styles.saveBtnText}>{saving ? 'Kaydediliyor…' : 'Şablon oluştur'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Planlı otomatik şablonlar</Text>
      {scheduledTemplates.length === 0 ? (
        <Text style={styles.empty}>Henüz planlı şablon yok</Text>
      ) : (
        scheduledTemplates.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>{item.title ?? 'Başlıksız'}</Text>
              <Switch value={item.active} onValueChange={(v) => toggleScheduled(item.id, v)} />
            </View>
            <Text style={styles.cardBody}>{item.body}</Text>
            <Text style={styles.meta}>
              {(item.send_time ?? '').slice(0, 5)} · {SMART_OPS_ROLE_LABELS[item.target_role] ?? item.target_role}
            </Text>
            <Text style={styles.rowFoot}>
              Son gönderim: {item.last_sent_at ? new Date(item.last_sent_at).toLocaleString('tr-TR') : 'Henüz yok'}
            </Text>
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>Hazır misafir şablonları</Text>
      {guestTemplates.length === 0 ? (
        <Text style={styles.empty}>Şablon yok</Text>
      ) : (
        guestTemplates.map((t) => <TemplateCard key={t.id} item={t} />)
      )}
      <Text style={styles.sectionTitle}>Hazır personel şablonları</Text>
      {staffTemplates.length === 0 ? (
        <Text style={styles.empty}>Şablon yok</Text>
      ) : (
        staffTemplates.map((t) => <TemplateCard key={t.id} item={t} />)
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7fafc' },
  content: { padding: 20, paddingBottom: 40 },
  pageTitle: { fontSize: 20, fontWeight: '700', color: '#1a365d', marginBottom: 10 },
  creatorCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
    marginBottom: 18,
  },
  creatorTitle: { fontSize: 16, fontWeight: '700', color: '#1a365d', marginBottom: 10 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1a202c',
    marginBottom: 8,
  },
  multiline: { minHeight: 84, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 8 },
  rowField: { flex: 1 },
  label: { fontSize: 12, fontWeight: '700', color: '#4a5568', marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#edf2f7',
  },
  chipActive: { backgroundColor: '#2b6cb0' },
  chipText: { fontSize: 12, color: '#2d3748', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  switchRow: { marginTop: 4, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  saveBtn: {
    marginTop: 4,
    backgroundColor: '#1a365d',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  error: { color: '#c53030', fontSize: 12, marginBottom: 8 },
  success: { color: '#2f855a', fontSize: 12, marginBottom: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#2d3748', marginTop: 20, marginBottom: 8 },
  empty: { color: '#a0aec0', fontSize: 14, paddingVertical: 12 },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#1a202c', flex: 1 },
  badge: { backgroundColor: '#edf2f7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 12, color: '#4a5568' },
  cardBody: { fontSize: 14, color: '#4a5568' },
  meta: { fontSize: 12, color: '#4a5568', marginTop: 8 },
  rowFoot: { fontSize: 11, color: '#a0aec0', marginTop: 8 },
  systemNote: { fontSize: 11, color: '#a0aec0', marginTop: 8 },
  useHint: { marginTop: 10, fontSize: 13, fontWeight: '700', color: '#1a365d' },
});
