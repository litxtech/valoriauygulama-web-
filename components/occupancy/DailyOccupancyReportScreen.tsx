import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { addDaysToDate } from '@/lib/date';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { AdminOrganizationPicker } from '@/components/admin';
import { adminTheme } from '@/constants/adminTheme';
import { occupancyPathsFromPathname } from '@/lib/occupancyOpsPaths';
import { loadDailyOccupancyReport, type DailyOccupancyReport } from '@/lib/occupancyDailyReportLoad';
import { getOccupancyCached, invalidateOccupancyCache, occupancyCacheKey } from '@/lib/occupancyCache';

function csvEscape(s: string): string {
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function DailyOccupancyReportScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const paths = occupancyPathsFromPathname(pathname);
  const { staff } = useAuthStore();
  const { selectedOrganizationId } = useAdminOrgStore();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<DailyOccupancyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const canUseAll = staff?.app_permissions?.super_admin === true || staff?.role === 'admin';
  const orgScoped =
    (canUseAll ? selectedOrganizationId : staff?.organization_id) &&
    (canUseAll ? selectedOrganizationId : staff?.organization_id) !== 'all'
      ? (canUseAll ? selectedOrganizationId : staff?.organization_id)!
      : null;

  const opsPath = paths.scope === 'staff' ? '/staff/occupancy/operations' : '/admin/report/operations';

  const load = useCallback(
    async (force = false) => {
      const report = await loadDailyOccupancyReport(date, orgScoped, { force });
      setData(report);
      setLoading(false);
      setRefreshing(false);
    },
    [date, orgScoped]
  );

  useEffect(() => {
    let cancelled = false;
    const key = occupancyCacheKey(['daily', orgScoped, date]);
    const cached = getOccupancyCached<DailyOccupancyReport>(key);
    if (cached) {
      setData(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    void loadDailyOccupancyReport(date, orgScoped).then((report) => {
      if (!cancelled) {
        setData(report);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [date, orgScoped]);

  const onRefresh = () => {
    setRefreshing(true);
    invalidateOccupancyCache('daily');
    void load(true);
  };

  const goDay = (delta: number) => setDate(addDaysToDate(date, delta));

  const exportCsv = async () => {
    if (!data) return;
    setExporting(true);
    try {
      const rows: string[] = [];
      rows.push('Valoria Hotel - Günlük Doluluk Raporu');
      rows.push(`Tarih,${data.date}`);
      rows.push(`Toplam Oda,${data.totalRooms}`);
      rows.push(`Dolu,${data.occupiedRooms}`);
      rows.push(`Boş,${data.availableRooms}`);
      rows.push(`Doluluk %,${data.occupancyPct}`);
      rows.push(`Giriş,${data.checkInCount}`);
      rows.push(`Çıkış,${data.checkOutCount}`);
      rows.push('');
      rows.push('Giriş yapanlar');
      rows.push('Ad,Oda,Saat');
      data.checkIns.forEach((g) => rows.push([csvEscape(g.full_name), g.room_number, g.at].join(',')));
      rows.push('');
      rows.push('Çıkış yapanlar');
      data.checkOuts.forEach((g) => rows.push([csvEscape(g.full_name), g.room_number, g.at].join(',')));

      const path = FileSystem.cacheDirectory + `doluluk-${data.date}.csv`;
      await FileSystem.writeAsStringAsync(path, '\uFEFF' + rows.join('\r\n'), {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Günlük rapor' });
      }
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Dışa aktarılamadı');
    }
    setExporting(false);
  };

  if (loading && !data) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
        <Text style={styles.loading}>Günlük rapor yükleniyor…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.title}>Günlük Doluluk Raporu</Text>
      <Text style={styles.subtitle}>Özet ve günlük giriş/çıkış listesi. Oda operasyonları için ayrı merkeze geçin.</Text>

      {canUseAll ? (
        <AdminOrganizationPicker canUseAll={canUseAll} ownOrganizationId={staff?.organization_id} />
      ) : null}

      <TouchableOpacity style={styles.opsBanner} onPress={() => router.push(opsPath as never)} activeOpacity={0.9}>
        <View style={styles.opsBannerIcon}>
          <Ionicons name="grid-outline" size={22} color="#0f766e" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.opsBannerTitle}>Konaklama operasyon merkezi</Text>
          <Text style={styles.opsBannerSub}>Odalar, çıkış, toplu işlem, oda atama</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#0f766e" />
      </TouchableOpacity>

      {date === new Date().toISOString().slice(0, 10) ? (
        <TouchableOpacity
          style={[styles.opsBanner, { borderColor: '#fde68a', backgroundColor: '#fffbeb' }]}
          onPress={() =>
            router.push(
              (paths.scope === 'staff'
                ? '/staff/occupancy/breakfast-briefing'
                : '/admin/report/breakfast-briefing') as never
            )
          }
          activeOpacity={0.9}
        >
          <View style={[styles.opsBannerIcon, { backgroundColor: '#fef3c7' }]}>
            <Ionicons name="cafe-outline" size={22} color="#b45309" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.opsBannerTitle, { color: '#92400e' }]}>Sabah kahvaltı sayısı</Text>
            <Text style={styles.opsBannerSub}>Kahvaltı misafiri ve otel nüfusu — mutfak/resepsiyon bildirimi</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#b45309" />
        </TouchableOpacity>
      ) : null}

      <View style={styles.dateRow}>
        <TouchableOpacity style={styles.dateBtn} onPress={() => goDay(-1)}>
          <Text style={styles.dateBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.dateText}>{date}</Text>
        <TouchableOpacity style={styles.dateBtn} onPress={() => goDay(1)}>
          <Text style={styles.dateBtnText}>→</Text>
        </TouchableOpacity>
      </View>

      {data ? (
        <>
          <View style={styles.cards}>
            <View style={styles.card}>
              <Text style={styles.cardValue}>%{data.occupancyPct}</Text>
              <Text style={styles.cardLabel}>Doluluk</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardValue}>{data.occupiedRooms}/{data.totalRooms}</Text>
              <Text style={styles.cardLabel}>Dolu / Toplam</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardValue}>{data.availableRooms}</Text>
              <Text style={styles.cardLabel}>Boş</Text>
            </View>
          </View>
          <View style={styles.cards}>
            <View style={styles.card}>
              <Text style={styles.cardValue}>{data.checkInCount}</Text>
              <Text style={styles.cardLabel}>Giriş</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardValue}>{data.checkOutCount}</Text>
              <Text style={styles.cardLabel}>Çıkış</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Giriş yapanlar ({data.checkInCount})</Text>
            {data.checkIns.length === 0 ? (
              <Text style={styles.empty}>Kayıt yok</Text>
            ) : (
              data.checkIns.map((g) => (
                <TouchableOpacity
                  key={g.id}
                  style={styles.row}
                  onPress={() => router.push(paths.guest(g.id) as never)}
                >
                  <Text style={styles.rowName}>{g.full_name}</Text>
                  <Text style={styles.rowMeta}>Oda {g.room_number} · {g.at}</Text>
                </TouchableOpacity>
              ))
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Çıkış yapanlar ({data.checkOutCount})</Text>
            {data.checkOuts.length === 0 ? (
              <Text style={styles.empty}>Kayıt yok</Text>
            ) : (
              data.checkOuts.map((g) => (
                <TouchableOpacity
                  key={g.id}
                  style={styles.row}
                  onPress={() => router.push(paths.guest(g.id) as never)}
                >
                  <Text style={styles.rowName}>{g.full_name}</Text>
                  <Text style={styles.rowMeta}>Oda {g.room_number} · {g.at}</Text>
                </TouchableOpacity>
              ))
            )}
          </View>

          <TouchableOpacity
            style={[styles.exportBtn, exporting && styles.exportDisabled]}
            onPress={exportCsv}
            disabled={exporting}
          >
            {exporting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.exportBtnText}>CSV / Excel paylaş</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cacheHintBtn}
            onPress={() => {
              invalidateOccupancyCache('daily');
              invalidateOccupancyCache('ops');
              setRefreshing(true);
              void load(true);
            }}
          >
            <Ionicons name="refresh-outline" size={14} color="#64748b" />
            <Text style={styles.cacheHintText}>Veriyi yenile (önbelleği temizle)</Text>
          </TouchableOpacity>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loading: { marginTop: 10, color: '#64748b' },
  title: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 13, color: '#64748b', marginTop: 6, marginBottom: 14, lineHeight: 18 },
  opsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ecfdf5',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  opsBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#d1fae5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  opsBannerTitle: { fontSize: 15, fontWeight: '800', color: '#0f766e' },
  opsBannerSub: { fontSize: 12, color: '#047857', marginTop: 2 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 16 },
  dateBtn: { padding: 12, backgroundColor: '#e2e8f0', borderRadius: 10 },
  dateBtnText: { fontSize: 16, fontWeight: '700', color: '#334155' },
  dateText: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  cards: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  card: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  cardValue: { fontSize: 18, fontWeight: '800', color: '#1a365d' },
  cardLabel: { fontSize: 11, color: '#64748b', marginTop: 4 },
  section: { marginTop: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 8 },
  row: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  rowName: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  rowMeta: { fontSize: 13, color: '#64748b', marginTop: 2 },
  empty: { fontSize: 13, color: '#94a3b8', fontStyle: 'italic' },
  exportBtn: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#276749',
    borderRadius: 12,
    alignItems: 'center',
  },
  exportDisabled: { opacity: 0.7 },
  exportBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cacheHintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    padding: 8,
  },
  cacheHintText: { fontSize: 12, color: '#64748b' },
});
