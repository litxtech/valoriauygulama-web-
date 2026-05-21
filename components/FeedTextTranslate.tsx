import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';
import { feedSharedText } from '@/lib/feedSharedI18n';
import { translateText } from '@/lib/translateText';

type Props = {
  text: string;
};

/** Instagram tarzı: "Çeviriyi gör" ile uygulama diline çeviri. */
export function FeedTextTranslate({ text }: Props) {
  const raw = text.trim();
  const [translated, setTranslated] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  const onTranslate = useCallback(async () => {
    if (!raw || loading) return;
    if (translated) {
      setVisible((v) => !v);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { translated: result } = await translateText(raw);
      setTranslated(result);
      setVisible(true);
    } catch (e) {
      setError((e as Error)?.message ?? feedSharedText('feedTranslateError'));
    } finally {
      setLoading(false);
    }
  }, [raw, loading, translated]);

  if (!raw) return null;

  return (
    <View style={styles.wrap}>
      {visible && translated ? (
        <Text style={styles.translated}>{translated}</Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity onPress={onTranslate} hitSlop={8} activeOpacity={0.7} disabled={loading}>
        {loading ? (
          <ActivityIndicator size="small" color={theme.colors.primary} style={styles.spinner} />
        ) : (
          <Text style={styles.link}>
            {translated
              ? visible
                ? feedSharedText('feedTranslateHide')
                : feedSharedText('feedTranslateShow')
              : feedSharedText('feedTranslateSee')}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 6 },
  translated: {
    fontSize: 15,
    lineHeight: 22,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  link: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
  error: {
    fontSize: 12,
    color: theme.colors.error,
    marginBottom: 4,
  },
  spinner: { alignSelf: 'flex-start' },
});
