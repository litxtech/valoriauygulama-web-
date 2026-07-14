import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import type { KbsBoardItem, KbsBoardTab } from '@/lib/kbsSubmissionBoard';

type Props = {
  item: KbsBoardItem;
  tab: KbsBoardTab;
  busy?: boolean;
  onProcess?: () => void;
  onRetry?: () => void;
  onAssignRoom?: () => void;
};

function statusTint(tab: KbsBoardTab): string {
  switch (tab) {
    case 'reached':
      return '#0f766e';
    case 'inProgress':
      return '#0369a1';
    case 'queued':
      return '#a16207';
    case 'failed':
      return '#b91c1c';
  }
}

export function KbsBoardItemCard({ item, tab, busy, onProcess, onRetry, onAssignRoom }: Props) {
  const tint = statusTint(tab);
  const name = item.guestName || item.documentNumber || 'İsimsiz kayıt';
  const showProcess = tab === 'queued' && item.canProcess && onProcess;
  const showRetry =
    (tab === 'failed' || (tab === 'queued' && item.canRetry)) && onRetry && item.transactionId;
  const showRoom = tab === 'queued' && item.needsRoom && onAssignRoom;

  return (
    <View style={[styles.card, { borderLeftColor: tint }]}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {item.roomNumber ? `Oda ${item.roomNumber}` : 'Oda yok'}
            {item.documentNumber ? ` · Belge ${item.documentNumber}` : ''}
            {item.nationalityCode ? ` · ${item.nationalityCode}` : ''}
          </Text>
        </View>
        {tab === 'inProgress' ? <ActivityIndicator color={tint} /> : null}
        {tab === 'reached' ? <Ionicons name="checkmark-circle" size={22} color={tint} /> : null}
      </View>

      {item.queueReason ? (
        <View style={styles.reasonBox}>
          <Text style={styles.reasonLabel}>
            {tab === 'failed' ? 'Hata' : tab === 'queued' ? 'Neden kuyrukta' : 'Durum'}
          </Text>
          <Text style={styles.reasonText}>{item.queueReason}</Text>
        </View>
      ) : null}

      {typeof item.retryCount === 'number' && item.retryCount > 0 ? (
        <Text style={styles.retryHint}>Deneme: {item.retryCount}</Text>
      ) : null}

      {(showProcess || showRetry || showRoom) && (
        <View style={styles.actions}>
          {showRoom ? (
            <TouchableOpacity style={[styles.btn, styles.btnMuted]} onPress={onAssignRoom} disabled={busy}>
              <Ionicons name="bed-outline" size={16} color="#fff" />
              <Text style={styles.btnText}>Oda ata</Text>
            </TouchableOpacity>
          ) : null}
          {showProcess ? (
            <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={onProcess} disabled={busy}>
              {busy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="send-outline" size={16} color="#fff" />
                  <Text style={styles.btnText}>İşle</Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}
          {showRetry ? (
            <TouchableOpacity style={[styles.btn, styles.btnWarn]} onPress={onRetry} disabled={busy}>
              {busy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="refresh-outline" size={16} color="#fff" />
                  <Text style={styles.btnText}>Yeniden ilet</Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderLeftWidth: 4,
    padding: 14,
    marginBottom: 10,
    gap: 8,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  meta: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  reasonBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  reasonLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  reasonText: { fontSize: 13, color: theme.colors.text, marginTop: 4, lineHeight: 18 },
  retryHint: { fontSize: 11, color: theme.colors.textMuted },
  actions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 11,
  },
  btnPrimary: { backgroundColor: theme.colors.primary },
  btnWarn: { backgroundColor: '#b45309' },
  btnMuted: { backgroundColor: '#374151' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
