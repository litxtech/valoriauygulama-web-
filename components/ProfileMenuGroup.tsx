import { Children, isValidElement, type ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { profileScreenTheme as P } from '@/constants/profileScreenTheme';

type Props = {
  children: ReactNode;
};

export function ProfileMenuGroup({ children }: Props) {
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <View style={[styles.group, P.cardShell]}>
      {items.map((child, index) => (
        <View key={index}>
          {child}
          {index < items.length - 1 ? <View style={styles.divider} /> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    overflow: 'hidden',
    marginBottom: 4,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: P.border,
    marginLeft: 78,
  },
});
