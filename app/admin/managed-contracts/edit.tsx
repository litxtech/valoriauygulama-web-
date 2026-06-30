import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { adminTheme } from '@/constants/adminTheme';
import { useAuthStore } from '@/stores/authStore';
import { MANAGED_CONTRACT_TYPES, DEPARTMENT_OPTIONS } from '@/lib/managedContracts/constants';
import { getManagedContractDetail, updateManagedContract } from '@/lib/managedContracts';
import {
  PartyFormFields,
  emptyPartyForm,
  partyFormFromRow,
  partyFormToInput,
  type PartyFormState,
} from '@/components/contracts/PartyFormFields';
import { AutoGrowMultilineInput } from '@/components/ui/AutoGrowMultilineInput';

export default function ManagedContractEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { staff } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [contractType, setContractType] = useState('other');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [specialClauses, setSpecialClauses] = useState('');
  const [visibleDepartments, setVisibleDepartments] = useState<string[]>([]);
  const [party1, setParty1] = useState<PartyFormState>(emptyPartyForm());
  const [party2, setParty2] = useState<PartyFormState>(emptyPartyForm());

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await getManagedContractDetail(String(id));
    if (error || !data) {
      Alert.alert('Hata', error?.message ?? 'Yüklenemedi');
      setLoading(false);
      return;
    }
    const c = data.contract;
    setOrgId(c.organization_id);
    setTitle(c.title);
    setContractType(c.contract_type);
    setStartDate(c.start_date ?? '');
    setEndDate(c.end_date ?? '');
    setBodyText(c.body_text);
    setSpecialClauses(c.special_clauses ?? '');
    setVisibleDepartments(c.visible_departments ?? []);
    const p1 = data.parties.find((p) => p.party_side === 'party_1');
    const p2 = data.parties.find((p) => p.party_side === 'party_2');
    setParty1(p1 ? partyFormFromRow(p1) : { ...emptyPartyForm(), role: 'Taraf 1' });
    setParty2(p2 ? partyFormFromRow(p2) : { ...emptyPartyForm(), role: 'Taraf 2' });
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleDept = (d: string) => {
    setVisibleDepartments((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const parties = useMemo(
    () => [partyFormToInput('party_1', party1), partyFormToInput('party_2', party2)],
    [party1, party2],
  );

  const save = async () => {
    if (!id || !orgId || !staff?.id) return;
    if (!title.trim() || !bodyText.trim()) {
      Alert.alert('Eksik', 'Başlık ve sözleşme metni zorunlu.');
      return;
    }
    setSaving(true);
    const { error } = await updateManagedContract(
      String(id),
      orgId,
      staff.id,
      {
        title: title.trim(),
        contract_type: contractType,
        start_date: startDate.trim() || null,
        end_date: endDate.trim() || null,
        body_text: bodyText,
        special_clauses: specialClauses.trim() || null,
        visible_departments: visibleDepartments,
      },
      parties,
    );
    setSaving(false);
    if (error) {
      Alert.alert('Hata', error.message);
      return;
    }
    Alert.alert('Güncellendi', 'Değişiklikler kaydedildi; yeni sürüm oluşturuldu.');
    router.replace(`/admin/managed-contracts/${id}` as never);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator
        nestedScrollEnabled={Platform.OS === 'android'}
      >
        <Text style={styles.heading}>Sözleşmeyi düzenle</Text>
        <Text style={styles.sub}>Taraflar, tarihler ve metin tamamen değiştirilebilir. Kayıt yeni sürüm oluşturur.</Text>

        <Text style={styles.label}>Sözleşme başlığı</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholderTextColor={adminTheme.colors.textMuted} />

        <Text style={styles.label}>Sözleşme türü</Text>
        <View style={styles.chips}>
          {MANAGED_CONTRACT_TYPES.map((t) => (
            <TouchableOpacity
              key={t.value}
              style={[styles.chip, contractType === t.value && styles.chipActive]}
              onPress={() => setContractType(t.value)}
            >
              <Text style={[styles.chipText, contractType === t.value && styles.chipTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.row}>
          <View style={styles.half}>
            <Text style={styles.label}>Başlangıç</Text>
            <TextInput style={styles.input} value={startDate} onChangeText={setStartDate} placeholderTextColor={adminTheme.colors.textMuted} />
          </View>
          <View style={styles.half}>
            <Text style={styles.label}>Bitiş</Text>
            <TextInput style={styles.input} value={endDate} onChangeText={setEndDate} placeholderTextColor={adminTheme.colors.textMuted} />
          </View>
        </View>

        <PartyFormFields title="Taraf 1" value={party1} onChange={setParty1} />
        <PartyFormFields title="Taraf 2" value={party2} onChange={setParty2} />

        <Text style={styles.label}>Görüntüleyebilecek bölümler (isteğe bağlı)</Text>
        <View style={styles.chips}>
          {DEPARTMENT_OPTIONS.map((d) => (
            <TouchableOpacity
              key={d}
              style={[styles.chip, visibleDepartments.includes(d) && styles.chipActive]}
              onPress={() => toggleDept(d)}
            >
              <Text style={[styles.chipText, visibleDepartments.includes(d) && styles.chipTextActive]}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Sözleşme metni</Text>
        <AutoGrowMultilineInput
          style={[styles.input, styles.textArea]}
          value={bodyText}
          onChangeText={setBodyText}
          minHeight={180}
          lineHeight={21}
          placeholderTextColor={adminTheme.colors.textMuted}
        />

        <Text style={styles.label}>Özel maddeler</Text>
        <AutoGrowMultilineInput
          style={[styles.input, styles.textAreaSm]}
          value={specialClauses}
          onChangeText={setSpecialClauses}
          minHeight={90}
          lineHeight={20}
          placeholderTextColor={adminTheme.colors.textMuted}
        />

        <TouchableOpacity style={styles.primaryBtn} onPress={save} disabled={saving}>
          <Text style={styles.primaryBtnText}>{saving ? 'Kaydediliyor…' : 'Değişiklikleri kaydet'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 20, fontWeight: '900', color: adminTheme.colors.text },
  sub: { marginTop: 6, marginBottom: 16, fontSize: 13, color: adminTheme.colors.textMuted, lineHeight: 20 },
  label: { marginTop: 10, marginBottom: 6, fontSize: 13, fontWeight: '700', color: adminTheme.colors.textSecondary },
  input: {
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: adminTheme.colors.text,
  },
  textArea: { minHeight: 180, fontSize: 14, lineHeight: 21 },
  textAreaSm: { minHeight: 90, fontSize: 14, lineHeight: 20 },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  chipActive: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textSecondary },
  chipTextActive: { color: '#fff' },
  primaryBtn: {
    marginTop: 24,
    backgroundColor: adminTheme.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
