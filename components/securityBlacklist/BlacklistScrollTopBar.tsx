import { View, StyleSheet } from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AdminStackBackButton } from '@/lib/adminStackBack';
import { StaffStackBackButton } from '@/lib/staffStackBack';

type Props = {
  fallback?: string;
};

export function BlacklistScrollTopBar({ fallback }: Props) {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith('/admin') ?? false;

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 8) }]}>
      {isAdminRoute ? (
        <AdminStackBackButton tintColor="#fff" accessibilityLabel="Geri" fallback={fallback as never} />
      ) : (
        <StaffStackBackButton tintColor="#fff" accessibilityLabel="Geri" fallback={fallback as never} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
});
