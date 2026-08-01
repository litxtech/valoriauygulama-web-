import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  Switch,
  Platform,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import { QrHubSection } from '@/components/admin/QrHubSection';
import {
  addQrPageMediaBlock,
  addQrPageTextBlock,
  buildPublicQrPageUrl,
  deleteQrPage,
  deleteQrPageBlock,
  fetchQrPage,
  listQrPageBlocks,
  reorderQrPageBlocks,
  updateQrPage,
  updateQrPageTextBlock,
  type QrPageBlockRow,
  type QrPageRow,
} from '@/lib/qrPages';

export default function AdminQrPageEditScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const pageId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] ?? '' : '';

  const [page, setPage] = useState<QrPageRow | null>(null);
  const [blocks, setBlocks] = useState<QrPageBlockRow[]>([]);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [textDraft, setTextDraft] = useState('');
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');

  const publicUrl = useMemo(
    () => (page ? buildPublicQrPageUrl(page.public_token) : ''),
    [page]
  );

  const load = useCallback(async () => {
    if (!pageId) return;
    const [pageRes, blocksRes] = await Promise.all([fetchQrPage(pageId), listQrPageBlocks(pageId)]);
    if (pageRes.error) Alert.alert('Hata', pageRes.error);
    if (blocksRes.error) Alert.alert('Hata', blocksRes.error);
    setPage(pageRes.data);
    setTitle(pageRes.data?.title ?? '');
    setBlocks(blocksRes.data);
  }, [pageId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load().finally(() => setLoading(false));
    }, [load])
  );

  const saveMeta = async () => {
    if (!page) return;
    setSaving(true);
    try {
      const { error } = await updateQrPage(page.id, { title: title.trim() || 'Yeni sayfa' });
      if (error) Alert.alert('Hata', error);
      else {
        setPage({ ...page, title: title.trim() || 'Yeni sayfa' });
        Alert.alert('Kaydedildi', 'Başlık güncellendi.');
      }
    } finally {
      setSaving(false);
    }
  };

  const togglePublished = async (value: boolean) => {
    if (!page) return;
    const { error } = await updateQrPage(page.id, { is_published: value });
    if (error) {
      Alert.alert('Hata', error);
      return;
    }
    setPage({ ...page, is_published: value });
  };

  const nextSort = () => (blocks.length ? Math.max(...blocks.map((b) => b.sort_order)) + 1 : 0);

  const addText = async () => {
    if (!page) return;
    const { data, error } = await addQrPageTextBlock(page.id, textDraft, nextSort());
    if (error) {
      Alert.alert('Hata', error);
      return;
    }
    if (data) setBlocks((prev) => [...prev, data]);
    setTextDraft('');
  };

  const pickMedia = async (kind: 'image' | 'video') => {
    if (!page) return;
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes:
        kind === 'image' ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.Videos,
      quality: kind === 'image' ? 0.9 : 0.85,
      allowsEditing: false,
      videoMaxDuration: kind === 'video' ? 120 : undefined,
    });
    if (picked.canceled || !picked.assets?.[0]?.uri) return;
    setUploading(true);
    try {
      const { data, error } = await addQrPageMediaBlock({
        pageId: page.id,
        organizationId: page.organization_id,
        blockType: kind,
        uri: picked.assets[0].uri,
        sortOrder: nextSort(),
      });
      if (error) Alert.alert('Hata', error);
      else if (data) setBlocks((prev) => [...prev, data]);
    } finally {
      setUploading(false);
    }
  };

  const removeBlock = (block: QrPageBlockRow) => {
    Alert.alert('Bloğu sil', 'Bu içerik silinsin mi?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const { error } = await deleteQrPageBlock(block.id, pageId);
            if (error) Alert.alert('Hata', error);
            else setBlocks((prev) => prev.filter((b) => b.id !== block.id));
          })();
        },
      },
    ]);
  };

  const moveBlock = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    const tmp = next[index];
    next[index] = next[target];
    next[target] = tmp;
    setBlocks(next);
    const { error } = await reorderQrPageBlocks(
      pageId,
      next.map((b) => b.id)
    );
    if (error) {
      Alert.alert('Hata', error);
      await load();
    }
  };

  const saveEditText = async () => {
    if (!editingBlockId) return;
    const { error } = await updateQrPageTextBlock(editingBlockId, pageId, editBody);
    if (error) {
      Alert.alert('Hata', error);
      return;
    }
    setBlocks((prev) =>
      prev.map((b) => (b.id === editingBlockId ? { ...b, body: editBody.trim() } : b))
    );
    setEditingBlockId(null);
    setEditBody('');
  };

  const confirmDeletePage = () => {
    Alert.alert('Sayfayı sil', 'QR adresi de geçersiz olur. Emin misiniz?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const { error } = await deleteQrPage(pageId);
            if (error) Alert.alert('Hata', error);
            else router.replace('/admin/qr-pages');
          })();
        },
      },
    ]);
  };

  const copyUrl = async () => {
    if (!publicUrl) return;
    await Clipboard.setStringAsync(publicUrl);
    Alert.alert('Kopyalandı', publicUrl);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a365d" />
      </View>
    );
  }

  if (!page) {
    return (
      <View style={styles.centered}>
        <Text style={styles.missing}>Sayfa bulunamadı.</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.link}>Geri</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.metaCard}>
        <Text style={styles.label}>Başlık</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} />
        <TouchableOpacity
          style={[styles.primaryBtn, saving && styles.disabled]}
          onPress={() => void saveMeta()}
          disabled={saving}
        >
          <Text style={styles.primaryBtnText}>{saving ? 'Kaydediliyor…' : 'Başlığı kaydet'}</Text>
        </TouchableOpacity>

        <View style={styles.publishRow}>
          <Text style={styles.publishLabel}>Yayında (QR açılır)</Text>
          <Switch value={page.is_published} onValueChange={(v) => void togglePublished(v)} />
        </View>

        <TouchableOpacity style={styles.urlRow} onPress={() => void copyUrl()} activeOpacity={0.85}>
          <Ionicons name="link-outline" size={18} color="#0f766e" />
          <Text style={styles.urlText} numberOfLines={2}>
            {publicUrl}
          </Text>
          <Ionicons name="copy-outline" size={18} color="#64748b" />
        </TouchableOpacity>
      </View>

      <QrHubSection
        variant="general"
        title="QR kod"
        description="Misafir tarayınca otomatik web sayfası açılır. İçeriği aşağıdan düzenleyin."
        url={publicUrl}
        urlLabel="Sayfa adresi"
      />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>İçerik ekle</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={textDraft}
          onChangeText={setTextDraft}
          placeholder="Metin bloğu yazın…"
          multiline
          textAlignVertical="top"
        />
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => void addText()}>
          <Ionicons name="text-outline" size={18} color="#1a365d" />
          <Text style={styles.secondaryBtnText}>Metin ekle</Text>
        </TouchableOpacity>
        <View style={styles.mediaRow}>
          <TouchableOpacity
            style={[styles.mediaBtn, uploading && styles.disabled]}
            onPress={() => void pickMedia('image')}
            disabled={uploading}
          >
            <Ionicons name="image-outline" size={18} color="#fff" />
            <Text style={styles.mediaBtnText}>Resim</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.mediaBtn, styles.mediaBtnAlt, uploading && styles.disabled]}
            onPress={() => void pickMedia('video')}
            disabled={uploading}
          >
            <Ionicons name="videocam-outline" size={18} color="#fff" />
            <Text style={styles.mediaBtnText}>Video</Text>
          </TouchableOpacity>
        </View>
        {uploading ? (
          <View style={styles.uploadHint}>
            <ActivityIndicator color="#0f766e" />
            <Text style={styles.uploadHintText}>Yükleniyor…</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Bloklar ({blocks.length})</Text>
        {blocks.length === 0 ? (
          <Text style={styles.empty}>Henüz blok yok. Metin, resim veya video ekleyin.</Text>
        ) : (
          blocks.map((block, index) => (
            <View key={block.id} style={styles.blockCard}>
              <View style={styles.blockHeader}>
                <Text style={styles.blockType}>
                  {block.block_type === 'text'
                    ? 'Metin'
                    : block.block_type === 'image'
                      ? 'Resim'
                      : 'Video'}
                </Text>
                <View style={styles.blockActions}>
                  <TouchableOpacity onPress={() => void moveBlock(index, -1)} hitSlop={8}>
                    <Ionicons name="arrow-up" size={18} color="#64748b" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => void moveBlock(index, 1)} hitSlop={8}>
                    <Ionicons name="arrow-down" size={18} color="#64748b" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => removeBlock(block)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color="#b91c1c" />
                  </TouchableOpacity>
                </View>
              </View>

              {block.block_type === 'text' ? (
                editingBlockId === block.id ? (
                  <View style={{ gap: 8 }}>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      value={editBody}
                      onChangeText={setEditBody}
                      multiline
                      textAlignVertical="top"
                    />
                    <View style={styles.editRow}>
                      <TouchableOpacity
                        style={styles.secondaryBtn}
                        onPress={() => {
                          setEditingBlockId(null);
                          setEditBody('');
                        }}
                      >
                        <Text style={styles.secondaryBtnText}>Vazgeç</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.primaryBtn} onPress={() => void saveEditText()}>
                        <Text style={styles.primaryBtnText}>Kaydet</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => {
                      setEditingBlockId(block.id);
                      setEditBody(block.body ?? '');
                    }}
                  >
                    <Text style={styles.blockBody}>{block.body}</Text>
                  </TouchableOpacity>
                )
              ) : null}

              {block.block_type === 'image' && block.media_url ? (
                <Image source={{ uri: block.media_url }} style={styles.previewImage} resizeMode="cover" />
              ) : null}

              {block.block_type === 'video' && block.media_url ? (
                Platform.OS === 'web' ? (
                  <View style={styles.previewVideoWrap}>
                    {React.createElement('video', {
                      src: block.media_url,
                      controls: true,
                      style: { width: '100%', height: 180, backgroundColor: '#0f172a' },
                    })}
                  </View>
                ) : (
                  <Video
                    style={styles.previewVideo}
                    source={{ uri: block.media_url }}
                    useNativeControls
                    resizeMode={ResizeMode.CONTAIN}
                  />
                )
              ) : null}
            </View>
          ))
        )}
      </View>

      <TouchableOpacity style={styles.dangerBtn} onPress={confirmDeletePage}>
        <Ionicons name="trash-outline" size={18} color="#fff" />
        <Text style={styles.dangerBtnText}>Sayfayı sil</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

import React from 'react';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 16, paddingBottom: 48, gap: 14 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9' },
  missing: { color: '#64748b', marginBottom: 12 },
  link: { color: '#1a365d', fontWeight: '700' },
  metaCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  label: { fontSize: 12, fontWeight: '700', color: '#475569' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  textArea: { minHeight: 96 },
  primaryBtn: {
    backgroundColor: '#1a365d',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '800' },
  disabled: { opacity: 0.7 },
  publishRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  publishLabel: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  urlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ecfdf5',
    borderRadius: 10,
    padding: 10,
  },
  urlText: { flex: 1, fontSize: 12, color: '#065f46' },
  section: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingVertical: 11,
    backgroundColor: '#f8fafc',
  },
  secondaryBtnText: { color: '#1a365d', fontWeight: '800' },
  mediaRow: { flexDirection: 'row', gap: 10 },
  mediaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0f766e',
    borderRadius: 10,
    paddingVertical: 12,
  },
  mediaBtnAlt: { backgroundColor: '#7c3aed' },
  mediaBtnText: { color: '#fff', fontWeight: '800' },
  uploadHint: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  uploadHintText: { color: '#64748b', fontSize: 13 },
  empty: { color: '#64748b', fontSize: 14 },
  blockCard: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#f8fafc',
    gap: 10,
  },
  blockHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  blockType: { fontSize: 12, fontWeight: '900', color: '#0f766e', textTransform: 'uppercase' },
  blockActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  blockBody: { color: '#334155', fontSize: 15, lineHeight: 22 },
  editRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  previewImage: { width: '100%', height: 180, borderRadius: 10, backgroundColor: '#e2e8f0' },
  previewVideo: { width: '100%', height: 180, borderRadius: 10, backgroundColor: '#0f172a' },
  previewVideoWrap: { borderRadius: 10, overflow: 'hidden' },
  dangerBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#b91c1c',
    borderRadius: 10,
    paddingVertical: 13,
  },
  dangerBtnText: { color: '#fff', fontWeight: '800' },
});
