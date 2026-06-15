import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { GlassSurface } from '@/components/premium/GlassSurface';
import { pds } from '@/constants/personelDesignSystem';
import { formatReplyMessagePreview } from '@/lib/chatPreviewText';
import type { Message } from '@/lib/messaging';

type Props = {
  message: Message;
  onClear: () => void;
};

export function ReplyPreviewBar({ message, onClear }: Props) {
  const { t } = useTranslation();
  const preview = formatReplyMessagePreview(message.message_type, message.content);

  return (
    <GlassSurface style={styles.wrap} borderRadius={12} intensity={36}>
      <View style={styles.bar}>
        <View style={styles.accent} />
        <View style={styles.body}>
          <Text style={styles.label} numberOfLines={1}>
            {message.sender_name ?? t('staffReplyLabel')}
          </Text>
          <Text style={styles.preview} numberOfLines={2}>
            {preview || '—'}
          </Text>
        </View>
        <TouchableOpacity onPress={onClear} hitSlop={12} style={styles.close}>
          <Ionicons name="close" size={20} color={pds.subtext} />
        </TouchableOpacity>
      </View>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 10, marginBottom: 6 },
  bar: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingRight: 8 },
  accent: { width: 3, alignSelf: 'stretch', backgroundColor: pds.indigo, borderRadius: 2, marginLeft: 10, marginRight: 10 },
  body: { flex: 1 },
  label: { fontSize: 12, fontWeight: '800', color: pds.indigo },
  preview: { fontSize: 12, color: pds.subtext, marginTop: 2 },
  close: { padding: 6 },
});
