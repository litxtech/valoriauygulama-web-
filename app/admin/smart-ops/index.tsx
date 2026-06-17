import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrganizationQueryScope } from '@/hooks/useAdminOrganizationQueryScope';
import { seedSmartOpsTemplates } from '@/lib/smartOps';
import { adminTheme } from '@/constants/adminTheme';

export default function AdminSmartOpsHub() {
  const { staff, canUseAll, orgScoped, canQuery } = useAdminOrganizationQueryScope();
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);

  const handleSeed = async () => {
    if (!orgScoped) return;
    setSeeding(true);
    setSeedMsg(null);
    const res = await seedSmartOpsTemplates(orgScoped);
    setSeeding(false);
    if (res.error) setSeedMsg(res.error);
    else setSeedMsg(`Varsayılan şablonlar yüklendi (${res.count ?? 0} kayıt).`);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Operasyon Merkezi</Text>
      <Text style={styles.subtitle}>
        Zamanlı görevler, bildirim şablonları, toplu duyuru, sesler ve canlı durum takibi.
      </Text>

      <AdminOrganizationPicker canUseAll={canUseAll} ownOrganizationId={staff?.organization_id} />

      {canQuery && orgScoped ? (
        <TouchableOpacity style={styles.seedBtn} onPress={handleSeed} disabled={seeding}>
          <Ionicons name="download-outline" size={20} color="#1a365d" />
          <Text style={styles.seedBtnText}>{seeding ? 'Yükleniyor…' : 'Varsayılan şablonları yükle'}</Text>
        </TouchableOpacity>
      ) : null}
      {seedMsg ? <Text style={styles.seedMsg}>{seedMsg}</Text> : null}

      <Link href="/admin/smart-ops/templates" asChild>
        <TouchableOpacity style={styles.card}>
          <Ionicons name="list-outline" size={28} color={adminTheme.colors.primary} />
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Görev Şablonları</Text>
            <Text style={styles.cardDesc}>Aç/kapat, saat, rol, checklist, foto zorunluluğu</Text>
          </View>
        </TouchableOpacity>
      </Link>

      <Link href="/admin/notifications/templates" asChild>
        <TouchableOpacity style={styles.card}>
          <Ionicons name="notifications-outline" size={28} color="#805ad5" />
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Bildirim Şablonları</Text>
            <Text style={styles.cardDesc}>Standart push/in-app metin şablonlarını yönetin</Text>
          </View>
        </TouchableOpacity>
      </Link>

      <Link href="/admin/smart-ops/live" asChild>
        <TouchableOpacity style={styles.card}>
          <Ionicons name="pulse-outline" size={28} color="#c05621" />
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Canlı Operasyon Paneli</Text>
            <Text style={styles.cardDesc}>Açık, geciken ve tamamlanan görevler</Text>
          </View>
        </TouchableOpacity>
      </Link>

      <Link href="/admin/notifications/bulk" asChild>
        <TouchableOpacity style={[styles.card, styles.cardMuted]}>
          <Ionicons name="megaphone-outline" size={28} color="#718096" />
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Toplu duyuru (klasik)</Text>
            <Text style={styles.cardDesc}>Anlık push — zamanlı operasyon değil</Text>
          </View>
        </TouchableOpacity>
      </Link>

      <Link href="/admin/notifications/sounds" asChild>
        <TouchableOpacity style={styles.card}>
          <Ionicons name="volume-high-outline" size={28} color="#0d9488" />
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Bildirim sesleri</Text>
            <Text style={styles.cardDesc}>Kanal ve olay bazlı ses dosyaları</Text>
          </View>
        </TouchableOpacity>
      </Link>

      <Link href="/admin/notifications/event-log" asChild>
        <TouchableOpacity style={styles.card}>
          <Ionicons name="analytics-outline" size={28} color="#4f46e5" />
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Bildirim log & takip</Text>
            <Text style={styles.cardDesc}>Gönderim geçmişi ve teslimat durumu</Text>
          </View>
        </TouchableOpacity>
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7fafc' },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', color: '#1a365d', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#718096', marginBottom: 16, lineHeight: 20 },
  seedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ebf8ff',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  seedBtnText: { fontSize: 14, fontWeight: '600', color: '#1a365d' },
  seedMsg: { fontSize: 13, color: '#2f855a', marginBottom: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#fff',
    padding: 18,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardMuted: { opacity: 0.92 },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#1a202c' },
  cardDesc: { fontSize: 13, color: '#718096', marginTop: 4 },
});
