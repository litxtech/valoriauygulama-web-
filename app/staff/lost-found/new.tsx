import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
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
import { useNavigation, usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { theme } from '@/constants/theme';
import { AdminStackBackButton } from '@/lib/adminStackBack';
import { StaffStackBackButton } from '@/lib/staffStackBack';
import { LostFoundAccessGate } from '@/components/staff/LostFoundAccessGate';
import { useAuthStore } from '@/stores/authStore';
import { CachedImage } from '@/components/CachedImage';
import { createLostFoundItem, listRoomsForLostFound, type RoomOption } from '@/lib/lostFound';
import {
  LOST_FOUND_CATEGORIES,
  LOST_FOUND_LOCATION_TYPES,
  LOST_FOUND_VALUE_TIERS,
  lostFoundCategoryLabel,
  lostFoundLocationLabel,
  lostFoundValueTierLabel,
  type LostFoundCategory,
  type LostFoundLocationType,
  type LostFoundValueTier,
} from '@/lib/lostFoundCatalog';
import { LOST_FOUND_MEDIA_BUCKET, MAX_LOST_FOUND_PHOTOS } from '@/lib/lostFoundMedia';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { ensureCameraPermission } from '@/lib/cameraPermission';

type PendingPhoto = { uri: string };

function LostFoundNewScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith('/admin') ?? false;
  const base = isAdminRoute ? '/admin/lost-found' : '/staff/lost-found';
  const staff = useAuthStore((s) => s.staff);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () =>
        isAdminRoute ? (
          <AdminStackBackButton accessibilityLabel={t('back')} fallback={base as never} />
        ) : (
          <StaffStackBackButton accessibilityLabel={t('back')} fallback={base as never} />
        ),
    });
  }, [navigation, isAdminRoute, base, t]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<LostFoundCategory>('other');
  const [valueTier, setValueTier] = useState<LostFoundValueTier>('low');
  const [locationType, setLocationType] = useState<LostFoundLocationType>('room');
  const [locationDetail, setLocationDetail] = useState('');
  const [storageLocation, setStorageLocation] = useState('');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [saving, setSaving] = useState(false);
  const [roomsLoading, setRoomsLoading] = useState(true);

  useEffect(() => {
    listRoomsForLostFound().then((res) => {
      setRooms(res.data);
      setRoomsLoading(false);
    });
  }, []);

  const pickPhotos = useCallback(
    async (fromCamera: boolean) => {
      if (photos.length >= MAX_LOST_FOUND_PHOTOS) {
        Alert.alert(t('lfPhotoLimitTitle'), t('lfPhotoLimitBody', { max: MAX_LOST_FOUND_PHOTOS }));
        return;
      }
      const granted = fromCamera
        ? await ensureCameraPermission({
            title: t('lfCameraPermTitle'),
            message: t('lfCameraPermBody'),
            settingsMessage: t('lfCameraPermSettings'),
          })
        : await ensureMediaLibraryPermission({
            title: t('lfGalleryPermTitle'),
            message: t('lfGalleryPermBody'),
            settingsMessage: t('lfGalleryPermSettings'),
          });
      if (!granted) return;

      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.85,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsMultipleSelection: true,
            quality: 0.85,
          });

      if (result.canceled || !result.assets?.length) return;
      const added = result.assets
        .slice(0, MAX_LOST_FOUND_PHOTOS - photos.length)
        .map((a) => ({ uri: a.uri }));
      setPhotos((p) => [...p, ...added]);
    },
    [photos.length, t]
  );

  const submit = async () => {
    if (!staff?.organization_id || !staff.id) {
      Alert.alert(t('error'), t('lfErrSession'));
      return;
    }
    if (!title.trim()) {
      Alert.alert(t('error'), t('lfErrTitle'));
      return;
    }

    setSaving(true);
    try {
      const uploaded: { storagePath: string; publicUrl: string }[] = [];
      for (const p of photos) {
        const { publicUrl, path } = await uploadUriToPublicBucket({
          bucketId: LOST_FOUND_MEDIA_BUCKET,
          uri: p.uri,
          kind: 'image',
          subfolder: `items/${staff.organization_id}`,
        });
        uploaded.push({ storagePath: path, publicUrl });
      }

      const { data, error } = await createLostFoundItem(staff.organization_id, staff.id, {
        title: title.trim(),
        description: description.trim() || null,
        category,
        valueTier,
        foundLocationType: locationType,
        foundLocationDetail: locationDetail.trim() || null,
        roomId: locationType === 'room' ? roomId : null,
        storageLocation: storageLocation.trim() || null,
        photos: uploaded,
      });

      if (error || !data) throw new Error(error ?? t('lfErrSave'));

      Alert.alert(t('lfSaveSuccessTitle'), t('lfSaveSuccessBody', { code: data.reference_code }), [
        {
          text: t('ok'),
          onPress: () => router.replace(`${base}/${data.id}` as never),
        },
      ]);
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('lfErrSave'));
    }
    setSaving(false);
  };

  const ChipRow = <T extends string>({
    options,
    value,
    onChange,
    labelFn,
  }: {
    options: readonly T[];
    value: T;
    onChange: (v: T) => void;
    labelFn: (v: T) => string;
  }) => (
    <View style={styles.chipRow}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt}
          style={[styles.chip, value === opt && styles.chipActive]}
          onPress={() => onChange(opt)}
        >
          <Text style={[styles.chipText, value === opt && styles.chipTextActive]}>{labelFn(opt)}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>{t('lfFieldPhotos')}</Text>
        <View style={styles.photoRow}>
          {photos.map((p, i) => (
            <View key={p.uri} style={styles.photoThumbWrap}>
              <CachedImage uri={p.uri} style={styles.photoThumb} contentFit="cover" />
              <TouchableOpacity
                style={styles.photoRemove}
                onPress={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
              >
                <Ionicons name="close-circle" size={22} color={theme.colors.error} />
              </TouchableOpacity>
            </View>
          ))}
          {photos.length < MAX_LOST_FOUND_PHOTOS ? (
            <>
              <TouchableOpacity style={styles.photoAdd} onPress={() => pickPhotos(false)}>
                <Ionicons name="images-outline" size={26} color={theme.colors.primary} />
                <Text style={styles.photoAddText}>{t('lfGallery')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.photoAdd} onPress={() => pickPhotos(true)}>
                <Ionicons name="camera-outline" size={26} color={theme.colors.primary} />
                <Text style={styles.photoAddText}>{t('lfCamera')}</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>

        <Text style={styles.sectionLabel}>{t('lfFieldTitle')} *</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder={t('lfFieldTitlePh')}
          placeholderTextColor={theme.colors.textMuted}
        />

        <Text style={styles.sectionLabel}>{t('lfFieldDescription')}</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder={t('lfFieldDescriptionPh')}
          placeholderTextColor={theme.colors.textMuted}
          multiline
        />

        <Text style={styles.sectionLabel}>{t('lfFieldCategory')}</Text>
        <ChipRow
          options={LOST_FOUND_CATEGORIES}
          value={category}
          onChange={setCategory}
          labelFn={(v) => lostFoundCategoryLabel(t, v)}
        />

        <Text style={styles.sectionLabel}>{t('lfFieldValue')}</Text>
        <ChipRow
          options={LOST_FOUND_VALUE_TIERS}
          value={valueTier}
          onChange={setValueTier}
          labelFn={(v) => lostFoundValueTierLabel(t, v)}
        />

        <Text style={styles.sectionLabel}>{t('lfFieldFoundWhere')}</Text>
        <ChipRow
          options={LOST_FOUND_LOCATION_TYPES}
          value={locationType}
          onChange={setLocationType}
          labelFn={(v) => lostFoundLocationLabel(t, v)}
        />

        {locationType === 'room' ? (
          <>
            <Text style={styles.sectionLabel}>{t('lfFieldRoom')}</Text>
            {roomsLoading ? (
              <ActivityIndicator color={theme.colors.primary} />
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roomScroll}>
                <TouchableOpacity
                  style={[styles.roomChip, !roomId && styles.chipActive]}
                  onPress={() => setRoomId(null)}
                >
                  <Text style={[styles.chipText, !roomId && styles.chipTextActive]}>{t('lfRoomUnknown')}</Text>
                </TouchableOpacity>
                {rooms.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    style={[styles.roomChip, roomId === r.id && styles.chipActive]}
                    onPress={() => setRoomId(r.id)}
                  >
                    <Text style={[styles.chipText, roomId === r.id && styles.chipTextActive]}>{r.room_number}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </>
        ) : null}

        <Text style={styles.sectionLabel}>{t('lfFieldLocationDetail')}</Text>
        <TextInput
          style={styles.input}
          value={locationDetail}
          onChangeText={setLocationDetail}
          placeholder={t('lfFieldLocationDetailPh')}
          placeholderTextColor={theme.colors.textMuted}
        />

        <Text style={styles.sectionLabel}>{t('lfFieldStorage')}</Text>
        <TextInput
          style={styles.input}
          value={storageLocation}
          onChangeText={setStorageLocation}
          placeholder={t('lfFieldStoragePh')}
          placeholderTextColor={theme.colors.textMuted}
        />

        <TouchableOpacity
          style={[styles.submitBtn, saving && styles.submitDisabled]}
          onPress={submit}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={22} color="#fff" />
              <Text style={styles.submitText}>{t('lfSubmit')}</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, paddingBottom: 40 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginTop: 16,
    marginBottom: 8,
  },
  input: {
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: theme.colors.text,
  },
  textArea: { minHeight: 88, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipActive: { backgroundColor: theme.colors.primary + '20', borderColor: theme.colors.primary },
  chipText: { fontSize: 13, color: theme.colors.textSecondary },
  chipTextActive: { color: theme.colors.primary, fontWeight: '600' },
  roomScroll: { maxHeight: 44 },
  roomChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginRight: 8,
  },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoThumbWrap: { position: 'relative' },
  photoThumb: { width: 88, height: 88, borderRadius: 10 },
  photoRemove: { position: 'absolute', top: -6, right: -6 },
  photoAdd: {
    width: 88,
    height: 88,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.card,
  },
  photoAddText: { fontSize: 11, color: theme.colors.primary, marginTop: 4 },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 28,
  },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});

export default function LostFoundNewRoute() {
  return (
    <LostFoundAccessGate>
      <LostFoundNewScreen />
    </LostFoundAccessGate>
  );
}
