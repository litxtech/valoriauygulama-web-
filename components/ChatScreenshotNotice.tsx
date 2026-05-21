import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { Message } from '@/lib/messaging';
import { theme } from '@/constants/theme';

type Props = {
  message: Message;
};

export function ChatScreenshotNotice({ message }: Props) {
  const { t } = useTranslation();
  const name =
    message.sender_name?.trim() ||
    (message.sender_type === 'guest' ? t('guestDefaultName') : t('chatMessageSenderStaff'));
  return (
    <View style={styles.wrap} accessibilityRole="text">
      <View style={styles.pill}>
        <Ionicons name="camera-outline" size={14} color={theme.colors.textMuted} style={styles.icon} />
        <Text style={styles.text}>{t('chatScreenshotNotice', { name })}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginVertical: 8,
    paddingHorizontal: 16,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '92%',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  icon: {
    marginRight: 6,
  },
  text: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 16,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
});
