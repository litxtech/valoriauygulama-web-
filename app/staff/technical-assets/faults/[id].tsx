import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { canOperateTechnicalAssets, hasTechnicalAssetsStaffAccess } from '@/lib/staffPermissions';
import { useAuthStore } from '@/stores/authStore';
import type { TechFaultReportRow } from '@/lib/technicalAssets';

export default function TechnicalFaultDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const [row, setRow] = useState<TechFaultReportRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolution, setResolution] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase.from('tech_fault_reports').select('*').eq('id', id).maybeSingle();
    if (!error && data) setRow(data as TechFaultReportRow);
    else setRow(null);
  }, [id]);

  useEffect(() => {
    if (!hasTechnicalAssetsStaffAccess(staff)) {
      router.replace('/staff/technical-assets');
      return;
    }
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load, router, staff]);

  const setStatus = (status: string) => {
    if (!row || !canOperateTechnicalAssets(staff)) return;
    Alert.alert('Durum', `Kaydı «${status}» yap?`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Evet',
        onPress: async () => {
          const patch: Record<string, unknown> = { status };
          if (status === 'resolved') {
            patch.resolved_at = new Date().toISOString();
            patch.resolved_by_staff_id = staff?.id;
            if (resolution.trim()) patch.resolution_note = resolution.trim();
          }
          const { error } = await supabase.from('tech_fault_reports').update(patch).eq('id', row.id);
          if (error) Alert.alert('Hata', error.message);
          else {
            setResolution('');
            await load();
          }
        },
      },
    ]);
  };

  if (!hasTechnicalAssetsStaffAccess(staff)) return null;

  if (loading || !row) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a365d" />
      </View>
    );
  }

  const canOp = canOperateTechnicalAssets(staff);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {row.is_emergency ? (
        <View style={styles.emergency}>
          <Text style={styles.emergencyText}>ACİL BİLDİRİM</Text>
        </View>
      ) : null}
      <Text style={styles.title}>{row.title}</Text>
      <Text style={styles.meta}>
        {row.status} · {new Date(row.created_at).toLocaleString('tr-TR')}
      </Text>
      {row.description ? <Text style={styles.body}>{row.description}</Text> : null}
      {row.asset_id ? (
        <TouchableOpacity style={styles.link} onPress={() => router.push(`/staff/technical-assets/${row.asset_id}`)}>
          <Text style={styles.linkText}>İlgili teknik varlığa git →</Text>
        </TouchableOpacity>
      ) : null}
      {row.resolution_note ? (
        <View style={styles.resBox}>
          <Text style={styles.resTitle}>Çözüm notu</Text>
          <Text style={styles.body}>{row.resolution_note}</Text>
        </View>
      ) : null}

      {canOp && row.status !== 'resolved' && row.status !== 'cancelled' ? (
        <>
          <Text style={styles.section}>Çözüm notu (isteğe bağlı)</Text>
          <TextInput
            style={[styles.input, styles.tall]}
            value={resolution}
            onChangeText={setResolution}
            multiline
            placeholderTextColor="#94a3b8"
            placeholder="Ne yapıldı, kime devredildi…"
          />
          <TouchableOpacity style={styles.btn} onPress={() => setStatus('in_progress')}>
            <Text style={styles.btnText}>Üzerinde çalışılıyor</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnOk]} onPress={() => setStatus('resolved')}>
            <Text style={styles.btnText}>Çözüldü</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnMuted]} onPress={() => setStatus('cancelled')}>
            <Text style={styles.btnText}>İptal</Text>
          </TouchableOpacity>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emergency: { backgroundColor: '#dc2626', padding: 10, borderRadius: 8, marginBottom: 12, alignSelf: 'flex-start' },
  emergencyText: { color: '#fff', fontWeight: '900' },
  title: { fontSize: 20, fontWeight: '900', color: '#0f172a' },
  meta: { fontSize: 13, color: '#64748b', marginTop: 8 },
  body: { fontSize: 15, color: '#334155', marginTop: 14, lineHeight: 22 },
  link: { marginTop: 16, paddingVertical: 10 },
  linkText: { color: '#1d4ed8', fontWeight: '800' },
  resBox: { marginTop: 20, padding: 12, backgroundColor: '#ecfdf5', borderRadius: 10 },
  resTitle: { fontWeight: '800', color: '#065f46', marginBottom: 6 },
  section: { marginTop: 20, fontWeight: '800', color: '#1a365d' },
  input: {
    marginTop: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: '#0f172a',
  },
  tall: { minHeight: 88, textAlignVertical: 'top' },
  btn: { marginTop: 12, backgroundColor: '#1a365d', padding: 14, borderRadius: 12, alignItems: 'center' },
  btnOk: { backgroundColor: '#047857' },
  btnMuted: { backgroundColor: '#64748b' },
  btnText: { color: '#fff', fontWeight: '800' },
});
