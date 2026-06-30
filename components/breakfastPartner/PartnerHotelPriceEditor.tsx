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
import { notifyPartnerPriceChanged } from '@/lib/breakfastPartnerNotify';
import { partnerTheme } from '@/lib/breakfastPartnerTheme';

type PriceRow = {
  hotel: BreakfastPartnerHotel;
  input: string;
  loadedPrice: number | null;
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
  onSaved?: () => void;
};

export function PartnerHotelPriceEditor({ organizationId, defaultUnitPrice, onSaved }: Props) {
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
          input: h.unit_price != null && h.unit_price > 0 ? String(h.unit_price) : '',
          loadedPrice: h.unit_price != null && h.unit_price > 0 ? h.unit_price : null,
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
        const next = parsePriceInput(r.input);
        const prev = r.loadedPrice;
        if (prev == null && next == null) return false;
        if (prev == null || next == null) return prev !== next;
        return Math.abs(prev - next) > 0.001;
      }),
    [rows]
  );

  const setRowInput = (hotelId: string, value: string) => {
    setRows((prev) => prev.map((r) => (r.hotel.id === hotelId ? { ...r, input: value } : r)));
  };

  const saveAll = async () => {
    if (changedRows.length === 0) {
      Alert.alert('Bilgi', 'Değişiklik yok.');
      return;
    }
    for (const row of changedRows) {
      const parsed = parsePriceInput(row.input);
      if (row.input.trim() && parsed == null) {
        Alert.alert('Hata', `${row.hotel.name} için geçerli bir fiyat girin veya alanı boş bırakın.`);
        return;
      }
    }

    setSaving(true);
    let notifyCount = 0;
    try {
      for (const row of changedRows) {
        const nextPrice = parsePriceInput(row.input);
        const err = await updatePartnerHotelUnitPrice(row.hotel.id, nextPrice);
        if (err) throw new Error(`${row.hotel.name}: ${err}`);
        if (nextPrice != null && row.hotel.status === 'active' && nextPrice !== row.loadedPrice) {
          await notifyPartnerPriceChanged({
            partnerHotelId: row.hotel.id,
            hotelName: row.hotel.name,
            unitPrice: nextPrice,
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
        Her otel için özel kişi başı fiyat belirleyin. Boş bırakırsanız varsayılan fiyat (
        {fmtPartnerMoney(defaultUnitPrice)}/kişi) uygulanır.
      </Text>

      {rows.map((row) => {
        const customPrice = parsePriceInput(row.input);
        const effective = customPrice ?? defaultUnitPrice;
        const isCustom = customPrice != null;
        return (
          <View key={row.hotel.id} style={styles.row}>
            <View style={styles.rowHead}>
              <Text style={styles.hotelName} numberOfLines={1}>
                {row.hotel.name}
              </Text>
              <Text style={styles.status}>{PARTNER_STATUS_LABELS[row.hotel.status]}</Text>
            </View>
            <View style={styles.rowInput}>
              <TextInput
                style={styles.input}
                value={row.input}
                onChangeText={(v) => setRowInput(row.hotel.id, v)}
                keyboardType="decimal-pad"
                placeholder={String(defaultUnitPrice || '0')}
                placeholderTextColor={partnerTheme.mutedSoft}
              />
              <Text style={styles.suffix}>₺/kişi</Text>
            </View>
            <Text style={styles.effective}>
              Geçerli: {fmtPartnerMoney(effective)}
              {isCustom ? ' · özel fiyat' : ' · varsayılan'}
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
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  hotelName: { color: partnerTheme.text, fontWeight: '700', fontSize: 15, flex: 1 },
  status: { color: partnerTheme.muted, fontSize: 11, fontWeight: '600' },
  rowInput: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  input: {
    flex: 1,
    backgroundColor: partnerTheme.surfaceInput,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: partnerTheme.text,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
    fontSize: 16,
    fontWeight: '700',
  },
  suffix: { color: partnerTheme.muted, fontWeight: '600', fontSize: 13 },
  effective: { color: partnerTheme.mutedSoft, fontSize: 12, marginTop: 6 },
  btn: {
    marginTop: 8,
    backgroundColor: partnerTheme.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.45 },
  btnText: { color: '#0f172a', fontWeight: '800' },
});
