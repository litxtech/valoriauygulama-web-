import { useEffect, useState } from 'react';
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
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { adminTheme } from '@/constants/adminTheme';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { resolveStaffOrganizationScope } from '@/lib/organizationScope';
import { supabase } from '@/lib/supabase';
import {
  DEPARTMENT_RULE_DEPARTMENTS,
  DEPARTMENT_RULE_TYPES,
  PUBLISH_SCOPES,
  STAFF_ROLE_OPTIONS,
} from '@/lib/departmentRules/constants';
import { createDepartmentRule, publishDepartmentRule } from '@/lib/departmentRules';
import { DepartmentRuleContentEditor } from '@/components/departmentRules/DepartmentRuleContentEditor';
import { AdminOrganizationPicker } from '@/components/admin';

export default function DepartmentRuleNewScreen() {
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
  const [department, setDepartment] = useState('kitchen');
  const [ruleType, setRuleType] = useState('hygiene');
  const [content, setContent] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [isPermanent, setIsPermanent] = useState(true);
  const [requiresAck, setRequiresAck] = useState(true);
  const [isPrintable, setIsPrintable] = useState(true);
  const [generatePdf, setGeneratePdf] = useState(true);
  const [sendNotification, setSendNotification] = useState(true);
  const [publishScope, setPublishScope] = useState<'all' | 'departments' | 'staff'>('departments');
  const [visibleRoles, setVisibleRoles] = useState<string[]>([]);
  const [scheduledPublishAt, setScheduledPublishAt] = useState('');
  const [orgName, setOrgName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    supabase.from('organizations').select('name').eq('id', orgId).maybeSingle().then(({ data }) => {
      const name = (data?.name as string | undefined)?.trim();
      if (name) {
        setOrgName(name);
        if (!title) setTitle(`${name} - Mutfak Bölümü Kuralları`);
      }
    });
  }, [orgId]);

  const toggleRole = (role: string) => {
    setVisibleRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  };

  const save = async (mode: 'draft' | 'publish' | 'schedule') => {
    if (!orgId || !staff?.id) {
      Alert.alert('Hata', 'Organizasyon veya oturum bilgisi eksik.');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Eksik', 'Başlık zorunludur.');
      return;
    }
    if (!content.trim()) {
      Alert.alert('Eksik', 'Kural metni zorunludur.');
      return;
    }

    setSaving(true);
    const { data, error } = await createDepartmentRule(
      {
        organizationId: orgId,
        title: title.trim(),
        department,
        ruleType,
        content,
        startDate: startDate.trim() || null,
        endDate: isPermanent ? null : endDate.trim() || null,
        startTime: startTime.trim() || null,
        endTime: endTime.trim() || null,
        isPermanent,
        requiresAcknowledgement: requiresAck,
        isPrintable,
        generatePdf,
        sendNotification,
        visibleRoles,
        targetDepartments: department === 'all_hotel' ? [] : [department],
        publishScope,
        scheduledPublishAt: mode === 'schedule' ? scheduledPublishAt.trim() || null : null,
        status: mode === 'draft' ? 'draft' : mode === 'schedule' ? 'scheduled' : 'draft',
      },
      staff.id,
    );
    setSaving(false);

    if (error || !data) {
      Alert.alert('Hata', error?.message ?? 'Kaydedilemedi');
      return;
    }

    if (mode === 'publish') {
      const pub = await publishDepartmentRule(data.id, staff.id);
      if (pub.error) {
        Alert.alert('Uyarı', 'Taslak kaydedildi ancak yayınlanamadı: ' + pub.error.message);
      } else {
        Alert.alert('Yayınlandı', 'Kural ilgili personele gönderildi.');
      }
    } else if (mode === 'schedule') {
      await publishDepartmentRule(data.id, staff.id, { scheduledAt: scheduledPublishAt.trim() || null });
      Alert.alert('Planlandı', 'Kural seçilen tarihte yayınlanacak.');
    } else {
      Alert.alert('Kaydedildi', 'Taslak oluşturuldu.');
    }

    router.replace(`/admin/department-rules/${data.id}` as never);
  };

  if (!orgId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.hint}>Organizasyon seçin.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AdminOrganizationPicker canUseAll={canUseAllOrganizations} ownOrganizationId={staff?.organization_id} />

        <Text style={styles.heading}>Yeni bölüm kuralı</Text>
        <Text style={styles.sub}>Başlığı serbest yazın. Örn: {orgName || 'Valoria Hotel'} - Mutfak Bölümü Kuralları</Text>

        <Text style={styles.label}>Başlık *</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Valoria Hotel - …" />

        <Text style={styles.label}>Bölüm / Departman</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          {DEPARTMENT_RULE_DEPARTMENTS.map((d) => (
            <TouchableOpacity
              key={d.value}
              style={[styles.chip, department === d.value && styles.chipActive]}
              onPress={() => setDepartment(d.value)}
            >
              <Text style={[styles.chipText, department === d.value && styles.chipTextActive]}>{d.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.label}>Kural türü</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          {DEPARTMENT_RULE_TYPES.map((t) => (
            <TouchableOpacity
              key={t.value}
              style={[styles.chip, ruleType === t.value && styles.chipActive]}
              onPress={() => setRuleType(t.value)}
            >
              <Text style={[styles.chipText, ruleType === t.value && styles.chipTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.row2}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Başlangıç (GG.AA.YYYY)</Text>
            <TextInput style={styles.input} value={startDate} onChangeText={setStartDate} placeholder="01.06.2026" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Bitiş</Text>
            <TextInput style={styles.input} value={endDate} onChangeText={setEndDate} editable={!isPermanent} placeholder="30.06.2026" />
          </View>
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.label}>Süresiz geçerli</Text>
          <Switch value={isPermanent} onValueChange={setIsPermanent} trackColor={{ true: '#0f766e' }} />
        </View>
        <View style={styles.row2}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Saat başlangıç</Text>
            <TextInput style={styles.input} value={startTime} onChangeText={setStartTime} placeholder="07:00" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Saat bitiş</Text>
            <TextInput style={styles.input} value={endTime} onChangeText={setEndTime} placeholder="23:00" />
          </View>
        </View>

        <DepartmentRuleContentEditor value={content} onChange={setContent} />

        <Text style={styles.label}>Yayın kapsamı</Text>
        {PUBLISH_SCOPES.map((s) => (
          <TouchableOpacity key={s.value} style={styles.radioRow} onPress={() => setPublishScope(s.value)}>
            <View style={[styles.radio, publishScope === s.value && styles.radioActive]} />
            <Text style={styles.radioText}>{s.label}</Text>
          </TouchableOpacity>
        ))}

        <Text style={styles.label}>Görünür roller (boş = tümü)</Text>
        <View style={styles.roleWrap}>
          {STAFF_ROLE_OPTIONS.map((r) => (
            <TouchableOpacity key={r.value} style={[styles.chip, visibleRoles.includes(r.value) && styles.chipActive]} onPress={() => toggleRole(r.value)}>
              <Text style={[styles.chipText, visibleRoles.includes(r.value) && styles.chipTextActive]}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.label}>Onay zorunlu (Okudum, Anladım)</Text>
          <Switch value={requiresAck} onValueChange={setRequiresAck} trackColor={{ true: '#0f766e' }} />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.label}>Yazdırılabilir</Text>
          <Switch value={isPrintable} onValueChange={setIsPrintable} trackColor={{ true: '#0f766e' }} />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.label}>PDF oluşturulsun</Text>
          <Switch value={generatePdf} onValueChange={setGeneratePdf} trackColor={{ true: '#0f766e' }} />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.label}>Bildirim gönderilsin</Text>
          <Switch value={sendNotification} onValueChange={setSendNotification} trackColor={{ true: '#0f766e' }} />
        </View>

        <Text style={styles.label}>Planlı yayın (ISO tarih, opsiyonel)</Text>
        <TextInput style={styles.input} value={scheduledPublishAt} onChangeText={setScheduledPublishAt} placeholder="2026-06-01T08:00:00" />

        <View style={styles.actions}>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => save('draft')} disabled={saving}>
            <Text style={styles.btnSecondaryText}>Taslak kaydet</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnPrimary} onPress={() => save('publish')} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Hemen yayınla</Text>}
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.btnOutline} onPress={() => save('schedule')} disabled={saving}>
          <Text style={styles.btnOutlineText}>Tarih seçerek yayınla</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hint: { color: adminTheme.colors.textMuted },
  heading: { fontSize: 20, fontWeight: '900', color: adminTheme.colors.text, marginTop: 12 },
  sub: { fontSize: 13, color: adminTheme.colors.textMuted, marginTop: 4, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.text, marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    backgroundColor: '#fff',
    color: adminTheme.colors.text,
  },
  chipScroll: { marginBottom: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', marginRight: 8, borderWidth: 1, borderColor: adminTheme.colors.border },
  chipActive: { backgroundColor: '#0f766e', borderColor: '#0f766e' },
  chipText: { fontSize: 12, color: adminTheme.colors.textMuted },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  row2: { flexDirection: 'row', gap: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: adminTheme.colors.border },
  radioActive: { borderColor: '#0f766e', backgroundColor: '#0f766e' },
  radioText: { fontSize: 14, color: adminTheme.colors.text },
  roleWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  btnPrimary: { flex: 1, backgroundColor: '#0f766e', padding: 14, borderRadius: 12, alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontWeight: '800' },
  btnSecondary: { flex: 1, backgroundColor: '#fff', padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: adminTheme.colors.border },
  btnSecondaryText: { color: adminTheme.colors.text, fontWeight: '700' },
  btnOutline: { marginTop: 10, padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#0f766e' },
  btnOutlineText: { color: '#0f766e', fontWeight: '700' },
});
