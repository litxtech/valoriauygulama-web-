import { useState } from 'react';
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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { safeRouterReplace } from '@/lib/safeRouter';
import { enterAppAfterSignIn } from '@/lib/enterAppAfterSignIn';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { completeSignIn, useAuthStore } from '@/stores/authStore';
import { useCustomerRoomStore } from '@/stores/customerRoomStore';
import { linkGuestToRoom } from '@/lib/linkGuestToRoom';
import { log } from '@/lib/logger';

export default function AuthPasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ signUp?: string }>();
  const isSignUp = params.signUp === '1';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const e = email.trim().toLowerCase();
    if (!e) {
      Alert.alert(t('error'), t('enterEmail'));
      return;
    }
    if (!password || password.length < 6) {
      Alert.alert(t('error'), t('passwordMinLength'));
      return;
    }
    if (isSignUp && password !== confirmPassword) {
      Alert.alert(t('error'), t('passwordsDontMatch'));
      return;
    }
    setLoading(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email: e, password });
        if (error) throw error;
        Alert.alert(
          t('signUpSuccess'),
          t('signUpSuccessMessage'),
          [{ text: t('ok'), onPress: () => safeRouterReplace(router, '/auth') }]
        );
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: e, password });
        if (error) throw error;
        if (data.user) {
          const signInResult = await completeSignIn(data.user);
          if (signInResult.denied === 'account_locked') {
            Alert.alert(t('accountLockedTitle'), t('accountLockedMessage'));
            return;
          }
          const { user, staff } = useAuthStore.getState();
          const { pendingRoom, clearPendingRoom } = useCustomerRoomStore.getState();
          if (!staff && pendingRoom && user?.email) {
            await linkGuestToRoom(user.email, pendingRoom.roomId, user.user_metadata?.full_name);
            clearPendingRoom();
          }
          // Personel / misafir paneline doğrudan yönlendir (web'de / boş ekranda kalmasın).
          await enterAppAfterSignIn(router, data.user.id);
        }
      }
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? (isSignUp ? t('signUpFailed') : t('signInFailed'));
      log.error('AuthPassword', isSignUp ? 'signUp' : 'signIn', err, msg);
      Alert.alert(t('error'), msg);
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
        <Text style={styles.title}>{isSignUp ? t('signUp') : t('loginWithPassword')}</Text>

        <TextInput
          style={styles.input}
          placeholder={t('emailPlaceholder')}
          placeholderTextColor="#9ca3af"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
        />
        <TextInput
          style={styles.input}
          placeholder={t('passwordPlaceholder')}
          placeholderTextColor="#9ca3af"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!loading}
        />
        {isSignUp && (
          <TextInput
            style={styles.input}
            placeholder={t('passwordConfirmPlaceholder')}
            placeholderTextColor="#9ca3af"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            editable={!loading}
          />
        )}

        <TouchableOpacity style={styles.button} onPress={submit} disabled={loading}>
          <Text style={styles.buttonText}>
            {loading ? t('processing') : isSignUp ? t('signUp') : t('signIn')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>← {t('backBtn')}</Text>
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
    flexGrow: 1,
    justifyContent: 'center',
  },
  title: { fontSize: 24, fontWeight: '700', color: '#1a1d21', textAlign: 'center', marginBottom: 24 },
  input: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    color: '#1a1d21',
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  button: {
    backgroundColor: '#b8860b',
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 12,
  },
  buttonText: { color: '#ffffff', fontSize: 18, fontWeight: '600', textAlign: 'center' },
  backBtn: { marginTop: 24, alignSelf: 'center' },
  backBtnText: { color: '#6c757d', fontSize: 16 },
});
