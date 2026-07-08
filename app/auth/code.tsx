import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  Keyboard,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { completeSignIn, useAuthStore } from '@/stores/authStore';
import { useCustomerRoomStore } from '@/stores/customerRoomStore';
import { linkGuestToRoom } from '@/lib/linkGuestToRoom';
import { log } from '@/lib/logger';
import { enterAppAfterSignIn } from '@/lib/enterAppAfterSignIn';

const CODE_LENGTH = 6;

export default function AuthCodeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ email: string }>();
  const email = (params.email ?? '').trim().toLowerCase();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (email) inputRef.current?.focus();
  }, [email]);

  const handleCodeChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH) Keyboard.dismiss();
  };

  const verify = async () => {
    if (!email) {
      Alert.alert(t('error'), t('emailRequired'));
      router.replace('/auth');
      return;
    }
    const trimmed = code.replace(/\D/g, '');
    if (trimmed.length !== CODE_LENGTH) {
      Alert.alert(t('error'), t('enterSixDigitCode'));
      return;
    }
    setLoading(true);
    try {
      let err = await supabase.auth.verifyOtp({
        email,
        token: trimmed,
        type: 'email',
      }).then((r) => r.error);
      if (err) {
        const res = await supabase.auth.verifyOtp({
          email,
          token: trimmed,
          type: 'magiclink',
        });
        if (res.error) throw err;
      }
      log.info('AuthCode', 'OTP doğrulandı');
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      const sessionUser = sessionData.session?.user;
      if (!sessionUser) throw new Error('Oturum kullanıcısı alınamadı');
      await completeSignIn(sessionUser);
      const { user } = useAuthStore.getState();
      const { pendingRoom, clearPendingRoom } = useCustomerRoomStore.getState();
      if (pendingRoom && user?.email) {
        await linkGuestToRoom(user.email, pendingRoom.roomId, user.user_metadata?.full_name);
        clearPendingRoom();
      }
      await enterAppAfterSignIn(router, sessionUser.id);
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? t('codeInvalidOrExpired');
      log.error('AuthCode', 'verifyOtp', err, msg);
      Alert.alert(t('verificationError'), msg);
    }
    setLoading(false);
  };

  if (!email) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{t('emailNotFound')}</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.replace('/auth')}>
          <Text style={styles.buttonText}>{t('backBtn')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('enterSixDigitCode')}</Text>
      <Text style={styles.subtitle}>{email}</Text>

      <TextInput
        ref={inputRef}
        style={styles.input}
        value={code}
        onChangeText={handleCodeChange}
        placeholder="000000"
        placeholderTextColor="#9ca3af"
        keyboardType="number-pad"
        maxLength={CODE_LENGTH}
        selectTextOnFocus
        editable={!loading}
      />

      <TouchableOpacity
        style={[styles.button, code.length !== CODE_LENGTH && styles.buttonDisabled]}
        onPress={verify}
        disabled={code.length !== CODE_LENGTH || loading}
      >
        <Text style={styles.buttonText}>{loading ? t('verifying') : t('signIn')}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backBtnText}>← {t('differentEmail')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 24,
    justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '700', color: '#1a1d21', textAlign: 'center', marginBottom: 8 },
  subtitle: {
    fontSize: 14,
    color: '#6c757d',
    textAlign: 'center',
    marginBottom: 24,
  },
  input: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 20,
    color: '#1a1d21',
    fontSize: 28,
    letterSpacing: 12,
    textAlign: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  button: {
    backgroundColor: '#b8860b',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#ffffff', fontSize: 18, fontWeight: '600', textAlign: 'center' },
  backBtn: { marginTop: 16, alignSelf: 'center' },
  backBtnText: { color: '#6c757d', fontSize: 15 },
  errorText: { color: '#dc3545', textAlign: 'center', marginBottom: 24 },
});
