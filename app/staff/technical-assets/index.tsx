import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import {
  canOperateTechnicalAssets,
  hasTechnicalAssetsReadonlyAccess,
  hasTechnicalAssetsStaffAccess,
} from '@/lib/staffPermissions';

export default function TechnicalAssetsHubScreen() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);

  if (staff == null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#1a365d" />
      </View>
    );
  }

  if (!hasTechnicalAssetsStaffAccess(staff)) {
    return (
      <View style={styles.blocked}>
        <Ionicons name="lock-closed-outline" size={40} color="#94a3b8" />
        <Text style={styles.blockedTitle}>Erişim yok</Text>
        <Text style={styles.blockedText}>Bu modül için yöneticinizden yetki isteyin (Teknik QR / envanter).</Text>
      </View>
    );
  }

  const readonly = hasTechnicalAssetsReadonlyAccess(staff);
  const canOperate = canOperateTechnicalAssets(staff);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.lead}>
        Fiziksel parçalar (sigorta, vana, kazan, kamera…) QR ile tanımlanır. Okutunca talimatlar, «nasıl kullanılır»
        metni ve eğitim videosu (varsa) burada görünür.
      </Text>

      <TouchableOpacity style={styles.card} onPress={() => router.push('/staff/technical-assets/scan')} activeOpacity={0.85}>
        <View style={[styles.iconWrap, { backgroundColor: 'rgba(184,134,11,0.15)' }]}>
          <Ionicons name="qr-code-outline" size={28} color="#b8860b" />
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>QR Tara</Text>
          <Text style={styles.cardHint}>Etiketteki kodu okut; varlık sayfası açılır.</Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color="#94a3b8" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.card} onPress={() => router.push('/staff/technical-assets/browse')} activeOpacity={0.85}>
        <View style={[styles.iconWrap, { backgroundColor: 'rgba(26,54,93,0.1)' }]}>
          <Ionicons name="list-outline" size={28} color="#1a365d" />
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>Teknik varlıklar</Text>
          <Text style={styles.cardHint}>İşletmenize kayıtlı varlıkları listeleyin.</Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color="#94a3b8" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.card} onPress={() => router.push('/staff/technical-assets/recent-logs')} activeOpacity={0.85}>
        <View style={[styles.iconWrap, { backgroundColor: 'rgba(14,116,144,0.12)' }]}>
          <Ionicons name="time-outline" size={28} color="#0e7490" />
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>Son müdahaleler</Text>
          <Text style={styles.cardHint}>İşletmedeki tüm müdahale kayıtları (tarih sırasıyla).</Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color="#94a3b8" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.card} onPress={() => router.push('/staff/technical-assets/faults')} activeOpacity={0.85}>
        <View style={[styles.iconWrap, { backgroundColor: 'rgba(220,38,38,0.1)' }]}>
          <Ionicons name="warning-outline" size={28} color="#dc2626" />
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>Arıza bildirimleri</Text>
          <Text style={styles.cardHint}>Acil / arıza kaydı açın veya açık kayıtları takip edin.</Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color="#94a3b8" />
      </TouchableOpacity>

      {readonly ? (
        <View style={styles.notice}>
          <Ionicons name="information-circle-outline" size={22} color="#b45309" />
          <Text style={styles.noticeText}>
            Hesabınız salt okunur: talimatları görürsünüz; müdahale kaydı ve durum değişikliği kapalıdır. Şüphede teknik
            personele haber verin.
          </Text>
        </View>
      ) : canOperate ? (
        <View style={styles.noticeOk}>
          <Ionicons name="checkmark-circle-outline" size={22} color="#047857" />
          <Text style={styles.noticeTextOk}>
            Müdahale yaptığınızda varlık sayfasından «Müdahale kaydı ekle» ile not bırakın; tarihçe takip edilebilir.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingBottom: 40 },
  lead: { fontSize: 15, color: '#475569', lineHeight: 22, marginBottom: 22 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 14,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  cardHint: { fontSize: 13, color: '#64748b', marginTop: 4 },
  blocked: { flex: 1, padding: 32, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  blockedTitle: { fontSize: 18, fontWeight: '800', color: '#334155', marginTop: 12 },
  blockedText: { fontSize: 14, color: '#64748b', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  notice: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#fde68a',
    marginTop: 8,
  },
  noticeText: { flex: 1, fontSize: 13, color: '#92400e', lineHeight: 19 },
  noticeOk: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#ecfdf5',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#a7f3d0',
    marginTop: 8,
  },
  noticeTextOk: { flex: 1, fontSize: 13, color: '#065f46', lineHeight: 19 },
});
