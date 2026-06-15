import { View, Text, StyleSheet, Modal, Pressable, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { profileScreenTheme as P } from '@/constants/profileScreenTheme';

export type ProfileMenuAction = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  destructive?: boolean;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  items: ProfileMenuAction[];
};

export function ProfileMenuSheet({ visible, onClose, items }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <ScrollView showsVerticalScrollIndicator={false}>
            {items.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.row}
                onPress={() => {
                  onClose();
                  item.onPress?.();
                }}
                disabled={item.disabled}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={item.icon}
                  size={22}
                  color={item.destructive ? '#dc2626' : P.text}
                />
                <Text style={[styles.label, item.destructive && styles.destructive]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: P.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 28,
    maxHeight: '72%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: P.border,
    marginTop: 10,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: P.border,
  },
  label: { fontSize: 16, fontWeight: '600', color: P.text, flex: 1 },
  destructive: { color: '#dc2626' },
});
