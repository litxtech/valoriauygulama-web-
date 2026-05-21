import { BreakfastPhotoLightbox } from '@/components/BreakfastPhotoLightbox';

type Props = {
  visible: boolean;
  urls: string[];
  initialIndex?: number;
  onClose: () => void;
};

/** Tam ekran yemek fotoğrafı — boşluğa veya ✕ ile kapanır. */
export function HotelKitchenMenuImageLightbox({ visible, urls, initialIndex = 0, onClose }: Props) {
  return (
    <BreakfastPhotoLightbox
      visible={visible}
      urls={urls}
      initialIndex={initialIndex}
      onClose={onClose}
      accentColor="#fff"
    />
  );
}
