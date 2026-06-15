import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useRouter } from 'expo-router';
import { adminTheme } from '@/constants/adminTheme';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { resolveStaffOrganizationScope } from '@/lib/organizationScope';
import { supabase } from '@/lib/supabase';
import { MANAGED_CONTRACT_TYPES, DEPARTMENT_OPTIONS } from '@/lib/managedContracts/constants';
import { createManagedContract, listContractTemplates } from '@/lib/managedContracts';
import {
  PartyFormFields,
  emptyPartyForm,
  partyFormToInput,
  type PartyFormState,
} from '@/components/contracts/PartyFormFields';
import { ContractAiAssistant } from '@/components/contracts/ContractAiAssistant';
import type { ManagedContractType } from '@/lib/managedContracts/constants';

export default function ManagedContractNewScreen() {
  const router = useRouter();
  const { staff } = useAuthStore();
  const { selectedOrganizationId } = useAdminOrgStore();
  const canUseAllOrganizations = staff?.app_permissions?.super_admin === true || staff?.role === 'admin';
  const orgId = resolveStaffOrganizationScope({
    canUseAll: canUseAllOrganizations,
    selectedOrganizationId,
    ownOrganizationId: staff?.organization_id,
  });

  const [title, setTitle] = useState('');
  const [contractType, setContractType] = useState('kitchen_operation');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [specialClauses, setSpecialClauses] = useState('');
  const [visibleDepartments, setVisibleDepartments] = useState<string[]>([]);
  const [party1, setParty1] = useState<PartyFormState>(emptyPartyForm());
  const [party2, setParty2] = useState<PartyFormState>(() => ({
    ...emptyPartyForm(),
    role: 'Taraf 2',
  }));
  const [saving, setSaving] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [organizationName, setOrganizationName] = useState('');
  const orgNameLoaded = useRef(false);
  const lastAppliedType = useRef<string | null>(null);

  useEffect(() => {
    if (!orgId || orgNameLoaded.current) return;
    supabase
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .maybeSingle()
      .then(({ data }) => {
        const name = (data?.name as string | undefined)?.trim();
        if (name) {
          setOrganizationName(name);
          setParty1((p) =>
            p.company || p.role
              ? p
              : { ...p, role: 'Taraf 1', company: name, authorityTitle: p.authorityTitle || 'Yetkili' },
          );
        } else {
          setParty1((p) => (p.role ? p : { ...p, role: 'Taraf 1' }));
        }
        orgNameLoaded.current = true;
      });
  }, [orgId]);

  const applyTemplate = useCallback(
    async (type: string, force = false) => {
      if (!orgId) return;
      if (!force && bodyText.trim() && lastAppliedType.current !== type) {
        Alert.alert('Şablon uygula', 'Mevcut sözleşme metni silinip şablon yüklensin mi?', [
          { text: 'Vazgeç', style: 'cancel' },
          { text: 'Uygula', style: 'destructive', onPress: () => applyTemplate(type, true) },
        ]);
        return;
      }
      setTemplatesLoading(true);
      const tpls = await listContractTemplates(orgId);
      const tpl = tpls.find((t) => t.contract_type === type);
      if (tpl) {
        if (!title.trim() || force) setTitle(tpl.title);
        setBodyText(tpl.body_text);
        setSpecialClauses(tpl.special_clauses ?? '');
      }
      lastAppliedType.current = type;
      setTemplatesLoading(false);
    },
    [orgId, bodyText, title],
  );

  useEffect(() => {
    if (!orgId || lastAppliedType.current !== null) return;
    applyTemplate(contractType, true);
  }, [orgId]);

  const pickType = (type: string) => {
    if (type === contractType) return;
    setContractType(type);
    if (lastAppliedType.current !== type) {
      applyTemplate(type, false);
    }
  };

  const toggleDept = (d: string) => {
    setVisibleDepartments((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const parties = useMemo(
    () => [partyFormToInput('party_1', party1), partyFormToInput('party_2', party2)],
    [party1, party2],
  );

  const save = async (asDraft: boolean) => {
    if (!orgId || !staff?.id) {
      Alert.alert('Hata', 'Organizasyon veya oturum bilgisi eksik.');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Eksik', 'Sözleşme başlığı zorunlu.');
      return;
    }
    if (!bodyText.trim()) {
      Alert.alert('Eksik', 'Sözleşme metni zorunlu.');
      return;
    }

    setSaving(true);
    const { data, error } = await createManagedContract(
      {
        organizationId: orgId,
        title: title.trim(),
        contractType,
        startDate: startDate.trim() || null,
        endDate: endDate.trim() || null,
        bodyText,
        specialClauses,
        visibleDepartments,
        parties,
        status: asDraft ? 'draft' : 'pending',
      },
      staff.id,
    );
    setSaving(false);

    if (error || !data) {
      Alert.alert('Hata', error?.message ?? 'Kaydedilemedi');
      return;
    }

    Alert.alert('Kaydedildi', asDraft ? 'Taslak oluşturuldu.' : 'Onay sürecine gönderildi.');
    router.replace(`/admin/managed-contracts/${data.id}` as never);
  };

  if (!orgId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.hint}>Organizasyon seçin veya yetkinizi kontrol edin.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Yeni sözleşme</Text>
        <Text style={styles.sub}>
          Otel adı, taraflar, tarihler ve metnin tamamı serbestçe düzenlenir. Şablon yalnızca başlangıç önerisidir.
        </Text>

        <ContractAiAssistant
          organizationId={orgId}
          organizationName={organizationName}
          contractType={contractType as ManagedContractType}
          title={title}
          startDate={startDate}
          endDate={endDate}
          bodyText={bodyText}
          specialClauses={specialClauses}
          party1={party1}
          party2={party2}
          onApply={(result) => {
            setTitle(result.title);
            setContractType(result.contractType);
            setStartDate(result.startDate ?? '');
            setEndDate(result.endDate ?? '');
            setBodyText(result.bodyText);
            setSpecialClauses(result.specialClauses);
            setParty1(result.party1);
            setParty2(result.party2);
            lastAppliedType.current = result.contractType;
          }}
        />

        {templatesLoading ? <ActivityIndicator style={{ marginVertical: 12 }} color={adminTheme.colors.accent} /> : null}

        <Text style={styles.label}>Sözleşme başlığı</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Sözleşme başlığı"
          placeholderTextColor={adminTheme.colors.textMuted}
        />

        <Text style={styles.label}>Sözleşme türü (etiket — metni değiştirmez)</Text>
        <View style={styles.chips}>
          {MANAGED_CONTRACT_TYPES.map((t) => (
            <TouchableOpacity
              key={t.value}
              style={[styles.chip, contractType === t.value && styles.chipActive]}
              onPress={() => pickType(t.value)}
            >
              <Text style={[styles.chipText, contractType === t.value && styles.chipTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.linkBtn} onPress={() => applyTemplate(contractType, true)}>
          <Text style={styles.linkBtnText}>Bu tür için şablon metnini yeniden yükle</Text>
        </TouchableOpacity>

        <View style={styles.row}>
          <View style={styles.half}>
            <Text style={styles.label}>Başlangıç (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={startDate}
              onChangeText={setStartDate}
              placeholder="2026-01-01"
              placeholderTextColor={adminTheme.colors.textMuted}
            />
          </View>
          <View style={styles.half}>
            <Text style={styles.label}>Bitiş (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={endDate}
              onChangeText={setEndDate}
              placeholder="2027-01-01"
              placeholderTextColor={adminTheme.colors.textMuted}
            />
          </View>
        </View>

        <PartyFormFields
          title="Taraf 1"
          hint="İşletme adı organizasyondan önerilir; istediğiniz gibi değiştirebilirsiniz."
          value={party1}
          onChange={setParty1}
        />
        <PartyFormFields title="Taraf 2" value={party2} onChange={setParty2} />

        <Text style={styles.label}>İsteğe bağlı: hangi bölümler görsün?</Text>
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
        <TextInput
          style={[styles.input, styles.textArea]}
          value={bodyText}
          onChangeText={setBodyText}
          multiline
          textAlignVertical="top"
          placeholder="Tüm maddeleri buraya yazın veya düzenleyin…"
          placeholderTextColor={adminTheme.colors.textMuted}
        />

        <Text style={styles.label}>Özel maddeler</Text>
        <TextInput
          style={[styles.input, styles.textAreaSm]}
          value={specialClauses}
          onChangeText={setSpecialClauses}
          multiline
          textAlignVertical="top"
          placeholder="Ek maddeler…"
          placeholderTextColor={adminTheme.colors.textMuted}
        />

        <View style={styles.actions}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => save(true)} disabled={saving}>
            <Text style={styles.secondaryBtnText}>{saving ? '…' : 'Taslak kaydet'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => save(false)} disabled={saving}>
            <Text style={styles.primaryBtnText}>{saving ? '…' : 'Onaya gönder'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  hint: { color: adminTheme.colors.textMuted, textAlign: 'center' },
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
  textArea: { minHeight: 180, fontSize: 14, lineHeight: 21, marginTop: 4 },
  textAreaSm: { minHeight: 90, fontSize: 14, lineHeight: 20, marginTop: 4 },
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
  linkBtn: { marginBottom: 8 },
  linkBtnText: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.primary },
  actions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  primaryBtn: {
    flex: 1,
    backgroundColor: adminTheme.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  secondaryBtn: {
    flex: 1,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  secondaryBtnText: { color: adminTheme.colors.text, fontWeight: '800', fontSize: 15 },
});
