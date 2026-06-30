import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { AdminButton, AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrganizationQueryScope } from '@/hooks/useAdminOrganizationQueryScope';
import {
  fetchFinanceCheckNotifySettings,
  saveFinanceCheckNotifySettings,
  FINANCE_CHECK_NOTIFY_LEAD_OPTIONS,
} from '@/lib/financeCheckNotifySettings';
import { formatDateShort } from '@/lib/date';

type StaffRow = { id: string; full_name: string | null; role: string; department: string | null };

export default function AdminFinanceCheckNotifySettings() {
  const T = adminTheme;
  const { staff, canUseAll, canQuery, orgScoped } = useAdminOrganizationQueryScope();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [enabled, setEnabled] = useState(false);
  const [startTime, setStartTime] = useState('08:00');
  const [notifyFirstDate, setNotifyFirstDate] = useState('');
  const [leadDays, setLeadDays] = useState<number[]>([0, 7]);
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canQuery || !orgScoped) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [{ data: staffData, error: staffErr }, settings] = await Promise.all([
        supabase
          .from('staff')
          .select('id, full_name, role, department')
          .eq('organization_id', orgScoped)
          .eq('is_active', true)
          .order('full_name'),
        fetchFinanceCheckNotifySettings(orgScoped),
      ]);
      if (staffErr) {
        Alert.alert('Hata', staffErr.message);
        return;
      }
      setStaffList((staffData ?? []) as StaffRow[]);
      setSelected(new Set(settings.notifyStaffIds));
      setEnabled(settings.enabled);
      setStartTime(settings.notifyStartTime);
      setNotifyFirstDate(settings.notifyFirstDate ?? '');
      setLeadDays(settings.notifyLeadDays);
      setLastSentAt(settings.lastSentAt);
    } finally {
      setLoading(false);
    }
  }, [canQuery, orgScoped]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleLeadDay = (days: number) => {
    setLeadDays((prev) => {
      const has = prev.includes(days);
      const next = has ? prev.filter((d) => d !== days) : [...prev, days].sort((a, b) => a - b);
      return next.length ? next : [days];
    });
  };

  const setTodayAsFirstDate = () => {
    setNotifyFirstDate(new Date().toISOString().slice(0, 10));
  };

  const save = async () => {
    if (!orgScoped) {
      Alert.alert('Hata', 'İşletme seçin.');
      return;
    }
    if (enabled && selected.size === 0) {
      Alert.alert('Eksik seçim', 'Bildirim açıkken en az bir personel seçin.');
      return;
    }
    if (enabled && leadDays.length === 0) {
      Alert.alert('Eksik seçim', 'En az bir bildirim günü seçin.');
      return;
    }
    setSaving(true);
    try {
      const res = await saveFinanceCheckNotifySettings(orgScoped, {
        enabled,
        notifyStaffIds: [...selected],
        notifyStartTime: startTime,
        notifyFirstDate: notifyFirstDate.trim() || null,
        notifyLeadDays: leadDays,
      });
      if (!res.ok) {
        Alert.alert('Hata', res.message);
        return;
      }
      const leadLabels = FINANCE_CHECK_NOTIFY_LEAD_OPTIONS.filter((o) => leadDays.includes(o.days))
        .map((o) => o.label)
        .join(', ');
      Alert.alert(
        'Kaydedildi',
        enabled
          ? `Her gün ${startTime} saatinde, ${leadLabels} eşleşen çekler için seçili personele detaylı bildirim gider.${notifyFirstDate.trim() ? ` İlk tarih: ${notifyFirstDate.trim()}.` : ''}`
          : 'Çek bildirimleri kapatıldı.',
      );
      await load();
    } finally {
      setSaving(false);
    }
  };

  const previewBody =
    'Verilen çek · ABC Tedarik · 45.000,00 TL · Vade 20.06.2026 · Ziraat Bankası · Çek no 123456 · Çek girildi';

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <AdminOrganizationPicker canUseAll={canUseAll} ownOrganizationId={staff?.organization_id} />

        <LinearGradient colors={['#0f172a', '#1e293b']} style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="notifications" size={22} color="#fff" />
          </View>
          <Text style={styles.heroTitle}>Çek vadesi bildirimi</Text>
          <Text style={styles.heroSub}>
            Seçtiğiniz günlerde (vade günü veya öncesinde) eşleşen her çek için ayrı push gider. Bildirim metninde
            karşı taraf, tutar, vade, banka ve durum yer alır.
          </Text>
        </LinearGradient>

        <View style={styles.card}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>Push bildirimi</Text>
              <Text style={styles.switchSub}>Açıkken günlük otomatik hatırlatma çalışır</Text>
            </View>
            <Switch value={enabled} onValueChange={setEnabled} />
          </View>

          <Text style={styles.label}>Bildirim başlangıç tarihi</Text>
          <View style={styles.dateRow}>
            <TextInput
              style={[styles.timeInput, styles.dateInput]}
              value={notifyFirstDate}
              onChangeText={setNotifyFirstDate}
              placeholder="YYYY-MM-DD (boş = hemen)"
              keyboardType="numbers-and-punctuation"
              maxLength={10}
            />
            <TouchableOpacity style={styles.todayBtn} onPress={setTodayAsFirstDate} activeOpacity={0.85}>
              <Text style={styles.todayBtnText}>Bugün</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>Bu tarihten önce bildirim gönderilmez. Boş bırakılırsa hemen başlar.</Text>

          <Text style={styles.label}>Hangi günlerde bildirim gitsin?</Text>
          <View style={styles.chipWrap}>
            {FINANCE_CHECK_NOTIFY_LEAD_OPTIONS.map((opt) => {
              const on = leadDays.includes(opt.days);
              return (
                <TouchableOpacity
                  key={opt.days}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() => toggleLeadDay(opt.days)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.hint}>
            Örnek: «7 gün önce» seçiliyse vadesi 7 gün sonra olan çekler bugün bildirilir; «Vade günü» vadesi bugün
            olan çekleri gönderir.
          </Text>

          <Text style={styles.label}>Günlük bildirim saati</Text>
          <TextInput
            style={styles.timeInput}
            value={startTime}
            onChangeText={setStartTime}
            placeholder="08:00"
            keyboardType="numbers-and-punctuation"
            maxLength={5}
          />
          <Text style={styles.hint}>Her eşleşen günde bir kez, bu saatte (±15 dk) gönderilir.</Text>

          {lastSentAt ? (
            <Text style={styles.lastSent}>
              Son gönderim: {formatDateShort(lastSentAt.slice(0, 10))} · {lastSentAt.slice(11, 16)}
            </Text>
          ) : null}
        </View>

        <View style={styles.previewCard}>
          <Text style={styles.previewTitle}>Örnek bildirim içeriği</Text>
          <Text style={styles.previewSample}>{previewBody}</Text>
        </View>

        <Text style={styles.sectionTitle}>Bildirim alacak personel</Text>
        <Text style={styles.sectionHint}>Muhasebe ve ilgili hesapları işaretleyin.</Text>

        {loading ? (
          <ActivityIndicator color={T.colors.accent} style={{ marginTop: 24 }} />
        ) : (
          <View style={styles.listWrap}>
            {staffList.map((item) => {
              const on = selected.has(item.id);
              return (
                <View key={item.id} style={[styles.row, on && styles.rowOn]}>
                  <View style={[styles.avatar, on && styles.avatarOn]}>
                    <Text style={[styles.avatarText, on && styles.avatarTextOn]}>
                      {(item.full_name || '?').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.full_name || '—'}</Text>
                    <Text style={styles.role}>
                      {[item.role, item.department].filter(Boolean).join(' · ') || 'Personel'}
                    </Text>
                  </View>
                  <Switch value={on} onValueChange={() => toggle(item.id)} />
                </View>
              );
            })}
            {staffList.length === 0 ? (
              <Text style={styles.empty}>Bu işletmede aktif personel yok.</Text>
            ) : null}
          </View>
        )}

        <AdminButton
          title={saving ? 'Kaydediliyor…' : 'Ayarları kaydet'}
          onPress={() => void save()}
          disabled={saving || loading || !orgScoped}
          fullWidth
        />
      </ScrollView>
    </View>
  );
}

const T = adminTheme;
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.colors.surfaceSecondary },
  scrollContent: { padding: 16, gap: 10, paddingBottom: 32 },
  hero: { borderRadius: 16, padding: 16, marginBottom: 4 },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(245,158,11,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  heroTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  heroSub: { fontSize: 13, color: '#94a3b8', lineHeight: 19, marginTop: 6 },
  card: {
    backgroundColor: T.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.colors.border,
    padding: 14,
    gap: 4,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  switchTitle: { fontSize: 15, fontWeight: '800', color: T.colors.text },
  switchSub: { fontSize: 12, color: T.colors.textMuted, marginTop: 2 },
  label: { fontSize: 13, fontWeight: '700', color: T.colors.textSecondary, marginTop: 8 },
  dateRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dateInput: { flex: 1 },
  todayBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: T.colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  todayBtnText: { fontSize: 13, fontWeight: '800', color: T.colors.primary },
  timeInput: {
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '700',
    color: T.colors.text,
    backgroundColor: T.colors.surfaceSecondary,
    letterSpacing: 0.5,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: T.colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  chipOn: { backgroundColor: '#b45309', borderColor: '#b45309' },
  chipText: { fontSize: 12, fontWeight: '700', color: T.colors.textSecondary },
  chipTextOn: { color: '#fff' },
  hint: { fontSize: 12, color: T.colors.textMuted, lineHeight: 17 },
  lastSent: { fontSize: 12, color: T.colors.info, fontWeight: '600', marginTop: 6 },
  previewCard: {
    backgroundColor: '#fffbeb',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fde68a',
    padding: 14,
  },
  previewTitle: { fontSize: 12, fontWeight: '800', color: '#92400e', marginBottom: 6, textTransform: 'uppercase' },
  previewSample: { fontSize: 13, lineHeight: 20, color: '#78350f', fontWeight: '600' },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: T.colors.text, marginTop: 4 },
  sectionHint: { fontSize: 12, color: T.colors.textMuted, lineHeight: 17 },
  listWrap: { gap: 6, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.colors.border,
    padding: 12,
    gap: 10,
  },
  rowOn: { borderColor: '#f59e0b', backgroundColor: '#fffbeb' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: T.colors.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOn: { backgroundColor: '#b45309' },
  avatarText: { fontSize: 16, fontWeight: '800', color: T.colors.textSecondary },
  avatarTextOn: { color: '#fff' },
  name: { fontSize: 15, fontWeight: '700', color: T.colors.text },
  role: { fontSize: 12, color: T.colors.textMuted, marginTop: 2 },
  empty: { textAlign: 'center', color: T.colors.textMuted, marginTop: 16 },
});
