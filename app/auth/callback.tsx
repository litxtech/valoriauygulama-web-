import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { completeSignIn, useAuthStore } from '@/stores/authStore';
import { useCustomerRoomStore } from '@/stores/customerRoomStore';
import { linkGuestToRoom } from '@/lib/linkGuestToRoom';
import { hasPolicyConsent } from '@/lib/policyConsent';
import { log } from '@/lib/logger';

function parseHashParams(url: string): { access_token?: string; refresh_token?: string; type?: string } {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return {};
  const hash = url.slice(hashIndex + 1);
  const params: Record<string, string> = {};
  hash.split('&').forEach((part) => {
    const [key, value] = part.split('=');
    if (key && value) params[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
  });
  return {
    access_token: params.access_token,
    refresh_token: params.refresh_token,
    type: params.type,
  };
}

export default function AuthCallbackScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [message, setMessage] = useState('Giriş yapılıyor...');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const url = await Linking.getInitialURL();
      if (cancelled) return;
      if (!url || !url.includes('auth/callback')) {
        setStatus('error');
        setMessage('Geçersiz veya eksik bağlantı.');
        return;
      }
      const { access_token, refresh_token, type } = parseHashParams(url);
      if (!access_token || !refresh_token) {
        setStatus('error');
        setMessage('Oturum bilgisi alınamadı.');
        return;
      }
      try {
        const { data: sessionData, error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (error) throw error;
        if (cancelled) return;
        const sessionUser = sessionData.user ?? (await supabase.auth.getUser()).data.user;
        if (!sessionUser) throw new Error('Oturum kullanıcısı alınamadı');
        await completeSignIn(sessionUser);
        if (type === 'recovery') {
          log.info('AuthCallback', 'Şifre sıfırlama linki ile geldi, şifre belirleme ekranına yönlendiriliyor');
          router.replace('/auth/set-password');
          setStatus('ok');
          return;
        }
        const { user, staff } = useAuthStore.getState();
        const { pendingRoom, clearPendingRoom } = useCustomerRoomStore.getState();
        log.info('AuthCallback', 'Magic link girişi tamamlandı', { hasStaff: !!staff });
        if (!staff && pendingRoom && user?.email) {
          await linkGuestToRoom(user.email, pendingRoom.roomId, user.user_metadata?.full_name);
          clearPendingRoom();
        }
        const accepted = await hasPolicyConsent(sessionUser.id);
        const path = staff ? '/staff' : '/customer';
        const nextParam = staff ? 'staff' : 'customer';
        if (accepted) {
          router.replace(path);
        } else {
          router.replace({ pathname: '/policies', params: { next: nextParam } });
        }
        setStatus('ok');
      } catch (err) {
        if (cancelled) return;
        log.error('AuthCallback', 'setSession', err);
        setStatus('error');
        setMessage((err as Error)?.message ?? 'Giriş tamamlanamadı.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (status === 'error') {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>{message}</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.replace('/auth')}>
          <Text style={styles.buttonText}>Giriş sayfasına dön</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#b8860b" />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  message: { color: '#1a1d21', fontSize: 16, marginTop: 16, textAlign: 'center' },
  button: {
    backgroundColor: '#b8860b',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 24,
  },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
});
