import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrganizationQueryScope } from '@/hooks/useAdminOrganizationQueryScope';
import type { BreakfastConfirmationSettings } from '@/lib/breakfastConfirm';

export default function AdminBreakfastConfirmSettingsScreen() {
  const { staff, canUseAll, orgScoped, canQuery } = useAdminOrganizationQueryScope();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [featureEnabled, setFeatureEnabled] = useState(true);
  const [minPhotos, setMinPhotos] = useState('1');
  const [maxPhotos, setMaxPhotos] = useState('3');
  const [guestRequired, setGuestRequired] = useState(true);
  const [noteRequired, setNoteRequired] = useState(false);
  const [dailyLimit, setDailyLimit] = useState('1');
  const [timeStart, setTimeStart] = useState('');
  const [timeEnd, setTimeEnd] = useState('');
  const [requireKitchen, setRequireKitchen] = useState(true);

  const load = useCallback(async () => {
    if (!canQuery || !orgScoped) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('breakfast_confirmation_settings')
      .select('*')
      .eq('organization_id', orgScoped)
      .maybeSingle();
    if (error) {
      Alert.alert('Hata', error.message);
      setLoading(false);
      return;
    }
    const row = data as BreakfastConfirmationSettings | null;
    if (row) {
      setFeatureEnabled(row.feature_enabled);
      setMinPhotos(String(row.min_photos));
      setMaxPhotos(String(row.max_photos));
      setGuestRequired(row.guest_count_required);
      setNoteRequired(row.note_required);
      setDailyLimit(String(row.daily_record_limit));
      setTimeStart(row.submission_time_start?.slice(0, 5) ?? '');
      setTimeEnd(row.submission_time_end?.slice(0, 5) ?? '');
      setRequireKitchen(row.require_kitchen_department);
    }
    setLoading(false);
  }, [canQuery, orgScoped]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!orgScoped) {
      Alert.alert('Hata', 'İşletme seçin veya personel kaydına işletme atayın.');
      return;
    }
    const minP = parseInt(minPhotos, 10);
    const maxP = parseInt(maxPhotos, 10);
    const daily = parseInt(dailyLimit, 10);
    if (!Number.isFinite(minP) || !Number.isFinite(maxP) || minP < 0 || maxP < minP) {
      Alert.alert('Hata', 'Fotoğraf sayıları geçersiz.');
      return;
    }
    if (!Number.isFinite(daily) || daily < 1) {
      Alert.alert('Hata', 'Günlük kayıt sınırı en az 1 olmalı.');
      return;
    }
    const parseTime = (s: string): string | null => {
      const t = s.trim();
      if (!t) return null;
      const m = t.match(/^(\d{1,2}):(\d{2})$/);
      if (!m) return null;
      const h = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      if (h < 0 || h > 23 || min < 0 || min > 59) return null;
      return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`;
    };
    const ts = parseTime(timeStart);
    const te = parseTime(timeEnd);
    if (Boolean(timeStart.trim()) !== Boolean(timeEnd.trim())) {
      Alert.alert('Hata', 'Gönderim saatini kısıtlamak için başlangıç ve bitişi birlikte girin; sınırsız için ikisini de boş bırakın.');
      return;
    }
    if (timeStart.trim() && !ts) {
      Alert.alert('Hata', 'Başlangıç saati HH:MM formatında olmalı (örn. 06:00).');
      return;
    }
    if (timeEnd.trim() && !te) {
      Alert.alert('Hata', 'Bitiş saati HH:MM formatında olmalı.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('breakfast_confirmation_settings')
        .update({
          feature_enabled: featureEnabled,
          min_photos: minP,
          max_photos: maxP,
          guest_count_required: guestRequired,
          note_required: noteRequired,
          daily_record_limit: daily,
          submission_time_start: ts,
          submission_time_end: te,
          require_kitchen_department: requireKitchen,
        })
        .eq('organization_id', orgScoped);
      if (error) throw new Error(error.message);
      Alert.alert('Kaydedildi', 'Kahvaltı teyit ayarları güncellendi.');
    } catch (e: unknown) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AdminOrganizationPicker canUseAll={canUseAll} ownOrganizationId={staff?.organization_id} />
        <Text style={styles.section}>Özellik</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Kahvaltı teyidi aktif</Text>
          <Switch value={featureEnabled} onValueChange={setFeatureEnabled} />
        </View>

        <Text style={styles.section}>Fotoğraf</Text>
        <Text style={styles.label}>Minimum zorunlu fotoğraf</Text>
        <TextInput style={styles.input} value={minPhotos} onChangeText={setMinPhotos} keyboardType="number-pad" />
        <Text style={styles.label}>Maksimum fotoğraf</Text>
        <TextInput style={styles.input} value={maxPhotos} onChangeText={setMaxPhotos} keyboardType="number-pad" />

        <Text style={styles.section}>Alanlar</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Kişi sayısı zorunlu</Text>
          <Switch value={guestRequired} onValueChange={setGuestRequired} />
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Not zorunlu</Text>
          <Switch value={noteRequired} onValueChange={setNoteRequired} />
        </View>

        <Text style={styles.section}>Kurallar</Text>
        <Text style={styles.label}>Günlük kayıt sınırı (personel başına)</Text>
        <TextInput style={styles.input} value={dailyLimit} onChangeText={setDailyLimit} keyboardType="number-pad" />
        <View style={styles.row}>
          <Text style={styles.label}>Sadece mutfak / restoran departmanı</Text>
          <Switch value={requireKitchen} onValueChange={setRequireKitchen} />
        </View>

        <Text style={styles.section}>Gönderim saati (İstanbul, boş = sınır yok)</Text>
        <Text style={styles.hint}>Örn. 06:00 — 11:00. Gece saran aralık da desteklenir (örn. 22:00 — 06:00).</Text>
        <Text style={styles.label}>Başlangıç (HH:MM)</Text>
        <TextInput style={styles.input} value={timeStart} onChangeText={setTimeStart} placeholder="06:00" />
        <Text style={styles.label}>Bitiş (HH:MM)</Text>
        <TextInput style={styles.input} value={timeEnd} onChangeText={setTimeEnd} placeholder="11:00" />

        <TouchableOpacity style={styles.primaryBtn} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Kaydet</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 20, paddingBottom: 40 },
  section: { fontSize: 17, fontWeight: '700', color: adminTheme.colors.text, marginTop: 20, marginBottom: 10 },
  label: { fontSize: 14, color: adminTheme.colors.textSecondary, marginBottom: 6 },
  hint: { fontSize: 13, color: adminTheme.colors.textMuted, marginBottom: 10, lineHeight: 18 },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.borderLight,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 12,
    backgroundColor: '#fff',
    color: adminTheme.colors.text,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  primaryBtn: {
    marginTop: 24,
    backgroundColor: adminTheme.colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
