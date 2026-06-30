import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useChatTheme } from '@/hooks/useScreenTheme';
import { useMemo } from 'react';

type Props = {
  memberCount: number;
  onPress: () => void;
};

/** WhatsApp tarzı grup bilgisi şeridi — sohbet listesinin üstünde. */
export function ChatGroupInfoBar({ memberCount, onPress }: Props) {
  const { t } = useTranslation();
  const chat = useChatTheme();
  const styles = useMemo(() => createStyles(chat), [chat]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.bar, pressed && styles.barPressed]}
    >
      <View style={styles.iconWrap}>
        <Ionicons name="people" size={18} color={chat.accent} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{t('groupMembersGroupInfo')}</Text>
        <Text style={styles.sub}>
          {t('groupMembersCount', { count: memberCount })}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={chat.textMuted} />
    </Pressable>
  );
}

function createStyles(chat: ReturnType<typeof useChatTheme>) {
  return StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 12,
      marginTop: 8,
      marginBottom: 4,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: chat.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: chat.border,
      gap: 12,
    },
    barPressed: {
      backgroundColor: chat.rowPressed,
      opacity: 0.95,
    },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: chat.selected,
      justifyContent: 'center',
      alignItems: 'center',
    },
    body: { flex: 1, minWidth: 0 },
    title: {
      fontSize: 15,
      fontWeight: '600',
      color: chat.text,
    },
    sub: {
      fontSize: 13,
      color: chat.textSecondary,
      marginTop: 2,
    },
  });
}
