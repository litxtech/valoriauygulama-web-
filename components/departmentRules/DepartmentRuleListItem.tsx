import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import type { DepartmentRuleRow } from '@/lib/departmentRules/types';
import { departmentLabel, ruleStatusMeta, ruleTypeLabel } from '@/lib/departmentRules/constants';

type Props = {
  item: DepartmentRuleRow & { readStatus?: string };
  onPress: () => void;
  showReadStatus?: boolean;
};

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d.includes('T') ? d : `${d}T12:00:00`).toLocaleDateString('tr-TR');
  } catch {
    return d ?? '—';
  }
}

export function DepartmentRuleListItem({ item, onPress, showReadStatus }: Props) {
  const meta = ruleStatusMeta(item.status);
  const readLabel =
    item.readStatus === 'acknowledged'
      ? 'Onaylandı'
      : item.readStatus === 'read'
        ? 'Okundu'
        : 'Okunmadı';
  const readColor =
    item.readStatus === 'acknowledged' ? '#059669' : item.readStatus === 'read' ? '#2563eb' : '#dc2626';

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.78} onPress={onPress}>
      <View style={styles.topRow}>
        <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
      </View>
      <View style={styles.metaRow}>
        <View style={styles.chip}>
          <Ionicons name="business-outline" size={12} color={adminTheme.colors.textMuted} />
          <Text style={styles.chipText}>{departmentLabel(item.department)}</Text>
        </View>
        <View style={styles.chip}>
          <Ionicons name="pricetag-outline" size={12} color={adminTheme.colors.textMuted} />
          <Text style={styles.chipText}>{ruleTypeLabel(item.rule_type)}</Text>
        </View>
      </View>
      <View style={styles.bottomRow}>
        <Text style={styles.date}>{formatDate(item.start_date ?? item.published_at ?? item.created_at)}</Text>
        <View style={[styles.statusBadge, { backgroundColor: `${meta.color}18` }]}>
          <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
        </View>
        {showReadStatus ? (
          <View style={[styles.readBadge, { backgroundColor: `${readColor}18` }]}>
            <Text style={[styles.readText, { color: readColor }]}>{readLabel}</Text>
          </View>
        ) : null}
        {item.requires_acknowledgement ? (
          <View style={styles.ackBadge}>
            <Ionicons name="checkmark-done-outline" size={12} color="#7c3aed" />
            <Text style={styles.ackText}>Onay gerekli</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  title: { flex: 1, fontSize: 15, fontWeight: '700', color: adminTheme.colors.text, lineHeight: 20 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: adminTheme.colors.surfaceSecondary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  chipText: { fontSize: 11, color: adminTheme.colors.textMuted },
  bottomRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  date: { fontSize: 12, color: adminTheme.colors.textMuted, flex: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '700' },
  readBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  readText: { fontSize: 11, fontWeight: '600' },
  ackBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ackText: { fontSize: 10, color: '#7c3aed', fontWeight: '600' },
});
