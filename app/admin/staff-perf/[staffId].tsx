import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminButton } from '@/components/admin';
import {
  fetchStaffPerfCategories,
  fetchStaffPerfDossier,
  updateStaffDossierFields,
  type StaffPerfDossier,
  type StaffPerfEvent,
} from '@/lib/staffPerfSystem';
import { formatPerfScore, getPerfBand } from '@/lib/staffPerfBands';
import {
  buildAiFromDossier,
  saveStaffPerfAiEvaluation,
  type StaffPerfAiPayload,
} from '@/lib/staffPerfAiEvaluation';
import { exportStaffPerfReportPdf } from '@/lib/staffPerfReportPdf';
import { fetchFinanceReportBranding } from '@/lib/financeReportBranding';
import { CachedImage } from '@/components/CachedImage';

function ynLabel(v: boolean): string {
  return v ? 'Evet' : 'Hayır';
}

export default function StaffPerfDossierScreen() {
  const { staffId } = useLocalSearchParams<{ staffId: string }>();
  const router = useRouter();
  const me = useAuthStore((s) => s.staff);
  const [dossier, setDossier] = useState<StaffPerfDossier | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ai, setAi] = useState<StaffPerfAiPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [familyMother, setFamilyMother] = useState('');
  const [familyFather, setFamilyFather] = useState('');
  const [familySpouse, setFamilySpouse] = useState('');
  const [familyChildren, setFamilyChildren] = useState('');
  const [education, setEducation] = useState('');
  const [certificates, setCertificates] = useState('');
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    if (!staffId) return;
    const { data, error } = await fetchStaffPerfDossier(staffId);
    if (error) Alert.alert('Hata', error);
    setDossier(data);
    if (data?.staff) {
      setFamilyMother(String(data.staff.family_mother ?? ''));
      setFamilyFather(String(data.staff.family_father ?? ''));
      setFamilySpouse(String(data.staff.family_spouse ?? ''));
      setFamilyChildren(String(data.staff.family_children ?? ''));
      setEducation(String(data.staff.education_detail ?? ''));
      setCertificates(String(data.staff.certificates_detail ?? data.staff.certifications_summary ?? ''));
      setNotes(String(data.staff.dossier_notes ?? data.staff.notes ?? ''));
    }
    setLoading(false);
    setRefreshing(false);
  }, [staffId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const staff = dossier?.staff;
  const score = Number(staff?.performance_score ?? 100);
  const band = getPerfBand(score);

  const events = dossier?.events ?? [];
  const positives = events.filter((e) => e.delta_points > 0);
  const negatives = events.filter((e) => e.delta_points < 0);

  const orgId = useMemo(
    () => (staff?.organization_id as string) || me?.organization_id || null,
    [staff, me]
  );

  const runAi = async () => {
    if (!dossier || !orgId || !me?.id || !staffId) return;
    setBusy(true);
    try {
      const cats = await fetchStaffPerfCategories(orgId);
      const names: Record<string, string> = {};
      for (const c of cats.data) names[c.id] = c.name;
      const payload = buildAiFromDossier(dossier, names);
      setAi(payload);
      const year = new Date().getFullYear() + 1;
      const { error } = await saveStaffPerfAiEvaluation({
        organizationId: orgId,
        staffId,
        evaluationYear: year,
        payload,
        preparedByStaffId: me.id,
      });
      if (error) Alert.alert('AI kayıt', error);
      else Alert.alert('Tamam', `Gelecek yıl (${year}) değerlendirmesi kaydedildi.`);
    } finally {
      setBusy(false);
    }
  };

  const saveFamily = async () => {
    if (!staffId) return;
    setBusy(true);
    const { error } = await updateStaffDossierFields(staffId, {
      family_mother: familyMother.trim() || null,
      family_father: familyFather.trim() || null,
      family_spouse: familySpouse.trim() || null,
      family_children: familyChildren.trim() || null,
      education_detail: education.trim() || null,
      certificates_detail: certificates.trim() || null,
      dossier_notes: notes.trim() || null,
    });
    setBusy(false);
    if (error) Alert.alert('Kayıt', error);
    else {
      Alert.alert('Kaydedildi', 'Personel dosyası güncellendi.');
      void load();
    }
  };

  const exportPdf = async () => {
    if (!dossier || !staff || !me) return;
    setBusy(true);
    try {
      const branding = orgId ? await fetchFinanceReportBranding(orgId) : undefined;
      let payload = ai;
      if (!payload) {
        const cats = orgId ? await fetchStaffPerfCategories(orgId) : { data: [] };
        const names: Record<string, string> = {};
        for (const c of cats.data) names[c.id] = c.name;
        payload = buildAiFromDossier(dossier, names);
        setAi(payload);
      }
      const reportNumber = `VPR-${new Date().getFullYear()}-${String(staffId).slice(0, 8).toUpperCase()}`;
      await exportStaffPerfReportPdf({
        branding,
        reportNumber,
        preparedByName: me.full_name || 'İK',
        approvedByName: null,
        staff: {
          fullName: String(staff.full_name ?? '—'),
          department: (staff.department as string) ?? null,
          position: (staff.position as string) ?? null,
          role: (staff.role as string) ?? null,
          hireDate: staff.hire_date ? String(staff.hire_date) : null,
          phone: (staff.phone as string) ?? null,
          address: (staff.address as string) ?? null,
          personnelNo: (staff.personnel_no as string) ?? null,
          profileImageUrl: (staff.profile_image as string) ?? null,
          familyMother: familyMother || null,
          familyFather: familyFather || null,
          familySpouse: familySpouse || null,
          familyChildren: familyChildren || null,
          emergencyName: (staff.emergency_contact_name as string) ?? null,
          emergencyPhone: (staff.emergency_contact_phone as string) ?? null,
          education: education || null,
          certificates: certificates || null,
          achievements: (staff.achievements as string) ?? null,
        },
        score,
        events,
        scoreLog: dossier.score_log,
        ai: payload,
      });
    } catch (e) {
      Alert.alert('PDF', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={adminTheme.colors.primary} />
      </View>
    );
  }

  if (!staff) {
    return (
      <View style={styles.center}>
        <Text>Personel bulunamadı.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
        />
      }
    >
      <View style={styles.hero}>
        {staff.profile_image ? (
          <CachedImage uri={String(staff.profile_image)} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPh]}>
            <Ionicons name="person" size={28} color="#94a3b8" />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{String(staff.full_name ?? '—')}</Text>
          <Text style={styles.meta}>
            {String(staff.department ?? '—')} · {String(staff.role ?? staff.position ?? '—')}
          </Text>
          <Text style={[styles.band, { color: band.color }]}>{band.labelTr}</Text>
        </View>
        <View style={[styles.scoreBox, { borderColor: band.color, backgroundColor: band.bg }]}>
          <Text style={[styles.scoreN, { color: band.color }]}>{Math.round(score)}</Text>
          <Text style={[styles.scoreL, { color: band.color }]}>/100</Text>
        </View>
      </View>

      <View style={styles.chipRow}>
        <View style={styles.chip}>
          <Text style={styles.chipN}>+{positives.length}</Text>
          <Text style={styles.chipL}>Artı</Text>
        </View>
        <View style={styles.chip}>
          <Text style={[styles.chipN, { color: '#b91c1c' }]}>−{negatives.length}</Text>
          <Text style={styles.chipL}>Eksi</Text>
        </View>
        <View style={styles.chip}>
          <Text style={styles.chipN}>{dossier?.warnings?.length ?? 0}</Text>
          <Text style={styles.chipL}>Uyarı</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <AdminButton
          title="Onay kaydı"
          onPress={() => router.push(`/admin/staff-perf/event?staffId=${staffId}` as Href)}
          size="sm"
        />
        <AdminButton
          title={busy ? '…' : 'AI değerlendirme'}
          onPress={() => void runAi()}
          variant="secondary"
          size="sm"
          disabled={busy}
        />
        <AdminButton
          title="PDF rapor"
          onPress={() => void exportPdf()}
          variant="outline"
          size="sm"
          disabled={busy}
        />
      </View>

      <Text style={styles.section}>Resmi personel dosyası</Text>
      <View style={styles.card}>
        <Row k="İşe giriş" v={staff.hire_date ? String(staff.hire_date) : '—'} />
        <Row k="Sözleşme" v={String(staff.contract_type ?? '—')} />
        <Row k="Telefon" v={String(staff.phone ?? '—')} />
        <Row k="Adres" v={String(staff.address ?? '—')} />
        <Row
          k="Acil kişi"
          v={`${staff.emergency_contact_name ?? '—'} · ${staff.emergency_contact_phone ?? ''}`}
        />
        <Text style={styles.fieldLabel}>Anne</Text>
        <TextInput style={styles.input} value={familyMother} onChangeText={setFamilyMother} />
        <Text style={styles.fieldLabel}>Baba</Text>
        <TextInput style={styles.input} value={familyFather} onChangeText={setFamilyFather} />
        <Text style={styles.fieldLabel}>Eş</Text>
        <TextInput style={styles.input} value={familySpouse} onChangeText={setFamilySpouse} />
        <Text style={styles.fieldLabel}>Çocuk</Text>
        <TextInput style={styles.input} value={familyChildren} onChangeText={setFamilyChildren} />
        <Text style={styles.fieldLabel}>Eğitim</Text>
        <TextInput style={styles.input} value={education} onChangeText={setEducation} multiline />
        <Text style={styles.fieldLabel}>Sertifikalar</Text>
        <TextInput style={styles.input} value={certificates} onChangeText={setCertificates} multiline />
        <Text style={styles.fieldLabel}>Notlar</Text>
        <TextInput style={[styles.input, { minHeight: 64 }]} value={notes} onChangeText={setNotes} multiline />
        <AdminButton title="Dosyayı kaydet" onPress={() => void saveFamily()} size="sm" style={{ marginTop: 10 }} />
      </View>

      <Text style={styles.section}>Tüm denetimler</Text>
      {events.length === 0 ? (
        <Text style={styles.empty}>Henüz olay yok.</Text>
      ) : (
        events.map((e) => <EventCard key={e.id} event={e} />)
      )}

      <Text style={styles.section}>Puan logu</Text>
      {(dossier?.score_log ?? []).slice(0, 20).map((l) => (
        <View key={l.id} style={styles.logRow}>
          <Text style={styles.logDate}>{new Date(l.logged_at).toLocaleString('tr-TR')}</Text>
          <Text style={{ fontWeight: '800', color: l.delta_points > 0 ? '#047857' : '#b91c1c' }}>
            {l.score_before}→{l.score_after} ({l.delta_points > 0 ? '+' : ''}
            {l.delta_points})
          </Text>
          <Text style={styles.logReason}>{l.reason}</Text>
        </View>
      ))}

      <Text style={styles.section}>Disiplin / uyarılar</Text>
      {(dossier?.warnings ?? []).length === 0 ? (
        <Text style={styles.empty}>Uyarı yok.</Text>
      ) : (
        (dossier?.warnings ?? []).map((w, i) => (
          <View key={String((w as { id?: string }).id ?? i)} style={styles.card}>
            <Text style={{ fontWeight: '700' }}>{String((w as { body?: string }).body ?? 'Uyarı')}</Text>
            <Text style={styles.meta}>
              {String((w as { severity?: string }).severity ?? '')} ·{' '}
              {(w as { created_at?: string }).created_at
                ? new Date(String((w as { created_at: string }).created_at)).toLocaleDateString('tr-TR')
                : ''}
            </Text>
          </View>
        ))
      )}

      <Text style={styles.section}>Maaş geçmişi</Text>
      {(dossier?.salary_history ?? []).length === 0 ? (
        <Text style={styles.empty}>Kayıt yok.</Text>
      ) : (
        (dossier?.salary_history ?? []).map((p, i) => (
          <View key={String((p as { id?: string }).id ?? i)} style={styles.logRow}>
            <Text style={{ fontWeight: '700' }}>
              {String((p as { period_month?: number }).period_month)}/
              {String((p as { period_year?: number }).period_year)} —{' '}
              {String((p as { amount?: number }).amount)} ₺
            </Text>
            <Text style={styles.meta}>{String((p as { status?: string }).status ?? '')}</Text>
          </View>
        ))
      )}

      {ai ? (
        <>
          <Text style={styles.section}>Gelecek yıl değerlendirmesi (AI)</Text>
          <View style={styles.card}>
            <AiLine label="Tutulmalı mı?" v={ai.retain_next_year} />
            <AiLine label="Terfi?" v={ai.promotion_eligible} />
            <AiLine label="Şef olabilir mi?" v={ai.can_be_supervisor} />
            <AiLine label="Maaş artışı?" v={ai.salary_increase} />
            <AiLine label="Eğitim?" v={ai.needs_training} />
            <AiLine label="Departman değişimi?" v={ai.department_change} />
            <AiLine label="Ayrılma riski?" v={ai.attrition_risk} />
            <AiLine label="Uzun vadeli katkı?" v={ai.long_term_contribution} />
            <Text style={styles.aiBlock}>{ai.guest_impact}</Text>
            <Text style={styles.aiBlock}>{ai.team_impact}</Text>
            <Text style={styles.aiBlock}>{ai.risk_analysis}</Text>
            <Text style={[styles.aiBlock, { fontWeight: '700' }]}>{ai.general_manager_comment}</Text>
          </View>
        </>
      ) : null}

      <Text style={styles.footerNote}>
        Tek performans puanı: {formatPerfScore(score)}. Geçmiş silinmez; her değişiklik
        tarih/saat/denetçi ile loglanır.
      </Text>
    </ScrollView>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.k}>{k}</Text>
      <Text style={styles.v}>{v}</Text>
    </View>
  );
}

function EventCard({ event }: { event: StaffPerfEvent }) {
  const pos = event.delta_points > 0;
  return (
    <View style={styles.eventCard}>
      <View style={styles.eventHead}>
        <Text style={styles.eventNo}>{event.report_number}</Text>
        <Text style={{ fontWeight: '800', color: pos ? '#047857' : '#b91c1c' }}>
          {pos ? '+' : ''}
          {event.delta_points}
        </Text>
      </View>
      <Text style={styles.eventTitle}>{event.title}</Text>
      <Text style={styles.meta}>
        {new Date(event.conducted_at).toLocaleString('tr-TR')} · {event.score_before}→
        {event.score_after}
      </Text>
      {event.note ? <Text style={styles.note}>{event.note}</Text> : null}
      {event.signature_name ? (
        <Text style={styles.meta}>İmza: {event.signature_name}</Text>
      ) : null}
    </View>
  );
}

function AiLine({
  label,
  v,
}: {
  label: string;
  v: { answer: boolean; rationale: string };
}) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={{ fontWeight: '700' }}>
        {label} {ynLabel(v.answer)}
      </Text>
      <Text style={styles.meta}>{v.rationale}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  avatar: { width: 64, height: 64, borderRadius: 12 },
  avatarPh: { backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 17, fontWeight: '800', color: adminTheme.colors.text },
  meta: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  band: { fontWeight: '700', marginTop: 4, fontSize: 12 },
  scoreBox: {
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  scoreN: { fontSize: 22, fontWeight: '800' },
  scoreL: { fontSize: 11, fontWeight: '700' },
  chipRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  chip: {
    flex: 1,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  chipN: { fontWeight: '800', fontSize: 16, color: '#047857' },
  chipL: { fontSize: 11, color: adminTheme.colors.textMuted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  section: {
    marginTop: 18,
    marginBottom: 8,
    fontWeight: '800',
    fontSize: 14,
    color: '#0f3d3a',
  },
  card: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  kv: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  k: { width: 90, color: adminTheme.colors.textMuted, fontSize: 12 },
  v: { flex: 1, fontSize: 12, color: adminTheme.colors.text, fontWeight: '600' },
  fieldLabel: { marginTop: 8, fontSize: 11, fontWeight: '700', color: adminTheme.colors.textMuted },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 4,
    color: adminTheme.colors.text,
    backgroundColor: '#fff',
  },
  empty: { color: adminTheme.colors.textMuted, fontSize: 13 },
  eventCard: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  eventHead: { flexDirection: 'row', justifyContent: 'space-between' },
  eventNo: { fontSize: 11, fontWeight: '700', color: '#0f3d3a' },
  eventTitle: { fontWeight: '700', marginTop: 4, color: adminTheme.colors.text },
  note: { marginTop: 4, fontSize: 12, color: adminTheme.colors.text },
  logRow: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  logDate: { fontSize: 11, color: adminTheme.colors.textMuted },
  logReason: { fontSize: 12, marginTop: 2 },
  aiBlock: { fontSize: 12, marginTop: 6, lineHeight: 17, color: adminTheme.colors.text },
  footerNote: {
    marginTop: 20,
    fontSize: 11,
    color: adminTheme.colors.textMuted,
    lineHeight: 16,
  },
});
