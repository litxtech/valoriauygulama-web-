import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useChatTheme } from '@/hooks/useScreenTheme';
import { useMemo } from 'react';

/** Kapatılmış grup sohbetinde admin kullanıcıya gösterilen bilgi şeridi. */
export function ChatGroupClosedBanner() {
  const { t } = useTranslation();
  const chat = useChatTheme();
  const styles = useMemo(() => createStyles(chat), [chat]);

  return (
    <View style={styles.banner}>
      <Ionicons name="lock-closed" size={16} color={chat.danger} />
      <Text style={styles.text}>{t('groupMembersClosedBanner')}</Text>
    </View>
  );
}

function createStyles(chat: ReturnType<typeof useChatTheme>) {
  return StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 12,
      marginTop: 8,
      marginBottom: 4,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: chat.selected,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: chat.border,
    },
    text: {
      flex: 1,
      fontSize: 13,
      color: chat.textSecondary,
      lineHeight: 18,
    },
  });
}
