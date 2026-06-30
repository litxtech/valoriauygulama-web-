import { useCallback, useEffect, useState } from 'react';
import { TextInput, type TextInputProps, type StyleProp, type TextStyle } from 'react-native';

type Props = Omit<TextInputProps, 'multiline' | 'scrollEnabled' | 'textAlignVertical'> & {
  minHeight?: number;
  lineHeight?: number;
  style?: StyleProp<TextStyle>;
};

/** Multiline input that grows with content; parent ScrollView handles vertical scroll. */
export function AutoGrowMultilineInput({
  value,
  minHeight = 180,
  lineHeight = 21,
  style,
  onContentSizeChange,
  ...rest
}: Props) {
  const verticalPad = 24;
  const [height, setHeight] = useState(minHeight);

  const applyHeight = useCallback(
    (contentHeight: number) => {
      setHeight(Math.max(minHeight, Math.ceil(contentHeight + verticalPad)));
    },
    [minHeight],
  );

  useEffect(() => {
    const text = value ?? '';
    if (!text.trim()) {
      setHeight(minHeight);
      return;
    }
    const lines = text.split('\n').length;
    const wrapped = Math.ceil(text.length / 44);
    applyHeight(Math.max(lines, wrapped) * lineHeight);
  }, [value, minHeight, lineHeight, applyHeight]);

  return (
    <TextInput
      {...rest}
      value={value}
      multiline
      scrollEnabled={false}
      textAlignVertical="top"
      onContentSizeChange={(e) => {
        onContentSizeChange?.(e);
        applyHeight(e.nativeEvent.contentSize.height);
      }}
      style={[style, { minHeight, height }]}
    />
  );
}
