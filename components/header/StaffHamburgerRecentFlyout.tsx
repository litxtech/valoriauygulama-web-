import { memo } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FastPress } from '@/components/ui/FastPress';
import { hapticSelection } from '@/lib/hapticsSafe';
import type { StaffHamburgerMenuItem } from '@/lib/staffHamburgerMenu';
import type { PersonelDesignPalette } from '@/constants/personelDesignSystem';

type Props = {
  items: StaffHamburgerMenuItem[];
  bottomInset: number;
  canPress: boolean;
  palette: PersonelDesignPalette;
  onSelect: (href: string, target?: { itemId?: string; item?: StaffHamburgerMenuItem }) => void;
};

const IS_ANDROID = Platform.OS === 'android';
const BTN = 42;

function RecentIconButton({
  item,
  isLatest,
  canPress,
  palette,
  onPress,
}: {
  item: StaffHamburgerMenuItem;
  isLatest: boolean;
  canPress: boolean;
  palette: PersonelDesignPalette;
  onPress: () => void;
}) {
  return (
    <FastPress
      onPress={onPress}
      disabled={!canPress}
      style={[
        styles.btn,
        {
          backgroundColor: isLatest ? `${item.accent}22` : palette.cardBg,
          borderColor: isLatest ? `${item.accent}55` : palette.cardBorder,
        },
      ]}
      rippleColor={`${item.accent}28`}
      accessibilityRole="button"
      accessibilityLabel={item.label}
    >
      <Ionicons name={item.icon} size={20} color={item.accent} />
    </FastPress>
  );
}

const RecentIconButtonMemo = memo(RecentIconButton);

export const StaffHamburgerRecentFlyout = memo(function StaffHamburgerRecentFlyout({
  items,
  bottomInset,
  canPress,
  palette,
  onSelect,
}: Props) {
  const handleSelect = (item: StaffHamburgerMenuItem) => {
    if (!canPress) return;
    hapticSelection();
    onSelect(item.href, { itemId: item.id, item });
  };

  if (items.length === 0) return null;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset + 10 }]}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
      bounces={!IS_ANDROID}
    >
      {items.map((item, index) => (
        <RecentIconButtonMemo
          key={item.id}
          item={item}
          isLatest={index === 0}
          canPress={canPress}
          palette={palette}
          onPress={() => handleSelect(item)}
        />
      ))}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    gap: 8,
  },
  btn: {
    width: BTN,
    height: BTN,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
