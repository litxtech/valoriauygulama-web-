import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { supabase } from '@/lib/supabase';
import { formatTime, addDaysToDate } from '@/lib/date';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { AdminOrganizationPicker } from '@/components/admin';

type ReportData = {
  date: string;
  totalRooms: number;
  occupiedRooms: number;
  occupancyPct: number;
  checkInCount: number;
  checkOutCount: number;
  checkIns: { full_name: string; room_number: string; at: string }[];
  checkOuts: { full_name: string; room_number: string; at: string }[];
};

function csvEscape(s: string): string {
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export default function ReportScreen() {
  const { staff } = useAuthStore();
  const { selectedOrganizationId } = useAdminOrgStore();
  const [date, setDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const loadReport = async () => {
    setLoading(true);
    const canUseAll = staff?.app_permissions?.super_admin === true || staff?.role === 'admin';
    const orgId = canUseAll ? selectedOrganizationId : staff?.organization_id;
    const orgScoped = orgId && orgId !== 'all' ? orgId : null;
    const dayStart = `${date}T00:00:00.000Z`;
    const dayEnd = `${date}T23:59:59.999Z`;

    let roomsQuery = supabase.from('rooms').select('id', { count: 'exact', head: true });
    let occupiedQuery = supabase.from('rooms').select('id', { count: 'exact', head: true }).eq('status', 'occupied');
    let checkInsQuery = supabase
      .from('guests')
      .select('full_name, check_in_at, rooms(room_number)')
      .not('check_in_at', 'is', null)
      .gte('check_in_at', dayStart)
      .lte('check_in_at', dayEnd);
    let checkOutsQuery = supabase
      .from('guests')
      .select('full_name, check_out_at, rooms(room_number)')
      .not('check_out_at', 'is', null)
      .gte('check_out_at', dayStart)
      .lte('check_out_at', dayEnd);
    if (orgScoped) {
      roomsQuery = roomsQuery.eq('organization_id', orgScoped);
      occupiedQuery = occupiedQuery.eq('organization_id', orgScoped);
      checkInsQuery = checkInsQuery.eq('organization_id', orgScoped);
      checkOutsQuery = checkOutsQuery.eq('organization_id', orgScoped);
    }

    const [roomsRes, occupiedRes, checkInsRes, checkOutsRes] = await Promise.all([
      roomsQuery,
      occupiedQuery,
      checkInsQuery,
      checkOutsQuery,
    ]);

    const totalRooms = roomsRes.count ?? 0;
    const occupiedRooms = occupiedRes.count ?? 0;
    const checkIns = (checkInsRes.data ?? []).map((g: { full_name: string; check_in_at: string; rooms: { room_number: string } | null }) => ({
      full_name: g.full_name,
      room_number: g.rooms?.room_number ?? '—',
      at: formatTime(g.check_in_at),
    }));
    const checkOuts = (checkOutsRes.data ?? []).map((g: { full_name: string; check_out_at: string; rooms: { room_number: string } | null }) => ({
      full_name: g.full_name,
      room_number: g.rooms?.room_number ?? '—',
      at: formatTime(g.check_out_at),
    }));

    setData({
      date,
      totalRooms,
      occupiedRooms,
      occupancyPct: totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0,
      checkInCount: checkIns.length,
      checkOutCount: checkOuts.length,
      checkIns,
      checkOuts,
    });
    setLoading(false);
  };

  useEffect(() => {
    loadReport();
  }, [date]);

  const exportCsv = async () => {
    if (!data) return;
    setExporting(true);
    try {
      const rows: string[] = [];
      rows.push('Valoria Hotel - Günlük Rapor');
      rows.push(`Tarih,${data.date}`);
      rows.push('');
      rows.push('Özet');
      rows.push('Toplam Oda,Dolu Oda,Doluluk %,Giriş Sayısı,Çıkış Sayısı');
      rows.push([data.totalRooms, data.occupiedRooms, `%${data.occupancyPct}`, data.checkInCount, data.checkOutCount].join(','));
      rows.push('');
      rows.push('Giriş yapan misafirler');
      rows.push('Ad Soyad,Oda,Saat');
      data.checkIns.forEach((g) => rows.push([csvEscape(g.full_name), g.room_number, g.at].join(',')));
      rows.push('');
      rows.push('Çıkış yapan misafirler');
      rows.push('Ad Soyad,Oda,Saat');
      data.checkOuts.forEach((g) => rows.push([csvEscape(g.full_name), g.room_number, g.at].join(',')));

      const csv = '\uFEFF' + rows.join('\r\n'); // BOM for Excel UTF-8
      const fileName = `valoria-rapor-${data.date}.csv`;
      const path = FileSystem.cacheDirectory + fileName;
      await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Raporu Kaydet' });
      } else {
        Alert.alert('CSV hazır', `Dosya: ${path}`);
      }
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'CSV oluşturulamadı.');
    }
    setExporting(false);
  };

  const goDay = (delta: number) => {
    setDate(addDaysToDate(date, delta));
  };

  if (loading && !data) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a365d" />
        <Text style={styles.loading}>Yükleniyor...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Günlük Rapor</Text>
      <AdminOrganizationPicker
        canUseAll={staff?.app_permissions?.super_admin === true || staff?.role === 'admin'}
        ownOrganizationId={staff?.organization_id}
      />
      <View style={styles.dateRow}>
        <TouchableOpacity style={styles.dateBtn} onPress={() => goDay(-1)}>
          <Text style={styles.dateBtnText}>← Önceki</Text>
        </TouchableOpacity>
        <Text style={styles.dateText}>{date}</Text>
        <TouchableOpacity style={styles.dateBtn} onPress={() => goDay(1)}>
          <Text style={styles.dateBtnText}>Sonraki →</Text>
        </TouchableOpacity>
      </View>

      {data && (
        <>
          <View style={styles.cards}>
            <View style={styles.card}>
              <Text style={styles.cardValue}>{data.totalRooms}</Text>
              <Text style={styles.cardLabel}>Toplam Oda</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardValue}>{data.occupiedRooms}</Text>
              <Text style={styles.cardLabel}>Dolu Oda</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardValue}>%{data.occupancyPct}</Text>
              <Text style={styles.cardLabel}>Doluluk</Text>
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

          {data.checkIns.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Giriş yapanlar</Text>
              {data.checkIns.map((g, i) => (
                <Text key={i} style={styles.row}>{g.full_name} – Oda {g.room_number} ({g.at})</Text>
              ))}
            </View>
          )}
          {data.checkOuts.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Çıkış yapanlar</Text>
              {data.checkOuts.map((g, i) => (
                <Text key={i} style={styles.row}>{g.full_name} – Oda {g.room_number} ({g.at})</Text>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={[styles.exportBtn, exporting && styles.exportBtnDisabled]}
            onPress={exportCsv}
            disabled={exporting}
          >
            {exporting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.exportBtnText}>CSV / Excel Olarak İndir</Text>
            )}
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7fafc' },
  content: { padding: 24, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loading: { marginTop: 12, color: '#718096' },
  title: { fontSize: 20, fontWeight: '700', color: '#1a202c', marginBottom: 16 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  dateBtn: { padding: 12, backgroundColor: '#e2e8f0', borderRadius: 8 },
  dateBtnText: { fontSize: 14, fontWeight: '600', color: '#2d3748' },
  dateText: { fontSize: 16, fontWeight: '600', color: '#1a202c' },
  cards: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  card: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  cardValue: { fontSize: 22, fontWeight: '700', color: '#1a365d' },
  cardLabel: { fontSize: 12, color: '#718096', marginTop: 4 },
  section: { marginTop: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#2d3748', marginBottom: 8 },
  row: { fontSize: 14, color: '#4a5568', marginBottom: 4 },
  exportBtn: { marginTop: 32, padding: 16, backgroundColor: '#276749', borderRadius: 12, alignItems: 'center' },
  exportBtnDisabled: { opacity: 0.7 },
  exportBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
