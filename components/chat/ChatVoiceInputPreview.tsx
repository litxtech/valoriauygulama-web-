import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { chatTheme } from '@/constants/chatTheme';
import { VoiceWaveformBars } from '@/components/premium/VoiceWaveformBars';
import type { ChatVoicePhase } from '@/hooks/chat/useChatVoiceRecording';

type Props = {
  phase: ChatVoicePhase;
  durationSec: number;
  onCancel: () => void;
  textColor?: string;
  mutedColor?: string;
};

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`;
}

export function ChatVoiceInputPreview({
  phase,
  durationSec,
  onCancel,
  textColor = chatTheme.text,
  mutedColor = chatTheme.textMuted,
}: Props) {
  const { t } = useTranslation();

  if (phase === 'recording') {
    return (
      <View style={styles.wrap}>
        <Pressable onPress={onCancel} style={styles.cancelBtn} hitSlop={8}>
          <Ionicons name="trash-outline" size={20} color={chatTheme.danger} />
        </Pressable>
        <View style={styles.center}>
          <View style={styles.row}>
            <View style={styles.recDot} />
            <Text style={[styles.timer, { color: textColor }]}>{formatDuration(durationSec)}</Text>
          </View>
          <VoiceWaveformBars playing color={chatTheme.accent} />
        </View>
        <Text style={[styles.hint, { color: mutedColor }]}>{t('chatVoiceTapToStop')}</Text>
      </View>
    );
  }

  if (phase === 'ready' || phase === 'uploading') {
    return (
      <View style={styles.wrap}>
        <Pressable onPress={onCancel} style={styles.cancelBtn} hitSlop={8} disabled={phase === 'uploading'}>
          <Ionicons name="close-circle-outline" size={22} color={mutedColor} />
        </Pressable>
        <View style={styles.readyRow}>
          <Ionicons name="mic" size={18} color={chatTheme.accent} />
          <Text style={[styles.readyText, { color: textColor }]}>
            {t('staffChatPreviewVoiceShort')} · {formatDuration(durationSec)}
          </Text>
        </View>
        <Text style={[styles.hint, { color: mutedColor }]}>
          {phase === 'uploading' ? t('chatVoiceUploading') : t('chatVoiceTapSend')}
        </Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 4,
  },
  cancelBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  center: {
    flex: 1,
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e53935',
  },
  timer: {
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  hint: {
    fontSize: 11,
    maxWidth: 72,
    textAlign: 'right',
  },
  readyRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  readyText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
