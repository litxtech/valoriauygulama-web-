import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

/** Eski temizlik planı → tek Temizlik ekranı. */
export default function AdminCleaningPlanRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/staff/cleaning-plan');
  }, [router]);

  return (
    <View style={styles.centered}>
      <ActivityIndicator color="#0f766e" />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9' },
});
