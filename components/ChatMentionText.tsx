import { Text, type TextStyle, type StyleProp } from 'react-native';
import { buildMentionTextSegments, type ChatMention } from '@/lib/chatMentions';
import { theme } from '@/constants/theme';

type Props = {
  content: string;
  mentions?: ChatMention[] | null;
  style?: StyleProp<TextStyle>;
  mentionStyle?: StyleProp<TextStyle>;
};

export function ChatMentionText({ content, mentions, style, mentionStyle }: Props) {
  const segments = buildMentionTextSegments(content, mentions);
  return (
    <Text style={style}>
      {segments.map((seg, idx) =>
        seg.kind === 'mention' ? (
          <Text
            key={`m-${idx}-${seg.mention?.participant_id ?? idx}`}
            style={[style, mentionStyle ?? styles.mention]}
          >
            {seg.value}
          </Text>
        ) : (
          <Text key={`t-${idx}`}>{seg.value}</Text>
        )
      )}
    </Text>
  );
}

const styles = {
  mention: {
    fontWeight: '700' as const,
    color: theme.colors.accent,
  },
};
