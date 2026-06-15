import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { BUBBLE_COLOR_OPTIONS, getContrastTextColor } from '@/stores/messagingBubbleStore';

type Props = {
  visible: boolean;
  onClose: () => void;
  selectedColor: string;
  onSelectColor: (color: string) => void;
  title: string;
  accentColor?: string;
  surfaceColor?: string;
  textColor?: string;
};

export function BubbleColorPickerModal({
  visible,
  onClose,
  selectedColor,
  onSelectColor,
  title,
  accentColor = '#C5A059',
  surfaceColor = '#FFFFFF',
  textColor = '#1F2937',
}: Props) {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} style={styles.overlay} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={[styles.box, { backgroundColor: surfaceColor }]}>
          <Text style={[styles.title, { color: textColor }]}>{title}</Text>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.grid}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {BUBBLE_COLOR_OPTIONS.map((c) => {
              const selected = selectedColor === c;
              const checkColor = getContrastTextColor(c);
              return (
                <TouchableOpacity
                  key={c}
                  style={[styles.chip, { backgroundColor: c }, selected && { borderColor: accentColor }]}
                  onPress={() => onSelectColor(c)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  {selected ? <Ionicons name="checkmark" size={22} color={checkColor} /> : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={[styles.closeText, { color: accentColor }]}>{t('close')}</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  box: {
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 340,
    maxHeight: '72%',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  scroll: {
    maxHeight: 320,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    paddingBottom: 8,
  },
  chip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 24,
    marginTop: 8,
  },
  closeText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
