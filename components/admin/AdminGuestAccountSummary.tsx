import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import {
  buildGuestAccountDetailLines,
  type AdminGuestAccountSummary,
} from '@/lib/adminGuestAccountSummary';

type Props = {
  guest: AdminGuestAccountSummary | null | undefined;
  onOpenProfile?: (guestId: string) => void;
  compact?: boolean;
};

export function AdminGuestAccountSummary({ guest, onOpenProfile, compact }: Props) {
  const lines = buildGuestAccountDetailLines(guest);
  if (lines.length === 0) {
    return (
      <View style={styles.emptyBox}>
        <Ionicons name="person-outline" size={16} color={theme.colors.textMuted} />
        <Text style={styles.emptyText}>Misafir hesabı bağlı değil</Text>
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <View style={styles.headerRow}>
        <Ionicons name="person-circle-outline" size={18} color="#635bff" />
        <Text style={styles.headerTitle}>Misafir hesap detayı</Text>
        {guest?.id && onOpenProfile ? (
          <TouchableOpacity style={styles.profileBtn} onPress={() => onOpenProfile(guest.id)} hitSlop={8}>
            <Text style={styles.profileBtnText}>Profil</Text>
            <Ionicons name="chevron-forward" size={14} color="#635bff" />
          </TouchableOpacity>
        ) : null}
      </View>

      {lines.map((line) => (
        <View key={line.label} style={[styles.line, compact && styles.lineCompact]}>
          <Text style={styles.label}>{line.label}</Text>
          <Text style={[styles.value, line.highlight && styles.valueHighlight]} numberOfLines={2}>
            {line.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  headerTitle: { flex: 1, fontSize: 12, fontWeight: '800', color: theme.colors.text },
  profileBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  profileBtnText: { fontSize: 12, fontWeight: '700', color: '#635bff' },
  line: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  lineCompact: { gap: 6 },
  label: { width: 108, fontSize: 11, color: theme.colors.textMuted, fontWeight: '600' },
  value: { flex: 1, fontSize: 12, color: theme.colors.text, fontWeight: '500' },
  valueHighlight: { fontWeight: '800', fontSize: 13 },
  emptyBox: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
  },
  emptyText: { fontSize: 12, color: theme.colors.textMuted },
});
