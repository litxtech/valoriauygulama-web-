import type { ReactNode } from 'react';
import {
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';

type Props = {
  /** Medya seçici + önizleme — klavye açılınca kaybolmaz */
  mediaSlot: ReactNode;
  hasMedia: boolean;
  children: ReactNode;
  footer?: ReactNode;
};

/**
 * Story / feed oluşturma: medya üstte sabit, metin alanı altta klavye ile kayar.
 * ScrollView içinde medya+metin birlikte olunca klavye açılınca önizleme kayboluyordu.
 */
export function FeedComposeLayout({ mediaSlot, hasMedia, children, footer }: Props) {
  return (
    <View style={styles.root}>
      <View
        style={[styles.mediaPane, hasMedia ? styles.mediaPaneFilled : styles.mediaPaneEmpty]}
        collapsable={false}
      >
        {mediaSlot}
      </View>

      <KeyboardAvoidingView
        style={styles.formPane}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 96 : 0}
      >
        <ScrollView
          style={styles.formScroll}
          contentContainerStyle={styles.formContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
        {footer}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  mediaPane: {
    flexShrink: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  mediaPaneEmpty: {
    paddingBottom: 4,
  },
  mediaPaneFilled: {
    minHeight: 280,
    maxHeight: '52%',
  },
  formPane: {
    flex: 1,
  },
  formScroll: {
    flex: 1,
  },
  formContent: {
    padding: 16,
    paddingBottom: 32,
  },
});
