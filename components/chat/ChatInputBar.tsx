import { useMemo } from 'react';
import { View, TextInput, Pressable, StyleSheet, ScrollView, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { chatTheme, chatLayout } from '@/constants/chatTheme';
import { ChatVoiceInputPreview } from '@/components/chat/ChatVoiceInputPreview';
import { ChatInputTrailingActions } from '@/components/chat/ChatInputTrailingActions';
import { AttachmentToggleIcon } from '@/components/chat/AttachmentSheet';
import type { ChatVoicePhase } from '@/hooks/chat/useChatVoiceRecording';

const QUICK_MESSAGE_KEYS = [
  'staffChatQuickRoomReady',
  'staffChatQuickGuestCheckedIn',
  'staffChatQuickCleaningNeeded',
  'staffChatQuickTechnicalIssue',
  'staffChatQuickReception',
  'staffChatQuickUrgent',
] as const;

type VoiceProps = {
  phase: ChatVoicePhase;
  durationSec: number;
  onMicPress: () => void;
  onSendVoice: () => void;
  onCancelVoice: () => void;
};

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onAttach: () => void;
  attachOpen?: boolean;
  onCamera?: () => void;
  voice?: VoiceProps;
  placeholder?: string;
  sending?: boolean;
  showQuickChips?: boolean;
  bottomPadding?: number;
};

export function ChatInputBar({
  value,
  onChangeText,
  onSend,
  onAttach,
  attachOpen = false,
  onCamera,
  voice,
  placeholder,
  sending,
  showQuickChips = true,
  bottomPadding = 8,
}: Props) {
  const { t } = useTranslation();
  const hasText = value.trim().length > 0;
  const inputPlaceholder = placeholder ?? t('staffChatMessagePlaceholder');
  const voiceActive = voice && voice.phase !== 'idle';

  const quickMessages = useMemo(
    () => QUICK_MESSAGE_KEYS.map((key) => ({ key, text: t(key) })),
    [t]
  );

  return (
    <View style={[styles.wrap, { paddingBottom: bottomPadding }]}>
      {showQuickChips && !voiceActive ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
          keyboardShouldPersistTaps="handled"
        >
          {quickMessages.map((chip) => (
            <Pressable
              key={chip.key}
              style={styles.chip}
              onPress={() => onChangeText(value ? `${value} ${chip.text}` : chip.text)}
            >
              <Text style={styles.chipText}>{chip.text}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.row}>
        <Pressable onPress={onAttach} style={styles.iconBtn} hitSlop={8} disabled={voiceActive}>
          <AttachmentToggleIcon open={attachOpen} />
        </Pressable>
        <View style={[styles.input, voiceActive && styles.inputVoice]}>
          {voiceActive && voice ? (
            <ChatVoiceInputPreview
              phase={voice.phase}
              durationSec={voice.durationSec}
              onCancel={voice.onCancelVoice}
            />
          ) : (
            <TextInput
              style={styles.textInput}
              placeholder={inputPlaceholder}
              placeholderTextColor={chatTheme.textMuted}
              value={value}
              onChangeText={onChangeText}
              multiline
              maxLength={4000}
              editable={!sending}
            />
          )}
        </View>
        {voice ? (
          <ChatInputTrailingActions
            hasText={hasText}
            voicePhase={voice.phase}
            onSendText={onSend}
            onSendVoice={voice.onSendVoice}
            onMicPress={voice.onMicPress}
            sending={sending}
          />
        ) : hasText ? (
          <Pressable
            onPress={onSend}
            disabled={sending}
            style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
          >
            <Ionicons name="send" size={20} color="#fff" />
          </Pressable>
        ) : onCamera ? (
          <Pressable onPress={onCamera} style={styles.iconBtn} hitSlop={8}>
            <Ionicons name="camera-outline" size={24} color={chatTheme.textSecondary} />
          </Pressable>
        ) : (
          <View style={styles.iconBtnPlaceholder} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: chatTheme.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: chatTheme.border,
  },
  chipsRow: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: chatTheme.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: chatTheme.border,
    marginRight: 8,
  },
  chipText: {
    fontSize: 13,
    color: chatTheme.text,
    fontWeight: '500',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBtnPlaceholder: {
    width: 36,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 96,
    backgroundColor: chatTheme.background,
    borderRadius: chatLayout.inputRadius,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: chatTheme.border,
    justifyContent: 'center',
  },
  inputVoice: {
    maxHeight: 56,
    paddingVertical: 4,
  },
  textInput: {
    minHeight: 40,
    maxHeight: 96,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: chatTheme.text,
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
    opacity: 0.5,
  },
});
