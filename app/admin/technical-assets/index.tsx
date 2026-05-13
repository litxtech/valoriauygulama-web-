import { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { canAccessTechnicalAssetsAdminRoutes } from '@/lib/staffPermissions';

export default function AdminTechnicalAssetsHubScreen() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const ok = canAccessTechnicalAssetsAdminRoutes(staff);

  useEffect(() => {
    if (!ok) router.replace('/admin');
  }, [ok, router]);

  if (!ok) {
    return (
      <View style={styles.blocked}>
        <Text style={styles.blockedText}>Yetkisiz</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>
        Bina → lokasyon → teknik varlık hiyerarşisi; her varlık için QR üretin ve etiket çıktısı alın. Personel yetkileri
        «Çalışan düzenle» ekranındaki Teknik QR kutularından verilir.
      </Text>

      <TouchableOpacity style={styles.card} onPress={() => router.push('/admin/technical-assets/structure')} activeOpacity={0.85}>
        <Ionicons name="business-outline" size={26} color="#1a365d" />
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>Bina & lokasyon</Text>
          <Text style={styles.cardHint}>Ana bina, bungalov, ortak alan ve iç mekânlar</Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color="#94a3b8" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.card} onPress={() => router.push('/admin/technical-assets/assets')} activeOpacity={0.85}>
        <Ionicons name="qr-code-outline" size={26} color="#b8860b" />
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>Teknik varlıklar</Text>
          <Text style={styles.cardHint}>Sigorta, vana, NVR… liste, yeni kayıt, QR ve etiket yazdırma</Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color="#94a3b8" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.card} onPress={() => router.push('/admin/technical-assets/faults')} activeOpacity={0.85}>
        <Ionicons name="warning-outline" size={26} color="#dc2626" />
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>Arıza bildirimleri</Text>
          <Text style={styles.cardHint}>Personelin açtığı kayıtlar; çözüm ve varlık bağlantısı</Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color="#94a3b8" />
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7fafc' },
  content: { padding: 20, paddingBottom: 40 },
  intro: { fontSize: 14, color: '#4a5568', lineHeight: 21, marginBottom: 20 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 17, fontWeight: '800', color: '#1a202c' },
  cardHint: { fontSize: 13, color: '#718096', marginTop: 4 },
  blocked: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  blockedText: { color: '#e53e3e', fontWeight: '700' },
});
