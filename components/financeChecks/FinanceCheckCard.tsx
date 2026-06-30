import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { adminTheme } from '@/constants/adminTheme';
import {
  CHECK_DIR_META,
  checkStatusTone,
  daysUntilDue,
  dueUrgencyLabel,
} from '@/lib/financeCheckTheme';
import { CHECK_STATUS_LABELS, fmtMoneyTry, type FinanceCheckDirection, type FinanceCheckStatus } from '@/lib/finance';
import { formatDateShort } from '@/lib/date';
import { FinanceCheckQuickStatusButtons } from '@/components/financeChecks/FinanceCheckQuickStatusButtons';

type Props = {
  id: string;
  direction: FinanceCheckDirection;
  counterpartyName: string;
  amount: number;
  status: FinanceCheckStatus;
  dueDate: string | null;
  onPress: () => void;
  onStatusChange?: (status: FinanceCheckStatus) => void;
  statusSaving?: boolean;
};

export function FinanceCheckCard({
  direction,
  counterpartyName,
  amount,
  status,
  dueDate,
  onPress,
  onStatusChange,
  statusSaving,
}: Props) {
  const dir = CHECK_DIR_META[direction];
  const st = checkStatusTone(status);
  const days = daysUntilDue(dueDate);
  const urgency = dueUrgencyLabel(days);
  const showUrgency =
    urgency && status !== 'paid' && status !== 'cancelled' && (days === null || days <= 7);

  return (
    <View style={styles.wrap}>
      <TouchableOpacity style={styles.mainTap} onPress={onPress} activeOpacity={0.9}>
        <View style={[styles.accent, { backgroundColor: dir.color }]} />
        <View style={styles.body}>
          <View style={styles.top}>
            <View style={[styles.dirPill, { backgroundColor: dir.bg, borderColor: dir.border }]}>
              <Ionicons name={dir.icon} size={14} color={dir.color} />
              <Text style={[styles.dirText, { color: dir.color }]}>{dir.label}</Text>
            </View>
            <Text style={styles.amount}>{fmtMoneyTry(amount)}</Text>
          </View>
          <Text style={styles.name} numberOfLines={1}>
            {counterpartyName}
          </Text>
          <View style={styles.meta}>
            <View style={[styles.statusPill, { backgroundColor: st.bg }]}>
              <Text style={[styles.statusText, { color: st.color }]}>{CHECK_STATUS_LABELS[status]}</Text>
            </View>
            {dueDate ? (
              <Text style={styles.dueText}>Vade {formatDateShort(dueDate)}</Text>
            ) : (
              <Text style={styles.dueText}>Vade yok</Text>
            )}
          </View>
          {showUrgency ? (
            <View style={[styles.urgency, days !== null && days < 0 ? styles.urgencyLate : styles.urgencySoon]}>
              <Ionicons
                name={days !== null && days < 0 ? 'alert-circle' : 'time-outline'}
                size={13}
                color={days !== null && days < 0 ? '#b91c1c' : '#b45309'}
              />
              <Text style={[styles.urgencyText, days !== null && days < 0 ? styles.urgencyTextLate : null]}>
                {urgency}
              </Text>
            </View>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={adminTheme.colors.textMuted} style={styles.chev} />
      </TouchableOpacity>
      {onStatusChange ? (
        <View style={styles.quickActions}>
          <FinanceCheckQuickStatusButtons
            status={status}
            onSelect={onStatusChange}
            compact
            saving={statusSaving}
          />
        </View>
      ) : null}
    </View>
  );
}

type SummaryProps = {
  givenTotal: number;
  givenCount: number;
  receivedTotal: number;
  receivedCount: number;
  upcomingCount: number;
  overdueCount: number;
};

export function FinanceCheckSummaryStrip({
  givenTotal,
  givenCount,
  receivedTotal,
  receivedCount,
  upcomingCount,
  overdueCount,
}: SummaryProps) {
  return (
    <LinearGradient colors={['#0f172a', '#1e293b']} style={styles.hero}>
      <View style={styles.heroIconWrap}>
        <LinearGradient colors={['#f59e0b', '#b45309']} style={styles.heroIcon}>
          <Ionicons name="document-text" size={24} color="#fff" />
        </LinearGradient>
      </View>
      <Text style={styles.heroTitle}>Çek defteri</Text>
      <Text style={styles.heroSub}>Verilen ve alınan çekleri tek ekranda takip edin.</Text>
      <View style={styles.statsRow}>
        <View style={[styles.statCard, styles.statGiven]}>
          <Ionicons name="arrow-up-circle" size={18} color="#fca5a5" />
          <Text style={styles.statValue}>{fmtMoneyTry(givenTotal)}</Text>
          <Text style={styles.statLabel}>Verilen · {givenCount}</Text>
        </View>
        <View style={[styles.statCard, styles.statReceived]}>
          <Ionicons name="arrow-down-circle" size={18} color="#6ee7b7" />
          <Text style={styles.statValue}>{fmtMoneyTry(receivedTotal)}</Text>
          <Text style={styles.statLabel}>Alınan · {receivedCount}</Text>
        </View>
      </View>
      {(upcomingCount > 0 || overdueCount > 0) && (
        <View style={styles.alertRow}>
          {overdueCount > 0 ? (
            <View style={styles.alertChipLate}>
              <Text style={styles.alertChipLateText}>{overdueCount} gecikmiş</Text>
            </View>
          ) : null}
          {upcomingCount > 0 ? (
            <View style={styles.alertChipSoon}>
              <Text style={styles.alertChipSoonText}>{upcomingCount} yaklaşan vade</Text>
            </View>
          ) : null}
        </View>
      )}
    </LinearGradient>
  );
}

const T = adminTheme;

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: T.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.colors.border,
    marginBottom: 10,
    overflow: 'hidden',
  },
  mainTap: { flexDirection: 'row', alignItems: 'center' },
  quickActions: { paddingHorizontal: 12, paddingBottom: 12 },
  accent: { width: 4, alignSelf: 'stretch' },
  body: { flex: 1, paddingVertical: 12, paddingHorizontal: 12 },
  chev: { marginRight: 10 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  dirPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  dirText: { fontSize: 11, fontWeight: '700' },
  amount: { fontSize: 17, fontWeight: '800', color: T.colors.text },
  name: { fontSize: 15, fontWeight: '700', color: T.colors.text, marginTop: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 8 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '700' },
  dueText: { fontSize: 12, color: T.colors.textMuted, fontWeight: '600' },
  urgency: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  urgencySoon: { backgroundColor: '#fef3c7' },
  urgencyLate: { backgroundColor: '#fee2e2' },
  urgencyText: { fontSize: 11, fontWeight: '700', color: '#b45309' },
  urgencyTextLate: { color: '#b91c1c' },
  hero: {
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
  },
  heroIconWrap: { marginBottom: 10 },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  heroSub: { fontSize: 13, color: '#94a3b8', marginTop: 4, lineHeight: 18 },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  statCard: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
    borderWidth: 1,
  },
  statGiven: { backgroundColor: 'rgba(220,38,38,0.12)', borderColor: 'rgba(252,165,165,0.35)' },
  statReceived: { backgroundColor: 'rgba(5,150,105,0.12)', borderColor: 'rgba(110,231,183,0.35)' },
  statValue: { fontSize: 15, fontWeight: '800', color: '#fff', marginTop: 2 },
  statLabel: { fontSize: 11, color: '#cbd5e1', fontWeight: '600' },
  alertRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  alertChipLate: {
    backgroundColor: 'rgba(185,28,28,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  alertChipLateText: { color: '#fecaca', fontSize: 12, fontWeight: '700' },
  alertChipSoon: {
    backgroundColor: 'rgba(245,158,11,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  alertChipSoonText: { color: '#fde68a', fontSize: 12, fontWeight: '700' },
});
