import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function AdminMaliyeHome() {
  const router = useRouter();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Maliye Evrak Merkezi</Text>
      <Text style={styles.sub}>
        Denetim evrakları, günlük müşteri listesi, PIN ile açılan portal. QR linki, URL ve indirme işlemleri QR Merkezi’ndedir.
      </Text>

      <TouchableOpacity style={styles.qrHubBtn} onPress={() => router.push('/admin/qr-designs')} activeOpacity={0.88}>
        <Ionicons name="qr-code-outline" size={24} color="#fff" />
        <View style={styles.qrHubTextWrap}>
          <Text style={styles.qrHubTitle}>QR Merkezi → Maliye</Text>
          <Text style={styles.qrHubSub}>Portal URL, sabit QR, token üret, indir</Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color="#fff" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.navBtn} onPress={() => router.push('/admin/maliye/documents')}>
        <Text style={styles.navText}>Evrak Sıralama ve Çekmeceler</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.navBtn} onPress={() => router.push('/admin/maliye/forms')}>
        <Text style={styles.navText}>Günlük Müşteri Formları</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.navBtn} onPress={() => router.push('/admin/maliye/tesk-serial')}>
        <Text style={styles.navText}>Günlük Liste Seri / Sıra No (TESK)</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.navBtn} onPress={() => router.push('/admin/maliye/access')}>
        <Text style={styles.navText}>PIN ve Erişim Tokenları</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.navBtn} onPress={() => router.push('/admin/maliye/logs')}>
        <Text style={styles.navText}>Denetim Erişim Logları</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, gap: 10 },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  sub: { color: '#475569', lineHeight: 20, marginBottom: 8 },
  qrHubBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1a365d',
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
  },
  qrHubTextWrap: { flex: 1 },
  qrHubTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
  qrHubSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 4 },
  navBtn: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', padding: 14 },
  navText: { fontSize: 15, fontWeight: '700', color: '#1e293b' },
});
