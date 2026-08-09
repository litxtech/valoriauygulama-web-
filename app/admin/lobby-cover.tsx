import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard } from '@/components/admin';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import {
  fetchLobbyCover,
  LOBBY_COVER_SETTING_KEY,
  LOBBY_MEDIA_BUCKET,
  parseLobbyCover,
  saveLobbyCover,
  type LobbyCover,
} from '@/lib/lobbyCover';

const DEFAULT_HERO = require('../../assets/lobby-hero-uzungol.png');

/**
 * Lobi kapak medyası: resim veya video (biri).
 * Video eklenince resim kalkar; resim eklenince video kalkar.
 * Kaydedilince tüm cihazlarda anlık güncellenir (realtime).
 */
export default function AdminLobbyCoverScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [cover, setCover] = useState<LobbyCover | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const previewW = Math.min(width - 40, 520);
  const previewH = Math.round(previewW * 1.35);

  const load = useCallback(async () => {
    try {
      setCover(await fetchLobbyCover());
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message || 'Yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();

      const channel = supabase
        .channel('admin-lobby-cover-preview')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'app_settings',
            filter: `key=eq.${LOBBY_COVER_SETTING_KEY}`,
          },
          (payload) => {
            const row = (payload.new ?? null) as { value?: unknown } | null;
            if (payload.eventType === 'DELETE') {
              setCover(null);
              return;
            }
            setCover(parseLobbyCover(row?.value));
          }
        )
        .subscribe();

      return () => {
        void supabase.removeChannel(channel);
      };
    }, [load])
  );

  const applyCover = async (next: LobbyCover | null, okMessage: string) => {
    setUploading(true);
    try {
      await saveLobbyCover(next);
      setCover(next);
      Alert.alert('Kaydedildi', okMessage);
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message || 'Kaydedilemedi');
    } finally {
      setUploading(false);
    }
  };

  const pickImage = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: false,
    });
    if (picked.canceled || !picked.assets?.[0]?.uri) return;
    setUploading(true);
    try {
      const uploaded = await uploadUriToPublicBucket({
        bucketId: LOBBY_MEDIA_BUCKET,
        uri: picked.assets[0].uri,
        subfolder: 'cover',
        kind: 'image',
      });
      await saveLobbyCover({ mediaType: 'image', url: uploaded.publicUrl });
      setCover({ mediaType: 'image', url: uploaded.publicUrl });
      Alert.alert('Kaydedildi', 'Lobi kapağı görsel olarak güncellendi. Tüm cihazlarda anında görünür.');
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message || 'Görsel yüklenemedi');
    } finally {
      setUploading(false);
    }
  };

  const pickVideo = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.85,
      allowsEditing: false,
      videoMaxDuration: 90,
    });
    if (picked.canceled || !picked.assets?.[0]?.uri) return;
    setUploading(true);
    try {
      const uploaded = await uploadUriToPublicBucket({
        bucketId: LOBBY_MEDIA_BUCKET,
        uri: picked.assets[0].uri,
        subfolder: 'cover',
        kind: 'video',
      });
      await saveLobbyCover({ mediaType: 'video', url: uploaded.publicUrl });
      setCover({ mediaType: 'video', url: uploaded.publicUrl });
      Alert.alert('Kaydedildi', 'Lobi kapağı video olarak güncellendi. Tüm cihazlarda anında görünür.');
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message || 'Video yüklenemedi');
    } finally {
      setUploading(false);
    }
  };

  const restoreDefault = () => {
    Alert.alert('Varsayılana dön', 'Özel kapak kaldırılsın mı? Lobi varsayılan Uzungöl görselini gösterir.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Kaldır',
        style: 'destructive',
        onPress: () =>
          void applyCover(null, 'Varsayılan lobi görseline dönüldü.'),
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back} accessibilityRole="button">
          <Ionicons name="chevron-back" size={22} color={adminTheme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Lobi kapak medyası</Text>
        <Text style={styles.sub}>
          Ana lobi arka planı. Resim veya video ekleyin — ikisi birlikte olmaz. Kaydettiğiniz anda tüm
          telefon ve web lobilerinde aynı boyutta güncellenir.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <AdminCard style={styles.card}>
          <Text style={styles.label}>Önizleme</Text>
          <View style={[styles.previewFrame, { width: previewW, height: previewH }]}>
            {loading ? (
              <ActivityIndicator color={adminTheme.colors.primary} />
            ) : cover?.mediaType === 'video' && cover.url ? (
              <Video
                key={cover.url}
                source={{ uri: cover.url }}
                style={styles.previewMedia}
                resizeMode={ResizeMode.COVER}
                isLooping
                isMuted
                shouldPlay
                useNativeControls={false}
              />
            ) : cover?.mediaType === 'image' && cover.url ? (
              <Image source={{ uri: cover.url }} style={styles.previewMedia} resizeMode="cover" />
            ) : (
              <Image source={DEFAULT_HERO} style={styles.previewMedia} resizeMode="cover" />
            )}
            <View style={styles.previewBadge}>
              <Text style={styles.previewBadgeText}>
                {cover?.mediaType === 'video'
                  ? 'Video'
                  : cover?.mediaType === 'image'
                    ? 'Görsel'
                    : 'Varsayılan'}
              </Text>
            </View>
          </View>

          {uploading ? (
            <View style={styles.uploadingRow}>
              <ActivityIndicator color={adminTheme.colors.primary} />
              <Text style={styles.uploadingText}>Yükleniyor…</Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionPrimary]}
              onPress={() => void pickImage()}
              disabled={uploading}
              activeOpacity={0.88}
            >
              <Ionicons name="image" size={20} color="#fff" />
              <Text style={styles.actionPrimaryText}>Resim ekle</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionSecondary]}
              onPress={() => void pickVideo()}
              disabled={uploading}
              activeOpacity={0.88}
            >
              <Ionicons name="videocam" size={20} color="#0f766e" />
              <Text style={styles.actionSecondaryText}>Video ekle</Text>
            </TouchableOpacity>
          </View>

          {cover ? (
            <TouchableOpacity
              style={styles.resetBtn}
              onPress={restoreDefault}
              disabled={uploading}
              activeOpacity={0.85}
            >
              <Ionicons name="refresh" size={18} color="#b91c1c" />
              <Text style={styles.resetText}>Varsayılan görsele dön</Text>
            </TouchableOpacity>
          ) : null}

          <Text style={styles.hint}>
            Video seçildiğinde mevcut resim kalkar; resim seçildiğinde video kalkar. Dikey (telefon)
            kadraj önerilir — lobi tam ekran kaplar.
          </Text>
        </AdminCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'web' ? 16 : 8,
    paddingBottom: 8,
  },
  back: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: adminTheme.colors.text,
  },
  sub: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: adminTheme.colors.textSecondary,
  },
  scroll: {
    padding: 16,
    paddingBottom: 48,
  },
  card: {
    padding: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  previewFrame: {
    alignSelf: 'center',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewMedia: {
    width: '100%',
    height: '100%',
  },
  previewBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(15,23,42,0.72)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  previewBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    justifyContent: 'center',
  },
  uploadingText: {
    color: '#64748b',
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  actionPrimary: {
    backgroundColor: '#0f766e',
  },
  actionPrimaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  actionSecondary: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#99f6e4',
  },
  actionSecondaryText: {
    color: '#0f766e',
    fontWeight: '700',
    fontSize: 15,
  },
  resetBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  resetText: {
    color: '#b91c1c',
    fontWeight: '600',
    fontSize: 14,
  },
  hint: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 18,
    color: '#94a3b8',
  },
});
