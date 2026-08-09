import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
  ScrollView,
  Switch,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard } from '@/components/admin';
import { DEFAULT_PUBLIC_MENU_ORG_SLUG } from '@/lib/publicPortalNav';

type CampaignRow = {
  id: string;
  code: string;
  name: string;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  audience: string;
  min_nights: number;
  min_members: number;
  student_extra_percent: number;
  is_active: boolean;
};

export default function AdminBookingCampaigns() {
  const router = useRouter();
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState('10');
  const [audience, setAudience] = useState<'all' | 'student' | 'group'>('all');
  const [minNights, setMinNights] = useState('1');
  const [minMembers, setMinMembers] = useState('1');
  const [studentExtra, setStudentExtra] = useState('0');

  const load = useCallback(async () => {
    try {
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', DEFAULT_PUBLIC_MENU_ORG_SLUG)
        .maybeSingle();
      let q = supabase
        .from('booking_campaigns')
        .select(
          'id, code, name, discount_type, discount_value, audience, min_nights, min_members, student_extra_percent, is_active'
        )
        .order('created_at', { ascending: false })
        .limit(80);
      if (org?.id) q = q.eq('organization_id', org.id);
      const { data, error } = await q;
      if (error) throw error;
      setRows(
        (data ?? []).map((r) => ({
          ...(r as CampaignRow),
          discount_type: String((r as CampaignRow).discount_type) === 'fixed' ? 'fixed' : 'percent',
        }))
      );
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message || 'Yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const save = async () => {
    if (code.trim().length < 2 || name.trim().length < 2) {
      Alert.alert('Eksik', 'Kod ve kampanya adı gerekli.');
      return;
    }
    const val = Number(String(discountValue).replace(',', '.'));
    if (!Number.isFinite(val) || val < 0) {
      Alert.alert('Hata', 'İndirim değeri geçersiz.');
      return;
    }
    setSaving(true);
    try {
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', DEFAULT_PUBLIC_MENU_ORG_SLUG)
        .maybeSingle();
      if (!org?.id) throw new Error('Organizasyon bulunamadı');
      const { error } = await supabase.from('booking_campaigns').insert({
        organization_id: org.id,
        code: code.trim().toUpperCase(),
        name: name.trim(),
        discount_type: discountType,
        discount_value: val,
        audience,
        min_nights: Math.max(1, Number(minNights) || 1),
        min_members: Math.max(1, Number(minMembers) || 1),
        student_extra_percent: Math.max(0, Number(String(studentExtra).replace(',', '.')) || 0),
        is_active: true,
      });
      if (error) throw error;
      setCode('');
      setName('');
      setDiscountValue('10');
      await load();
      Alert.alert('Kaydedildi', 'Kampanya aktif. Misafir kodu girebilir.');
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message || 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (row: CampaignRow) => {
    const { error } = await supabase
      .from('booking_campaigns')
      .update({ is_active: !row.is_active, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (error) Alert.alert('Hata', error.message);
    else void load();
  };

  const remove = (id: string) => {
    Alert.alert('Sil', 'Kampanya silinsin mi?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('booking_campaigns').delete().eq('id', id);
          if (error) Alert.alert('Hata', error.message);
          else void load();
        },
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={adminTheme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Kampanyalar & indirimler</Text>
        <Text style={styles.sub}>
          Öğrenci / grup kodları. Misafir rezervasyonda kod girer; list fiyat − indirim = ödenecek tutar.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
        <AdminCard style={styles.form}>
          <Text style={styles.label}>Kod</Text>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            placeholder="OGRENCI10"
            autoCapitalize="characters"
          />
          <Text style={styles.label}>Ad</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Öğrenci indirimi" />

          <Text style={styles.label}>Tür</Text>
          <View style={styles.chips}>
            {(['percent', 'fixed'] as const).map((k) => (
              <TouchableOpacity
                key={k}
                style={[styles.chip, discountType === k && styles.chipOn]}
                onPress={() => setDiscountType(k)}
              >
                <Text style={[styles.chipText, discountType === k && styles.chipTextOn]}>
                  {k === 'percent' ? 'Yüzde %' : 'Sabit ₺'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>İndirim değeri</Text>
          <TextInput
            style={styles.input}
            value={discountValue}
            onChangeText={setDiscountValue}
            keyboardType="decimal-pad"
            placeholder="10"
          />

          <Text style={styles.label}>Hedef kitle</Text>
          <View style={styles.chips}>
            {([
              ['all', 'Herkes'],
              ['student', 'Öğrenci'],
              ['group', 'Grup'],
            ] as const).map(([k, label]) => (
              <TouchableOpacity
                key={k}
                style={[styles.chip, audience === k && styles.chipOn]}
                onPress={() => setAudience(k)}
              >
                <Text style={[styles.chipText, audience === k && styles.chipTextOn]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Min. gece</Text>
              <TextInput style={styles.input} value={minNights} onChangeText={setMinNights} keyboardType="number-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Min. kişi</Text>
              <TextInput style={styles.input} value={minMembers} onChangeText={setMinMembers} keyboardType="number-pad" />
            </View>
          </View>

          <Text style={styles.label}>Öğrenci ekstra % (opsiyonel)</Text>
          <TextInput style={styles.input} value={studentExtra} onChangeText={setStudentExtra} keyboardType="decimal-pad" />

          <TouchableOpacity style={styles.saveBtn} onPress={() => void save()} disabled={saving} activeOpacity={0.88}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Kampanya ekle</Text>}
          </TouchableOpacity>
        </AdminCard>

        {loading ? (
          <ActivityIndicator color="#0f766e" style={{ marginTop: 20 }} />
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(r) => r.id}
            scrollEnabled={false}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
            contentContainerStyle={{ gap: 10, paddingBottom: 40 }}
            ListEmptyComponent={<Text style={styles.empty}>Henüz kampanya yok.</Text>}
            renderItem={({ item }) => (
              <AdminCard style={[styles.rowCard, !item.is_active && styles.rowOff]}>
                <Text style={styles.rowCode}>{item.code}</Text>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowMeta}>
                  {item.discount_type === 'percent' ? `%${item.discount_value}` : `${item.discount_value} ₺`}
                  {' · '}
                  {item.audience === 'student' ? 'Öğrenci' : item.audience === 'group' ? 'Grup' : 'Herkes'}
                  {' · '}min {item.min_members} kişi / {item.min_nights} gece
                </Text>
                <View style={styles.rowActions}>
                  <View style={styles.switchRow}>
                    <Text style={styles.switchLbl}>{item.is_active ? 'Aktif' : 'Kapalı'}</Text>
                    <Switch value={item.is_active} onValueChange={() => void toggle(item)} />
                  </View>
                  <TouchableOpacity onPress={() => remove(item.id)}>
                    <Ionicons name="trash-outline" size={18} color="#b42318" />
                  </TouchableOpacity>
                </View>
              </AdminCard>
            )}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: adminTheme.colors.background },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 6 },
  back: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', marginBottom: 4,
  },
  title: { fontSize: 22, fontWeight: '800', color: adminTheme.colors.text },
  sub: { fontSize: 13, fontWeight: '500', color: adminTheme.colors.textMuted, lineHeight: 19 },
  formScroll: { paddingHorizontal: 16, paddingBottom: 24, gap: 14 },
  form: { gap: 8, padding: 14 },
  label: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textMuted, marginTop: 4 },
  input: {
    borderWidth: 1, borderColor: 'rgba(15,23,42,0.1)', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 15, fontWeight: '600', color: adminTheme.colors.text, backgroundColor: '#fff',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#f1f5f9' },
  chipOn: { backgroundColor: '#ccfbf1' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  chipTextOn: { color: '#0f766e' },
  row2: { flexDirection: 'row', gap: 10 },
  saveBtn: {
    marginTop: 10, backgroundColor: '#0f766e', borderRadius: 14, paddingVertical: 14, alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '800' },
  empty: { textAlign: 'center', color: '#94a3b8', fontWeight: '600', paddingVertical: 28 },
  rowCard: { padding: 14, gap: 4 },
  rowOff: { opacity: 0.55 },
  rowCode: { fontSize: 13, fontWeight: '900', color: '#0f766e', letterSpacing: 0.6 },
  rowName: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  rowMeta: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  rowActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  switchLbl: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
});
