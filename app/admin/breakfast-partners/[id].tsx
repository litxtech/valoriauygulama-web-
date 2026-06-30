import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BreakfastPartnerAdminGate } from '@/components/breakfastPartner/BreakfastPartnerAdminGate';
import {
  fetchPartnerHotel,
  fetchPartnerOpenBalance,
  fmtPartnerMoney,
  formatPartnerDate,
  listOrgPartnerDailyEntries,
  resolveEffectiveUnitPrice,
  updatePartnerHotel,
  adminSetPartnerStatus,
  PARTNER_STATUS_LABELS,
  type BreakfastPartnerHotelStatus,
} from '@/lib/breakfastPartner';
import {
  notifyPartnerHotelApproved,
  notifyPartnerPriceChanged,
  notifyPartnerStatusSuspended,
} from '@/lib/breakfastPartnerNotify';
import { partnerTheme } from '@/lib/breakfastPartnerTheme';
import { PartnerReportExportButtons } from '@/components/breakfastPartner/PartnerReportExportButtons';
import { loadAdminPartnerActivityReport } from '@/lib/breakfastPartnerReportPdf';

export default function AdminBreakfastPartnerDetailScreen() {
  return (
    <BreakfastPartnerAdminGate>
      <AdminBreakfastPartnerDetail />
    </BreakfastPartnerAdminGate>
  );
}

function AdminBreakfastPartnerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openBalance, setOpenBalance] = useState(0);
  const [unitPrice, setUnitPrice] = useState('');
  const [status, setStatus] = useState<BreakfastPartnerHotelStatus>('active');
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [taxId, setTaxId] = useState('');
  const [taxOffice, setTaxOffice] = useState('');
  const [iban, setIban] = useState('');
  const [notes, setNotes] = useState('');
  const [entries, setEntries] = useState<Awaited<ReturnType<typeof listOrgPartnerDailyEntries>>>([]);
  const [hotelOrgId, setHotelOrgId] = useState('');
  const [counterpartyId, setCounterpartyId] = useState('');
  const [effectivePrice, setEffectivePrice] = useState(0);
  const [loadedStatus, setLoadedStatus] = useState<BreakfastPartnerHotelStatus>('active');
  const [loadedUnitPrice, setLoadedUnitPrice] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const hotel = await fetchPartnerHotel(id);
    if (!hotel) {
      Alert.alert('Hata', 'Partner otel bulunamadı');
      router.back();
      return;
    }
    setName(hotel.name);
    setContactName(hotel.contact_name ?? '');
    setEmail(hotel.email ?? '');
    setPhone(hotel.phone ?? '');
    setCity(hotel.city ?? '');
    setAddress(hotel.address ?? '');
    setTaxId(hotel.tax_id ?? '');
    setTaxOffice(hotel.tax_office ?? '');
    setIban(hotel.iban ?? '');
    setNotes(hotel.notes ?? '');
    setStatus(hotel.status);
    setLoadedStatus(hotel.status);
    setUnitPrice(hotel.unit_price != null ? String(hotel.unit_price) : '');
    setLoadedUnitPrice(hotel.unit_price);
    setHotelOrgId(hotel.organization_id);
    setCounterpartyId(hotel.counterparty_id);
    setEffectivePrice(await resolveEffectiveUnitPrice(hotel));
    const [balance, entryRows] = await Promise.all([
      fetchPartnerOpenBalance(hotel.counterparty_id),
      listOrgPartnerDailyEntries(hotel.organization_id, { partnerHotelId: id, limit: 30 }),
    ]);
    setOpenBalance(balance);
    setEntries(entryRows);
    setLoading(false);
    setRefreshing(false);
  }, [id, router]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const save = async () => {
    if (!id) return;
    setSaving(true);
    const price = unitPrice.trim() ? parseFloat(unitPrice.replace(',', '.')) : null;
    const prevStatus = loadedStatus;
    const prevPrice = loadedUnitPrice;
    const err = await updatePartnerHotel(id, {
      name: name.trim(),
      contact_name: contactName.trim() || null,
      phone: phone.trim() || null,
      city: city.trim() || null,
      address: address.trim() || null,
      tax_id: taxId.trim() || null,
      tax_office: taxOffice.trim() || null,
      iban: iban.trim().replace(/\s+/g, '').toUpperCase() || null,
      notes: notes.trim() || null,
      status,
      unit_price: price && price > 0 ? price : null,
    });
    setSaving(false);
    if (err) Alert.alert('Hata', err);
    else {
      if (prevStatus !== 'active' && status === 'active') {
        void notifyPartnerHotelApproved({
          partnerHotelId: id,
          hotelName: name.trim(),
          unitPrice: price && price > 0 ? price : effectivePrice,
        });
      } else if (status === 'suspended' && prevStatus !== 'suspended') {
        void notifyPartnerStatusSuspended({ partnerHotelId: id, hotelName: name.trim() });
      }
      const newPrice = price && price > 0 ? price : null;
      if (newPrice != null && newPrice !== prevPrice && status === 'active') {
        void notifyPartnerPriceChanged({
          partnerHotelId: id,
          hotelName: name.trim(),
          unitPrice: newPrice,
        });
      }
      Alert.alert('Kaydedildi', 'Partner otel güncellendi.');
      void load();
    }
  };

  if (loading) {
    return (
      <View style={[styles.boot, { paddingTop: insets.top }]}>
        <ActivityIndicator color={partnerTheme.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24, paddingHorizontal: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={partnerTheme.accent} />}
    >
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Ionicons name="arrow-back" size={22} color={partnerTheme.text} />
        <Text style={styles.backText}>Geri</Text>
      </TouchableOpacity>

      <Text style={styles.title}>{name}</Text>
      <Text style={styles.statusLabel}>{PARTNER_STATUS_LABELS[status]}</Text>
      <Text style={styles.balance}>Açık cari: {fmtPartnerMoney(openBalance)}</Text>
      <Text style={styles.meta}>Geçerli birim fiyat: {fmtPartnerMoney(effectivePrice)}</Text>

      <View style={styles.exportCard}>
        <PartnerReportExportButtons
          hint="Partner ile yapılan tüm işlemler, tarihler, tahsilatlar ve cari durum."
          loadReport={() => loadAdminPartnerActivityReport(id!, 365)}
          disabled={loading}
        />
      </View>

      <Text style={styles.sectionHeading}>İletişim ve profil</Text>
      <Text style={styles.label}>Otel adı</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} />

      <Text style={styles.label}>Yetkili adı</Text>
      <TextInput style={styles.input} value={contactName} onChangeText={setContactName} />

      <Text style={styles.label}>Giriş e-postası</Text>
      <TextInput style={[styles.input, styles.inputReadOnly]} value={email} editable={false} />

      <Text style={styles.label}>Telefon</Text>
      <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />

      <Text style={styles.label}>Şehir</Text>
      <TextInput style={styles.input} value={city} onChangeText={setCity} />

      <Text style={styles.label}>Adres</Text>
      <TextInput style={[styles.input, styles.inputMulti]} value={address} onChangeText={setAddress} multiline />

      <Text style={styles.sectionHeading}>Fatura</Text>
      <Text style={styles.label}>Vergi no</Text>
      <TextInput style={styles.input} value={taxId} onChangeText={setTaxId} />

      <Text style={styles.label}>Vergi dairesi</Text>
      <TextInput style={styles.input} value={taxOffice} onChangeText={setTaxOffice} />

      <Text style={styles.label}>IBAN</Text>
      <TextInput style={styles.input} value={iban} onChangeText={setIban} autoCapitalize="characters" />

      <Text style={styles.sectionHeading}>Kahvaltı fiyatı</Text>
      <Text style={styles.label}>Bu otel için kişi başı fiyat (₺)</Text>
      <TextInput style={styles.input} value={unitPrice} onChangeText={setUnitPrice} keyboardType="decimal-pad" placeholder="Boş = varsayılan fiyat" placeholderTextColor={partnerTheme.mutedSoft} />
      <Text style={styles.fieldHint}>
        Boş bırakırsanız ayarlardaki varsayılan fiyat ({fmtPartnerMoney(effectivePrice)}/kişi) uygulanır. Tüm otelleri
        bir arada düzenlemek için listedeki fiyat etiketine veya Ayarlar → Otel fiyatları ekranına gidin.
      </Text>

      <Text style={styles.sectionHeading}>Yönetim</Text>
      <Text style={styles.label}>Durum</Text>
      <View style={styles.statusRow}>
        {(['pending', 'active', 'suspended'] as const).map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.statusChip, status === s && styles.statusChipActive]}
            onPress={() => setStatus(s)}
          >
            <Text style={[styles.statusChipText, status === s && styles.statusChipTextActive]}>
              {PARTNER_STATUS_LABELS[s]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {status === 'pending' ? (
        <TouchableOpacity
          style={styles.approveBtn}
          onPress={async () => {
            const price = unitPrice.trim() ? parseFloat(unitPrice.replace(',', '.')) : undefined;
            const err = await adminSetPartnerStatus(id!, 'active', price);
            if (err) Alert.alert('Hata', err);
            else {
              setStatus('active');
              void notifyPartnerHotelApproved({
                partnerHotelId: id!,
                hotelName: name.trim(),
                unitPrice: price,
              });
              Alert.alert('Onaylandı', 'Partner otel aktif edildi.');
              void load();
            }
          }}
        >
          <Text style={styles.approveBtnText}>Onayla ve aktif et</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.label}>Notlar</Text>
      <TextInput style={[styles.input, styles.inputMulti]} value={notes} onChangeText={setNotes} multiline />

      <TouchableOpacity style={styles.btn} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#0f172a" /> : <Text style={styles.btnText}>Kaydet</Text>}
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Son kayıtlar</Text>
      {entries.map((e) => (
        <View key={e.id} style={styles.entryRow}>
          <Text style={styles.entryDate}>{formatPartnerDate(e.record_date)}</Text>
          <Text style={styles.entryGuests}>{e.guest_count} kişi</Text>
          <Text style={styles.entryAmount}>{fmtPartnerMoney(e.line_total)}</Text>
        </View>
      ))}

      {counterpartyId && hotelOrgId ? (
        <TouchableOpacity
          style={styles.linkBtn}
          onPress={() => router.push(`/admin/accounting/counterparties/${counterpartyId}`)}
        >
          <Text style={styles.linkBtnText}>Cari detayına git →</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: partnerTheme.bg },
  boot: { flex: 1, backgroundColor: partnerTheme.bg, alignItems: 'center', justifyContent: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  backText: { color: partnerTheme.text },
  title: { color: partnerTheme.text, fontSize: 22, fontWeight: '800' },
  statusLabel: { color: partnerTheme.accent, fontWeight: '700', marginTop: 4 },
  balance: { color: partnerTheme.accent, fontWeight: '800', fontSize: 18, marginTop: 6 },
  meta: { color: partnerTheme.muted, marginBottom: 12 },
  exportCard: {
    marginBottom: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: partnerTheme.card,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
  },
  sectionHeading: { color: partnerTheme.text, fontSize: 15, fontWeight: '800', marginTop: 16, marginBottom: 4 },
  label: { color: partnerTheme.muted, fontSize: 13, marginBottom: 6, marginTop: 8 },
  fieldHint: { color: partnerTheme.mutedSoft, fontSize: 12, lineHeight: 18, marginTop: 6 },
  input: {
    backgroundColor: partnerTheme.card,
    borderRadius: 12,
    padding: 12,
    color: partnerTheme.text,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
  },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  inputReadOnly: { opacity: 0.72 },
  statusRow: { flexDirection: 'row', gap: 8 },
  statusChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: partnerTheme.card,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
  },
  statusChipActive: { backgroundColor: partnerTheme.accentSoft, borderColor: partnerTheme.accent },
  statusChipText: { color: partnerTheme.muted, fontWeight: '600' },
  statusChipTextActive: { color: partnerTheme.accent },
  approveBtn: {
    marginTop: 12,
    backgroundColor: '#22c55e',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  approveBtnText: { color: '#fff', fontWeight: '800' },
  btn: {
    marginTop: 16,
    backgroundColor: partnerTheme.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: { color: '#0f172a', fontWeight: '800' },
  sectionTitle: { color: partnerTheme.text, fontSize: 17, fontWeight: '800', marginTop: 24, marginBottom: 8 },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: partnerTheme.cardBorder,
  },
  entryDate: { color: partnerTheme.text, fontWeight: '600' },
  entryGuests: { color: partnerTheme.muted },
  entryAmount: { color: partnerTheme.accent, fontWeight: '700' },
  linkBtn: { marginTop: 16, padding: 12 },
  linkBtnText: { color: partnerTheme.accent, fontWeight: '700', textAlign: 'center' },
});
