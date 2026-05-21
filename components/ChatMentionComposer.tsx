import { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  type TextInputProps,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { CachedImage } from '@/components/CachedImage';
import { theme } from '@/constants/theme';
import {
  filterMentionParticipants,
  insertMentionInText,
  parseActiveMentionQuery,
  syncMentionsWithText,
  type ChatMention,
  type ChatMentionParticipant,
} from '@/lib/chatMentions';

type Props = Omit<TextInputProps, 'value' | 'onChangeText'> & {
  value: string;
  onChangeText: (text: string) => void;
  participants: ChatMentionParticipant[];
  mentions: ChatMention[];
  onMentionsChange: (mentions: ChatMention[]) => void;
  enabled?: boolean;
};

export function ChatMentionComposer({
  value,
  onChangeText,
  participants,
  mentions,
  onMentionsChange,
  enabled = true,
  style,
  ...inputProps
}: Props) {
  const { t } = useTranslation();
  const [selection, setSelection] = useState({ start: value.length, end: value.length });
  const inputRef = useRef<TextInput>(null);

  const mentionQuery = enabled ? parseActiveMentionQuery(value, selection.start) : null;
  const showPicker = enabled && mentionQuery !== null && participants.length > 0;
  const filtered = useMemo(
    () => filterMentionParticipants(participants, mentionQuery),
    [participants, mentionQuery]
  );

  const handleChangeText = useCallback(
    (text: string) => {
      onChangeText(text);
      onMentionsChange(syncMentionsWithText(text, mentions));
    },
    [mentions, onChangeText, onMentionsChange]
  );

  const handleSelectionChange = useCallback(
    (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      setSelection(e.nativeEvent.selection);
    },
    []
  );

  const pickParticipant = useCallback(
    (p: ChatMentionParticipant) => {
      const { text, cursor, mention } = insertMentionInText(value, selection.start, p);
      const nextMentions = syncMentionsWithText(text, [...mentions, mention]);
      onChangeText(text);
      onMentionsChange(nextMentions);
      setSelection({ start: cursor, end: cursor });
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [mentions, onChangeText, onMentionsChange, selection.start, value]
  );

  return (
    <View style={styles.wrap}>
      {showPicker ? (
        <View style={styles.picker}>
          <Text style={styles.pickerHint}>{t('chatMentionPickerHint')}</Text>
          <FlatList
            data={filtered}
            keyExtractor={(item) => `${item.participant_type}:${item.participant_id}`}
            keyboardShouldPersistTaps="always"
            style={styles.pickerList}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.pickerRow} onPress={() => pickParticipant(item)} activeOpacity={0.7}>
                {item.avatar ? (
                  <CachedImage uri={item.avatar} style={styles.pickerAvatar} contentFit="cover" />
                ) : (
                  <View style={styles.pickerAvatarPlaceholder}>
                    <Text style={styles.pickerAvatarInitial}>
                      {item.display_name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <Text style={styles.pickerName} numberOfLines={1}>
                  {item.display_name}
                </Text>
                <Ionicons name="at" size={16} color={theme.colors.textMuted} />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={styles.pickerEmpty}>{t('chatMentionNoResults')}</Text>
            }
          />
        </View>
      ) : null}
      <TextInput
        ref={inputRef}
        {...inputProps}
        style={[styles.input, style]}
        value={value}
        onChangeText={handleChangeText}
        onSelectionChange={handleSelectionChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minWidth: 0,
  },
  input: {
    flex: 1,
    minWidth: 0,
  },
  picker: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '100%',
    marginBottom: 6,
    maxHeight: 200,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    overflow: 'hidden',
    ...theme.shadows.md,
  },
  pickerHint: {
    fontSize: 11,
    color: theme.colors.textMuted,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  pickerList: {
    maxHeight: 160,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  pickerName: {
    flex: 1,
    fontSize: 15,
    color: theme.colors.text,
    fontWeight: '500',
  },
  pickerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  pickerAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerAvatarInitial: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  pickerEmpty: {
    padding: 16,
    textAlign: 'center',
    color: theme.colors.textMuted,
    fontSize: 13,
  },
});
