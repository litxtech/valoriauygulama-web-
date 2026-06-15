import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import { adminTheme } from '@/constants/adminTheme';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import {
  acknowledgeRule,
  getDepartmentRuleDetail,
  getStaffRuleReadStatus,
  markRuleRead,
} from '@/lib/departmentRules';
import { departmentLabel, ruleTypeLabel } from '@/lib/departmentRules/constants';
import { buildDepartmentRulePdfHtml, printDepartmentRulePdf } from '@/lib/departmentRules/pdf';
import type { DepartmentRuleDetail } from '@/lib/departmentRules/types';

export default function StaffDepartmentRuleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { staff } = useAuthStore();
  const [detail, setDetail] = useState<DepartmentRuleDetail | null>(null);
  const [readStatus, setReadStatus] = useState<string>('unread');
  const [orgName, setOrgName] = useState('VALORIA HOTEL');
  const [loading, setLoading] = useState(true);
  const [ackWorking, setAckWorking] = useState(false);

  const load = useCallback(async () => {
    if (!id || !staff?.id) return;
    setLoading(true);
    const res = await getDepartmentRuleDetail(id);
    if (res.error || !res.data) {
      Alert.alert('Hata', res.error?.message ?? 'Kural bulunamadı');
      setLoading(false);
      return;
    }
    setDetail(res.data);
    const read = await getStaffRuleReadStatus(id, staff.id);
    setReadStatus(read?.status ?? 'unread');

    if (staff.organization_id && res.data.rule.status === 'published') {
      await markRuleRead(id, staff.id, staff.organization_id);
      if (!read?.read_at) setReadStatus('read');
    }

    const { data: org } = await supabase.from('organizations').select('name').eq('id', res.data.rule.organization_id).maybeSingle();
    if (org?.name) setOrgName(String(org.name));
    setLoading(false);
  }, [id, staff?.id, staff?.organization_id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleAcknowledge = async () => {
    if (!detail || !staff?.id || !staff.organization_id) return;
    Alert.alert(
      'Okudum, Anladım ve Kabul Ediyorum',
      'Bu kuralı okuduğunuzu ve kabul ettiğinizi onaylıyor musunuz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Onayla',
          onPress: async () => {
            setAckWorking(true);
            const res = await acknowledgeRule(detail.rule.id, staff.id, staff.organization_id, detail.rule.version);
            setAckWorking(false);
            if (res.error) Alert.alert('Hata', res.error.message);
            else {
              setReadStatus('acknowledged');
              Alert.alert('Teşekkürler', 'Onayınız kaydedildi.');
            }
          },
        },
      ],
    );
  };

  const handlePrint = async () => {
    if (!detail) return;
    const html = buildDepartmentRulePdfHtml(detail, orgName);
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
  const previewHtml = buildDepartmentRulePdfHtml(detail, orgName);
  const needsAck = rule.requires_acknowledgement && readStatus !== 'acknowledged';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.docNo}>{rule.document_number} · V{rule.version}</Text>
      <Text style={styles.title}>{rule.title}</Text>
      <Text style={styles.meta}>{departmentLabel(rule.department)} · {ruleTypeLabel(rule.rule_type)}</Text>

      <View style={styles.previewBox}>
        <WebView originWhitelist={['*']} source={{ html: previewHtml }} style={styles.webview} scrollEnabled nestedScrollEnabled />
      </View>

      {needsAck ? (
        <TouchableOpacity style={styles.ackBtn} onPress={handleAcknowledge} disabled={ackWorking}>
          {ackWorking ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.ackBtnText}>Okudum, Anladım ve Kabul Ediyorum</Text>
          )}
        </TouchableOpacity>
      ) : readStatus === 'acknowledged' ? (
        <View style={styles.ackDone}>
          <Text style={styles.ackDoneText}>✓ Onaylandı</Text>
        </View>
      ) : null}

      {rule.is_printable ? (
        <TouchableOpacity style={styles.printBtn} onPress={handlePrint}>
          <Text style={styles.printBtnText}>Yazdır</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  docNo: { fontSize: 12, color: adminTheme.colors.textMuted, fontWeight: '600' },
  title: { fontSize: 20, fontWeight: '900', color: adminTheme.colors.text, marginTop: 4, lineHeight: 26 },
  meta: { fontSize: 13, color: adminTheme.colors.textMuted, marginTop: 6, marginBottom: 12 },
  previewBox: { height: 420, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: adminTheme.colors.border },
  webview: { flex: 1, backgroundColor: '#fff' },
  ackBtn: { marginTop: 16, backgroundColor: '#0f766e', padding: 16, borderRadius: 12, alignItems: 'center' },
  ackBtnText: { color: '#fff', fontWeight: '800', fontSize: 15, textAlign: 'center' },
  ackDone: { marginTop: 16, backgroundColor: '#ecfdf5', padding: 14, borderRadius: 12, alignItems: 'center' },
  ackDoneText: { color: '#059669', fontWeight: '800' },
  printBtn: { marginTop: 10, padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#0f766e' },
  printBtnText: { color: '#0f766e', fontWeight: '700' },
});
