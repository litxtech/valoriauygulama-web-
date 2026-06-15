import { TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { CachedImage } from '@/components/CachedImage';
import { expenseReceiptPreviewStyle, expenseReceiptPreviewCompactStyle } from '@/lib/expenseReceiptPreviewStyles';

type Props = {
  uri: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Liste tablosu gibi dar alanlarda */
  compact?: boolean;
};

/** Orta boy fiş önizlemesi — dokunulabilir veya salt görüntü */
export function ExpenseReceiptThumbnail({ uri, onPress, style, compact }: Props) {
  const imageStyle = compact ? expenseReceiptPreviewCompactStyle : expenseReceiptPreviewStyle;
  const image = (
    <CachedImage uri={uri} style={imageStyle} contentFit="cover" recyclingKey={uri} />
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.88} style={style} accessibilityRole="button">
        {image}
      </TouchableOpacity>
    );
  }

  return <View style={style}>{image}</View>;
}
