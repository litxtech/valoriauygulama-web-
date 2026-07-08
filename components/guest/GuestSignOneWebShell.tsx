import type { ReactNode } from 'react';
import { View, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Web sözleşme — header, içerik ve footer aynı arka plan; tek sayfa hissi */
export const GUEST_CONTRACT_WEB_BG = '#eef2f7';

type Props = {
  header: ReactNode;
  footer: ReactNode;
  children: ReactNode;
};

export function GuestSignOneWebShell({ header, footer, children }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const columnWidth = Math.min(760, Math.max(320, width - 32));

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={styles.header}>{header}</View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        <View style={[styles.column, { width: columnWidth, maxWidth: columnWidth }]}>{children}</View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>{footer}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: GUEST_CONTRACT_WEB_BG,
    width: '100%',
  },
  header: {
    backgroundColor: GUEST_CONTRACT_WEB_BG,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15, 23, 42, 0.08)',
  },
  scroll: {
    flex: 1,
    backgroundColor: GUEST_CONTRACT_WEB_BG,
  },
  scrollContent: {
    alignItems: 'center',
    paddingTop: 20,
    paddingHorizontal: 16,
  },
  column: {
    alignSelf: 'center',
  },
  footer: {
    backgroundColor: GUEST_CONTRACT_WEB_BG,
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(15, 23, 42, 0.08)',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
  },
});
