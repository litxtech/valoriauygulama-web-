import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CachedImage } from '@/components/CachedImage';
import { menuUi } from '@/components/hotelKitchenMenu/hotelKitchenMenuUi';
import { formatMenuPrice } from '@/lib/hotelKitchenMenu';
import type { PublicMenuCartLine } from '@/lib/publicKitchenMenuCart';
import { cartTotal } from '@/lib/publicKitchenMenuCart';
import { checkoutPublicKitchenMenu } from '@/lib/publicKitchenMenuCheckout';
import type { PublicMenuLang } from '@/lib/publicKitchenMenuLang';
import { getOrCreateGuestForCurrentSession } from '@/lib/getOrCreateGuestForCaller';
import { supabase } from '@/lib/supabase';
import {
  PublicKitchenMenuMapPickSheet,
  type PublicMenuLocationPick,
} from '@/components/hotelKitchenMenu/PublicKitchenMenuMapPickSheet';
import {
  DEFAULT_KITCHEN_MENU_CHECKOUT_FIELDS,
  resolveCheckoutCustomerName,
  validateCheckoutForm,
  type KitchenMenuCheckoutFields,
} from '@/lib/kitchenMenuCheckoutFields';

type Props = {
  visible: boolean;
  onClose: () => void;
  orgSlug: string;
  orgName: string;
  lines: PublicMenuCartLine[];
  lang: PublicMenuLang;
  onUpdateQuantity: (itemId: string, quantity: number) => void;
  checkoutFields?: KitchenMenuCheckoutFields;
  accentColor?: string;
};

export function PublicKitchenMenuCartSheet({
  visible,
  onClose,
  orgSlug,
  orgName,
  lines,
  lang,
  onUpdateQuantity,
  checkoutFields = DEFAULT_KITCHEN_MENU_CHECKOUT_FIELDS,
  accentColor = menuUi.accent,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [room, setRoom] = useState('');
  const [table, setTable] = useState('');
  const [hotelName, setHotelName] = useState('');
  const [locationPick, setLocationPick] = useState<PublicMenuLocationPick | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionGuestEmail, setSessionGuestEmail] = useState<string | null>(null);

  const fields = checkoutFields;

  const fieldLabel = (label: string, mode: 'required' | 'optional' | 'hidden') => {
    if (mode === 'hidden') return null;
    return `${label}${mode === 'required' ? ' *' : ''}`;
  };

  useEffect(() => {
    if (!visible) {
      setError(null);
      setPaying(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const guest = await getOrCreateGuestForCurrentSession();
      if (cancelled || !guest?.guest_id) return;
      const { data: row } = await supabase
        .from('guests')
        .select('full_name, email, rooms(room_number)')
        .eq('id', guest.guest_id)
        .maybeSingle();
      if (cancelled || !row) return;
      const fullName = (row as { full_name?: string | null }).full_name?.trim();
      const guestEmail = (row as { email?: string | null }).email?.trim() ?? '';
      const roomNum = (row as { rooms?: { room_number?: string | null } | null }).rooms?.room_number;
      if (fullName && fields.name !== 'hidden') setName((prev) => prev.trim() || fullName);
      if (guestEmail && fields.email !== 'hidden') {
        setSessionGuestEmail(guestEmail);
        setEmail((prev) => prev.trim() || guestEmail);
      }
      if (roomNum && fields.room !== 'hidden') setRoom((prev) => prev.trim() || String(roomNum));
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, fields.email, fields.name, fields.room]);

  const total = cartTotal(lines);
  const showRoom = fields.room !== 'hidden';
  const showTable = fields.table !== 'hidden';
  const showHotelName = fields.hotelName !== 'hidden';
  const showLocation = fields.location !== 'hidden';
  const showContactForm = useMemo(
    () =>
      fields.name !== 'hidden' ||
      fields.email !== 'hidden' ||
      showRoom ||
      showTable ||
      showHotelName ||
      showLocation,
    [fields.email, fields.name, showHotelName, showLocation, showRoom, showTable]
  );

  const handlePay = async () => {
    if (lines.length === 0) return;
    const validationError = validateCheckoutForm(
      fields,
      {
        name,
        email,
        room,
        table,
        hotelName,
        locationAddress: locationPick?.address ?? '',
        locationLat: locationPick?.lat ?? null,
        locationLng: locationPick?.lng ?? null,
      },
      {
        nameRequired: t('publicKitchenMenuNameRequired'),
        emailRequired: t('publicKitchenMenuEmailRequired'),
        roomRequired: t('publicKitchenMenuRoomRequired'),
        tableRequired: t('publicKitchenMenuTableRequired'),
        hotelNameRequired: t('publicKitchenMenuHotelNameRequired'),
        locationRequired: t('publicKitchenMenuLocationRequired'),
      }
    );
    if (validationError) {
      setError(validationError);
      return;
    }

    const customerName = resolveCheckoutCustomerName(fields, name);
    const customerEmail = (email.trim() || sessionGuestEmail?.trim() || '').trim();

    setError(null);
    setPaying(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const result = await checkoutPublicKitchenMenu({
        orgSlug,
        items: lines.map((l) => ({ menu_item_id: l.itemId, quantity: l.quantity })),
        customerName,
        customerEmail: customerEmail || undefined,
        roomNumber: room.trim() || undefined,
        tableNumber: table.trim() || undefined,
        guestHotelName: hotelName.trim() || undefined,
        deliveryLat: locationPick?.lat,
        deliveryLng: locationPick?.lng,
        deliveryAddress: locationPick?.address,
        lang,
        accessToken: sessionData.session?.access_token ?? null,
      });
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        if (!result.pay_url) throw new Error(t('publicKitchenMenuCheckoutError'));
        window.location.assign(result.pay_url);
        return;
      }
    } catch (e) {
      setError((e as Error)?.message ?? t('publicKitchenMenuCheckoutError'));
      setPaying(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: insets.bottom + 16, maxHeight: '92%' }]}
          onPress={(e) => e.stopPropagation?.()}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="bag-handle-outline" size={20} color={accentColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{t('publicKitchenMenuCart')}</Text>
              <Text style={styles.sub}>{orgName}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={menuUi.webMuted} />
            </Pressable>
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {lines.length === 0 ? (
              <Text style={styles.empty}>{t('publicKitchenMenuCartEmpty')}</Text>
            ) : (
              lines.map((line) => (
                <View key={line.itemId} style={styles.line}>
                  {line.coverUrl ? (
                    <CachedImage uri={line.coverUrl} style={styles.thumb} contentFit="cover" />
                  ) : (
                    <View style={[styles.thumb, styles.thumbPh]}>
                      <Ionicons name="restaurant-outline" size={20} color={accentColor} />
                    </View>
                  )}
                  <View style={styles.lineBody}>
                    <Text style={styles.lineName} numberOfLines={2}>
                      {line.name}
                    </Text>
                    <Text style={styles.linePrice}>{formatMenuPrice(line.price)}</Text>
                    <View style={styles.qtyRow}>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => onUpdateQuantity(line.itemId, line.quantity - 1)}
                        accessibilityLabel={t('publicKitchenMenuRemoveFromCart')}
                      >
                        <Ionicons
                          name={line.quantity <= 1 ? 'trash-outline' : 'remove'}
                          size={16}
                          color={line.quantity <= 1 ? '#dc2626' : menuUi.webText}
                        />
                      </TouchableOpacity>
                      <Text style={styles.qtyVal}>{line.quantity}</Text>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => onUpdateQuantity(line.itemId, line.quantity + 1)}
                      >
                        <Ionicons name="add" size={16} color={menuUi.webText} />
                      </TouchableOpacity>
                      {line.quantity <= 1 ? (
                        <Text style={styles.removeHint}>{t('publicKitchenMenuRemoveFromCart')}</Text>
                      ) : null}
                    </View>
                  </View>
                  <Text style={styles.lineTotal}>{formatMenuPrice(line.price * line.quantity)}</Text>
                </View>
              ))
            )}

            {lines.length > 0 && showContactForm ? (
              <View style={styles.form}>
                <Text style={styles.formHint}>{t('publicKitchenMenuCheckoutHint')}</Text>
                {fields.name !== 'hidden' ? (
                  <>
                    <Text style={styles.fieldLabel}>{fieldLabel(t('publicKitchenMenuYourName'), fields.name)}</Text>
                    <TextInput
                      style={styles.input}
                      value={name}
                      onChangeText={setName}
                      placeholder={t('publicKitchenMenuYourName')}
                      placeholderTextColor={menuUi.webMuted}
                      autoComplete="name"
                    />
                  </>
                ) : null}
                {fields.email !== 'hidden' ? (
                  <>
                    <Text style={styles.fieldLabel}>{fieldLabel(t('publicKitchenMenuYourEmail'), fields.email)}</Text>
                    <TextInput
                      style={styles.input}
                      value={email}
                      onChangeText={setEmail}
                      placeholder="ornek@email.com"
                      placeholderTextColor={menuUi.webMuted}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoComplete="email"
                      editable={!sessionGuestEmail}
                    />
                  </>
                ) : null}
                {showRoom || showTable ? (
                  <View style={styles.formRow}>
                    {showRoom ? (
                      <View style={styles.formHalf}>
                        <Text style={styles.fieldLabel}>{fieldLabel(t('publicKitchenMenuRoomNumber'), fields.room)}</Text>
                        <TextInput
                          style={styles.input}
                          value={room}
                          onChangeText={setRoom}
                          placeholder="101"
                          placeholderTextColor={menuUi.webMuted}
                        />
                      </View>
                    ) : null}
                    {showTable ? (
                      <View style={[styles.formHalf, !showRoom && { flex: 1 }]}>
                        <Text style={styles.fieldLabel}>{fieldLabel(t('publicKitchenMenuTableNumber'), fields.table)}</Text>
                        <TextInput
                          style={styles.input}
                          value={table}
                          onChangeText={setTable}
                          placeholder="12"
                          placeholderTextColor={menuUi.webMuted}
                        />
                      </View>
                    ) : null}
                  </View>
                ) : null}
                {showHotelName ? (
                  <>
                    <Text style={styles.fieldLabel}>{fieldLabel(t('publicKitchenMenuHotelName'), fields.hotelName)}</Text>
                    <TextInput
                      style={styles.input}
                      value={hotelName}
                      onChangeText={setHotelName}
                      placeholder={orgName}
                      placeholderTextColor={menuUi.webMuted}
                    />
                  </>
                ) : null}
                {showLocation ? (
                  <>
                    <Text style={styles.fieldLabel}>{fieldLabel(t('publicKitchenMenuDeliveryLocation'), fields.location)}</Text>
                    <TouchableOpacity style={styles.mapBtn} onPress={() => setMapOpen(true)}>
                      <Ionicons name="map-outline" size={18} color={accentColor} />
                      <Text style={styles.mapBtnText}>
                        {locationPick?.address
                          ? locationPick.address
                          : t('publicKitchenMenuPickLocation')}
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : null}
              </View>
            ) : null}
          </ScrollView>

          {lines.length > 0 ? (
            <View style={styles.footer}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>{t('publicKitchenMenuCartTotal')}</Text>
                <Text style={styles.totalVal}>{formatMenuPrice(total)}</Text>
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <TouchableOpacity
                style={[styles.payBtn, { backgroundColor: accentColor }, paying && styles.payBtnDisabled]}
                onPress={() => void handlePay()}
                disabled={paying}
                activeOpacity={0.9}
              >
                {paying ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="card-outline" size={20} color="#fff" />
                    <Text style={styles.payBtnText}>{t('publicKitchenMenuPayNow')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        </Pressable>
      </Pressable>

      <PublicKitchenMenuMapPickSheet
        visible={mapOpen}
        initial={locationPick}
        onClose={() => setMapOpen(false)}
        onConfirm={(pick) => setLocationPick(pick)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(8px)' } as object) : {}),
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
    ...menuUi.shadowLg,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: menuUi.border,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: menuUi.border,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: menuUi.warmBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: menuUi.border,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: menuUi.warmBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: '800', color: menuUi.navy, letterSpacing: -0.3 },
  sub: { fontSize: 13, color: menuUi.webMuted, marginTop: 2, fontWeight: '600' },
  scroll: { maxHeight: 420 },
  empty: { textAlign: 'center', color: menuUi.webMuted, paddingVertical: 32, fontSize: 15 },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: menuUi.border,
  },
  thumb: { width: 60, height: 60, borderRadius: 12, backgroundColor: menuUi.imagePlaceholder },
  thumbPh: { alignItems: 'center', justifyContent: 'center' },
  lineBody: { flex: 1, minWidth: 0 },
  lineName: { fontSize: 15, fontWeight: '700', color: menuUi.navy },
  linePrice: { fontSize: 13, color: menuUi.webMuted, marginTop: 2 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  qtyBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: menuUi.warmBg,
    borderWidth: 1,
    borderColor: menuUi.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyVal: { fontSize: 14, fontWeight: '800', color: menuUi.navy, minWidth: 18, textAlign: 'center' },
  removeHint: { fontSize: 11, fontWeight: '600', color: '#dc2626' },
  lineTotal: { fontSize: 15, fontWeight: '800', color: menuUi.price },
  form: { marginTop: 20, paddingBottom: 8 },
  formHint: { fontSize: 13, color: menuUi.webMuted, lineHeight: 20, marginBottom: 16 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: menuUi.webMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: menuUi.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: menuUi.webText,
    backgroundColor: menuUi.warmBg,
    outlineStyle: 'none',
  } as object,
  formRow: { flexDirection: 'row', gap: 12 },
  formHalf: { flex: 1 },
  mapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: menuUi.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: menuUi.warmBg,
  },
  mapBtnText: { flex: 1, fontSize: 14, color: menuUi.webText, fontWeight: '600' },
  footer: { paddingTop: 16, borderTopWidth: 1, borderTopColor: menuUi.border, marginTop: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  totalLabel: { fontSize: 15, fontWeight: '600', color: menuUi.webMuted },
  totalVal: { fontSize: 22, fontWeight: '800', color: menuUi.navy },
  error: { color: '#dc2626', fontSize: 13, marginBottom: 10, fontWeight: '600' },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 14,
    paddingVertical: 15,
    ...menuUi.shadowMd,
  },
  payBtnDisabled: { opacity: 0.7 },
  payBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
});
