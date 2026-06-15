import React from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';

type ImagePreviewModalProps = {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
  /** Alt kısımda ek düğüm (ör. sil) */
  footer?: React.ReactNode;
};

/** Tam ekran resim önizlemesi — boşluğa, resme veya ✕ ile kapanır. */
export function ImagePreviewModal({ visible, uri, onClose, footer }: ImagePreviewModalProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  if (!uri) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={styles.overlay}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Kapat"
      >
        <CachedImage
          key={uri}
          uri={uri}
          style={{ width, height }}
          contentFit="contain"
          pointerEvents="none"
        />
        <View style={[styles.closeBtnWrap, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            activeOpacity={0.8}
            accessibilityLabel="Kapat"
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
        {footer ? (
          <View style={[styles.footerWrap, { paddingBottom: insets.bottom + 16 }]} pointerEvents="box-none">
            {footer}
          </View>
        ) : null}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    alignItems: 'flex-end',
    paddingRight: 16,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});
