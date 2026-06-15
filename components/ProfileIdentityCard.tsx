import { type ReactNode } from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { profileScreenTheme as P } from '@/constants/profileScreenTheme';

type Props = {
  children: ReactNode;
  style?: ViewStyle;
};

/** Kapak altı — avatar + isim + istatistik kartı kabuğu */
export function ProfileIdentityCard({ children, style }: Props) {
  return (
    <View style={[styles.outer, style]}>
      <LinearGradient
        colors={['#ffffff', '#f8faff']}
        style={[styles.card, P.cardShell, P.identityCard]}
      >
        {children}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    marginHorizontal: 14,
    zIndex: 5,
    overflow: 'visible',
  },
  card: {
    alignItems: 'center',
    width: '100%',
    overflow: 'visible',
  },
});
