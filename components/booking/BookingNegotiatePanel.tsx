import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  listTotal: number | null;
  payableTotal: number | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  offerText: string;
  onOfferTextChange: (v: string) => void;
  note: string;
  onNoteChange: (v: string) => void;
};

function money(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${Math.round(n).toLocaleString('tr-TR')} ₺`;
}

/** Pazarlık paneli — teklif tutarı + kısa not */
export function BookingNegotiatePanel({
  listTotal,
  payableTotal,
  open,
  onOpenChange,
  offerText,
  onOfferTextChange,
  note,
  onNoteChange,
}: Props) {
  const floor = listTotal != null ? Math.ceil(listTotal * 0.4) : null;
  const ref = payableTotal ?? listTotal;

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={[styles.toggle, open && styles.toggleOn]}
        onPress={() => onOpenChange(!open)}
        activeOpacity={0.88}
      >
        <Ionicons name="chatbubbles-outline" size={18} color={open ? '#fff' : '#0f766e'} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.toggleTitle, open && styles.toggleTitleOn]}>Pazarlık yapmak istiyorum</Text>
          <Text style={[styles.toggleHint, open && styles.toggleHintOn]}>
            Teklifinizi yazın · admin onaylarsa hesabınıza bildirim gelir
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={open ? '#fff' : '#64748b'} />
      </TouchableOpacity>

      {open ? (
        <View style={styles.body}>
          <Text style={styles.ref}>
            Güncel tutar: {money(ref)}
            {listTotal != null && payableTotal != null && listTotal !== payableTotal
              ? ` (liste ${money(listTotal)})`
              : ''}
          </Text>
          <Text style={styles.label}>Teklif tutarınız (₺)</Text>
          <TextInput
            style={styles.input}
            value={offerText}
            onChangeText={(v) => onOfferTextChange(v.replace(/[^\d]/g, ''))}
            keyboardType="number-pad"
            placeholder={ref != null ? String(Math.round(ref * 0.85)) : 'Örn. 4500'}
            placeholderTextColor="#98a2b3"
          />
          {floor != null ? (
            <Text style={styles.floorHint}>En düşük kabul edilebilir teklif yaklaşık {money(floor)}</Text>
          ) : null}
          <Text style={styles.label}>Not (isteğe bağlı)</Text>
          <TextInput
            style={[styles.input, styles.note]}
            value={note}
            onChangeText={onNoteChange}
            placeholder="Kısa bir not yazabilirsiniz"
            placeholderTextColor="#98a2b3"
            multiline
          />
          <View style={styles.info}>
            <Ionicons name="phone-portrait-outline" size={16} color="#0f766e" />
            <Text style={styles.infoText}>
              Teklif sonrası hesabınız otomatik açılır. Web’den yapıyorsanız uygulamayı indirmeniz
              istenir (Android: Google Play, iPhone: App Store). Onay bildirimi uygulamaya gelir.
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 14, gap: 10 },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ecfdf5',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,118,110,0.22)',
  },
  toggleOn: { backgroundColor: '#0f766e', borderColor: '#0f766e' },
  toggleTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  toggleTitleOn: { color: '#fff' },
  toggleHint: { fontSize: 11, fontWeight: '600', color: '#64748b', marginTop: 2 },
  toggleHintOn: { color: 'rgba(255,255,255,0.78)' },
  body: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(11,18,32,0.08)',
    gap: 6,
  },
  ref: { fontSize: 13, fontWeight: '700', color: '#0f766e', marginBottom: 4 },
  label: { fontSize: 12, fontWeight: '700', color: '#64748b', marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(11,18,32,0.08)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 16,
    fontWeight: '700',
    color: '#0b1220',
    backgroundColor: '#f8faf9',
  },
  note: { minHeight: 64, textAlignVertical: 'top', fontWeight: '500', fontSize: 14 },
  floorHint: { fontSize: 11, fontWeight: '600', color: '#94a3b8' },
  info: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 8,
    backgroundColor: '#ecfdf5',
    borderRadius: 12,
    padding: 10,
  },
  infoText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#0f766e', lineHeight: 17 },
});
