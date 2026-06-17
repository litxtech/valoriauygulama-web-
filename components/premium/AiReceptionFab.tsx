import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Pressable,
  Platform,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from '@/components/premium/PressableScale';
import { GlassSurface } from '@/components/premium/GlassSurface';
import { pds } from '@/constants/personelDesignSystem';
import { useAuthStore } from '@/stores/authStore';
import { createAiReceptionTask } from '@/lib/aiReceptionTask';
import { useTranslation } from 'react-i18next';

type Props = { variant?: 'fab' | 'icon' };

export function AiReceptionFab({ variant = 'fab' }: Props) {
  const { t } = useTranslation();
  const staff = useAuthStore((s) => s.staff);
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  const close = () => {
    Keyboard.dismiss();
    setOpen(false);
    setKeyboardOffset(0);
  };

  useEffect(() => {
    if (!open) {
      setKeyboardOffset(0);
      return;
    }
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        const h = e.endCoordinates?.height;
        setKeyboardOffset(typeof h === 'number' && h > 0 ? h : 0);
      }
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardOffset(0)
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, [open]);

  const submit = async () => {
    const prompt = text.trim();
    if (!prompt) return;
    if (!staff?.id) {
      Alert.alert(t('error'), t('assignPage_errSession'));
      return;
    }
    if (!staff.organization_id) {
      Alert.alert(t('error'), t('staffAiOrgRequired'));
      return;
    }

    setBusy(true);
    try {
      await createAiReceptionTask({ prompt, staff });
      Alert.alert(t('staffAiTaskCreated'), t('staffAiTaskRouted'));
      setText('');
      close();
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('staffAiTaskFailed');
      Alert.alert(t('error'), msg.includes('staff_ai_reception') ? t('staffAiMigrationHint') : msg);
    } finally {
      setBusy(false);
    }
  };

  const trigger =
    variant === 'icon' ? (
      <PressableScale style={styles.iconWrap} onPress={() => setOpen(true)} scaleTo={0.92}>
        <LinearGradient colors={['#667eea', '#764ba2']} style={styles.iconBtn}>
          <Ionicons name="sparkles" size={16} color="#fff" />
        </LinearGradient>
      </PressableScale>
    ) : (
      <PressableScale style={styles.fabWrap} onPress={() => setOpen(true)}>
        <LinearGradient colors={['#667eea', '#764ba2']} style={styles.fab}>
          <Ionicons name="sparkles" size={18} color="#fff" />
          <Text style={styles.fabText}>{t('staffAiFabLabel')}</Text>
        </LinearGradient>
      </PressableScale>
    );

  return (
    <>
      {trigger}

      <Modal visible={open} animationType="slide" transparent onRequestClose={close}>
        <View style={styles.root}>
          <Pressable style={styles.backdrop} onPress={close} accessibilityRole="button" accessibilityLabel={t('cancel')} />
          <View
            style={[
              styles.sheetWrap,
              {
                bottom: keyboardOffset,
                paddingBottom: Math.max(insets.bottom, 12),
              },
            ]}
          >
            <Pressable onPress={(e) => e.stopPropagation()}>
              <GlassSurface style={styles.sheet} borderRadius={24} strong>
                <Text style={styles.title}>{t('staffAiSheetTitle')}</Text>
                <Text style={styles.hint}>{t('staffAiSheetHint')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('staffAiSheetPlaceholder')}
                  placeholderTextColor={pds.subtext}
                  value={text}
                  onChangeText={setText}
                  multiline
                  textAlignVertical="top"
                  keyboardAppearance="dark"
                />
                <View style={styles.actions}>
                  <TouchableOpacity onPress={close} style={styles.cancel}>
                    <Text style={styles.cancelText}>{t('cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => void submit()} style={styles.go} disabled={busy || !text.trim()}>
                    {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.goText}>{t('staffAiSubmit')}</Text>}
                  </TouchableOpacity>
                </View>
              </GlassSurface>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  iconWrap: { marginHorizontal: 0 },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabWrap: { alignSelf: 'center', marginBottom: 8 },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  fabText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheetWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 16,
  },
  sheet: { padding: 20 },
  title: { fontSize: 18, fontWeight: '800', color: pds.text },
  hint: { fontSize: 12, color: pds.subtext, marginTop: 4, marginBottom: 12 },
  input: {
    minHeight: 88,
    maxHeight: 140,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: pds.borderLight,
    padding: 12,
    fontSize: 15,
    color: pds.text,
    textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 16 },
  cancel: { paddingVertical: 10, paddingHorizontal: 14 },
  cancelText: { color: pds.subtext, fontWeight: '600' },
  go: {
    backgroundColor: pds.indigo,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    minWidth: 120,
    alignItems: 'center',
  },
  goText: { color: '#fff', fontWeight: '800' },
});
