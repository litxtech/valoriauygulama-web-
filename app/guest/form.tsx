import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useGuestFlowStore } from '@/stores/guestFlowStore';
import { useGuestMessagingStore } from '@/stores/guestMessagingStore';
import { supabase } from '@/lib/supabase';

type IdType = 'tc' | 'passport' | 'other';

export default function GuestFormScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { lang, roomId, setStep, setGuestId } = useGuestFlowStore();
  const { setAppToken } = useGuestMessagingStore();
  const [fullName, setFullName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [idType, setIdType] = useState<IdType>('tc');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [nationality, setNationality] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!fullName.trim()) {
      Alert.alert(t('error'), t('required'));
      return;
    }
    setLoading(true);
    try {
      const { data: template } = await supabase
        .from('contract_templates')
        .select('id')
        .eq('lang', i18n.language || lang)
        .eq('is_active', true)
        .order('version', { ascending: false })
        .limit(1)
        .single();

      const { data: guest, error } = await supabase
        .from('guests')
        .insert({
          full_name: fullName.trim(),
          id_number: idNumber.trim() || null,
          id_type: idType,
          phone: phone.trim() || null,
          email: email.trim() || null,
          nationality: nationality.trim() || null,
          contract_lang: i18n.language || lang,
          contract_template_id: template?.id ?? null,
          status: 'pending',
        })
        .select('id')
        .single();

      if (error) throw error;
      if (guest) {
        setGuestId(guest.id);
        const { data: token } = await supabase.rpc('get_guest_app_token', { p_guest_id: guest.id });
        if (token) await setAppToken(token);
      }
      setStep('verify');
      router.replace('/guest/verify');
    } catch (e: unknown) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('guestRegistrationCreateFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{t('guestInfo')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('fullName')}
          placeholderTextColor="rgba(255,255,255,0.5)"
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
        />
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.chip, idType === 'tc' && styles.chipActive]}
            onPress={() => setIdType('tc')}
          >
            <Text style={[styles.chipText, idType === 'tc' && styles.chipTextActive]}>{t('idTypeTC')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, idType === 'passport' && styles.chipActive]}
            onPress={() => setIdType('passport')}
          >
            <Text style={[styles.chipText, idType === 'passport' && styles.chipTextActive]}>{t('idTypePassport')}</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          style={styles.input}
          placeholder={t('idNumber')}
          placeholderTextColor="rgba(255,255,255,0.5)"
          value={idNumber}
          onChangeText={setIdNumber}
          keyboardType="default"
        />
        <TextInput
          style={styles.input}
          placeholder={t('phone')}
          placeholderTextColor="rgba(255,255,255,0.5)"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <TextInput
          style={styles.input}
          placeholder={t('email')}
          placeholderTextColor="rgba(255,255,255,0.5)"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder={t('nationality')}
          placeholderTextColor="rgba(255,255,255,0.5)"
          value={nationality}
          onChangeText={setNationality}
        />
        <TouchableOpacity style={styles.button} onPress={submit} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? t('loading') : t('sendCode')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a365d' },
  scroll: { padding: 24, paddingTop: 56 },
  title: { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 24 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    marginBottom: 12,
  },
  row: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  chipActive: { backgroundColor: '#ed8936' },
  chipText: { color: 'rgba(255,255,255,0.8)', fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  button: {
    backgroundColor: '#ed8936',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
});
