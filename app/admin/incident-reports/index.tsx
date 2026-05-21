import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, usePathname, useRouter } from 'expo-router';
import { navigateAdminBack, ADMIN_TABS_FALLBACK } from '@/lib/adminStackBack';
import { navigateStaffBack, STAFF_TABS_FALLBACK } from '@/lib/staffStackBack';
import { adminTheme } from '@/constants/adminTheme';
import { listIncidentReports, type IncidentReportRow } from '@/lib/incidentReports';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Taslak',
  pending_admin_approval: 'Admin onayı bekliyor',
  revision_requested: 'Düzeltme istendi',
  approved: 'Onaylandı',
  pdf_generated: 'PDF oluşturuldu',
  archived: 'Arşivlendi',
  cancelled: 'İptal edildi',
};

export default function AdminIncidentReportsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const pathname = usePathname();
  const isStaffRoute = pathname?.startsWith('/staff') ?? false;
  const basePath = isStaffRoute ? '/staff/incident-reports' : '/admin/incident-reports';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reports, setReports] = useState<IncidentReportRow[]>([]);

  const pendingCount = useMemo(
    () => reports.filter((r) => r.status === 'pending_admin_approval' || r.status === 'revision_requested').length,
    [reports]
  );

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    const { data, error } = await listIncidentReports({ limit: 100 });
    if (!error && data) setReports(data as IncidentReportRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.topRow}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() =>
            isStaffRoute
              ? navigateStaffBack(router, navigation, pathname, STAFF_TABS_FALLBACK)
              : navigateAdminBack(router, navigation, pathname, ADMIN_TABS_FALLBACK)
          }
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-back" size={16} color={adminTheme.colors.text} />
          <Text style={styles.backBtnText}>Geri</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Tutanak Yönetimi</Text>
        <Text style={styles.summarySub}>Toplam kayıt: {reports.length}</Text>
        <Text style={styles.summarySub}>İnceleme bekleyen: {pendingCount}</Text>
      </View>

      {reports.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="document-text-outline" size={30} color={adminTheme.colors.textMuted} />
          <Text style={styles.emptyTitle}>Henüz tutanak yok</Text>
          <Text style={styles.emptySub}>Personel veya admin yeni kayıt oluşturduğunda burada listelenecek.</Text>
        </View>
      ) : (
        reports.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.itemCard}
            activeOpacity={0.85}
            onPress={() => router.push({ pathname: `${basePath}/[id]` as any, params: { id: item.id } })}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.itemNo}>{item.report_no}</Text>
              <Text style={styles.itemDesc} numberOfLines={2}>
                {item.description}
              </Text>
              <Text style={styles.itemMeta}>
                {STATUS_LABELS[item.status] ?? item.status} · {item.room_number ? `Oda ${item.room_number}` : item.location_label}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={adminTheme.colors.textMuted} />
          </TouchableOpacity>
        ))
      )}

      <TouchableOpacity style={styles.createBtn} onPress={() => router.push(`${basePath}/new` as any)} activeOpacity={0.9}>
        <Ionicons name="add-circle-outline" size={18} color="#fff" />
        <Text style={styles.createText}>Yeni tutanak oluştur</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: adminTheme.spacing.lg, paddingBottom: 28, gap: 10 },
  topRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: '#fff',
  },
  backBtnText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.text },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  summaryCard: {
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.lg,
    padding: 14,
  },
  summaryTitle: { fontSize: 16, fontWeight: '800', color: adminTheme.colors.text },
  summarySub: { marginTop: 4, fontSize: 13, fontWeight: '600', color: adminTheme.colors.textMuted },
  emptyCard: {
    marginTop: 8,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.lg,
    padding: 18,
    alignItems: 'center',
  },
  emptyTitle: { marginTop: 8, fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  emptySub: { marginTop: 6, fontSize: 12, color: adminTheme.colors.textMuted, textAlign: 'center' },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.lg,
    padding: 12,
  },
  itemNo: { fontSize: 14, fontWeight: '800', color: adminTheme.colors.text },
  itemDesc: { marginTop: 3, fontSize: 12, color: adminTheme.colors.textSecondary },
  itemMeta: { marginTop: 6, fontSize: 12, fontWeight: '600', color: adminTheme.colors.textMuted },
  createBtn: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: adminTheme.colors.primary,
    borderRadius: adminTheme.radius.lg,
    paddingVertical: 12,
  },
  createText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
