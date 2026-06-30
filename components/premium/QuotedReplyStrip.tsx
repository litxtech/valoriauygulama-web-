import { View, Text, StyleSheet } from 'react-native';
import type { Message } from '@/lib/messaging';
import { pds } from '@/constants/personelDesignSystem';
import { formatQuotedReplyPreview } from '@/lib/chatPreviewText';

type Props = { message: Message; isOwn: boolean; textColor?: string };

export function QuotedReplyStrip({ message, isOwn, textColor }: Props) {
  const preview = formatQuotedReplyPreview(message.message_type, message.content);

  return (
    <View style={[styles.wrap, isOwn ? styles.wrapOwn : styles.wrapOther]}>
      <View style={[styles.bar, { backgroundColor: isOwn ? 'rgba(255,255,255,0.85)' : pds.indigo }]} />
      <View style={styles.body}>
        <Text style={[styles.name, { color: textColor ?? pds.indigo }]} numberOfLines={1}>
          {message.sender_name ?? '—'}
        </Text>
        <Text style={[styles.text, { color: textColor ?? pds.subtext }]} numberOfLines={3}>
          {preview || '—'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    marginBottom: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  wrapOwn: { backgroundColor: 'rgba(255,255,255,0.15)' },
  wrapOther: { backgroundColor: 'rgba(99,102,241,0.08)' },
  bar: {
    width: 3,
    borderRadius: 2,
    marginRight: 8,
    alignSelf: 'stretch',
  },
  body: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  name: {
    fontSize: 12,
    fontWeight: '800',
  },
  text: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
});
