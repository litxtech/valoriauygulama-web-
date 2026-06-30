import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import { fmtMoneyTry } from '@/lib/financeLedger';
import { formatDateShort } from '@/lib/date';
import type { CounterpartyCandidate, ResolvedImportLine } from '@/lib/bankStatement/types';
import { counterpartyLabel } from '@/lib/bankStatement/matchCounterparty';

type Props = {
  line: ResolvedImportLine;
  counterparties: CounterpartyCandidate[];
  onToggle: (localId: string, selected: boolean) => void;
  onAssign: (line: ResolvedImportLine) => void;
  onRemove: (localId: string) => void;
  compact?: boolean;
  isDuplicate?: boolean;
  bulkDeleteMode?: boolean;
  bulkDeleteSelected?: boolean;
  onBulkDeleteToggle?: (localId: string) => void;
};

function formatTime(t: string | null): string {
  if (!t) return '—';
  return t.slice(0, 5);
}

function matchLabel(line: ResolvedImportLine, counterparties: CounterpartyCandidate[]): string {
  if (line.resolvedCounterpartyId) {
    return counterpartyLabel(line.resolvedCounterpartyId, counterparties);
  }
  if (line.createNewPerson) return 'Yeni cari oluşturulacak';
  return 'Kişi atanmadı';
}

export function BankImportLineRow({
  line,
  counterparties,
  onToggle,
  onAssign,
  onRemove,
  compact = false,
  isDuplicate = false,
  bulkDeleteMode = false,
  bulkDeleteSelected = false,
  onBulkDeleteToggle,
}: Props) {
  const canImport = !!line.resolvedCounterpartyId || line.createNewPerson;
  const included = line.selected && canImport;
  const excluded = canImport && !line.selected;

  const onRowPress = () => {
    if (bulkDeleteMode && onBulkDeleteToggle) {
      onBulkDeleteToggle(line.localId);
      return;
    }
    onAssign(line);
  };

  return (
    <View
      style={[
        styles.row,
        !bulkDeleteMode && included && styles.rowIncluded,
        !bulkDeleteMode && excluded && styles.rowExcluded,
        !bulkDeleteMode && !canImport && styles.rowNeedsPerson,
        isDuplicate && styles.rowDuplicate,
        bulkDeleteMode && bulkDeleteSelected && styles.rowBulkSelected,
      ]}
    >
      <TouchableOpacity
        style={styles.checkHit}
        onPress={() => {
          if (bulkDeleteMode && onBulkDeleteToggle) {
            onBulkDeleteToggle(line.localId);
            return;
          }
          if (canImport) onToggle(line.localId, !line.selected);
        }}
        disabled={!bulkDeleteMode && !canImport}
        hitSlop={8}
      >
        <Ionicons
          name={
            bulkDeleteMode
              ? bulkDeleteSelected
                ? 'checkbox'
                : 'square-outline'
              : included
                ? 'checkmark-circle'
                : excluded
                  ? 'ellipse-outline'
                  : 'alert-circle-outline'
          }
          size={26}
          color={
            bulkDeleteMode
              ? bulkDeleteSelected
                ? '#dc2626'
                : '#94a3b8'
              : included
                ? '#0f766e'
                : excluded
                  ? '#94a3b8'
                  : '#f59e0b'
          }
        />
      </TouchableOpacity>

      <Pressable style={styles.body} onPress={onRowPress}>
        <View style={styles.topRow}>
          <View style={styles.titleCol}>
            <Text style={[styles.name, excluded && styles.nameExcluded]} numberOfLines={1}>
              {line.displayName}
            </Text>
            <View style={styles.badgeRow}>
              {included ? (
                <View style={styles.badgeIncluded}>
                  <Text style={styles.badgeIncludedText}>Kayda dahil</Text>
                </View>
              ) : excluded ? (
                <View style={styles.badgeExcluded}>
                  <Text style={styles.badgeExcludedText}>Hariç</Text>
                </View>
              ) : (
                <View style={styles.badgeWarn}>
                  <Text style={styles.badgeWarnText}>Kişi gerekli</Text>
                </View>
              )}
              {isDuplicate ? (
                <View style={styles.badgeDup}>
                  <Text style={styles.badgeDupText}>Mükerrer</Text>
                </View>
              ) : null}
              <Text style={styles.metaInline}>
                {formatDateShort(line.valueDate)} · {line.direction === 'credit' ? 'Gelen' : 'Giden'}
              </Text>
            </View>
          </View>
          <Text
            style={[
              styles.amount,
              line.direction === 'credit' ? styles.amountIn : styles.amountOut,
              excluded && styles.amountMuted,
            ]}
          >
            {line.direction === 'credit' ? '+' : '−'}
            {fmtMoneyTry(line.amount)}
          </Text>
        </View>

        {!compact ? (
          <>
            <Text style={styles.match} numberOfLines={1}>
              {matchLabel(line, counterparties)}
            </Text>
            <Text style={styles.desc} numberOfLines={2}>
              {line.description}
            </Text>
          </>
        ) : null}
      </Pressable>

      <View style={styles.actions}>
        {!bulkDeleteMode ? (
          <>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => onAssign(line)}
          hitSlop={6}
          accessibilityLabel="Kişi ata"
        >
          <Ionicons name="person-outline" size={18} color={adminTheme.colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.iconBtn, styles.iconBtnDanger]}
          onPress={() => onRemove(line.localId)}
          hitSlop={6}
          accessibilityLabel="Listeden kaldır"
        >
          <Ionicons name="trash-outline" size={18} color="#dc2626" />
        </TouchableOpacity>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  rowIncluded: { borderColor: '#99f6e4', backgroundColor: '#f0fdfa' },
  rowExcluded: { borderColor: '#e2e8f0', backgroundColor: '#f8fafc', opacity: 0.92 },
  rowNeedsPerson: { borderColor: '#fde68a', backgroundColor: '#fffbeb' },
  rowDuplicate: { borderColor: '#fca5a5', backgroundColor: '#fff1f2' },
  rowBulkSelected: { borderColor: '#f87171', backgroundColor: '#fef2f2' },
  checkHit: { paddingTop: 4 },
  body: { flex: 1, minWidth: 0 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  titleCol: { flex: 1, minWidth: 0 },
  name: { fontSize: 14, fontWeight: '800', color: adminTheme.colors.text },
  nameExcluded: { color: adminTheme.colors.textMuted, textDecorationLine: 'line-through' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  badgeIncluded: {
    backgroundColor: '#ccfbf1',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeIncludedText: { fontSize: 10, fontWeight: '800', color: '#0f766e' },
  badgeExcluded: {
    backgroundColor: '#e2e8f0',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeExcludedText: { fontSize: 10, fontWeight: '800', color: '#64748b' },
  badgeWarn: {
    backgroundColor: '#fef3c7',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeWarnText: { fontSize: 10, fontWeight: '800', color: '#b45309' },
  badgeDup: {
    backgroundColor: '#fee2e2',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeDupText: { fontSize: 10, fontWeight: '800', color: '#b91c1c' },
  metaInline: { fontSize: 11, color: adminTheme.colors.textMuted, fontWeight: '600' },
  amount: { fontSize: 15, fontWeight: '800' },
  amountIn: { color: '#16a34a' },
  amountOut: { color: '#dc2626' },
  amountMuted: { color: '#94a3b8' },
  match: { fontSize: 12, fontWeight: '700', color: '#0f766e', marginTop: 6 },
  desc: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 4, lineHeight: 17 },
  actions: { gap: 4, paddingTop: 2 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnDanger: { backgroundColor: '#fef2f2' },
});
