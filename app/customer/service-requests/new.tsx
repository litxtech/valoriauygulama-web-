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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { theme } from '@/constants/theme';
import { getOrCreateGuestForCurrentSession } from '@/lib/getOrCreateGuestForCaller';
import { supabase } from '@/lib/supabase';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { CachedImage } from '@/components/CachedImage';
import { notifyAdmins } from '@/lib/notificationService';
import {
  buildGuestServiceRequestAdminPush,
  createGuestServiceRequest,
} from '@/lib/guestServiceRequests';
import {
  GUEST_SERVICE_REQUEST_TYPES,
  guestServiceText,
  guestServiceTypeLabel,
  type GuestServiceRequestType,
} from '@/lib/guestServiceRequestsI18n';

const VALID_TYPES = new Set<string>(GUEST_SERVICE_REQUEST_TYPES);

export default function CustomerServiceRequestNewScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string }>();
  const initialType =
    params.type && VALID_TYPES.has(params.type) ? (params.type as GuestServiceRequestType) : 'room_cleaning';

  const [requestType, setRequestType] = useState<GuestServiceRequestType>(initialType);
  const [description, setDescription] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(() => description.trim().length >= 3 && !submitting, [description, submitting]);

  useEffect(() => {
    void (async () => {
      const guest = await getOrCreateGuestForCurrentSession();
      if (!guest?.guest_id) return;
      const { data } = await supabase
        .from('guests')
        .select('phone, rooms(room_number)')
        .eq('id', guest.guest_id)
        .maybeSingle();
      const row = data as { rooms?: { room_number?: string | null } | null } | null;
      if (!roomNumber && row?.rooms?.room_number) setRoomNumber(String(row.rooms.room_number));
    })().catch(() => {});
  }, []);

  const pickImage = async (fromCamera: boolean) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        guestServiceText('permTitle'),
        fromCamera ? guestServiceText('permCamera') : guestServiceText('permGallery')
      );
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (!result.canceled && result.assets?.[0]?.uri) setImageUri(result.assets[0].uri);
  };

  const submit = async () => {
    const text = description.trim();
    if (text.length < 3) {
      Alert.alert(guestServiceText('infoTitle'), guestServiceText('minDesc'));
      return;
    }
    setSubmitting(true);
    try {
      const guest = await getOrCreateGuestForCurrentSession();
      if (!guest?.guest_id) {
        Alert.alert(guestServiceText('loginRequired'), guestServiceText('loginToSend'));
        return;
      }

      let uploadedUrl: string | null = null;
      if (imageUri) {
        const upload = await uploadUriToPublicBucket({
          bucketId: 'guest-service-requests',
          uri: imageUri,
          kind: 'image',
          subfolder: 'requests',
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

      await createGuestServiceRequest({
        guestId: guest.guest_id,
        organizationId,
        requestType,
        description: text,
        roomNumber: roomNumber.trim() || null,
        imageUrl: uploadedUrl,
      });

      const push = buildGuestServiceRequestAdminPush({
        requestType,
        description: text,
        guestName,
        roomNumber: roomNumber.trim() || null,
      });

      await notifyAdmins({
        title: push.title,
        body: push.body,
        data: {
          url: '/staff/guest-service-requests',
          screen: 'guest_service_requests',
          notificationType: 'guest_service_request_new',
          feature_key: 'guest_service_request',
          requestType,
        },
      });

      Alert.alert(guestServiceText('submittedTitle'), guestServiceText('submittedBody'), [
        { text: t('ok'), onPress: () => router.replace('/customer/service-requests') },
      ]);
    } catch (e: unknown) {
      Alert.alert(guestServiceText('errorTitle'), (e as Error)?.message ?? guestServiceText('submitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>{guestServiceText('intro')}</Text>

        <Text style={styles.label}>{guestServiceText('typeLabel')}</Text>
        <View style={styles.typeGrid}>
          {GUEST_SERVICE_REQUEST_TYPES.map((t) => {
            const on = requestType === t;
            return (
              <TouchableOpacity
                key={t}
                style={[styles.typeChip, on && styles.typeChipOn]}
                onPress={() => setRequestType(t)}
                activeOpacity={0.85}
              >
                <Text style={[styles.typeChipText, on && styles.typeChipTextOn]} numberOfLines={2}>
                  {guestServiceTypeLabel(t)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>{guestServiceText('roomLabel')}</Text>
        <TextInput
          style={styles.input}
          value={roomNumber}
          onChangeText={setRoomNumber}
          placeholder={guestServiceText('roomPh')}
          placeholderTextColor={theme.colors.textMuted}
        />

        <Text style={styles.label}>{guestServiceText('descriptionLabel')}</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder={guestServiceText('descriptionPh')}
          placeholderTextColor={theme.colors.textMuted}
          multiline
          textAlignVertical="top"
        />

        <Text style={styles.label}>{guestServiceText('photoOptional')}</Text>
        <View style={styles.photoRow}>
          <TouchableOpacity style={styles.photoBtn} onPress={() => pickImage(true)}>
            <Ionicons name="camera-outline" size={20} color={theme.colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.photoBtn} onPress={() => pickImage(false)}>
            <Ionicons name="images-outline" size={20} color={theme.colors.primary} />
          </TouchableOpacity>
          {imageUri ? <CachedImage uri={imageUri} style={styles.thumb} contentFit="cover" /> : null}
        </View>

        <TouchableOpacity
          style={[styles.submit, !canSubmit && styles.submitDisabled]}
          onPress={submit}
          disabled={!canSubmit}
          activeOpacity={0.88}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>{guestServiceText('submit')}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, paddingBottom: 40 },
  intro: { fontSize: 14, color: theme.colors.textSecondary, lineHeight: 20, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '700', color: theme.colors.textMuted, marginBottom: 8, marginTop: 8 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
    maxWidth: '48%',
  },
  typeChipOn: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '14' },
  typeChipText: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary },
  typeChipTextOn: { color: theme.colors.primary },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  textArea: { minHeight: 100 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  photoBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: { width: 56, height: 56, borderRadius: 10 },
  submit: {
    marginTop: 24,
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
