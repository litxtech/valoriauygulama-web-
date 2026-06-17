import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import type { AdminPaymentLane } from '@/lib/adminPaymentLanes';
import { buildAdminPaymentHubNavSections } from '@/lib/paymentHubMenu';

type Props = {
  onLanePress?: (lane: AdminPaymentLane) => void;
};

export function AdminPaymentHubNav({ onLanePress }: Props) {
  const router = useRouter();
  const sections = buildAdminPaymentHubNavSections();

  const open = (href: string, lane?: AdminPaymentLane) => {
    if (lane && onLanePress) {
      onLanePress(lane);
      return;
    }
    router.push(href as never);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.headerKicker}>TEK MERKEZ</Text>
        <Text style={styles.headerTitle}>Tahsilat & ödeme</Text>
        <Text style={styles.headerSub}>
          QR kod, sabit restoran ödemesi, sepet siparişleri, bahşiş ve muhasebe — hepsi buradan.
        </Text>
      </View>

      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <Text style={styles.sectionSub}>{section.subtitle}</Text>
          <View style={styles.grid}>
            {section.links.map((link) => (
              <TouchableOpacity
                key={`${section.title}-${link.label}`}
                style={[styles.tile, { borderColor: `${link.accent}33` }]}
                onPress={() => open(link.href, link.lane)}
                activeOpacity={0.88}
              >
                <View style={styles.tileTop}>
                  <View style={[styles.tileIcon, { backgroundColor: `${link.accent}18` }]}>
                    <Ionicons name={link.icon} size={20} color={link.accent} />
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
                </View>
                <Text style={styles.tileLabel}>{link.label}</Text>
                <Text style={styles.tileSub} numberOfLines={2}>
                  {link.sub}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  header: {
    backgroundColor: '#1e1b4b',
    marginHorizontal: -12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    marginBottom: 8,
  },
  headerKicker: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.65)', letterSpacing: 1 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#fff', marginTop: 4 },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 8, lineHeight: 18 },
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: theme.colors.text },
  sectionSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2, marginBottom: 10 },
  grid: { gap: 8 },
  tile: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
  },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: { fontSize: 14, fontWeight: '800', color: theme.colors.text },
  tileSub: { fontSize: 11, color: theme.colors.textMuted, marginTop: 4, lineHeight: 15 },
});
