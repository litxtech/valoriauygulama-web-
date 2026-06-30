import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';
import { menuUi } from '@/components/hotelKitchenMenu/hotelKitchenMenuUi';
import {
  hotelKitchenMenuSaveUserMessage,
  updateHotelKitchenMenuItemBasics,
  type HotelKitchenMenuItemWithImages,
} from '@/lib/hotelKitchenMenu';
import { useAuthStore } from '@/stores/authStore';

type Props = {
  visible: boolean;
  item: HotelKitchenMenuItemWithImages | null;
  onClose: () => void;
  onSaved: (patch: { name: string; price: number; description: string | null }) => void;
};

export function HotelKitchenMenuQuickEditSheet({ visible, item, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const staff = useAuthStore((s) => s.staff);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !item) return;
    setName(item.name);
    setPrice(String(item.price));
    setDescription(item.description ?? '');
    setError(null);
    setSaving(false);
  }, [visible, item?.id, item?.name, item?.price, item?.description]);

  const handleSave = async () => {
    if (!item || !staff?.organization_id) return;
    const nm = name.trim();
    const pr = parseFloat(price.replace(',', '.'));
    if (!nm || !Number.isFinite(pr) || pr < 0) {
      setError(t('hotelKitchenMenuValidation'));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const desc = description.trim() || null;
      await updateHotelKitchenMenuItemBasics({
        id: item.id,
        organizationId: staff.organization_id,
        name: nm,
        price: pr,
        description: desc,
      });
      onSaved({ name: nm, price: pr, description: desc });
      onClose();
    } catch (e: unknown) {
      setError(hotelKitchenMenuSaveUserMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (!item) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.kav}
        >
          <Pressable
            style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}
            onPress={(e) => e.stopPropagation?.()}
          >
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={styles.headerIcon}>
                <Ionicons name="pencil" size={18} color={menuUi.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{t('hotelKitchenMenuQuickEditTitle')}</Text>
                <Text style={styles.sub}>{t('hotelKitchenMenuQuickEditSub')}</Text>
              </View>
              <Pressable onPress={onClose} hitSlop={12}>
                <Ionicons name="close" size={24} color={theme.colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>{t('hotelKitchenMenuNameLabel')}</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder={t('hotelKitchenMenuNamePh')}
                placeholderTextColor={theme.colors.textMuted}
              />

              <Text style={styles.label}>{t('hotelKitchenMenuPriceLabel')}</Text>
              <TextInput
                style={styles.input}
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={theme.colors.textMuted}
              />

              <Text style={styles.label}>{t('hotelKitchenMenuDescLabel')}</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={description}
                onChangeText={setDescription}
                multiline
                placeholder={t('hotelKitchenMenuDescPh')}
                placeholderTextColor={theme.colors.textMuted}
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>{t('save')}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  kav: { maxHeight: '92%' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 8,
    maxHeight: '100%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    marginBottom: 12,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: menuUi.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: '800', color: theme.colors.text },
  sub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2, lineHeight: 16 },
  label: { fontSize: 13, fontWeight: '700', color: theme.colors.text, marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: theme.colors.text,
    backgroundColor: '#fff',
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  error: { color: '#dc2626', fontSize: 13, marginTop: 10 },
  saveBtn: {
    marginTop: 20,
    marginBottom: 8,
    backgroundColor: menuUi.accentDeep,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
