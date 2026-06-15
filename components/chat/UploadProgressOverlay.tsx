import { View, ActivityIndicator, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

type Props = {
  progress?: number;
  failed?: boolean;
  onRetry?: () => void;
  onCancel?: () => void;
};

export function UploadProgressOverlay({ progress, failed, onRetry, onCancel }: Props) {
  const { t } = useTranslation();

  if (failed) {
    return (
      <Pressable
        style={styles.overlay}
        onPress={onRetry}
        onLongPress={onCancel}
        delayLongPress={400}
      >
        <Ionicons name="refresh" size={28} color="#fff" />
        <Text style={styles.failText}>{t('staffChatUploadFailed')}</Text>
      </Pressable>
    );
  }
  const pct = progress != null ? Math.round(Math.min(100, Math.max(0, progress * 100))) : null;
  return (
    <Pressable style={styles.overlay} onLongPress={onCancel} delayLongPress={400}>
      <ActivityIndicator size="small" color="#fff" />
      {pct != null && pct > 0 && pct < 100 ? (
        <Text style={styles.pctText}>{pct}%</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    gap: 6,
  },
  pctText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  failText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
});
