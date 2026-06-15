import { View, Text, StyleSheet, Modal, Pressable, TouchableOpacity } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { profileScreenTheme as P } from '@/constants/profileScreenTheme';
import { staffProfileDeepLink } from '@/lib/profileShare';

type Props = {
  visible: boolean;
  onClose: () => void;
  staffId: string;
  fullName: string;
  positionLine?: string | null;
  organizationName?: string | null;
  viewer?: 'staff' | 'customer';
};

export function ProfileQrCardModal({
  visible,
  onClose,
  staffId,
  fullName,
  positionLine,
  organizationName,
  viewer = 'staff',
}: Props) {
  const { t } = useTranslation();
  const link = staffProfileDeepLink(staffId, viewer);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.brand}>VALORIA HOTEL</Text>
          <Text style={styles.name}>{fullName || '—'}</Text>
          {positionLine ? <Text style={styles.sub}>{positionLine}</Text> : null}
          {organizationName ? <Text style={styles.org}>{organizationName}</Text> : null}
          <View style={styles.qrWrap}>
            <QRCode value={link} size={200} />
          </View>
          <Text style={styles.hint}>{t('modernProfileQrHint')}</Text>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.85}>
            <Ionicons name="close" size={20} color={P.text} />
            <Text style={styles.closeText}>{t('close')}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: P.card,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: P.border,
  },
  brand: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    color: P.accent.blue,
  },
  name: { fontSize: 22, fontWeight: '800', color: P.text, marginTop: 8, textAlign: 'center' },
  sub: { fontSize: 14, color: P.subtext, marginTop: 4, textAlign: 'center' },
  org: { fontSize: 13, fontWeight: '600', color: P.accent.blue, marginTop: 2 },
  qrWrap: {
    marginTop: 20,
    padding: 14,
    backgroundColor: '#fff',
    borderRadius: 16,
  },
  hint: { fontSize: 12, color: P.subtext, marginTop: 14, textAlign: 'center', lineHeight: 18 },
  closeBtn: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: P.cardMuted,
  },
  closeText: { fontSize: 14, fontWeight: '600', color: P.text },
});
