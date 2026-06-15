import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { profileScreenTheme as P } from '@/constants/profileScreenTheme';

type Props = {
  title: string;
  subtitle?: string;
};

export function ProfileSectionHeader({ title, subtitle }: Props) {
  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={[P.gradient.start, P.gradient.end]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.accent}
      />
      <View style={styles.textCol}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    paddingTop: 8,
  },
  accent: {
    width: 4,
    height: 22,
    borderRadius: 4,
  },
  textCol: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 14,
    fontWeight: '800',
    color: P.text,
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 12,
    color: P.subtext,
    marginTop: 2,
    lineHeight: 16,
  },
});
