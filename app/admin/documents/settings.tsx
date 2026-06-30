import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DocumentScreenIntro } from '@/components/documents/DocumentScreenIntro';
import { docTheme } from '@/constants/documentManagementTheme';

const PLANNED_FEATURES = [
  {
    icon: 'document-attach-outline' as const,
    title: 'İzin verilen dosya türleri',
    description: 'PDF, görsel ve ofis belgeleri için yükleme kuralları.',
  },
  {
    icon: 'shield-checkmark-outline' as const,
    title: 'Onay kuralları',
    description: 'Kategori bazlı otomatik onay akışı ve yetki sınırları.',
  },
  {
    icon: 'notifications-outline' as const,
    title: 'Süre bildirimleri',
    description: 'Yaklaşan ve dolmuş belgeler için e-posta / push hatırlatmaları.',
  },
];

export default function AdminDocumentsSettings() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <DocumentScreenIntro screenKey="settings" />

      <View style={styles.comingSoon}>
        <Ionicons name="construct-outline" size={22} color={docTheme.accent} />
        <Text style={styles.comingSoonTitle}>Yakında</Text>
        <Text style={styles.comingSoonText}>
          Bu ekran modül ayarlarını merkezi olarak yönetmek için hazırlanıyor. Şimdilik kategoriler ve onay
          süreçlerini Kategoriler ekranından yapılandırabilirsiniz.
        </Text>
      </View>

      {PLANNED_FEATURES.map((f) => (
        <View key={f.title} style={styles.featureCard}>
          <View style={styles.featureIcon}>
            <Ionicons name={f.icon} size={20} color={docTheme.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.featureTitle}>{f.title}</Text>
            <Text style={styles.featureDesc}>{f.description}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: docTheme.bg },
  content: { padding: 16, paddingBottom: 28 },
  comingSoon: {
    backgroundColor: docTheme.accentSoft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: docTheme.border,
    padding: 16,
    marginBottom: 14,
    gap: 6,
  },
  comingSoonTitle: { fontSize: 15, fontWeight: '800', color: docTheme.accentDark },
  comingSoonText: { fontSize: 13, color: docTheme.textSecondary, lineHeight: 20 },
  featureCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: docTheme.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: docTheme.border,
    padding: 14,
    marginBottom: 10,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: docTheme.cardMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: { fontSize: 14, fontWeight: '800', color: docTheme.text },
  featureDesc: { marginTop: 4, fontSize: 12, color: docTheme.textMuted, lineHeight: 17 },
});
