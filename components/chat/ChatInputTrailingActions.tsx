import { Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { chatTheme } from '@/constants/chatTheme';
import type { ChatVoicePhase } from '@/hooks/chat/useChatVoiceRecording';

type Props = {
  hasText: boolean;
  voicePhase: ChatVoicePhase;
  onSendText: () => void;
  onSendVoice: () => void;
  onMicPress: () => void;
  sending?: boolean;
  iconColor?: string;
  sendBtnStyle?: object;
  sendBtnDisabledStyle?: object;
  iconBtnStyle?: object;
};

export function ChatInputTrailingActions({
  hasText,
  voicePhase,
  onSendText,
  onSendVoice,
  onMicPress,
  sending,
  iconColor = chatTheme.textSecondary,
  sendBtnStyle,
  sendBtnDisabledStyle,
  iconBtnStyle,
}: Props) {
  const showSend = hasText || voicePhase === 'ready' || voicePhase === 'uploading';
  const sendEnabled = hasText || voicePhase === 'ready';
  const sendDisabled = sending || voicePhase === 'uploading' || (showSend && !sendEnabled);

  if (showSend) {
    return (
      <Pressable
        onPress={hasText ? onSendText : onSendVoice}
        disabled={!sendEnabled || sendDisabled}
        style={[
          styles.sendBtn,
          sendBtnStyle,
          (!sendEnabled || sendDisabled) && styles.sendBtnDisabled,
          (!sendEnabled || sendDisabled) && sendBtnDisabledStyle,
        ]}
      >
        {voicePhase === 'uploading' ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons name="send" size={20} color="#fff" />
        )}
      </Pressable>
    );
  }

  if (voicePhase === 'recording') {
    return (
      <Pressable onPress={onMicPress} style={[styles.iconBtn, iconBtnStyle]} hitSlop={8}>
        <Ionicons name="stop-circle" size={28} color={chatTheme.danger} />
      </Pressable>
    );
  }

  return (
    <Pressable onPress={onMicPress} style={[styles.iconBtn, iconBtnStyle]} hitSlop={8} disabled={sending}>
      <Ionicons name="mic-outline" size={24} color={iconColor} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: chatTheme.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.45,
  },
});
