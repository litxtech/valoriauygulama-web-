import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import { useAuthStore } from '@/stores/authStore';
import {
  deleteHotelKitchenMenuItem,
  fetchHotelKitchenMenuItemById,
  hotelKitchenMenuSaveUserMessage,
  MAX_HOTEL_KITCHEN_MENU_IMAGES,
  newHotelKitchenMenuItemId,
  upsertHotelKitchenMenuItemWithRetry,
} from '@/lib/hotelKitchenMenu';
import { buildKitchenMenuItemI18nFields } from '@/lib/kitchenMenuItemAutoTranslate';
import { uploadHotelKitchenMenuImagesParallel } from '@/lib/hotelKitchenMenuUpload';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { ensureCameraPermission } from '@/lib/cameraPermission';

type PendingImage = { uri: string; uploadedUrl?: string };

type Props = {
  itemId?: string;
  backFallback: string;
};

export function HotelKitchenMenuEditor({ itemId, backFallback }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const isEdit = !!itemId;

  const [categoryTitle, setCategoryTitle] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [servedInHotel, setServedInHotel] = useState(true);
  const [isAvailable, setIsAvailable] = useState(true);
  const [images, setImages] = useState<PendingImage[]>([]);
  const [loading, setLoading] = useState(!!itemId);
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);

  useEffect(() => {
    if (!itemId) return;
    setLoading(true);
    fetchHotelKitchenMenuItemById(itemId)
      .then((row) => {
        if (!row) return;
        setCategoryTitle(row.category_title);
        setName(row.name);
        setDescription(row.description ?? '');
        setPrice(String(row.price));
        setServedInHotel(row.served_in_hotel_restaurant);
        setIsAvailable(row.is_available);
        setImages(row.images.map((im) => ({ uri: im.image_url, uploadedUrl: im.image_url })));
      })
      .catch(() => Alert.alert(t('error'), t('hotelKitchenMenuLoadFailed')))
      .finally(() => setLoading(false));
  }, [itemId, t]);

  const pickImages = useCallback(
    async (fromCamera: boolean) => {
      if (images.length >= MAX_HOTEL_KITCHEN_MENU_IMAGES) {
        Alert.alert(
          t('hotelKitchenMenuPhotoLimitTitle'),
          t('hotelKitchenMenuPhotoLimitBody', { max: MAX_HOTEL_KITCHEN_MENU_IMAGES })
        );
        return;
      }
      const granted = fromCamera
        ? await ensureCameraPermission({
            title: t('hotelKitchenMenuCameraPermTitle'),
            message: t('hotelKitchenMenuCameraPermBody'),
            settingsMessage: t('hotelKitchenMenuCameraPermSettings'),
          })
        : await ensureMediaLibraryPermission({
            title: t('hotelKitchenMenuGalleryPermTitle'),
            message: t('hotelKitchenMenuGalleryPermBody'),
            settingsMessage: t('hotelKitchenMenuGalleryPermSettings'),
          });
      if (!granted) return;

      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.85,
            allowsMultipleSelection: true,
            selectionLimit: MAX_HOTEL_KITCHEN_MENU_IMAGES - images.length,
          });

      if (result.canceled || !result.assets?.length) return;
      setImages((prev) => [
        ...prev,
        ...result.assets.slice(0, MAX_HOTEL_KITCHEN_MENU_IMAGES - prev.length).map((a) => ({ uri: a.uri })),
      ]);
    },
    [images.length, t]
  );

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const save = async () => {
    if (!staff?.organization_id) {
      Alert.alert(t('error'), t('hotelKitchenMenuNoOrg'));
      return;
    }
    const cat = categoryTitle.trim();
    const nm = name.trim();
    const pr = parseFloat(price.replace(',', '.'));
    if (!cat || !nm || !Number.isFinite(pr) || pr < 0) {
      Alert.alert(t('error'), t('hotelKitchenMenuValidation'));
      return;
    }

    setSaving(true);
    try {
      const base = {
        organizationId: staff.organization_id,
        categoryTitle: cat,
        name: nm,
        description: description.trim() || null,
        price: pr,
        servedInHotelRestaurant: servedInHotel,
        isAvailable,
      };

      // Yeni ürün: görseller storage yolunda bu id kullanılır; RPC kayıt yoksa INSERT yapar (güncelleme değil).
      const savedId = itemId ?? newHotelKitchenMenuItemId();
      const existingUrls = images.filter((im) => im.uploadedUrl).map((im) => im.uploadedUrl!);
      const pendingUris = images.filter((im) => !im.uploadedUrl).map((im) => im.uri);

      const { urls: uploaded, errors: uploadErrors } = await uploadHotelKitchenMenuImagesParallel({
        organizationId: staff.organization_id,
        itemId: savedId,
        localUris: pendingUris,
      });

      setTranslating(true);
      const i18n = await buildKitchenMenuItemI18nFields({
        categoryTitle: cat,
        name: nm,
        description: description.trim() || null,
      });
      setTranslating(false);

      await upsertHotelKitchenMenuItemWithRetry({
        ...base,
        id: savedId,
        imageUrls: [...existingUrls, ...uploaded].slice(0, MAX_HOTEL_KITCHEN_MENU_IMAGES),
        nameEn: i18n.nameEn,
        nameAr: i18n.nameAr,
        descriptionEn: i18n.descriptionEn,
        descriptionAr: i18n.descriptionAr,
        categoryTitleEn: i18n.categoryTitleEn,
        categoryTitleAr: i18n.categoryTitleAr,
      });

      router.replace(backFallback as never);

      if (uploadErrors.length > 0) {
        Alert.alert(
          t('hotelKitchenMenuSavedPartialTitle'),
          t('hotelKitchenMenuSavedPartialBody', { count: uploadErrors.length })
        );
      } else {
        Alert.alert(t('success'), isEdit ? t('hotelKitchenMenuSaved') : t('hotelKitchenMenuCreated'));
      }
    } catch (e: unknown) {
      Alert.alert(t('error'), hotelKitchenMenuSaveUserMessage(e));
    } finally {
      setSaving(false);
      setTranslating(false);
    }
  };

  const onDelete = () => {
    if (!itemId) return;
    Alert.alert(t('hotelKitchenMenuDeleteTitle'), t('hotelKitchenMenuDeleteBody'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteHotelKitchenMenuItem(itemId);
            router.replace(backFallback as never);
          } catch (e: unknown) {
            Alert.alert(t('error'), (e as Error)?.message ?? t('unknownErrorShort'));
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>{t('hotelKitchenMenuCategoryLabel')}</Text>
        <Text style={styles.hint}>{t('hotelKitchenMenuCategoryHint')}</Text>
        <TextInput
          style={styles.input}
          value={categoryTitle}
          onChangeText={setCategoryTitle}
          placeholder={t('hotelKitchenMenuCategoryPh')}
          placeholderTextColor={theme.colors.textMuted}
        />

        <Text style={styles.label}>{t('hotelKitchenMenuNameLabel')}</Text>
        <Text style={styles.hint}>{t('hotelKitchenMenuAutoTranslateHint')}</Text>
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

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>{t('hotelKitchenMenuServedInHotel')}</Text>
          <Switch value={servedInHotel} onValueChange={setServedInHotel} />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>{t('hotelKitchenMenuAvailable')}</Text>
          <Switch value={isAvailable} onValueChange={setIsAvailable} />
        </View>

        <Text style={styles.label}>{t('hotelKitchenMenuPhotosLabel')}</Text>
        <View style={styles.photoActions}>
          <TouchableOpacity style={styles.photoBtn} onPress={() => pickImages(true)}>
            <Ionicons name="camera-outline" size={20} color={theme.colors.primary} />
            <Text style={styles.photoBtnText}>{t('hotelKitchenMenuCamera')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.photoBtn} onPress={() => pickImages(false)}>
            <Ionicons name="images-outline" size={20} color={theme.colors.primary} />
            <Text style={styles.photoBtnText}>{t('hotelKitchenMenuGallery')}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbRow}>
          {images.map((im, i) => (
            <View key={`${im.uri}-${i}`} style={styles.thumbWrap}>
              <CachedImage uri={im.uploadedUrl ?? im.uri} style={styles.thumb} contentFit="cover" />
              <TouchableOpacity style={styles.thumbRemove} onPress={() => removeImage(i)}>
                <Ionicons name="close-circle" size={22} color="#ef4444" />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>

        <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>{isEdit ? t('save') : t('hotelKitchenMenuCreate')}</Text>
          )}
        </TouchableOpacity>
        {translating ? (
          <Text style={styles.translatingHint}>{t('hotelKitchenMenuTranslating')}</Text>
        ) : null}

        {isEdit ? (
          <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
            <Text style={styles.deleteBtnText}>{t('delete')}</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  label: { fontSize: 14, fontWeight: '700', color: theme.colors.text, marginTop: 12 },
  hint: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: theme.colors.text,
    backgroundColor: '#fff',
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingVertical: 8,
  },
  switchLabel: { fontSize: 15, color: theme.colors.text, flex: 1, paddingRight: 12 },
  photoActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  photoBtnText: { color: theme.colors.primary, fontWeight: '600' },
  thumbRow: { marginTop: 10, maxHeight: 100 },
  thumbWrap: { marginRight: 10, position: 'relative' },
  thumb: { width: 80, height: 80, borderRadius: 8 },
  thumbRemove: { position: 'absolute', top: -6, right: -6 },
  saveBtn: {
    marginTop: 24,
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  deleteBtn: { marginTop: 16, alignItems: 'center', paddingVertical: 12 },
  deleteBtnText: { color: '#ef4444', fontWeight: '600' },
  translatingHint: { marginTop: 10, textAlign: 'center', fontSize: 12, color: theme.colors.textMuted },
});
