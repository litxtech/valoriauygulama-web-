import { memo } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, type ReactNode } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePersonelDesign } from '@/hooks/usePersonelDesign';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';

type Props = {
  children: ReactNode;
  title?: string;
  onStoryPress?: () => void;
};

/** Feed personel şeridi — başlık + mevcut story kısayolu + avatar kaydırma */
export const FeedStaffRail = memo(function FeedStaffRail({
  children,
  title = 'Ekip',
  onStoryPress,
}: Props) {
  const palette = usePersonelDesign();
  const { isNight } = usePremiumTheme();

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: isNight ? 'rgba(255,255,255,0.06)' : '#FFFFFF',
          borderBottomColor: palette.divider,
        },
      ]}
    >
      <View style={styles.head}>
        <View style={styles.headLeft}>
          <View style={[styles.dot, { backgroundColor: palette.accent }]} />
          <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
        </View>
        {onStoryPress ? (
          <Pressable
            onPress={onStoryPress}
            style={({ pressed }) => [
              styles.storyChip,
              {
                backgroundColor: isNight ? palette.accentSoft : '#FFFFFF',
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: palette.borderLight,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Hikaye ekle"
            hitSlop={6}
          >
            <Ionicons name="add-circle-outline" size={15} color={palette.accent} />
            <Text style={[styles.storyChipText, { color: palette.accent }]}>Hikaye</Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {children}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 0,
    marginBottom: 0,
    borderRadius: 0,
    borderWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    paddingBottom: 8,
    overflow: 'visible',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  title: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  storyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  storyChipText: { fontSize: 12, fontWeight: '700' },
  scroll: { overflow: 'visible' },
  scrollContent: {
    paddingLeft: 10,
    paddingRight: 12,
    paddingVertical: 2,
    alignItems: 'flex-start',
  },
});
