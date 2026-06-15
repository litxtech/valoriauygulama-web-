import { useLayoutEffect } from 'react';
import { StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { adminTheme } from '@/constants/adminTheme';
import { AdminStackBackButton } from '@/lib/adminStackBack';
import { QuickAssignTaskForm } from '@/components/tasks/QuickAssignTaskForm';

export default function AdminAssignTaskScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <AdminStackBackButton accessibilityLabel={t('back')} fallback="/admin/tasks" />
      ),
      title: t('quickAssign_title'),
    });
  }, [navigation, t]);

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <QuickAssignTaskForm
        onSuccess={(count) => {
          Alert.alert(t('assignPage_successTitle'), t('quickAssign_success', { count }), [
            { text: t('ok'), onPress: () => router.back() },
          ]);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: adminTheme.colors.background },
});
