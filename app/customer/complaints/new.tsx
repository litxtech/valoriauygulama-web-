import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '@/constants/theme';
import { getOrCreateGuestForCurrentSession } from '@/lib/getOrCreateGuestForCaller';
import { supabase } from '@/lib/supabase';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { notifyAdmins } from '@/lib/notificationService';
import { CachedImage } from '@/components/CachedImage';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  buildGuestComplaintAdminPush,
  complaintsText,
  complaintCategoryLabel,
  complaintTypeLabel,
} from '@/lib/complaintsI18n';

const TOPIC_TYPES = [
  { value: 'complaint' },
  { value: 'suggestion' },
  { value: 'thanks' },
] as const;

const CATEGORIES = [
  { value: 'personnel' },
  { value: 'room_issue' },
  { value: 'payment' },
  { value: 'reception_checkin_checkout' },
  { value: 'passport' },
  { value: 'noise' },
  { value: 'breakfast' },
  { value: 'food' },
  { value: 'other' },
] as const;

export default function CustomerComplaintNewScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [topicType, setTopicType] = useState<(typeof TOPIC_TYPES)[number]['value']>('complaint');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]['value']>('personnel');
  const [phone, setPhone] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [description, setDescription] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const canSubmit = useMemo(() => description.trim().length >= 1 && !submitting, [description, submitting]);

  useEffect(() => {
    (async () => {
      const guest = await getOrCreateGuestForCurrentSession();
      if (!guest?.guest_id) return;
      const { data } = await supabase
        .from('guests')
        .select('phone, rooms(room_number)')
        .eq('id', guest.guest_id)
        .maybeSingle();
      const row = data as { phone?: string | null; rooms?: { room_number?: string | null } | null } | null;
      if (!row) return;
      if (!phone && row.phone) setPhone(row.phone);
      if (!roomNumber && row.rooms?.room_number) setRoomNumber(String(row.rooms.room_number));
    })().catch(() => {});
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const pickImage = async (fromCamera: boolean) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        complaintsText('permissionRequired'),
        fromCamera ? complaintsText('cameraPermission') : complaintsText('galleryPermission')
      );
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setImageUri(result.assets[0].uri);
    }
  };

  const submit = async () => {
    const text = description.trim();
    if (text.length < 1) {
      Alert.alert(complaintsText('missingInfo'), complaintsText('min5'));
      return;
    }
    setSubmitting(true);
    try {
      const guest = await getOrCreateGuestForCurrentSession();
      if (!guest?.guest_id) {
        Alert.alert(complaintsText('loginRequired'), complaintsText('loginToSend'));
        setSubmitting(false);
        return;
      }

      let uploadedUrl: string | null = null;
      if (imageUri) {
        const upload = await uploadUriToPublicBucket({
          bucketId: 'guest-complaints',
          uri: imageUri,
          kind: 'image',
          subfolder: 'complaints',
        });
        uploadedUrl = upload.publicUrl;
      }

      let guestName: string | null = null;
      let organizationId: string | null = null;
      const { data: guestRow } = await supabase
        .from('guests')
        .select('full_name, organization_id')
        .eq('id', guest.guest_id)
        .maybeSingle();
      guestName = (guestRow as { full_name?: string | null } | null)?.full_name ?? null;
      organizationId = (guestRow as { organization_id?: string | null } | null)?.organization_id ?? null;

      const insertPayload = {
        guest_id: guest.guest_id,
        organization_id: organizationId,
        topic_type: topicType,
        category,
        description: text,
        phone: phone.trim() || null,
        room_number: roomNumber.trim() || null,
        image_url: uploadedUrl,
      };
      let { error } = await supabase.from('guest_complaints').insert(insertPayload);
      if (error?.message?.includes('organization_id')) {
        const { organization_id: _org, ...withoutOrg } = insertPayload;
        ({ error } = await supabase.from('guest_complaints').insert(withoutOrg));
      }
      if (error) throw error;

      let guestNameOnly: string | null = guestName;

      const push = buildGuestComplaintAdminPush({
        topicType,
        category,
        description: text,
        guestName: guestNameOnly,
        roomNumber: roomNumber.trim() || null,
      });

      await notifyAdmins({
        title: push.title,
        body: push.body,
        data: {
          url: '/admin/complaints',
          screen: 'admin_complaints',
          notificationType: 'guest_complaint_new',
          topicType,
          category,
        },
      }).catch(() => {});

      Alert.alert(complaintsText('received'), complaintsText('sentToAdmin'), [
        { text: t('ok'), onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert(complaintsText('error'), (e as Error)?.message || complaintsText('sendFailed'));
    }
    setSubmitting(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 84 : 0}
    >
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, Platform.OS === 'android' && keyboardHeight > 0 ? { paddingBottom: keyboardHeight + 24 } : null]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>{complaintsText('newScreenTitle')}</Text>
      <Text style={styles.subtitle}>{complaintsText('newScreenSubtitle')}</Text>

      <Text style={styles.label}>{complaintsText('reportType')}</Text>
      <View style={styles.chips}>
        {TOPIC_TYPES.map((item) => (
          <TouchableOpacity
            key={item.value}
            style={[styles.chip, topicType === item.value && styles.chipActive]}
            onPress={() => setTopicType(item.value)}
          >
            <Text style={[styles.chipText, topicType === item.value && styles.chipTextActive]}>
              {complaintTypeLabel(item.value)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>{complaintsText('category')}</Text>
      <View style={styles.categoryList}>
        {CATEGORIES.map((item) => (
          <TouchableOpacity
            key={item.value}
            style={[styles.categoryRow, category === item.value && styles.categoryRowActive]}
            onPress={() => setCategory(item.value)}
          >
            <Ionicons
              name={category === item.value ? 'radio-button-on' : 'radio-button-off'}
              size={20}
              color={category === item.value ? theme.colors.primary : theme.colors.textMuted}
            />
            <Text style={styles.categoryText}>{complaintCategoryLabel(item.value)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>{complaintsText('phone')}</Text>
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        placeholder={t('complaintsPhPhone')}
        placeholderTextColor={theme.colors.textMuted}
      />

      <Text style={styles.label}>{complaintsText('roomNo')}</Text>
      <TextInput
        style={styles.input}
        value={roomNumber}
        onChangeText={setRoomNumber}
        placeholder={t('complaintsPhRoom')}
        placeholderTextColor={theme.colors.textMuted}
      />

      <Text style={styles.label}>{complaintsText('detailRequired')}</Text>
      <TextInput
        style={[styles.input, styles.textarea]}
        value={description}
        onChangeText={setDescription}
        multiline
        textAlignVertical="top"
        maxLength={1000}
        placeholder="Sorunu, oneriyi veya tesekkuru detayli yazabilirsiniz."
        placeholderTextColor={theme.colors.textMuted}
      />

      <Text style={styles.label}>{complaintsText('photoOptional')}</Text>
      <View style={styles.imageActions}>
        <TouchableOpacity style={styles.imageBtn} onPress={() => pickImage(true)}>
          <Ionicons name="camera-outline" size={18} color={theme.colors.primary} />
          <Text style={styles.imageBtnText}>{complaintsText('camera')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.imageBtn} onPress={() => pickImage(false)}>
          <Ionicons name="images-outline" size={18} color={theme.colors.primary} />
          <Text style={styles.imageBtnText}>{complaintsText('gallery')}</Text>
        </TouchableOpacity>
      </View>
      {imageUri ? (
        <View style={styles.previewWrap}>
          <CachedImage uri={imageUri} style={styles.preview} contentFit="cover" />
          <TouchableOpacity style={styles.removeImage} onPress={() => setImageUri(null)}>
            <Ionicons name="close-circle" size={24} color={theme.colors.error} />
          </TouchableOpacity>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
        disabled={!canSubmit}
        onPress={() => {
          Keyboard.dismiss();
          submit();
        }}
      >
        {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.submitText}>{complaintsText('send')}</Text>}
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 16, paddingBottom: 40, flexGrow: 1 },
  title: { fontSize: 22, fontWeight: '800', color: theme.colors.text },
  subtitle: { marginTop: 6, fontSize: 14, lineHeight: 20, color: theme.colors.textSecondary, marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '700', color: theme.colors.text, marginBottom: 8, marginTop: 10 },
  chips: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
  },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  chipTextActive: { color: '#fff' },
  categoryList: { backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.borderLight },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 11 },
  categoryRowActive: { backgroundColor: `${theme.colors.primary}14` },
  categoryText: { fontSize: 14, color: theme.colors.text },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.text,
    fontSize: 14,
  },
  textarea: { minHeight: 120 },
  imageActions: { flexDirection: 'row', gap: 10 },
  imageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  imageBtnText: { color: theme.colors.text, fontWeight: '600' },
  previewWrap: { marginTop: 10, position: 'relative' },
  preview: { width: '100%', height: 180, borderRadius: 12, backgroundColor: theme.colors.borderLight },
  removeImage: { position: 'absolute', right: 8, top: 8, backgroundColor: '#fff', borderRadius: 12 },
  submitBtn: {
    marginTop: 20,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
