import { Modal, Pressable, StyleSheet, TouchableOpacity, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';

type Props = {
  visible: boolean;
  uri: string | null | undefined;
  onClose: () => void;
  onDelete?: () => void;
  deleteLabel?: string;
};

/** Tam ekran görsel — boşluğa basınca kapanır (profil fotoğrafı vb.) */
export function ImageLightboxModal({ visible, uri, onClose, onDelete, deleteLabel = 'Sil' }: Props) {
  if (!uri) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <CachedImage uri={uri} style={styles.image} contentFit="contain" pointerEvents="none" />
        {onDelete ? (
          <TouchableOpacity style={styles.deleteBtn} onPress={onDelete} activeOpacity={0.85}>
            <Ionicons name="trash-outline" size={16} color="#fff" />
            <Text style={styles.deleteText}>{deleteLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: { width: '92%', height: '72%' },
  deleteBtn: {
    position: 'absolute',
    bottom: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(220,38,38,0.9)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  deleteText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
