import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { useTranslation } from 'react-i18next';
import { getAuthCallbackRedirectUrl } from '@/lib/authCallbackUrl';

const CODE_LENGTH = 6;

export default function AuthResetScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const codeInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (sent) {
      codeInputRef.current?.focus();
    }
  }, [sent]);

  const sendReset = async () => {
    const e = email.trim().toLowerCase();
    if (!e) {
      Alert.alert(t('error'), t('errorEnterEmail'));
      return;
    }
    setLoading(true);
    setSent(false);
    setCode('');
    setNewPassword('');
    setConfirmPassword('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(e, {
        redirectTo: getAuthCallbackRedirectUrl(),
      });
      if (error) throw error;
      setSent(true);
      log.info('AuthReset', 'Şifre sıfırlama e-postası gönderildi', { email: e.slice(0, 5) + '...' });
      Alert.alert(t('resetEmailSentTitle'), t('resetEmailSentMessage', { email: e }));
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? t('resetEmailSendFailed');
      log.error('AuthReset', 'resetPasswordForEmail', err, msg);
      Alert.alert(t('error'), msg);
    }
    setLoading(false);
  };

  const handleCodeChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH) Keyboard.dismiss();
  };

  const submitNewPassword = async () => {
    const e = email.trim().toLowerCase();
    const trimmedCode = code.replace(/\D/g, '');
    if (trimmedCode.length !== CODE_LENGTH) {
      Alert.alert(t('error'), t('enterSixDigitCode'));
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      Alert.alert(t('error'), t('passwordMinLength'));
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert(t('error'), t('passwordsDontMatch'));
      return;
    }
    setLoading(true);
    try {
      let verifyError = (await supabase.auth.verifyOtp({
        email: e,
        token: trimmedCode,
        type: 'recovery',
      })).error;
      if (verifyError) {
        const msg = verifyError.message ?? '';
        if (msg.includes('expired') || msg.includes('invalid') || msg.includes('token')) {
          verifyError = (await supabase.auth.verifyOtp({
            email: e,
            token: trimmedCode,
            type: 'email',
          })).error;
        }
      }
      if (verifyError) throw verifyError;
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      log.info('AuthReset', 'Şifre güncellendi');
      Alert.alert(t('resetPasswordUpdatedTitle'), t('resetPasswordUpdatedMessage'), [
        { text: t('ok'), onPress: () => router.replace('/auth') },
      ]);
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? '';
      const userMsg =
        msg.includes('expired') || msg.includes('süresi')
          ? t('resetCodeExpired')
          : msg.includes('invalid') || msg.includes('geçersiz')
            ? t('resetCodeInvalid')
            : msg || t('resetCodeRejected');
      log.error('AuthReset', 'verifyOtp/updateUser', err, msg);
      Alert.alert(t('error'), userMsg);
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={60}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{t('resetTitle')}</Text>
        <Text style={styles.subtitle}>
          {t('resetSubtitle')}
        </Text>

        <Text style={styles.label}>{t('email')}</Text>
        <TextInput
          style={styles.input}
          placeholder="ornek@email.com"
          placeholderTextColor="#9ca3af"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          editable={!loading && !sent}
        />

        {!sent ? (
          <TouchableOpacity style={styles.button} onPress={sendReset} disabled={loading}>
            <Text style={styles.buttonText}>{loading ? t('sending') : t('sendCodeBtn')}</Text>
          </TouchableOpacity>
        ) : (
          <>
            <View style={styles.codeSection}>
              <Text style={styles.codeSectionTitle}>{t('resetCodeSectionTitle')}</Text>
              <Text style={styles.codeSectionHint}>{t('resetCodeSectionHint')}</Text>
              <Text style={styles.helpText}>{t('resetHelpText', { tokenTemplate: '{{ .Token }}' })}</Text>
              <TextInput
                ref={codeInputRef}
                style={[styles.input, styles.codeInput]}
                value={code}
                onChangeText={handleCodeChange}
                placeholder="000000"
                placeholderTextColor="#9ca3af"
                keyboardType="number-pad"
                maxLength={CODE_LENGTH}
                selectTextOnFocus
                editable={!loading}
              />
            </View>

            <Text style={styles.label}>{t('resetNewPasswordLabel')}</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor="#9ca3af"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              editable={!loading}
            />

            <Text style={styles.label}>{t('resetConfirmPasswordLabel')}</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor="#9ca3af"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              editable={!loading}
            />

            <TouchableOpacity
              style={[styles.button, (code.length !== CODE_LENGTH || !newPassword || newPassword !== confirmPassword) && styles.buttonDisabled]}
              onPress={submitNewPassword}
              disabled={code.length !== CODE_LENGTH || !newPassword || newPassword !== confirmPassword || loading}
            >
              <Text style={styles.buttonText}>{loading ? t('processing') : t('resetUpdatePasswordBtn')}</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>← {t('back')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  title: { fontSize: 24, fontWeight: '700', color: '#1a1d21', textAlign: 'center', marginBottom: 8 },
  subtitle: {
    fontSize: 14,
    color: '#6c757d',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1d21',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    color: '#1a1d21',
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  codeSection: {
    marginTop: 8,
    marginBottom: 8,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  codeSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0369a1',
    marginBottom: 4,
  },
  codeSectionHint: {
    fontSize: 13,
    color: '#0c4a6e',
    marginBottom: 12,
  },
  helpText: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 8,
    lineHeight: 16,
  },
  codeInput: {
    fontSize: 28,
    letterSpacing: 12,
    textAlign: 'center',
    paddingVertical: 16,
  },
  button: {
    backgroundColor: '#b8860b',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#ffffff', fontSize: 18, fontWeight: '600', textAlign: 'center' },
  backBtn: { marginTop: 24, alignSelf: 'center' },
  backBtnText: { color: '#6c757d', fontSize: 16 },
});
