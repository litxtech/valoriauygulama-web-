import { useMemo, type RefObject } from 'react';
import { View, TextInput, Pressable, StyleSheet, ScrollView, Text, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { chatTheme, chatLayout } from '@/constants/chatTheme';
import { partnerTheme } from '@/lib/breakfastPartnerTheme';
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
  /** Koyu arka planlı ekranlar (partner sohbet vb.) */
  variant?: 'light' | 'dark';
  inputRef?: RefObject<TextInput | null>;
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
  variant = 'light',
  inputRef,
}: Props) {
  const { t } = useTranslation();
  const palette = useMemo(() => {
    if (variant === 'dark') {
      return {
        surface: partnerTheme.bg,
        background: partnerTheme.surfaceInput,
        text: partnerTheme.text,
        textMuted: partnerTheme.mutedSoft,
        textSecondary: partnerTheme.muted,
        border: partnerTheme.cardBorder,
        accent: partnerTheme.accent,
      };
    }
    return {
      surface: chatTheme.surface,
      background: chatTheme.background,
      text: chatTheme.text,
      textMuted: chatTheme.textMuted,
      textSecondary: chatTheme.textSecondary,
      border: chatTheme.border,
      accent: chatTheme.accent,
    };
  }, [variant]);
  const hasText = value.trim().length > 0;
  const inputPlaceholder = placeholder ?? t('staffChatMessagePlaceholder');
  const voiceActive = voice && voice.phase !== 'idle';

  const quickMessages = useMemo(
    () => QUICK_MESSAGE_KEYS.map((key) => ({ key, text: t(key) })),
    [t]
  );

  return (
    <View style={[styles.wrap, { paddingBottom: bottomPadding, backgroundColor: palette.surface, borderTopColor: palette.border }]}>
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
              style={[styles.chip, { backgroundColor: palette.background, borderColor: palette.border }]}
              onPress={() => onChangeText(value ? `${value} ${chip.text}` : chip.text)}
            >
              <Text style={[styles.chipText, { color: palette.text }]}>{chip.text}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.row}>
        <Pressable onPress={onAttach} style={styles.iconBtn} hitSlop={8} disabled={voiceActive}>
          <AttachmentToggleIcon
            open={attachOpen}
            accentColor={palette.accent}
            mutedColor={palette.textSecondary}
          />
        </Pressable>
        <View
          style={[
            styles.input,
            voiceActive && styles.inputVoice,
            { backgroundColor: palette.background, borderColor: palette.border },
          ]}
        >
          {voiceActive && voice ? (
            <ChatVoiceInputPreview
              phase={voice.phase}
              durationSec={voice.durationSec}
              onCancel={voice.onCancelVoice}
            />
          ) : (
            <TextInput
              ref={inputRef}
              style={[styles.textInput, { color: palette.text }]}
              placeholder={inputPlaceholder}
              placeholderTextColor={palette.textMuted}
              value={value}
              onChangeText={onChangeText}
              multiline
              maxLength={4000}
              blurOnSubmit={false}
              returnKeyType="default"
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
            onPress={() => {
              onSend();
              if (inputRef) {
                requestAnimationFrame(() => inputRef.current?.focus());
              }
            }}
            disabled={sending}
            style={[styles.sendBtn, { backgroundColor: palette.accent }, sending && styles.sendBtnDisabled]}
          >
            <Ionicons name="send" size={20} color="#fff" />
          </Pressable>
        ) : onCamera ? (
          <Pressable onPress={onCamera} style={styles.iconBtn} hitSlop={8}>
            <Ionicons name="camera-outline" size={24} color={palette.textSecondary} />
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
    borderTopWidth: StyleSheet.hairlineWidth,
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
    borderWidth: StyleSheet.hairlineWidth,
    marginRight: 8,
  },
  chipText: {
    fontSize: 13,
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
    borderRadius: chatLayout.inputRadius,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  inputVoice: {
    maxHeight: 56,
    paddingVertical: 4,
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: 'transparent',
    ...Platform.select({
      android: { textAlignVertical: 'top', includeFontPadding: false },
      default: {},
    }),
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
});
