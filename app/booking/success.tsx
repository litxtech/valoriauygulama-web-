import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

export default function BookingSuccessScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.iconWrap}>
        <Ionicons name="checkmark" size={36} color="#0f766e" />
      </View>
      <Text style={styles.title}>{t('bookingSuccessTitle')}</Text>
      <Text style={styles.body}>{t('bookingSuccessBody')}</Text>
      {id ? <Text style={styles.ref}>{t('bookingSuccessRef', { id: String(id).slice(0, 8).toUpperCase() })}</Text> : null}
      <TouchableOpacity style={styles.btn} onPress={() => router.replace('/')} activeOpacity={0.88}>
        <Text style={styles.btnText}>{t('bookingBackLobby')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f7f6f3',
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(15,118,110,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 10,
  },
  body: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 360,
    marginBottom: 16,
  },
  ref: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f766e',
    letterSpacing: 1,
    marginBottom: 28,
  },
  btn: {
    backgroundColor: '#111827',
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 28,
    minWidth: 220,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
