import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import { contractStatusMeta, contractTypeLabel } from '@/lib/managedContracts/constants';
import type { ManagedContractRow } from '@/lib/managedContracts/types';

type Props = {
  item: ManagedContractRow;
  onPress: () => void;
};

export function ManagedContractListItem({ item, onPress }: Props) {
  const status = contractStatusMeta(item.status);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.78}>
      <View style={styles.top}>
        <View style={styles.iconWrap}>
          <Ionicons name="document-text-outline" size={22} color={adminTheme.colors.primary} />
        </View>
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {item.contract_number} · {contractTypeLabel(item.contract_type)}
          </Text>
          <Text style={styles.dates}>
            {item.start_date ? new Date(item.start_date).toLocaleDateString('tr-TR') : '—'}
            {' — '}
            {item.end_date ? new Date(item.end_date).toLocaleDateString('tr-TR') : '—'}
            {' · v'}
            {item.current_version_no}
          </Text>
        </View>
        <View style={[styles.pill, { backgroundColor: `${status.color}18` }]}>
          <Text style={[styles.pillText, { color: status.color }]}>{status.label}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: adminTheme.radius.lg,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    padding: 14,
    marginBottom: 10,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.text },
  sub: { marginTop: 3, fontSize: 12, fontWeight: '600', color: adminTheme.colors.textMuted },
  dates: { marginTop: 4, fontSize: 11, color: adminTheme.colors.textSecondary },
  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  pillText: { fontSize: 11, fontWeight: '800' },
});
