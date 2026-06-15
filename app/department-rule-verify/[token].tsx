import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import { verifyDepartmentRuleToken } from '@/lib/departmentRules';
import { departmentLabel } from '@/lib/departmentRules/constants';

export default function DepartmentRuleVerifyScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    verifyDepartmentRuleToken(String(token)).then((r) => {
      setResult(r);
      setLoading(false);
    });
  }, [token]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#0f766e" size="large" />
      </View>
    );
  }

  if (!result?.valid) {
    return (
      <View style={styles.centered}>
        <Ionicons name="close-circle" size={64} color="#dc2626" />
        <Text style={styles.failTitle}>Belge doğrulanamadı</Text>
        <Text style={styles.failSub}>{String(result?.message ?? 'Geçersiz veya silinmiş belge')}</Text>
      </View>
    );
  }

  const active = result.is_active === true;
  const latest = result.is_latest_version === true;

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Ionicons name="shield-checkmark" size={48} color="#0f766e" />
        <Text style={styles.heroTitle}>Belge Doğrulama</Text>
        <Text style={styles.heroSub}>Valoria Bölüm Kuralları</Text>
      </View>
      <View style={styles.card}>
        <Row label="Belge No" value={String(result.document_number ?? '—')} />
        <Row label="Başlık" value={String(result.title ?? '—')} />
        <Row label="Departman" value={departmentLabel(String(result.department ?? ''))} />
        <Row label="Durum" value={active ? 'Aktif' : 'Pasif'} highlight={active ? '#059669' : '#dc2626'} />
        <Row label="Son sürüm" value={latest ? 'Evet' : 'Hayır — eski versiyon'} highlight={latest ? '#059669' : '#d97706'} />
        <Row label="Oluşturan" value={String(result.created_by ?? '—')} />
        <Row label="Oluşturma" value={formatDate(String(result.created_at ?? ''))} />
        <Row label="Versiyon" value={`V${result.version ?? 1}`} />
      </View>
    </View>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, highlight ? { color: highlight, fontWeight: '800' } : null]}>{value}</Text>
    </View>
  );
}

function formatDate(d: string): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('tr-TR');
  } catch {
    return d;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary, padding: 20 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  hero: { alignItems: 'center', paddingVertical: 24 },
  heroTitle: { fontSize: 22, fontWeight: '900', color: adminTheme.colors.text, marginTop: 12 },
  heroSub: { fontSize: 14, color: adminTheme.colors.textMuted, marginTop: 4 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: adminTheme.colors.border },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: adminTheme.colors.border },
  rowLabel: { fontSize: 11, color: adminTheme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  rowValue: { fontSize: 15, color: adminTheme.colors.text, marginTop: 4, fontWeight: '600' },
  failTitle: { fontSize: 20, fontWeight: '900', color: adminTheme.colors.text, marginTop: 16 },
  failSub: { fontSize: 14, color: adminTheme.colors.textMuted, marginTop: 8, textAlign: 'center' },
});
