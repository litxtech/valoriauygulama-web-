import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import {
  buildDefaultBreakfastShareCaption,
  exportBreakfastConfirmation,
  publishBreakfastConfirmationToFeed,
  shareBreakfastConfirmationExternally,
  type BreakfastShareRecord,
} from '@/lib/breakfastConfirmShare';

type Props = {
  visible: boolean;
  record: BreakfastShareRecord | null;
  staffId: string | null;
  staffName: string;
  onClose: () => void;
  onFeedPublished?: () => void;
};

type BusyAction = 'print' | 'printer' | 'share' | 'feed' | null;

export function BreakfastConfirmShareSheet({
  visible,
  record,
  staffId,
  staffName,
  onClose,
  onFeedPublished,
}: Props) {
  const insets = useSafeAreaInsets();
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState<BusyAction>(null);

  useEffect(() => {
    if (visible && record) {
      setCaption(buildDefaultBreakfastShareCaption(record));
    }
  }, [visible, record?.id]);

  if (!record) return null;

  const urls = (record.photo_urls ?? []).filter(Boolean);
  const run = async (action: Exclude<BusyAction, null>, fn: () => Promise<void>) => {
    setBusy(action);
    try {
      await fn();
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'İşlem tamamlanamadı');
    } finally {
      setBusy(null);
    }
  };

  const onPrint = () =>
    run('print', async () => {
      await exportBreakfastConfirmation(record, 'print', caption);
    });

  const onPrinter = () =>
    run('printer', async () => {
      await exportBreakfastConfirmation(record, 'printer', caption);
    });

  const onShare = () =>
    run('share', async () => {
      await shareBreakfastConfirmationExternally(record, caption);
    });

  const onFeed = () => {
    if (!staffId) {
      Alert.alert('Hata', 'Oturum bulunamadı');
      return;
    }
    void run('feed', async () => {
      const res = await publishBreakfastConfirmationToFeed({
        record,
        staffId,
        staffName,
        caption,
      });
      if (!res.ok) {
        Alert.alert('Gönderilemedi', res.error ?? 'Gönderi paylaşılamadı');
        return;
      }
      Alert.alert('Paylaşıldı', 'Kahvaltı teyidi gönderi olarak yayınlandı.');
      onFeedPublished?.();
      onClose();
    });
  };

  const ActionBtn = ({
    icon,
    label,
    sub,
    color,
    action,
    onPress,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    sub: string;
    color: string;
    action: Exclude<BusyAction, null>;
    onPress: () => void;
  }) => (
    <TouchableOpacity
      style={styles.actionBtn}
      onPress={onPress}
      disabled={busy !== null}
      activeOpacity={0.85}
    >
      <View style={[styles.actionIcon, { backgroundColor: `${color}18` }]}>
        {busy === action ? (
          <ActivityIndicator color={color} size="small" />
        ) : (
          <Ionicons name={icon} size={22} color={color} />
        )}
      </View>
      <View style={styles.actionTextWrap}>
        <Text style={styles.actionLabel}>{label}</Text>
        <Text style={styles.actionSub}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Kahvaltı Teyidini Paylaş</Text>
          <Text style={styles.subtitle}>
            {record.staff?.full_name ?? '—'} · {record.record_date} · {record.guest_count} misafir
          </Text>

          {urls.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbScroll}>
              {urls.map((u, idx) => (
                <CachedImage
                  key={`${record.id}-share-${idx}`}
                  uri={u}
                  style={styles.thumb}
                  contentFit="cover"
                  recyclingKey={`bf-share-${record.id}-${idx}`}
                />
              ))}
            </ScrollView>
          ) : null}

          <Text style={styles.inputLabel}>Metin (WhatsApp, gönderi ve yazdırma)</Text>
          <TextInput
            style={styles.input}
            value={caption}
            onChangeText={setCaption}
            placeholder="Paylaşım metnini düzenleyin…"
            placeholderTextColor={theme.colors.textMuted}
            multiline
            textAlignVertical="top"
          />

          <ActionBtn
            icon="print-outline"
            label="Yazıcıya gönder"
            sub="Seçili yazıcı e-postasına PDF ilet"
            color="#0369a1"
            action="printer"
            onPress={onPrinter}
          />
          <ActionBtn
            icon="document-text-outline"
            label="Yazdır"
            sub="Cihaz yazıcısı veya PDF önizleme"
            color="#0f766e"
            action="print"
            onPress={onPrint}
          />
          <ActionBtn
            icon="share-social-outline"
            label="WhatsApp / Paylaş"
            sub={
              urls.length > 1
                ? 'Her fotoğraf ayrı ayrı, orijinal kalitede paylaşılır'
                : 'Fotoğraf ve metin ile harici paylaşım'
            }
            color="#16a34a"
            action="share"
            onPress={onShare}
          />
          <ActionBtn
            icon="images-outline"
            label="Gönderi olarak paylaş"
            sub="Uygulama içi feed'e fotoğraf ve metinle yayınla"
            color={theme.colors.primary}
            action="feed"
            onPress={onFeed}
          />

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.cancelText}>Vazgeç</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15, 23, 42, 0.5)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    maxHeight: '92%',
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#cbd5e1',
    alignSelf: 'center',
    marginBottom: 14,
  },
  title: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
  subtitle: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 4, marginBottom: 12 },
  thumbScroll: { marginBottom: 12, maxHeight: 88 },
  thumb: {
    width: 80,
    height: 80,
    borderRadius: 12,
    marginRight: 8,
    backgroundColor: theme.colors.borderLight,
  },
  inputLabel: { fontSize: 13, fontWeight: '600', color: theme.colors.text, marginBottom: 6 },
  input: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.colors.text,
    minHeight: 96,
    marginBottom: 12,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTextWrap: { flex: 1 },
  actionLabel: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  actionSub: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  cancelBtn: {
    marginTop: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  cancelText: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
});
