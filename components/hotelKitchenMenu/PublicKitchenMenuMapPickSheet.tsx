import { useCallback, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  TextInput,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CustomerMapPicker from '@/components/CustomerMapPicker';
import { menuUi } from '@/components/hotelKitchenMenu/hotelKitchenMenuUi';
import { HOTEL_LAT, HOTEL_LON } from '@/lib/diningVenueMapHelpers';

export type PublicMenuLocationPick = {
  lat: number;
  lng: number;
  address: string;
};

type Props = {
  visible: boolean;
  initial?: PublicMenuLocationPick | null;
  onClose: () => void;
  onConfirm: (pick: PublicMenuLocationPick) => void;
};

export function PublicKitchenMenuMapPickSheet({ visible, initial, onClose, onConfirm }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [center, setCenter] = useState({
    lat: initial?.lat ?? HOTEL_LAT,
    lng: initial?.lng ?? HOTEL_LON,
  });
  const [detail, setDetail] = useState(initial?.address ?? '');
  const lastRef = useRef(center);

  const onRegion = useCallback((c: { lat: number; lng: number }) => {
    lastRef.current = c;
    setCenter(c);
  }, []);

  const confirm = () => {
    const c = lastRef.current;
    const address = detail.trim() || `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`;
    onConfirm({ lat: c.lat, lng: c.lng, address });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('publicKitchenMenuPickLocation')}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={menuUi.webMuted} />
            </Pressable>
          </View>
          <Text style={styles.hint}>{t('publicKitchenMenuPickLocationHint')}</Text>
          <View style={styles.mapWrap}>
            <CustomerMapPicker
              latitude={center.lat}
              longitude={center.lng}
              initialLat={center.lat}
              initialLng={center.lng}
              onRegionChange={onRegion}
              style={{ width: '100%', height: '100%' }}
            />
          </View>
          <Text style={styles.fieldLabel}>{t('publicKitchenMenuLocationDetail')}</Text>
          <TextInput
            style={styles.detailInput}
            value={detail}
            onChangeText={setDetail}
            placeholder={t('publicKitchenMenuLocationDetailPh')}
            placeholderTextColor={menuUi.webMuted}
            multiline
          />
          <TouchableOpacity style={styles.btn} onPress={confirm}>
            <Text style={styles.btnText}>{t('confirm')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
    maxHeight: '92%',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: 18, fontWeight: '800', color: menuUi.navy },
  hint: { fontSize: 13, color: menuUi.webMuted, marginBottom: 10, lineHeight: 18 },
  mapWrap: { height: 280, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: menuUi.border },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: menuUi.webMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 12,
    marginBottom: 6,
  },
  detailInput: {
    borderWidth: 1,
    borderColor: menuUi.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: menuUi.webText,
    backgroundColor: menuUi.warmBg,
    minHeight: 72,
    textAlignVertical: 'top',
    marginBottom: 12,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  btn: {
    backgroundColor: menuUi.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: { color: menuUi.navy, fontSize: 15, fontWeight: '800' },
});
