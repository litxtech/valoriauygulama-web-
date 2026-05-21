import { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  translateText,
  getCachedTranslation,
  shouldShowTranslation,
  likelyNeedsTranslation,
  subscribeTranslationCache,
  appLangCode,
} from '@/lib/translateText';
import { feedSharedText } from '@/lib/feedSharedI18n';
import { theme } from '@/constants/theme';

type Props = {
  content: string;
  enabled?: boolean;
  textColor?: string;
};

export function MessageTranslation({ content, enabled = true, textColor }: Props) {
  const { t, i18n } = useTranslation();
  const trimmed = content.trim();
  const targetLang = appLangCode();
  const [translated, setTranslated] = useState<string | null>(() =>
    enabled && trimmed ? getCachedTranslation(trimmed, targetLang) : null
  );
  const [failed, setFailed] = useState(false);
  const requestId = useRef(0);

  const applyIfValid = useCallback(
    (result: string) => {
      if (shouldShowTranslation(trimmed, result)) {
        setTranslated(result);
        setFailed(false);
      } else {
        setTranslated(null);
        setFailed(false);
      }
    },
    [trimmed]
  );

  const runTranslate = useCallback(() => {
    if (!enabled || !trimmed || !likelyNeedsTranslation(trimmed, targetLang)) return;
    const cached = getCachedTranslation(trimmed, targetLang);
    if (cached) {
      applyIfValid(cached);
      return;
    }
    const id = ++requestId.current;
    setFailed(false);
    translateText(trimmed, { targetLang })
      .then(({ translated: result }) => {
        if (requestId.current !== id) return;
        applyIfValid(result);
      })
      .catch(() => {
        if (requestId.current !== id) return;
        setTranslated(null);
        setFailed(true);
      });
  }, [trimmed, enabled, targetLang, applyIfValid]);

  useEffect(() => {
    if (!enabled || !trimmed || !likelyNeedsTranslation(trimmed, targetLang)) {
      setTranslated(null);
      setFailed(false);
      return;
    }
    runTranslate();
    return () => {
      requestId.current += 1;
    };
  }, [trimmed, enabled, targetLang, runTranslate]);

  useEffect(() => {
    if (!enabled || !trimmed) return;
    return subscribeTranslationCache(() => {
      const cached = getCachedTranslation(trimmed, targetLang);
      if (cached) applyIfValid(cached);
    });
  }, [trimmed, enabled, targetLang, applyIfValid]);

  useEffect(() => {
    const cached = getCachedTranslation(trimmed, targetLang);
    if (cached) applyIfValid(cached);
    else {
      setTranslated(null);
      setFailed(false);
    }
  }, [i18n.language, trimmed, targetLang, applyIfValid]);

  if (!enabled || !trimmed) return null;

  if (translated) {
    return (
      <View style={styles.wrap}>
        <View style={styles.divider} />
        <Text style={[styles.label, textColor ? { color: textColor, opacity: 0.75 } : null]}>
          {t('messageTranslatedLabel')}
        </Text>
        <Text style={[styles.text, textColor ? { color: textColor, opacity: 0.92 } : null]}>
          {translated}
        </Text>
      </View>
    );
  }

  if (failed) {
    return (
      <TouchableOpacity onPress={runTranslate} hitSlop={8} activeOpacity={0.7} style={styles.wrap}>
        <Text style={[styles.link, textColor ? { color: textColor, opacity: 0.8 } : null]}>
          {feedSharedText('feedTranslateSee')}
        </Text>
      </TouchableOpacity>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  wrap: { marginTop: 6 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginBottom: 6,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.textSecondary,
  },
  link: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
});
