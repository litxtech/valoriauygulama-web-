import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { chatTheme } from '@/constants/chatTheme';

type Props = {
  visible: boolean;
  label?: string;
};

export function ConnectionBanner({ visible, label }: Props) {
  const { t } = useTranslation();
  if (!visible) return null;
  const text = label ?? t('staffChatConnectionWaiting');
  return (
    <View style={styles.bar}>
      <Ionicons name="cloud-offline-outline" size={16} color="#fff" />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#6B7280',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  text: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
