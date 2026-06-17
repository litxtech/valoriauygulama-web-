import { Link } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { usePublicWebRouteRedirect } from '@/components/PublicWebRouteFallback';

export default function NotFoundScreen() {
  const redirect = usePublicWebRouteRedirect();
  if (redirect) return redirect;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sayfa bulunamadı</Text>
      <Text style={styles.sub}>Aradığınız ekran mevcut değil veya kaldırılmış olabilir.</Text>
      <Link href="/" style={styles.link}>
        Ana sayfaya dön
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#0f172a',
  },
  title: { color: '#f8fafc', fontSize: 20, fontWeight: '800', marginBottom: 8 },
  sub: { color: '#94a3b8', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  link: { color: '#635bff', fontSize: 15, fontWeight: '700' },
});
