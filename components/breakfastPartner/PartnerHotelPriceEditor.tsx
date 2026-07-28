import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  fmtPartnerMoney,
  listPartnerHotels,
  updatePartnerHotelUnitPrice,
  PARTNER_STATUS_LABELS,
  type BreakfastPartnerHotel,
} from '@/lib/breakfastPartner';
import { updatePartnerHotelLaundryUnitPrice } from '@/lib/breakfastPartnerLaundry';
import { notifyPartnerPriceChanged } from '@/lib/breakfastPartnerNotify';
import { partnerTheme } from '@/lib/breakfastPartnerTheme';

type PriceRow = {
  hotel: BreakfastPartnerHotel;
  breakfastInput: string;
  laundryInput: string;
  loadedBreakfast: number | null;
  loadedLaundry: number | null;
};

function parsePriceInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = parseFloat(trimmed.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

type Props = {
  organizationId: string;
  defaultUnitPrice: number;
  defaultLaundryUnitPrice: number;
  onSaved?: () => void;
};

export function PartnerHotelPriceEditor({
  organizationId,
  defaultUnitPrice,
  defaultLaundryUnitPrice,
  onSaved,
}: Props) {
  const [rows, setRows] = useState<PriceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const hotels = await listPartnerHotels(organizationId);
      setRows(
        hotels.map((h) => ({
          hotel: h,
          breakfastInput: h.unit_price != null && h.unit_price > 0 ? String(h.unit_price) : '',
          laundryInput:
            h.laundry_unit_price != null && h.laundry_unit_price > 0 ? String(h.laundry_unit_price) : '',
          loadedBreakfast: h.unit_price != null && h.unit_price > 0 ? h.unit_price : null,
          loadedLaundry:
            h.laundry_unit_price != null && h.laundry_unit_price > 0 ? h.laundry_unit_price : null,
        }))
      );
    } catch (e) {
      Alert.alert('Hata', (e as Error).message || 'Oteller yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const changedRows = useMemo(
    () =>
      rows.filter((r) => {
        const nextB = parsePriceInput(r.breakfastInput);
        const nextL = parsePriceInput(r.laundryInput);
        const breakfastChanged =
          (r.loadedBreakfast == null && nextB != null) ||
          (r.loadedBreakfast != null && nextB == null) ||
          (r.loadedBreakfast != null && nextB != null && Math.abs(r.loadedBreakfast - nextB) > 0.001);
        const laundryChanged =
          (r.loadedLaundry == null && nextL != null) ||
          (r.loadedLaundry != null && nextL == null) ||
          (r.loadedLaundry != null && nextL != null && Math.abs(r.loadedLaundry - nextL) > 0.001);
        return breakfastChanged || laundryChanged;
      }),
    [rows]
  );

  const setBreakfastInput = (hotelId: string, value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.hotel.id === hotelId ? { ...r, breakfastInput: value } : r))
    );
  };

  const setLaundryInput = (hotelId: string, value: string) => {
    setRows((prev) => prev.map((r) => (r.hotel.id === hotelId ? { ...r, laundryInput: value } : r)));
  };

  const saveAll = async () => {
    if (changedRows.length === 0) {
      Alert.alert('Bilgi', 'Değişiklik yok.');
      return;
    }
    for (const row of changedRows) {
      if (row.breakfastInput.trim() && parsePriceInput(row.breakfastInput) == null) {
        Alert.alert('Hata', `${row.hotel.name} için geçerli kahvaltı fiyatı girin veya boş bırakın.`);
        return;
      }
      if (row.laundryInput.trim() && parsePriceInput(row.laundryInput) == null) {
        Alert.alert('Hata', `${row.hotel.name} için geçerli çamaşır fiyatı girin veya boş bırakın.`);
        return;
      }
    }

    setSaving(true);
    let notifyCount = 0;
    try {
      for (const row of changedRows) {
        const nextBreakfast = parsePriceInput(row.breakfastInput);
        const nextLaundry = parsePriceInput(row.laundryInput);
        const errB = await updatePartnerHotelUnitPrice(row.hotel.id, nextBreakfast);
        if (errB) throw new Error(`${row.hotel.name}: ${errB}`);
        const errL = await updatePartnerHotelLaundryUnitPrice(row.hotel.id, nextLaundry);
        if (errL) throw new Error(`${row.hotel.name}: ${errL}`);
        if (
          nextBreakfast != null &&
          row.hotel.status === 'active' &&
          nextBreakfast !== row.loadedBreakfast
        ) {
          await notifyPartnerPriceChanged({
            partnerHotelId: row.hotel.id,
            hotelName: row.hotel.name,
            unitPrice: nextBreakfast,
          });
          notifyCount += 1;
        }
      }
      const msg =
        notifyCount > 0
          ? `${changedRows.length} otel fiyatı kaydedildi. ${notifyCount} partnere bildirim gönderildi.`
          : `${changedRows.length} otel fiyatı kaydedildi.`;
      Alert.alert('Kaydedildi', msg);
      await load();
      onSaved?.();
    } catch (e) {
      Alert.alert('Hata', (e as Error).message || 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <ActivityIndicator color={partnerTheme.accent} style={{ marginTop: 16 }} />;
  }

  if (rows.length === 0) {
    return <Text style={styles.empty}>Henüz partner otel yok.</Text>;
  }

  return (
    <View>
      <Text style={styles.hint}>
        Kahvaltı ve çamaşır birim fiyatlarını otel bazında ayarlayın. Boş = org varsayılanı (
        {fmtPartnerMoney(defaultUnitPrice)}/kişi · {fmtPartnerMoney(defaultLaundryUnitPrice)}/çamaşır).
      </Text>

      {rows.map((row) => {
        const customB = parsePriceInput(row.breakfastInput);
        const customL = parsePriceInput(row.laundryInput);
        const effectiveB = customB ?? defaultUnitPrice;
        const effectiveL = customL ?? defaultLaundryUnitPrice;
        return (
          <View key={row.hotel.id} style={styles.row}>
            <View style={styles.rowHead}>
              <Text style={styles.hotelName} numberOfLines={1}>
                {row.hotel.name}
              </Text>
              <Text style={styles.status}>{PARTNER_STATUS_LABELS[row.hotel.status]}</Text>
            </View>
            <Text style={styles.fieldLbl}>Kahvaltı ₺/kişi</Text>
            <View style={styles.rowInput}>
              <TextInput
                style={styles.input}
                value={row.breakfastInput}
                onChangeText={(v) => setBreakfastInput(row.hotel.id, v)}
                keyboardType="decimal-pad"
                placeholder={String(defaultUnitPrice || '0')}
                placeholderTextColor={partnerTheme.mutedSoft}
              />
              <Text style={styles.suffix}>₺</Text>
            </View>
            <Text style={styles.effective}>
              Geçerli kahvaltı: {fmtPartnerMoney(effectiveB)}
              {customB != null ? ' · özel' : ' · varsayılan'}
            </Text>
            <Text style={[styles.fieldLbl, { marginTop: 8 }]}>Çamaşır ₺/birim</Text>
            <View style={styles.rowInput}>
              <TextInput
                style={styles.input}
                value={row.laundryInput}
                onChangeText={(v) => setLaundryInput(row.hotel.id, v)}
                keyboardType="decimal-pad"
                placeholder={String(defaultLaundryUnitPrice || '0')}
                placeholderTextColor={partnerTheme.mutedSoft}
              />
              <Text style={styles.suffix}>₺</Text>
            </View>
            <Text style={styles.effective}>
              Geçerli çamaşır: {fmtPartnerMoney(effectiveL)}
              {customL != null ? ' · özel' : ' · varsayılan'}
            </Text>
          </View>
        );
      })}

      <TouchableOpacity
        style={[styles.btn, (saving || changedRows.length === 0) && styles.btnDisabled]}
        onPress={() => void saveAll()}
        disabled={saving || changedRows.length === 0}
      >
        {saving ? (
          <ActivityIndicator color="#0f172a" />
        ) : (
          <Text style={styles.btnText}>
            {changedRows.length > 0 ? `${changedRows.length} değişikliği kaydet` : 'Kaydet'}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { color: partnerTheme.muted, fontSize: 13, lineHeight: 20, marginBottom: 12 },
  empty: { color: partnerTheme.muted, textAlign: 'center', marginTop: 12 },
  row: {
    marginBottom: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: partnerTheme.card,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
  },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  hotelName: { flex: 1, color: partnerTheme.text, fontWeight: '700', fontSize: 15 },
  status: { color: partnerTheme.muted, fontSize: 12 },
  fieldLbl: { color: partnerTheme.muted, fontSize: 11, fontWeight: '700', marginBottom: 4 },
  rowInput: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: partnerTheme.text,
    backgroundColor: partnerTheme.bg,
  },
  suffix: { color: partnerTheme.muted, fontWeight: '700' },
  effective: { color: partnerTheme.muted, fontSize: 12, marginTop: 6 },
  btn: {
    marginTop: 8,
    backgroundColor: partnerTheme.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#0f172a', fontWeight: '800' },
});
