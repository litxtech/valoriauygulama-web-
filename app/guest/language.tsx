import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useGuestFlowStore } from '@/stores/guestFlowStore';
import { LANGUAGES, LANG_STORAGE_KEY, changeAppLanguage, type LangCode } from '@/i18n';

export default function LanguageScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { setLang, setStep, roomNumber } = useGuestFlowStore();

  const select = async (code: LangCode) => {
    await changeAppLanguage(code);
    AsyncStorage.setItem(LANG_STORAGE_KEY, code);
    if (roomNumber) {
      setLang(code);
      setStep('contract');
      router.replace('/guest/contract');
    } else {
      router.back();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('selectLanguage')}</Text>
        {roomNumber ? <Text style={styles.room}>{t('guestRoomNumber', { room: roomNumber })}</Text> : null}
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {LANGUAGES.map(({ code, label }) => (
          <TouchableOpacity
            key={code}
            style={styles.item}
            onPress={() => select(code)}
            activeOpacity={0.7}
          >
            <Text style={styles.itemText}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a365d' },
  header: { paddingTop: 56, paddingHorizontal: 24, paddingBottom: 24 },
  title: { fontSize: 24, fontWeight: '700', color: '#fff' },
  room: { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  list: { padding: 24, paddingTop: 0 },
  item: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    padding: 20,
    borderRadius: 12,
    marginBottom: 12,
  },
  itemText: { color: '#fff', fontSize: 18, fontWeight: '500' },
});
