import { View, Text, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';
import { MessageTranslation } from '@/components/MessageTranslation';

type Props = {
  body: string;
  numberOfLines?: number;
};

/** Görev notu + uygulama diline otomatik çeviri. */
export function TaskAssignmentBody({ body, numberOfLines }: Props) {
  const trimmed = body.trim();
  if (!trimmed) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.body} numberOfLines={numberOfLines}>
        {trimmed}
      </Text>
      <MessageTranslation content={trimmed} textColor={theme.colors.textSecondary} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 10 },
  body: { fontSize: 14, lineHeight: 20, color: theme.colors.textSecondary },
});
