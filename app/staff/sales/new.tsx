import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity, Alert, Modal, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { canAccessReservationSales } from '@/lib/staffPermissions';
import { useTranslation } from 'react-i18next';

type StaffPickRow = { id: string; full_name: string | null };

const SOURCE_TYPES: { value: string; label: string }[] = [
  { value: 'personel_kendi', label: 'Personelin kendi müşterisi' },
  { value: 'personel_baglanti', label: 'Personelin bağlantısı' },
  { value: 'dis_referans', label: 'Dış referans' },
  { value: 'acente', label: 'Acente' },
  { value: 'firma', label: 'Firma yönlendirmesi' },
  { value: 'telefon', label: 'Telefon araması' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'sosyal_medya', label: 'Sosyal medya' },
  { value: 'web', label: 'Web sitesi' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'tekrar', label: 'Tekrar gelen müşteri' },
];

const COMMISSION_TYPES: { value: 'percent' | 'fixed' | 'manual'; label: string }[] = [
  { value: 'percent', label: 'Yüzdelik (%)' },
  { value: 'fixed', label: 'Sabit tutar' },
  { value: 'manual', label: 'Manuel tutar' },
];

const PAYMENT_PLACES: { value: string; label: string }[] = [
  { value: 'otel_kasa', label: 'Otel kasası' },
  { value: 'otel_banka', label: 'Otel banka hesabı' },
  { value: 'personel_hesabi', label: 'Personel hesabı' },
  { value: 'araci_hesabi', label: 'Aracı hesabı' },
  { value: 'elden', label: 'Elden ödeme' },
  { value: 'sanal_pos', label: 'Sanal POS' },
  { value: 'online_link', label: 'Online ödeme linki' },
];

function parseMoneyInput(v: string): number {
  const cleaned = v.replace(/[^\d.,-]/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseIsoDateOptional(label: string, raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    throw new Error(`${label}: Tarih YYYY-MM-DD formatında olmalıdır.`);
  }
  const d = new Date(`${t}T12:00:00`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`${label}: Geçersiz tarih.`);
  }
  return t;
}

function StaffPicker({
  title,
  value,
  onChange,
  options,
}: {
  title: string;
  value: StaffPickRow | null;
  onChange: (s: StaffPickRow | null) => void;
  options: StaffPickRow[];
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Text style={styles.label}>{title}</Text>
      <TouchableOpacity style={styles.pickerBtn} onPress={() => setOpen(true)} activeOpacity={0.85}>
        <Text style={styles.pickerBtnText}>{value?.full_name ?? t('staffSalesSelect')}</Text>
        <Ionicons name="chevron-down" size={18} color={theme.colors.textMuted} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => undefined}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{title}</Text>
              <TouchableOpacity onPress={() => setOpen(false)} style={{ padding: 6 }}>
                <Ionicons name="close" size={20} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              <TouchableOpacity
                onPress={() => {
                  onChange(null);
                  setOpen(false);
                }}
                style={styles.modalRow}
              >
                <Text style={styles.modalRowText}>{t('staffSalesNotSelected')}</Text>
              </TouchableOpacity>
              {options.map((o) => (
                <TouchableOpacity
                  key={o.id}
                  onPress={() => {
                    onChange(o);
                    setOpen(false);
                  }}
                  style={styles.modalRow}
                >
                  <Text style={styles.modalRowText}>{o.full_name ?? t('staffSalesUnnamedStaff')}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function PlacePicker({
  title,
  value,
  onChange,
  places = PAYMENT_PLACES,
}: {
  title: string;
  value: string;
  onChange: (v: string) => void;
  places?: { value: string; label: string }[];
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const label = places.find((p) => p.value === value)?.label ?? (value ? value : 'Seçiniz');
  return (
    <>
      <Text style={styles.label}>{title}</Text>
      <TouchableOpacity style={styles.pickerBtn} onPress={() => setOpen(true)} activeOpacity={0.85}>
        <Text style={styles.pickerBtnText}>{label}</Text>
        <Ionicons name="chevron-down" size={18} color={theme.colors.textMuted} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => undefined}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{title}</Text>
              <TouchableOpacity onPress={() => setOpen(false)} style={{ padding: 6 }}>
                <Ionicons name="close" size={20} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              <TouchableOpacity
                onPress={() => {
                  onChange('');
                  setOpen(false);
                }}
                style={styles.modalRow}
              >
                <Text style={styles.modalRowText}>{t('staffSalesNotSelected')}</Text>
              </TouchableOpacity>
              {places.map((p) => (
                <TouchableOpacity
                  key={p.value}
                  onPress={() => {
                    onChange(p.value);
                    setOpen(false);
                  }}
                  style={styles.modalRow}
                >
                  <Text style={styles.modalRowText}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export default function NewReservationSale() {
  const router = useRouter();
  const { t } = useTranslation();
  const pathname = usePathname();
  const staff = useAuthStore((s) => s.staff);
  const canUse = canAccessReservationSales(staff);
  const [loading, setLoading] = useState(false);
  const [staffOptions, setStaffOptions] = useState<StaffPickRow[]>([]);

  const [customer_full_name, setName] = useState('');
  const [customer_phone, setPhone] = useState('');
  const [check_in_date, setCheckIn] = useState('');
  const [check_out_date, setCheckOut] = useState('');
  const [room_type, setRoomType] = useState('');
  const [sale_amount, setSaleAmount] = useState('0');
  const [discount_amount, setDiscountAmount] = useState('0');
  const [extra_service_amount, setExtraServiceAmount] = useState('0');
  const [source_type, setSourceType] = useState('personel_kendi');

  const sourceTypesI18n = useMemo(
    () => [
      { value: 'personel_kendi', label: t('staffSalesSourceOwn') },
      { value: 'personel_baglanti', label: t('staffSalesSourceConnection') },
      { value: 'dis_referans', label: t('staffSalesSourceExternal') },
      { value: 'firma', label: t('staffSalesSourceCompany') },
      { value: 'telefon', label: t('staffSalesSourcePhone') },
      { value: 'tekrar', label: t('staffSalesSourceRepeat') },
    ],
    [t]
  );
  const commissionTypesI18n = useMemo(
    () => [{ value: 'percent' as const, label: t('staffSalesCommissionPercent') }],
    [t]
  );
  const paymentPlacesI18n = useMemo(
    () => [
      { value: 'otel_kasa', label: t('staffSalesPayHotelCash') },
      { value: 'otel_banka', label: t('staffSalesPayHotelBank') },
      { value: 'personel_hesabi', label: t('staffSalesPayStaff') },
      { value: 'araci_hesabi', label: t('staffSalesPayIntermediary') },
      { value: 'elden', label: t('staffSalesPayCash') },
      { value: 'online_link', label: t('staffSalesPayOnline') },
    ],
    [t]
  );

  const [broughtBy, setBroughtBy] = useState<StaffPickRow | null>(null);
  const [intermediary, setIntermediary] = useState<StaffPickRow | null>(null);
  const [hotelResponsible, setHotelResponsible] = useState<StaffPickRow | null>(null);

  const [commission_enabled, setCommissionEnabled] = useState(false);
  const [commission_type, setCommissionType] = useState<'percent' | 'fixed' | 'manual'>('percent');
  const [commission_rate, setCommissionRate] = useState('10');
  const [commission_amount, setCommissionAmount] = useState('0');
  const [commissionEarner, setCommissionEarner] = useState<StaffPickRow | null>(null);

  const [payment_place, setPaymentPlace] = useState('');
  const [paid_amount, setPaidAmount] = useState('0');

  const sourceLabel = useMemo(
    () => sourceTypesI18n.find((x) => x.value === source_type)?.label ?? source_type,
    [source_type, sourceTypesI18n]
  );

  useEffect(() => {
    if (!staff?.organization_id || !canUse) return;
    supabase
      .from('staff')
      .select('id, full_name')
      .eq('organization_id', staff.organization_id)
      .eq('is_active', true)
      .order('full_name')
      .then(({ data }) => setStaffOptions(((data ?? []) as StaffPickRow[]) ?? []));
  }, [staff?.organization_id, canUse]);

  useEffect(() => {
    if (!staff?.id) return;
    setCommissionEarner({ id: staff.id, full_name: staff.full_name ?? 'Ben' });
    setBroughtBy({ id: staff.id, full_name: staff.full_name ?? 'Ben' });
    setHotelResponsible({ id: staff.id, full_name: staff.full_name ?? 'Ben' });
  }, [staff?.id, staff?.full_name]);

  const submit = useCallback(async () => {
    if (!canUse) return;
    if (!staff?.id) {
      Alert.alert(t('error'), t('staffEmergencySessionMissing'));
      return;
    }
    if (!customer_full_name.trim()) {
      Alert.alert(t('error'), t('required'));
      return;
    }
    if (!customer_phone.trim()) {
      Alert.alert(t('error'), t('required'));
      return;
    }
    if (!source_type) {
      Alert.alert(t('error'), t('required'));
      return;
    }

    setLoading(true);
    try {
      let checkIn: string | null = null;
      let checkOut: string | null = null;
      try {
        checkIn = parseIsoDateOptional('Giriş tarihi', check_in_date);
        checkOut = parseIsoDateOptional('Çıkış tarihi', check_out_date);
      } catch (e) {
        Alert.alert(t('error'), (e as Error)?.message ?? t('recordError'));
        setLoading(false);
        return;
      }
      if (checkIn && checkOut && checkOut < checkIn) {
        Alert.alert(t('error'), t('invalidCode'));
        setLoading(false);
        return;
      }

      const paid = parseMoneyInput(paid_amount);
      if (paid > 0 && !payment_place.trim()) {
        Alert.alert(t('error'), t('required'));
        setLoading(false);
        return;
      }

      // Mükerrer telefon uyarısı (soft): aynı telefondan son 60 gün kayıt varsa uyar.
      const { data: dup } = await supabase
        .from('reservation_sales')
        .select('id, customer_full_name, created_at')
        .eq('customer_phone', customer_phone.trim())
        .order('created_at', { ascending: false })
        .limit(1);

      if (dup && dup[0]?.id) {
        const ok = await new Promise<boolean>((resolve) => {
          Alert.alert(
            t('warning'),
            `Bu telefonla daha önce kayıt var: ${dup[0].customer_full_name}. Yine de yeni kayıt oluşturulsun mu?`,
            [
              { text: t('cancel'), style: 'cancel', onPress: () => resolve(false) },
              { text: t('save'), style: 'default', onPress: () => resolve(true) },
            ]
          );
        });
        if (!ok) {
          setLoading(false);
          return;
        }
      }

      const payload: Record<string, unknown> = {
        customer_full_name: customer_full_name.trim(),
        customer_phone: customer_phone.trim(),
        check_in_date: checkIn,
        check_out_date: checkOut,
        room_type: room_type.trim() || null,
        sale_amount: parseMoneyInput(sale_amount),
        discount_amount: parseMoneyInput(discount_amount),
        extra_service_amount: parseMoneyInput(extra_service_amount),
        source_type,
        brought_by_staff_id: broughtBy?.id ?? null,
        intermediary_staff_id: intermediary?.id ?? null,
        closed_by_staff_id: staff.id,
        hotel_responsible_staff_id: hotelResponsible?.id ?? null,
        created_by_staff_id: staff.id,
        commission_enabled,
        commission_type: commission_enabled ? commission_type : null,
        commission_rate: commission_enabled && commission_type !== 'manual' ? parseMoneyInput(commission_rate) : null,
        commission_amount: commission_enabled && commission_type === 'manual' ? parseMoneyInput(commission_amount) : 0,
        commission_earner_staff_id: commission_enabled ? commissionEarner?.id ?? staff.id : null,
        payment_place: payment_place.trim() || null,
        paid_amount: paid,
      };

      const { data, error } = await supabase.from('reservation_sales').insert(payload).select('id').single();
      if (error) throw error;
      const base = pathname?.startsWith('/admin') ? '/admin/sales' : '/staff/sales';
      router.replace(`${base}/${data.id}`);
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('recordError'));
    } finally {
      setLoading(false);
    }
  }, [
    canUse,
    staff?.id,
    customer_full_name,
    customer_phone,
    check_in_date,
    check_out_date,
    room_type,
    sale_amount,
    discount_amount,
    extra_service_amount,
    source_type,
    broughtBy?.id,
    intermediary?.id,
    hotelResponsible?.id,
    commission_enabled,
    commission_type,
    commission_rate,
    commission_amount,
    commissionEarner?.id,
    payment_place,
    paid_amount,
    router,
    pathname,
  ]);

  if (!canUse) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={28} color={theme.colors.textMuted} />
        <Text style={styles.deniedTitle}>Erişim yok</Text>
        <Text style={styles.deniedDesc}>Admin, resepsiyon şefi veya “Satış / komisyon” yetkisi gerekir.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <Text style={styles.h1}>Yeni satış kaydı</Text>
        <Text style={styles.h2}>Hızlı kayıt. Detayları sonra düzenleyebilirsiniz.</Text>
      </View>

      <Text style={styles.sectionTitle}>Müşteri</Text>
      <Text style={styles.label}>Ad Soyad *</Text>
      <TextInput style={styles.input} value={customer_full_name} onChangeText={setName} placeholder="Ad Soyad" placeholderTextColor={theme.colors.textMuted} />
      <Text style={styles.label}>Telefon *</Text>
      <TextInput style={styles.input} value={customer_phone} onChangeText={setPhone} placeholder="+90 5xx xxx xx xx" keyboardType="phone-pad" placeholderTextColor={theme.colors.textMuted} />

      <Text style={styles.sectionTitle}>Rezervasyon</Text>
      <View style={styles.row2}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Giriş tarihi</Text>
          <TextInput style={styles.input} value={check_in_date} onChangeText={setCheckIn} placeholder="YYYY-MM-DD" placeholderTextColor={theme.colors.textMuted} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Çıkış tarihi</Text>
          <TextInput style={styles.input} value={check_out_date} onChangeText={setCheckOut} placeholder="YYYY-MM-DD" placeholderTextColor={theme.colors.textMuted} />
        </View>
      </View>
      <Text style={styles.label}>Oda tipi</Text>
      <TextInput style={styles.input} value={room_type} onChangeText={setRoomType} placeholder="Deluxe / Family / ..." placeholderTextColor={theme.colors.textMuted} />

      <Text style={styles.sectionTitle}>Kaynak & sorumlular</Text>
      <Text style={styles.label}>Satış kaynağı</Text>
      <View style={styles.pickerInfo}>
        <Text style={styles.pickerInfoText}>{sourceLabel}</Text>
      </View>
      <View style={styles.sourceGrid}>
        {sourceTypesI18n.map((s) => {
          const active = s.value === source_type;
          return (
            <TouchableOpacity
              key={s.value}
              onPress={() => setSourceType(s.value)}
              style={[styles.sourceChip, active ? styles.sourceChipActive : null]}
              activeOpacity={0.85}
            >
              <Text style={[styles.sourceChipText, active ? styles.sourceChipTextActive : null]}>{s.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <StaffPicker title={t('staffSalesBroughtBy')} value={broughtBy} onChange={setBroughtBy} options={staffOptions} />
      <StaffPicker title={t('staffSalesIntermediaryPerson')} value={intermediary} onChange={setIntermediary} options={staffOptions} />
      <StaffPicker title="Otel sorumlusu" value={hotelResponsible} onChange={setHotelResponsible} options={staffOptions} />

      <Text style={styles.sectionTitle}>Fiyat</Text>
      <View style={styles.row2}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Satış tutarı *</Text>
          <TextInput style={styles.input} value={sale_amount} onChangeText={setSaleAmount} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>İndirim</Text>
          <TextInput style={styles.input} value={discount_amount} onChangeText={setDiscountAmount} keyboardType="decimal-pad" />
        </View>
      </View>
      <Text style={styles.label}>Ek hizmet</Text>
      <TextInput style={styles.input} value={extra_service_amount} onChangeText={setExtraServiceAmount} keyboardType="decimal-pad" />

      <Text style={styles.sectionTitle}>Ödeme</Text>
      <PlacePicker
        title={t('staffSalesPaymentPlaceRequired')}
        value={payment_place}
        onChange={setPaymentPlace}
        places={paymentPlacesI18n}
      />
      <Text style={styles.label}>Ödenen tutar</Text>
      <TextInput style={styles.input} value={paid_amount} onChangeText={setPaidAmount} keyboardType="decimal-pad" />

      <Text style={styles.sectionTitle}>Komisyon</Text>
      <TouchableOpacity
        style={[styles.toggleRow, commission_enabled ? styles.toggleOn : null]}
        activeOpacity={0.85}
        onPress={() => setCommissionEnabled((v) => !v)}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleTitle}>Komisyon var mı?</Text>
          <Text style={styles.toggleDesc}>Açık olunca sistem otomatik komisyon hesaplar.</Text>
        </View>
        <View style={[styles.togglePill, commission_enabled ? styles.togglePillOn : null]}>
          <Text style={[styles.togglePillText, commission_enabled ? styles.togglePillTextOn : null]}>{commission_enabled ? 'AÇIK' : 'KAPALI'}</Text>
        </View>
      </TouchableOpacity>

      {commission_enabled ? (
        <View style={styles.box}>
          <Text style={styles.label}>Komisyon türü</Text>
          <View style={styles.sourceGrid}>
            {COMMISSION_TYPES.map((c) => {
              const active = c.value === commission_type;
              return (
                <TouchableOpacity
                  key={c.value}
                  onPress={() => setCommissionType(c.value)}
                  style={[styles.sourceChip, active ? styles.sourceChipActive : null]}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.sourceChipText, active ? styles.sourceChipTextActive : null]}>{c.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {commission_type === 'manual' ? (
            <>
              <Text style={styles.label}>Komisyon tutarı</Text>
              <TextInput style={styles.input} value={commission_amount} onChangeText={setCommissionAmount} keyboardType="decimal-pad" />
            </>
          ) : (
            <>
              <Text style={styles.label}>{commission_type === 'percent' ? 'Oran (%)' : 'Sabit tutar'}</Text>
              <TextInput style={styles.input} value={commission_rate} onChangeText={setCommissionRate} keyboardType="decimal-pad" />
            </>
          )}
          <StaffPicker title="Komisyon hak edeni" value={commissionEarner} onChange={setCommissionEarner} options={staffOptions} />
        </View>
      ) : null}

      <TouchableOpacity style={styles.submitBtn} onPress={submit} activeOpacity={0.9} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />}
        <Text style={styles.submitBtnText}>{loading ? t('staffSalesSaving') : t('staffSalesCreateRecord')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, paddingBottom: 44 },
  hero: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  h1: { fontSize: 18, fontWeight: '900', color: theme.colors.text },
  h2: { marginTop: 6, fontSize: 13, lineHeight: 18, color: theme.colors.textMuted },
  sectionTitle: { marginTop: 14, marginBottom: 8, fontSize: 15, fontWeight: '900', color: theme.colors.text },
  label: { marginTop: 10, marginBottom: 6, fontSize: 12, fontWeight: '800', color: theme.colors.textMuted },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.text,
  },
  row2: { flexDirection: 'row', gap: 10 },
  pickerBtn: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pickerBtnText: { color: theme.colors.text, fontWeight: '800' },
  pickerInfo: { padding: 10, borderRadius: 12, backgroundColor: theme.colors.surfaceTertiary, borderWidth: 1, borderColor: theme.colors.borderLight },
  pickerInfoText: { color: theme.colors.text, fontWeight: '800' },
  sourceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  sourceChip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.borderLight },
  sourceChipActive: { backgroundColor: theme.colors.primary },
  sourceChipText: { fontSize: 12, fontWeight: '800', color: theme.colors.text },
  sourceChipTextActive: { color: '#fff' },
  toggleRow: {
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toggleOn: { borderColor: 'rgba(16,185,129,0.35)' },
  toggleTitle: { fontSize: 14, fontWeight: '900', color: theme.colors.text },
  toggleDesc: { marginTop: 4, fontSize: 12, color: theme.colors.textMuted },
  togglePill: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, backgroundColor: theme.colors.surfaceTertiary },
  togglePillOn: { backgroundColor: 'rgba(16,185,129,0.15)' },
  togglePillText: { fontSize: 12, fontWeight: '900', color: theme.colors.textMuted },
  togglePillTextOn: { color: '#059669' },
  box: { marginTop: 10, padding: 12, borderRadius: 14, backgroundColor: theme.colors.surfaceTertiary, borderWidth: 1, borderColor: theme.colors.borderLight },
  submitBtn: {
    marginTop: 18,
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', padding: 18, justifyContent: 'center' },
  modalCard: { backgroundColor: theme.colors.surface, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.borderLight, overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.borderLight },
  modalTitle: { fontSize: 14, fontWeight: '900', color: theme.colors.text },
  modalRow: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.borderLight },
  modalRowText: { color: theme.colors.text, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: theme.colors.background },
  deniedTitle: { marginTop: 10, fontSize: 16, fontWeight: '900', color: theme.colors.text },
  deniedDesc: { marginTop: 6, fontSize: 13, color: theme.colors.textMuted, textAlign: 'center' },
});

