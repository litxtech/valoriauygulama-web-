import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { adminTheme } from '@/constants/adminTheme';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import {
  getDepartmentRuleDetail,
  getRuleTrackingStats,
  publishDepartmentRule,
  softDeleteDepartmentRule,
  notifyRuleAudience,
} from '@/lib/departmentRules';
import {
  departmentLabel,
  ruleStatusMeta,
  ruleTypeLabel,
} from '@/lib/departmentRules/constants';
import { buildDepartmentRulePdfHtml, printDepartmentRulePdf } from '@/lib/departmentRules/pdf';
import { canManageDepartmentRules } from '@/lib/staffPermissions';
import type { DepartmentRuleDetail, RuleTrackingStats } from '@/lib/departmentRules/types';

function formatDateTime(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('tr-TR');
  } catch {
    return d;
  }
}

export default function DepartmentRuleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { staff } = useAuthStore();
  const canManage = canManageDepartmentRules(staff);

  const [detail, setDetail] = useState<DepartmentRuleDetail | null>(null);
  const [stats, setStats] = useState<RuleTrackingStats | null>(null);
  const [orgName, setOrgName] = useState('VALORIA HOTEL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const res = await getDepartmentRuleDetail(id);
    if (res.error || !res.data) {
      Alert.alert('Hata', res.error?.message ?? 'Yüklenemedi');
      setLoading(false);
      return;
    }
    setDetail(res.data);
    const s = await getRuleTrackingStats(res.data.rule);
    setStats(s);
    const { data: org } = await supabase.from('organizations').select('name').eq('id', res.data.rule.organization_id).maybeSingle();
    if (org?.name) setOrgName(String(org.name));
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handlePublish = async () => {
    if (!detail || !staff?.id) return;
    setWorking(true);
    const res = await publishDepartmentRule(detail.rule.id, staff.id);
    setWorking(false);
    if (res.error) Alert.alert('Hata', res.error.message);
    else {
      Alert.alert('Yayınlandı', 'Kural yayına alındı.');
      load();
    }
  };

  const handleReminder = async () => {
    if (!detail || !staff?.id) return;
    setWorking(true);
    await notifyRuleAudience(detail.rule, staff.id, true);
    setWorking(false);
    Alert.alert('Hatırlatma', 'Okumayan personele bildirim gönderildi.');
  };

  const handleArchive = () => {
    if (!detail || !staff?.id) return;
    Alert.alert('Arşivle', 'Bu kural arşivlenecek. Devam?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Arşivle',
        style: 'destructive',
        onPress: async () => {
          setWorking(true);
          const res = await softDeleteDepartmentRule(detail.rule.id, staff.id);
          setWorking(false);
          if (res.error) Alert.alert('Hata', res.error.message);
          else router.back();
        },
      },
    ]);
  };

  const handlePdf = async () => {
    if (!detail) return;
    const verifyUrl = `https://valoria.tr/bolum-kurali/${detail.rule.verification_token}`;
    const html = buildDepartmentRulePdfHtml(detail, orgName, verifyUrl);
    await printDepartmentRulePdf(html, detail.rule.title);
  };

  if (loading || !detail) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={adminTheme.colors.accent} />
      </View>
    );
  }

  const rule = detail.rule;
  const meta = ruleStatusMeta(rule.status);
  const previewHtml = buildDepartmentRulePdfHtml(detail, orgName);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={adminTheme.colors.accent} />}
    >
      <View style={styles.header}>
        <Text style={styles.docNo}>{rule.document_number} · V{rule.version}</Text>
        <Text style={styles.title}>{rule.title}</Text>
        <View style={styles.badges}>
          <View style={[styles.badge, { backgroundColor: `${meta.color}20` }]}>
            <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
          </View>
          <Text style={styles.metaText}>{departmentLabel(rule.department)} · {ruleTypeLabel(rule.rule_type)}</Text>
        </View>
      </View>

      <View style={styles.infoGrid}>
        <InfoCell label="Oluşturulma" value={formatDateTime(rule.created_at)} />
        <InfoCell label="Güncelleme" value={formatDateTime(rule.updated_at)} />
        <InfoCell label="Yayın" value={formatDateTime(rule.published_at)} />
        <InfoCell label="Geçerlilik" value={rule.is_permanent ? 'Süresiz' : `${rule.start_date ?? '—'} → ${rule.end_date ?? '—'}`} />
        {(rule.start_time || rule.end_time) ? (
          <InfoCell label="Saat" value={`${(rule.start_time ?? '').slice(0, 5)} - ${(rule.end_time ?? '').slice(0, 5)}`} />
        ) : null}
        <InfoCell label="Hazırlayan" value={rule.creator?.full_name ?? '—'} />
      </View>

      {stats ? (
        <View style={styles.statsCard}>
          <Text style={styles.sectionTitle}>Takip paneli</Text>
          <View style={styles.statsRow}>
            <StatBox label="Gönderildi" value={stats.sentCount} />
            <StatBox label="Okudu" value={stats.readCount} color="#2563eb" />
            <StatBox label="Onayladı" value={stats.acknowledgedCount} color="#059669" />
          </View>
          {stats.unreadStaff.length > 0 ? (
            <View style={styles.listBlock}>
              <Text style={styles.listTitle}>Okumayan ({stats.unreadStaff.length})</Text>
              <Text style={styles.listBody}>{stats.unreadStaff.map((s) => s.full_name ?? s.id.slice(0, 8)).join(', ')}</Text>
            </View>
          ) : null}
          {rule.requires_acknowledgement && stats.unacknowledgedStaff.length > 0 ? (
            <View style={styles.listBlock}>
              <Text style={styles.listTitle}>Onaylamayan ({stats.unacknowledgedStaff.length})</Text>
              <Text style={styles.listBody}>{stats.unacknowledgedStaff.map((s) => s.full_name ?? s.id.slice(0, 8)).join(', ')}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Kural metni</Text>
      <View style={styles.previewBox}>
        <WebView originWhitelist={['*']} source={{ html: previewHtml }} style={styles.webview} scrollEnabled nestedScrollEnabled />
      </View>

      {detail.versions.length > 1 ? (
        <View style={styles.versionBlock}>
          <Text style={styles.sectionTitle}>Versiyonlar</Text>
          {detail.versions.map((v) => (
            <TouchableOpacity key={v.id} style={styles.versionRow} onPress={() => router.push(`/admin/department-rules/${v.id}` as never)}>
              <Text style={styles.versionText}>V{v.version} — {v.title}</Text>
              <Ionicons name="chevron-forward" size={16} color={adminTheme.colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        {canManage && rule.status === 'draft' ? (
          <TouchableOpacity style={styles.btnPrimary} onPress={handlePublish} disabled={working}>
            <Text style={styles.btnPrimaryText}>Yayınla</Text>
          </TouchableOpacity>
        ) : null}
        {canManage && rule.status === 'published' ? (
          <TouchableOpacity style={styles.btnSecondary} onPress={handleReminder} disabled={working}>
            <Text style={styles.btnSecondaryText}>Hatırlatma gönder</Text>
          </TouchableOpacity>
        ) : null}
        {rule.is_printable ? (
          <TouchableOpacity style={styles.btnSecondary} onPress={handlePdf}>
            <Ionicons name="print-outline" size={18} color="#0f766e" />
            <Text style={styles.btnSecondaryText}>Yazdır / PDF</Text>
          </TouchableOpacity>
        ) : null}
        {canManage ? (
          <TouchableOpacity style={styles.btnDanger} onPress={handleArchive} disabled={working}>
            <Text style={styles.btnDangerText}>Arşivle</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </ScrollView>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoCell}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { marginBottom: 16 },
  docNo: { fontSize: 12, color: adminTheme.colors.textMuted, fontWeight: '600' },
  title: { fontSize: 20, fontWeight: '900', color: adminTheme.colors.text, marginTop: 4, lineHeight: 26 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 12, fontWeight: '800' },
  metaText: { fontSize: 13, color: adminTheme.colors.textMuted },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  infoCell: { width: '47%', backgroundColor: '#fff', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: adminTheme.colors.border },
  infoLabel: { fontSize: 10, color: adminTheme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.text, marginTop: 4 },
  statsCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: adminTheme.colors.border },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: adminTheme.colors.text, marginBottom: 10 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statBox: { flex: 1, alignItems: 'center', backgroundColor: adminTheme.colors.surfaceSecondary, borderRadius: 10, padding: 12 },
  statValue: { fontSize: 22, fontWeight: '900', color: adminTheme.colors.text },
  statLabel: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 2 },
  listBlock: { marginTop: 12 },
  listTitle: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.text },
  listBody: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 4 },
  previewBox: { height: 360, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: adminTheme.colors.border, marginBottom: 16 },
  webview: { flex: 1, backgroundColor: '#fff' },
  versionBlock: { marginBottom: 16 },
  versionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', padding: 12, borderRadius: 10, marginBottom: 6, borderWidth: 1, borderColor: adminTheme.colors.border },
  versionText: { fontSize: 13, color: adminTheme.colors.text, flex: 1 },
  actions: { gap: 10 },
  btnPrimary: { backgroundColor: '#0f766e', padding: 14, borderRadius: 12, alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontWeight: '800' },
  btnSecondary: { flexDirection: 'row', gap: 8, backgroundColor: '#fff', padding: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: adminTheme.colors.border },
  btnSecondaryText: { color: '#0f766e', fontWeight: '700' },
  btnDanger: { padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#fecaca' },
  btnDangerText: { color: '#dc2626', fontWeight: '700' },
});
