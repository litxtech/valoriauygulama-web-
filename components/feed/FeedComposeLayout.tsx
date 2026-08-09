import type { ReactNode } from 'react';
import {
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { usePersonelDesign } from '@/hooks/usePersonelDesign';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';

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
  const palette = usePersonelDesign();
  const { isNight } = usePremiumTheme();

  return (
    <View style={[styles.root, { backgroundColor: palette.pageBg }]}>
      <LinearGradient
        colors={
          isNight
            ? ['rgba(251,191,36,0.08)', 'transparent', 'rgba(45,212,191,0.06)']
            : ['rgba(245,158,11,0.07)', 'transparent', 'rgba(15,118,110,0.05)']
        }
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View
        style={[
          styles.mediaPane,
          hasMedia ? styles.mediaPaneFilled : styles.mediaPaneEmpty,
          {
            borderBottomColor: palette.divider,
            backgroundColor: hasMedia
              ? isNight
                ? 'rgba(0,0,0,0.35)'
                : 'rgba(255,255,255,0.72)'
              : 'transparent',
          },
        ]}
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
  },
  mediaPane: {
    flexShrink: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mediaPaneEmpty: {
    paddingBottom: 2,
  },
  mediaPaneFilled: {
    minHeight: 260,
    maxHeight: '48%',
    overflow: 'hidden',
  },
  formPane: {
    flex: 1,
  },
  formScroll: {
    flex: 1,
  },
  formContent: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 28,
  },
});
