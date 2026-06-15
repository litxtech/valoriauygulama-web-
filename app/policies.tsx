import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setPolicyConsent, getPendingGuest, clearPendingGuest } from '@/lib/policyConsent';
import { useGuestFlowStore } from '@/stores/guestFlowStore';
import { useCustomerRoomStore } from '@/stores/customerRoomStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LANGUAGES, LANG_STORAGE_KEY, changeAppLanguage, type LangCode } from '@/i18n';
import { applyRTLAndReloadIfNeeded } from '@/lib/reloadForRTL';

export default function PoliciesConsentScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string; roomId?: string; roomNumber?: string }>();
  const next = params.next === 'guest_contract' ? 'guest_contract' : params.next === 'guest_sign_one' ? 'guest_sign_one' : params.next === 'guest' ? 'guest' : params.next === 'staff' ? 'staff' : 'customer';
  const roomId = params.roomId as string | undefined;
  const roomNumber = params.roomNumber as string | undefined;
  const setPendingRoom = useCustomerRoomStore((s) => s.setPendingRoom);
  const { t, i18n } = useTranslation();
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canConfirm = privacyChecked && termsChecked;

  const setQR = useGuestFlowStore((s) => s.setQR);

  const handleConfirm = async () => {
    if (!canConfirm || submitting) return;
    setSubmitting(true);
    try {
      await setPolicyConsent();
      if (next === 'guest_contract') {
        router.replace('/guest/contract');
      } else if (next === 'guest_sign_one') {
        const pending = await getPendingGuest();
        if (pending) {
          setQR(pending.token, pending.roomId, pending.roomNumber);
          await clearPendingGuest();
          router.replace({ pathname: '/guest/sign-one', params: { token: pending.token } });
        } else {
          router.replace('/guest/sign-one');
        }
      } else if (next === 'guest') {
        const pending = await getPendingGuest();
        if (pending) {
          setQR(pending.token, pending.roomId, pending.roomNumber);
          await clearPendingGuest();
          router.replace('/guest/language');
        } else {
          router.replace('/guest');
        }
      } else if (next === 'staff') {
        router.replace('/staff');
      } else {
        if (roomId && roomNumber) {
          setPendingRoom(roomId, roomNumber);
          router.replace('/auth');
        } else {
          router.replace('/customer');
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const openLegal = (type: 'privacy' | 'terms') => {
    router.push({ pathname: '/legal/[type]', params: { type } });
  };

  return (
    <KeyboardAvoidingView style={[styles.container, { paddingTop: insets.top + 16 }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{t('policiesConsentTitle')}</Text>
        <Text style={styles.intro}>
          Valoria Hotel uygulaması kişisel verilerinizi yalnızca otel hizmetleri ve check-in süreçleri için kullanır. Aşağıdaki metinleri okuyup kabul ederek devam edebilirsiniz.
        </Text>

        <TouchableOpacity style={styles.docButton} onPress={() => openLegal('privacy')} activeOpacity={0.8}>
          <Text style={styles.docButtonText}>{t('privacyPolicy')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.docButton} onPress={() => openLegal('terms')} activeOpacity={0.8}>
          <Text style={styles.docButtonText}>{t('termsOfService')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.checkRow}
          onPress={() => setPrivacyChecked((v) => !v)}
          activeOpacity={0.8}
        >
          <View style={[styles.checkbox, privacyChecked && styles.checkboxChecked]}>
            {privacyChecked && <Text style={styles.checkMark}>✓</Text>}
          </View>
          <Text style={styles.checkText}>{t('acceptPrivacy')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.checkRow}
          onPress={() => setTermsChecked((v) => !v)}
          activeOpacity={0.8}
        >
          <View style={[styles.checkbox, termsChecked && styles.checkboxChecked]}>
            {termsChecked && <Text style={styles.checkMark}>✓</Text>}
          </View>
          <Text style={styles.checkText}>{t('acceptTerms')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, !canConfirm && styles.buttonDisabled]}
          onPress={handleConfirm}
          disabled={!canConfirm || submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{t('confirmConsent')}</Text>
          )}
        </TouchableOpacity>

        <View style={styles.langStrip}>
          {LANGUAGES.map(({ code, label }) => (
            <TouchableOpacity
              key={code}
              style={[styles.langBtn, i18n.language === code && styles.langBtnActive]}
              onPress={async () => {
                await changeAppLanguage(code);
                await AsyncStorage.setItem(LANG_STORAGE_KEY, code as LangCode);
                await applyRTLAndReloadIfNeeded(code);
              }}
            >
              <Text style={[styles.langBtnText, i18n.language === code && styles.langBtnTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scroll: {
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1d21',
    marginBottom: 8,
  },
  intro: {
    fontSize: 15,
    color: '#6c757d',
    lineHeight: 22,
    marginBottom: 24,
  },
  docButton: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e9ecef',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 10,
  },
  docButtonText: {
    color: '#0d6efd',
    fontSize: 16,
    fontWeight: '600',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#adb5bd',
    marginRight: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#b8860b',
    borderColor: '#b8860b',
  },
  checkMark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  checkText: {
    color: '#1a1d21',
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
  button: {
    backgroundColor: '#b8860b',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  langStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 32,
    gap: 8,
  },
  langBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#e9ecef',
  },
  langBtnActive: {
    backgroundColor: '#b8860b',
  },
  langBtnText: {
    color: '#6c757d',
    fontSize: 13,
  },
  langBtnTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
});
