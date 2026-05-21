import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { invokeEdgeWithAuth } from '@/lib/invokeEdgeWithAuth';
import { theme } from '@/constants/theme';
import { useTranslation } from 'react-i18next';

export default function CustomerDeleteAccountScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, signOut } = useAuthStore();
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [deleted, setDeleted] = useState(false);

  const handleDelete = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await invokeEdgeWithAuth('delete-user-account', {
        mode: 'self',
        password: password || undefined,
        deletion_reason: reason.trim() || undefined,
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) {
        throw new Error((data as { error: string }).error);
      }
      setDeleted(true);
      await signOut();
      setTimeout(() => router.replace('/'), 1500);
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? t('deleteAccountFailed');
      Alert.alert(t('error'), msg);
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      t('deleteAccountConfirmTitle'),
      t('deleteAccountConfirmBody'),
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('deleteAccountConfirmCta'), style: 'destructive', onPress: handleDelete },
      ]
    );
  };

  if (deleted) {
    return (
      <View style={styles.centered}>
        <View style={styles.successIconWrap}>
          <Ionicons name="checkmark-done" size={48} color={theme.colors.success} />
        </View>
        <Text style={styles.successTitle}>{t('deleteAccountSuccessTitle')}</Text>
        <Text style={styles.successText}>{t('deleteAccountSuccessBody')}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.warningBox}>
          <View style={styles.warningIconWrap}>
            <Ionicons name="warning-outline" size={28} color={theme.colors.error} />
          </View>
          <Text style={styles.warningTitle}>{t('deleteAccountWarningTitle')}</Text>
          <Text style={styles.warningText}>{t('deleteAccountWarningIntro')}</Text>
          <Text style={styles.warningBullet}>{`• ${t('deleteAccountWarningItem1')}`}</Text>
          <Text style={styles.warningBullet}>{`• ${t('deleteAccountWarningItem2')}`}</Text>
          <Text style={styles.warningBullet}>{`• ${t('deleteAccountWarningItem3')}`}</Text>
        </View>

        <Text style={styles.label}>{t('deleteAccountPasswordLabel')}</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder={t('deleteAccountPasswordPlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>{t('deleteAccountReasonLabel')}</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={reason}
          onChangeText={setReason}
          placeholder={t('deleteAccountReasonPlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          multiline
          numberOfLines={3}
        />

        <TouchableOpacity
          style={[styles.deleteBtn, loading && styles.deleteBtnDisabled]}
          onPress={confirmDelete}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={theme.colors.white} />
          ) : (
            <>
              <Ionicons name="trash-outline" size={22} color={theme.colors.white} style={{ marginRight: 10 }} />
              <Text style={styles.deleteBtnText}>{t('deleteAccountPrimaryCta')}</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => router.back()}
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-back-outline" size={20} color={theme.colors.text} style={{ marginRight: 8 }} />
          <Text style={styles.cancelBtnText}>{t('back')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  scroll: { padding: theme.spacing.lg, paddingBottom: 40 },
  warningBox: {
    backgroundColor: theme.colors.error + '0c',
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
    borderWidth: 2,
    borderColor: theme.colors.error + '30',
  },
  warningIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.error + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  warningTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.error, marginBottom: 8 },
  warningText: { fontSize: 14, color: theme.colors.text, marginBottom: 6 },
  warningBullet: { fontSize: 14, color: theme.colors.textSecondary, marginLeft: 8, marginBottom: 4 },
  label: { fontSize: 14, fontWeight: '600', color: theme.colors.text, marginBottom: 8 },
  input: {
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: 16,
    fontSize: 16,
    backgroundColor: theme.colors.surface,
    marginBottom: 20,
  },
  textArea: { minHeight: 88, textAlignVertical: 'top' },
  deleteBtn: {
    flexDirection: 'row',
    backgroundColor: theme.colors.error,
    paddingVertical: 16,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  deleteBtnDisabled: { opacity: 0.7 },
  deleteBtnText: { color: theme.colors.white, fontSize: 16, fontWeight: '700' },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: theme.radius.lg,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  cancelBtnText: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  successIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.success + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  successTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.text, marginBottom: 12 },
  successText: { fontSize: 15, color: theme.colors.textSecondary },
});
