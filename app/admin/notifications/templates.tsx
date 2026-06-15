import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import type { BulkCategory, BulkGuestTarget, NotificationTemplateRow } from '@/lib/notifications';
import { AdminOrganizationPicker } from '@/components/admin';
import { TemplateStaffRecipientPicker } from '@/components/admin/TemplateStaffRecipientPicker';
import { useAdminOrganizationQueryScope } from '@/hooks/useAdminOrganizationQueryScope';
import { adminTheme as T } from '@/constants/adminTheme';
import {
  GUEST_BULK_TARGET_LABELS,
  guestScheduledRecipientLabel,
  parseExcludedStaffIds,
  parseGuestBulkTarget,
  parseGuestRoomNumbers,
  parseScheduledGuestCategory,
} from '@/lib/notificationTemplateRecipients';

type TabKey = 'scheduled_staff' | 'scheduled_guest' | 'guest' | 'staff';
type ScheduledAudience = 'staff' | 'guest';

const GUEST_TARGETS: { value: BulkGuestTarget; label: string }[] = [
  { value: 'all_guests', label: GUEST_BULK_TARGET_LABELS.all_guests },
  { value: 'checkin_today', label: GUEST_BULK_TARGET_LABELS.checkin_today },
  { value: 'checkout_tomorrow', label: GUEST_BULK_TARGET_LABELS.checkout_tomorrow },
  { value: 'specific_rooms', label: GUEST_BULK_TARGET_LABELS.specific_rooms },
  { value: 'long_stay', label: GUEST_BULK_TARGET_LABELS.long_stay },
];

const BULK_CATEGORIES: { value: BulkCategory; label: string }[] = [
  { value: 'info', label: 'Bilgilendirme' },
  { value: 'warning', label: 'Uyarı' },
  { value: 'campaign', label: 'Kampanya' },
];

const CATEGORY_LABELS: Record<string, string> = {
  info: 'Bilgi',
  warning: 'Uyarı',
  campaign: 'Kampanya',
  event: 'Etkinlik',
  reminder: 'Hatırlatma',
  meeting: 'Toplantı',
  urgent: 'Acil',
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  info: { bg: T.colors.infoLight, text: T.colors.info },
  warning: { bg: T.colors.warningLight, text: T.colors.warning },
  campaign: { bg: '#fce7f3', text: '#be185d' },
  event: { bg: '#ede9fe', text: '#6d28d9' },
  reminder: { bg: T.colors.surfaceTertiary, text: T.colors.textSecondary },
  meeting: { bg: '#e0e7ff', text: '#4338ca' },
  urgent: { bg: T.colors.errorLight, text: T.colors.error },
};

const REPEAT_LABELS: Record<string, string> = {
  daily: 'Her gün',
  weekdays: 'Hafta içi',
  weekend: 'Hafta sonu',
};

type ScheduledTemplateRow = {
  id: string;
  title: string | null;
  body: string | null;
  target_role: string;
  target_audience?: string | null;
  category?: string | null;
  send_time: string | null;
  repeat_type: string | null;
  active: boolean;
  last_sent_at: string | null;
  metadata?: Record<string, unknown> | null;
};

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

function openBulkWithTemplate(
  router: ReturnType<typeof useRouter>,
  params: {
    audience: string;
    category: string;
    title: string;
    body: string;
    excludeStaffIds?: string[];
    guestTarget?: BulkGuestTarget;
    roomNumbers?: string;
  }
) {
  const q = new URLSearchParams();
  q.set('audience', params.audience);
  q.set('category', params.category);
  q.set('title', params.title);
  q.set('body', params.body);
  if (params.excludeStaffIds?.length) q.set('excludeStaff', params.excludeStaffIds.join(','));
  if (params.guestTarget) q.set('guestTarget', params.guestTarget);
  if (params.roomNumbers?.trim()) q.set('roomNumbers', params.roomNumbers.trim());
  router.push(`/admin/notifications/bulk?${q.toString()}`);
}

function ReadyTemplateCard({
  item,
  onUse,
}: {
  item: NotificationTemplateRow;
  onUse: () => void;
}) {
  const cat = CATEGORY_COLORS[item.category] ?? { bg: T.colors.surfaceTertiary, text: T.colors.textMuted };
  return (
    <View style={styles.readyCard}>
      <View style={styles.readyCardTop}>
        <View style={[styles.categoryBadge, { backgroundColor: cat.bg }]}>
          <Text style={[styles.categoryBadgeText, { color: cat.text }]}>
            {CATEGORY_LABELS[item.category] ?? item.category}
          </Text>
        </View>
        {item.is_system ? (
          <View style={styles.systemPill}>
            <Ionicons name="lock-closed-outline" size={12} color={T.colors.textMuted} />
            <Text style={styles.systemPillText}>Sistem</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.readyTitle}>{item.title_template}</Text>
      <Text style={styles.readyBody} numberOfLines={3}>
        {item.body_template}
      </Text>
      <TouchableOpacity style={styles.useBtn} onPress={onUse} activeOpacity={0.85}>
        <Ionicons name="send-outline" size={16} color="#fff" />
        <Text style={styles.useBtnText}>Toplu gönderimde kullan</Text>
      </TouchableOpacity>
    </View>
  );
}

function ScheduledTemplateCard({
  item,
  audience,
  deleting,
  onToggle,
  onUse,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  item: ScheduledTemplateRow;
  audience: ScheduledAudience;
  deleting: boolean;
  onToggle: (v: boolean) => void;
  onUse: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const timeLabel = (item.send_time ?? '').slice(0, 5) || '—';
  const repeatLabel = REPEAT_LABELS[item.repeat_type ?? ''] ?? item.repeat_type ?? '—';
  const excludedCount = parseExcludedStaffIds(item.metadata).length;
  const recipientLabel =
    audience === 'guest'
      ? guestScheduledRecipientLabel(item.metadata)
      : excludedCount > 0
        ? `Tüm personel · ${excludedCount} hariç`
        : 'Tüm personel';

  return (
    <View style={[styles.scheduledCard, !item.active && styles.scheduledCardPaused]}>
      <View style={styles.scheduledHead}>
        <View style={styles.scheduledIconWrap}>
          <Ionicons name="time-outline" size={20} color={item.active ? T.colors.accent : T.colors.textMuted} />
        </View>
        <View style={styles.scheduledHeadText}>
          <Text style={styles.scheduledTitle} numberOfLines={1}>
            {item.title ?? 'Başlıksız'}
          </Text>
          <Text style={styles.scheduledMeta}>
            {timeLabel} · {repeatLabel} · {recipientLabel}
          </Text>
        </View>
        <Switch
          value={item.active}
          onValueChange={onToggle}
          trackColor={{ false: T.colors.border, true: T.colors.warningLight }}
          thumbColor={item.active ? T.colors.accent : T.colors.surface}
        />
      </View>

      <Text style={styles.scheduledBody} numberOfLines={3}>
        {item.body ?? '—'}
      </Text>

      <Text style={styles.scheduledFoot}>
        Son gönderim:{' '}
        {item.last_sent_at ? new Date(item.last_sent_at).toLocaleString('tr-TR') : 'Henüz yok'}
      </Text>

      <View style={styles.scheduledActions}>
        <TouchableOpacity style={styles.actionBtnOutline} onPress={onUse} activeOpacity={0.85}>
          <Ionicons name="paper-plane-outline" size={16} color={T.colors.primary} />
          <Text style={styles.actionBtnOutlineText}>Gönder</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtnOutline} onPress={onEdit} activeOpacity={0.85}>
          <Ionicons name="create-outline" size={16} color={T.colors.primary} />
          <Text style={styles.actionBtnOutlineText}>Düzenle</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtnOutline} onPress={onDuplicate} activeOpacity={0.85}>
          <Ionicons name="copy-outline" size={16} color={T.colors.primary} />
          <Text style={styles.actionBtnOutlineText}>Kopyala</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtnDanger, deleting && styles.actionBtnDisabled]}
          onPress={onDelete}
          disabled={deleting}
          activeOpacity={0.85}
        >
          {deleting ? (
            <ActivityIndicator size="small" color={T.colors.error} />
          ) : (
            <Ionicons name="trash-outline" size={16} color={T.colors.error} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function NotificationTemplatesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { staff, canUseAll, canQuery, orgScoped } = useAdminOrganizationQueryScope();
  const [guestTemplates, setGuestTemplates] = useState<NotificationTemplateRow[]>([]);
  const [staffTemplates, setStaffTemplates] = useState<NotificationTemplateRow[]>([]);
  const [scheduledStaffTemplates, setScheduledStaffTemplates] = useState<ScheduledTemplateRow[]>([]);
  const [scheduledGuestTemplates, setScheduledGuestTemplates] = useState<ScheduledTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('scheduled_staff');
  const [showCreator, setShowCreator] = useState(true);
  const [scheduledAudience, setScheduledAudience] = useState<ScheduledAudience>('staff');

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sendTime, setSendTime] = useState('09:00');
  const [repeatType, setRepeatType] = useState('daily');
  const [excludedStaffIds, setExcludedStaffIds] = useState<string[]>([]);
  const [guestTarget, setGuestTarget] = useState<BulkGuestTarget>('all_guests');
  const [roomNumbers, setRoomNumbers] = useState('');
  const [bulkCategory, setBulkCategory] = useState<BulkCategory>('info');
  const [active, setActive] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setTitle('');
    setBody('');
    setSendTime('09:00');
    setRepeatType('daily');
    setExcludedStaffIds([]);
    setGuestTarget('all_guests');
    setRoomNumbers('');
    setBulkCategory('info');
    setActive(true);
    setFormError(null);
    setFormSuccess(null);
  }, []);

  const fillFormFromScheduled = useCallback(
    (item: ScheduledTemplateRow, audience: ScheduledAudience, asCopy: boolean) => {
      setEditingId(asCopy ? null : item.id);
      setScheduledAudience(audience);
      setTitle(item.title ?? '');
      setBody(item.body ?? '');
      setSendTime((item.send_time ?? '09:00').slice(0, 5));
      setRepeatType(item.repeat_type ?? 'daily');
      setExcludedStaffIds(parseExcludedStaffIds(item.metadata));
      setGuestTarget(parseGuestBulkTarget(item.metadata));
      setRoomNumbers(parseGuestRoomNumbers(item.metadata).join(', '));
      setBulkCategory(parseScheduledGuestCategory(item.metadata, item.category ?? 'info'));
      setActive(item.active);
      setFormError(null);
      setFormSuccess(asCopy ? 'Şablon forma kopyalandı — kaydetmek için düzenleyip kaydedin.' : null);
      setShowCreator(true);
    },
    []
  );

  const load = useCallback(async () => {
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
            .select('id, title, body, target_role, target_audience, category, send_time, repeat_type, active, last_sent_at, metadata')
            .eq('organization_id', orgScoped)
            .eq('template_kind', 'smart_ops')
            .contains('metadata', { notification_only: true })
            .order('send_time', { ascending: true })
        : Promise.resolve({ data: [] as ScheduledTemplateRow[] }),
    ]);
    const list = (legacyData as NotificationTemplateRow[]) ?? [];
    const scheduled = (scheduledData as ScheduledTemplateRow[]) ?? [];
    setScheduledStaffTemplates(
      scheduled.filter((t) => (t as { target_audience?: string }).target_audience !== 'guest')
    );
    setScheduledGuestTemplates(
      scheduled.filter((t) => (t as { target_audience?: string }).target_audience === 'guest')
    );
    setGuestTemplates(list.filter((t) => t.target_audience === 'guest'));
    setStaffTemplates(list.filter((t) => t.target_audience === 'staff'));
    setLoading(false);
  }, [orgScoped]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const canCreate = useMemo(() => Boolean(canQuery && orgScoped), [canQuery, orgScoped]);

  const stats = useMemo(
    () => ({
      scheduledStaff: scheduledStaffTemplates.length,
      scheduledGuest: scheduledGuestTemplates.length,
      scheduledActive:
        scheduledStaffTemplates.filter((t) => t.active).length +
        scheduledGuestTemplates.filter((t) => t.active).length,
      guest: guestTemplates.length,
      staff: staffTemplates.length,
    }),
    [guestTemplates.length, scheduledGuestTemplates, scheduledStaffTemplates, staffTemplates.length]
  );

  const toggleExcludedStaff = useCallback((staffId: string) => {
    setExcludedStaffIds((prev) =>
      prev.includes(staffId) ? prev.filter((id) => id !== staffId) : [...prev, staffId]
    );
  }, []);

  const saveScheduledTemplate = async () => {
    setFormError(null);
    setFormSuccess(null);
    const cleanTitle = title.trim();
    const cleanBody = body.trim();
    const cleanTime = sendTime.trim();
    if (!canCreate || !orgScoped) return setFormError('Önce işletme seçin.');
    if (!cleanTitle) return setFormError('Başlık gerekli.');
    if (!cleanBody) return setFormError('Mesaj metni gerekli.');
    if (!isValidTime(cleanTime)) return setFormError('Saat formatı HH:MM olmalı.');

    const payload = {
      title_template: cleanTitle,
      body_template: cleanBody,
      title: cleanTitle,
      body: cleanBody,
      target_role: 'all_staff',
      active,
      send_time: cleanTime,
      repeat_type: repeatType,
      updated_at: new Date().toISOString(),
      updated_by_staff_id: staff?.id ?? null,
    };

    const isGuest = scheduledAudience === 'guest';
    if (isGuest && guestTarget === 'specific_rooms' && !roomNumbers.trim()) {
      return setFormError('Belirli odalar için oda numarası girin (örn: 101, 205).');
    }

    const metadata = isGuest
      ? {
          notification_only: true,
          source: 'admin_notifications_templates',
          guest_bulk_target: guestTarget,
          room_numbers: roomNumbers
            .split(/[,;\s]+/)
            .map((s) => s.trim())
            .filter(Boolean),
          bulk_category: bulkCategory,
        }
      : {
          notification_only: true,
          source: 'admin_notifications_templates',
          excluded_staff_ids: excludedStaffIds,
        };

    const insertPayload = {
      organization_id: orgScoped,
      code: `notif_${Date.now()}`,
      template_kind: 'smart_ops',
      target_audience: scheduledAudience,
      template_key: `scheduled_${scheduledAudience}_${Date.now()}`,
      category: isGuest ? bulkCategory : 'info',
      critical_level: 'normal',
      require_photo: 'off',
      sound_type: 'normal',
      escalation_enabled: false,
      checklist: [],
      metadata,
      created_by_staff_id: staff?.id ?? null,
      ...payload,
      ...(isGuest ? { target_role: 'guest' } : { target_role: 'all_staff' }),
    };

    setSaving(true);
    const { error } = editingId
      ? await supabase.from('notification_templates').update({ ...payload, metadata, category: insertPayload.category, target_audience: scheduledAudience }).eq('id', editingId)
      : await supabase.from('notification_templates').insert(insertPayload);
    setSaving(false);
    if (error) return setFormError(error.message);

    const wasEditing = Boolean(editingId);
    resetForm();
    setFormSuccess(
      wasEditing
        ? 'Planlı şablon güncellendi.'
        : isGuest
          ? 'Misafir planlı şablon kaydedildi. Belirlenen saatte otomatik gönderilecek.'
          : 'Planlı şablon kaydedildi. Belirlenen saatte otomatik gönderilecek.'
    );
    setTab(isGuest ? 'scheduled_guest' : 'scheduled_staff');
    await load();
  };

  const toggleScheduled = async (id: string, next: boolean, audience: ScheduledAudience) => {
    const patch = (prev: ScheduledTemplateRow[]) =>
      prev.map((t) => (t.id === id ? { ...t, active: next } : t));
    if (audience === 'guest') setScheduledGuestTemplates(patch);
    else setScheduledStaffTemplates(patch);
    const { error } = await supabase
      .from('notification_templates')
      .update({ active: next, updated_at: new Date().toISOString(), updated_by_staff_id: staff?.id ?? null })
      .eq('id', id);
    if (error) {
      const revert = (prev: ScheduledTemplateRow[]) =>
        prev.map((t) => (t.id === id ? { ...t, active: !next } : t));
      if (audience === 'guest') setScheduledGuestTemplates(revert);
      else setScheduledStaffTemplates(revert);
      Alert.alert('Hata', error.message);
    }
  };

  const deleteScheduled = (item: ScheduledTemplateRow, audience: ScheduledAudience) => {
    Alert.alert(
      'Şablonu sil',
      `«${item.title ?? 'Başlıksız'}» planlı bildirimi kalıcı olarak silinsin mi?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(item.id);
            const { error } = await supabase.from('notification_templates').delete().eq('id', item.id);
            setDeletingId(null);
            if (error) {
              Alert.alert('Silinemedi', error.message);
              return;
            }
            if (audience === 'guest') {
              setScheduledGuestTemplates((prev) => prev.filter((t) => t.id !== item.id));
            } else {
              setScheduledStaffTemplates((prev) => prev.filter((t) => t.id !== item.id));
            }
          },
        },
      ]
    );
  };

  const tabs: { key: TabKey; label: string; count: number; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'scheduled_staff', label: 'Planlı · personel', count: stats.scheduledStaff, icon: 'alarm-outline' },
    { key: 'scheduled_guest', label: 'Planlı · misafir', count: stats.scheduledGuest, icon: 'time-outline' },
    { key: 'guest', label: 'Misafir metinleri', count: stats.guest, icon: 'people-outline' },
    { key: 'staff', label: 'Personel metinleri', count: stats.staff, icon: 'briefcase-outline' },
  ];

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
      keyboardShouldPersistTaps="handled"
    >
      <AdminOrganizationPicker canUseAll={canUseAll} ownOrganizationId={staff?.organization_id} />

      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons name="documents-outline" size={22} color={T.colors.accent} />
        </View>
        <View style={styles.heroText}>
          <Text style={styles.heroTitle}>Bildirim şablonları</Text>
          <Text style={styles.heroSub}>
            Hazır metinlerle hızlı gönderim veya saatli otomatik bildirim planlayın.
          </Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statChip}>
          <Text style={styles.statValue}>{stats.scheduledActive}</Text>
          <Text style={styles.statLabel}>Aktif plan</Text>
        </View>
        <View style={styles.statChip}>
          <Text style={styles.statValue}>{stats.scheduledGuest}</Text>
          <Text style={styles.statLabel}>Planlı misafir</Text>
        </View>
        <View style={styles.statChip}>
          <Text style={styles.statValue}>{stats.guest}</Text>
          <Text style={styles.statLabel}>Hazır misafir</Text>
        </View>
        <View style={styles.statChip}>
          <Text style={styles.statValue}>{stats.staff}</Text>
          <Text style={styles.statLabel}>Personel metni</Text>
        </View>
      </View>

      <Pressable style={styles.creatorToggle} onPress={() => setShowCreator((v) => !v)}>
        <View style={styles.creatorToggleLeft}>
          <Ionicons
            name={editingId ? 'create-outline' : 'add-circle-outline'}
            size={20}
            color={T.colors.accent}
          />
          <Text style={styles.creatorToggleText}>
            {editingId
              ? scheduledAudience === 'guest'
                ? 'Misafir planlı şablonu düzenle'
                : 'Personel planlı şablonu düzenle'
              : 'Yeni planlı bildirim oluştur'}
          </Text>
        </View>
        <Ionicons name={showCreator ? 'chevron-up' : 'chevron-down'} size={20} color={T.colors.textMuted} />
      </Pressable>

      {showCreator ? (
        <View style={styles.creatorCard}>
          {!canCreate ? (
            <Text style={styles.hintMuted}>Planlı şablon eklemek için üstten işletme seçin.</Text>
          ) : null}

          <Text style={styles.fieldLabel}>Alıcı</Text>
          <View style={styles.chips}>
            {(['staff', 'guest'] as ScheduledAudience[]).map((aud) => {
              const selected = scheduledAudience === aud;
              return (
                <TouchableOpacity
                  key={aud}
                  style={[styles.chip, selected && styles.chipActive]}
                  onPress={() => {
                    setScheduledAudience(aud);
                    if (aud === 'guest' && tab === 'scheduled_staff') setTab('scheduled_guest');
                    if (aud === 'staff' && tab === 'scheduled_guest') setTab('scheduled_staff');
                  }}
                  disabled={!canCreate || Boolean(editingId)}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                    {aud === 'guest' ? 'Misafir' : 'Personel'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>Başlık</Text>
          <TextInput
            style={styles.input}
            placeholder="Örn: Sabah brifingi"
            value={title}
            onChangeText={setTitle}
            editable={canCreate}
            placeholderTextColor={T.colors.textMuted}
            maxLength={120}
          />

          <View style={styles.fieldLabelRow}>
            <Text style={styles.fieldLabel}>Mesaj</Text>
            <Text style={styles.charCount}>{body.length}/500</Text>
          </View>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="Bildirim metnini yazın…"
            value={body}
            onChangeText={setBody}
            editable={canCreate}
            multiline
            maxLength={500}
            placeholderTextColor={T.colors.textMuted}
          />

          <Text style={styles.fieldLabel}>Gönderim saati</Text>
          <TextInput
            style={[styles.input, styles.timeInput]}
            value={sendTime}
            onChangeText={(v) => setSendTime(normalizeTimeInput(v))}
            editable={canCreate}
            keyboardType="numbers-and-punctuation"
            placeholder="09:00"
            placeholderTextColor={T.colors.textMuted}
          />

          <Text style={styles.fieldLabel}>Tekrar</Text>
          <View style={styles.chips}>
            {REPEAT_OPTIONS.map((o) => {
              const selected = repeatType === o.key;
              return (
                <TouchableOpacity
                  key={o.key}
                  style={[styles.chip, selected && styles.chipActive]}
                  onPress={() => setRepeatType(o.key)}
                  disabled={!canCreate}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextActive]}>{o.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {scheduledAudience === 'staff' ? (
            <TemplateStaffRecipientPicker
              organizationId={orgScoped}
              excludedStaffIds={excludedStaffIds}
              onToggleExclude={toggleExcludedStaff}
              disabled={!canCreate}
            />
          ) : (
            <>
              <Text style={styles.fieldLabel}>Misafir hedefi</Text>
              <View style={styles.chips}>
                {GUEST_TARGETS.map((o) => {
                  const selected = guestTarget === o.value;
                  return (
                    <TouchableOpacity
                      key={o.value}
                      style={[styles.chip, selected && styles.chipActive]}
                      onPress={() => setGuestTarget(o.value)}
                      disabled={!canCreate}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextActive]}>{o.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {guestTarget === 'specific_rooms' ? (
                <>
                  <Text style={styles.fieldLabel}>Oda numaraları</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="101, 205, 310"
                    value={roomNumbers}
                    onChangeText={setRoomNumbers}
                    editable={canCreate}
                    placeholderTextColor={T.colors.textMuted}
                  />
                </>
              ) : null}
              <Text style={styles.fieldLabel}>Bildirim türü</Text>
              <View style={styles.chips}>
                {BULK_CATEGORIES.map((o) => {
                  const selected = bulkCategory === o.value;
                  return (
                    <TouchableOpacity
                      key={o.value}
                      style={[styles.chip, selected && styles.chipActive]}
                      onPress={() => setBulkCategory(o.value)}
                      disabled={!canCreate}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextActive]}>{o.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.hintMuted}>
                Misafir uygulama tercihlerine göre filtrelenir (otel duyuruları / kampanya).
              </Text>
            </>
          )}

          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>Kayıt sonrası aktif</Text>
            <Switch
              value={active}
              onValueChange={setActive}
              disabled={!canCreate}
              trackColor={{ false: T.colors.border, true: T.colors.warningLight }}
              thumbColor={active ? T.colors.accent : T.colors.surface}
            />
          </View>

          {formError ? <Text style={styles.error}>{formError}</Text> : null}
          {formSuccess ? <Text style={styles.success}>{formSuccess}</Text> : null}

          {editingId ? (
            <TouchableOpacity style={styles.cancelEditBtn} onPress={resetForm} activeOpacity={0.85}>
              <Text style={styles.cancelEditBtnText}>Düzenlemeyi iptal et</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[styles.saveBtn, (!canCreate || saving) && styles.saveBtnDisabled]}
            onPress={() => void saveScheduledTemplate()}
            disabled={!canCreate || saving}
            activeOpacity={0.9}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="save-outline" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>
                  {editingId ? 'Değişiklikleri kaydet' : 'Planlı şablon kaydet'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
        {tabs.map((t) => {
          const selected = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabChip, selected && styles.tabChipActive]}
              onPress={() => {
                setTab(t.key);
                if (t.key === 'scheduled_guest') setScheduledAudience('guest');
                if (t.key === 'scheduled_staff') setScheduledAudience('staff');
              }}
              activeOpacity={0.85}
            >
              <Ionicons name={t.icon} size={16} color={selected ? '#fff' : T.colors.textSecondary} />
              <Text style={[styles.tabChipText, selected && styles.tabChipTextActive]}>{t.label}</Text>
              <View style={[styles.tabCount, selected && styles.tabCountActive]}>
                <Text style={[styles.tabCountText, selected && styles.tabCountTextActive]}>{t.count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={T.colors.accent} style={{ marginTop: 32 }} />
      ) : tab === 'scheduled_staff' || tab === 'scheduled_guest' ? (
        (() => {
          const audience: ScheduledAudience = tab === 'scheduled_guest' ? 'guest' : 'staff';
          const list = audience === 'guest' ? scheduledGuestTemplates : scheduledStaffTemplates;
          return list.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="alarm-outline" size={36} color={T.colors.border} />
              <Text style={styles.emptyTitle}>
                {audience === 'guest' ? 'Planlı misafir şablonu yok' : 'Planlı personel şablonu yok'}
              </Text>
              <Text style={styles.emptySub}>
                Yukarıdan alıcıyı seçip saatli otomatik bildirim oluşturabilirsiniz.
              </Text>
            </View>
          ) : (
            list.map((item) => (
              <ScheduledTemplateCard
                key={item.id}
                item={item}
                audience={audience}
                deleting={deletingId === item.id}
                onToggle={(v) => void toggleScheduled(item.id, v, audience)}
                onUse={() =>
                  openBulkWithTemplate(router, {
                    audience,
                    category:
                      audience === 'guest'
                        ? parseScheduledGuestCategory(item.metadata, item.category ?? 'info')
                        : 'info',
                    title: item.title ?? '',
                    body: item.body ?? '',
                    excludeStaffIds: parseExcludedStaffIds(item.metadata),
                    guestTarget: parseGuestBulkTarget(item.metadata),
                    roomNumbers: parseGuestRoomNumbers(item.metadata).join(', '),
                  })
                }
                onEdit={() => fillFormFromScheduled(item, audience, false)}
                onDuplicate={() => fillFormFromScheduled(item, audience, true)}
                onDelete={() => deleteScheduled(item, audience)}
              />
            ))
          );
        })()
      ) : tab === 'guest' ? (
        guestTemplates.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="people-outline" size={36} color={T.colors.border} />
            <Text style={styles.emptyTitle}>Misafir şablonu yok</Text>
          </View>
        ) : (
          guestTemplates.map((t) => (
            <ReadyTemplateCard
              key={t.id}
              item={t}
              onUse={() =>
                openBulkWithTemplate(router, {
                  audience: t.target_audience,
                  category: t.category,
                  title: t.title_template ?? '',
                  body: t.body_template ?? '',
                })
              }
            />
          ))
        )
      ) :         staffTemplates.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="briefcase-outline" size={36} color={T.colors.border} />
            <Text style={styles.emptyTitle}>Personel metni yok</Text>
            <Text style={styles.emptySub}>Sistem hazır metinleri burada listelenir (çalışan sayısı değil).</Text>
          </View>
      ) : (
        staffTemplates.map((t) => (
          <ReadyTemplateCard
            key={t.id}
            item={t}
            onUse={() =>
              openBulkWithTemplate(router, {
                audience: t.target_audience,
                category: t.category,
                title: t.title_template ?? '',
                body: t.body_template ?? '',
              })
            }
          />
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: T.colors.surfaceSecondary },
  content: { padding: T.spacing.lg },
  hero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: T.spacing.sm,
    marginBottom: T.spacing.md,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: T.colors.warningLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { flex: 1 },
  heroTitle: { fontSize: 20, fontWeight: '800', color: T.colors.text },
  heroSub: { fontSize: 13, color: T.colors.textSecondary, lineHeight: 19, marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: T.spacing.md },
  statChip: {
    flex: 1,
    backgroundColor: T.colors.surface,
    borderRadius: T.radius.md,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  statValue: { fontSize: 20, fontWeight: '800', color: T.colors.primary },
  statLabel: { fontSize: 11, color: T.colors.textMuted, marginTop: 2 },
  creatorToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: T.colors.surface,
    borderRadius: T.radius.md,
    padding: 14,
    marginBottom: T.spacing.sm,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  creatorToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  creatorToggleText: { fontSize: 14, fontWeight: '700', color: T.colors.text },
  creatorCard: {
    backgroundColor: T.colors.surface,
    borderRadius: T.radius.lg,
    padding: T.spacing.lg,
    marginBottom: T.spacing.lg,
    borderWidth: 1,
    borderColor: T.colors.border,
    ...T.shadow.sm,
  },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: T.colors.textSecondary, marginBottom: 6, marginTop: 4 },
  fieldLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  charCount: { fontSize: 11, color: T.colors.textMuted },
  input: {
    backgroundColor: T.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: T.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: T.colors.text,
    marginBottom: 8,
  },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  timeInput: { maxWidth: 120 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: T.colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  chipActive: { backgroundColor: T.colors.primary, borderColor: T.colors.primary },
  chipText: { fontSize: 12, color: T.colors.textSecondary, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 8,
  },
  saveBtn: {
    marginTop: 8,
    backgroundColor: T.colors.primary,
    borderRadius: T.radius.md,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  error: { color: T.colors.error, fontSize: 12, marginBottom: 6 },
  success: { color: T.colors.success, fontSize: 12, marginBottom: 6 },
  hintMuted: { fontSize: 13, color: T.colors.textMuted, marginBottom: 10 },
  tabScroll: { marginBottom: T.spacing.md, maxHeight: 44 },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 22,
    backgroundColor: T.colors.surface,
    borderWidth: 1,
    borderColor: T.colors.border,
    marginRight: 8,
  },
  tabChipActive: { backgroundColor: T.colors.primary, borderColor: T.colors.primary },
  tabChipText: { fontSize: 13, fontWeight: '700', color: T.colors.textSecondary },
  tabChipTextActive: { color: '#fff' },
  tabCount: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: T.colors.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  tabCountActive: { backgroundColor: 'rgba(255,255,255,0.22)' },
  tabCountText: { fontSize: 11, fontWeight: '800', color: T.colors.textMuted },
  tabCountTextActive: { color: '#fff' },
  emptyBox: { alignItems: 'center', paddingVertical: 36, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: T.colors.textSecondary },
  emptySub: { fontSize: 13, color: T.colors.textMuted, textAlign: 'center', paddingHorizontal: 24 },
  scheduledCard: {
    backgroundColor: T.colors.surface,
    borderRadius: T.radius.lg,
    padding: T.spacing.lg,
    marginBottom: T.spacing.md,
    borderWidth: 1,
    borderColor: T.colors.border,
    ...T.shadow.sm,
  },
  scheduledCardPaused: { opacity: 0.82 },
  scheduledHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  scheduledIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: T.colors.warningLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduledHeadText: { flex: 1, minWidth: 0 },
  scheduledTitle: { fontSize: 16, fontWeight: '800', color: T.colors.text },
  scheduledMeta: { fontSize: 12, color: T.colors.textMuted, marginTop: 2 },
  scheduledBody: { fontSize: 14, color: T.colors.textSecondary, lineHeight: 20 },
  scheduledFoot: { fontSize: 11, color: T.colors.textMuted, marginTop: 10 },
  scheduledActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  actionBtnOutline: {
    flexGrow: 1,
    flexBasis: '22%',
    minWidth: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: T.radius.md,
    borderWidth: 1,
    borderColor: T.colors.border,
    backgroundColor: T.colors.surfaceSecondary,
  },
  actionBtnOutlineText: { fontSize: 11, fontWeight: '700', color: T.colors.primary },
  actionBtnDanger: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: T.radius.md,
    borderWidth: 1,
    borderColor: T.colors.errorLight,
    backgroundColor: T.colors.errorLight,
  },
  cancelEditBtn: {
    marginTop: 4,
    marginBottom: 4,
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelEditBtnText: { fontSize: 13, fontWeight: '600', color: T.colors.textMuted },
  actionBtnDisabled: { opacity: 0.6 },
  readyCard: {
    backgroundColor: T.colors.surface,
    borderRadius: T.radius.lg,
    padding: T.spacing.lg,
    marginBottom: T.spacing.md,
    borderWidth: 1,
    borderColor: T.colors.border,
    ...T.shadow.sm,
  },
  readyCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  categoryBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  categoryBadgeText: { fontSize: 11, fontWeight: '800' },
  systemPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  systemPillText: { fontSize: 11, color: T.colors.textMuted, fontWeight: '600' },
  readyTitle: { fontSize: 16, fontWeight: '800', color: T.colors.text, marginBottom: 6 },
  readyBody: { fontSize: 14, color: T.colors.textSecondary, lineHeight: 20 },
  useBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: T.colors.accent,
    borderRadius: T.radius.md,
    paddingVertical: 11,
  },
  useBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
});
