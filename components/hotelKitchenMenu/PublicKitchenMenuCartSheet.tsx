import { useEffect, useState } from 'react';
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
import { cartTotal, clearPublicMenuCart } from '@/lib/publicKitchenMenuCart';
import { checkoutPublicKitchenMenu } from '@/lib/publicKitchenMenuCheckout';
import type { PublicMenuLang } from '@/lib/publicKitchenMenuLang';

type Props = {
  visible: boolean;
  onClose: () => void;
  orgSlug: string;
  orgName: string;
  lines: PublicMenuCartLine[];
  lang: PublicMenuLang;
  onUpdateQuantity: (itemId: string, quantity: number) => void;
  onCartCleared: () => void;
};

export function PublicKitchenMenuCartSheet({
  visible,
  onClose,
  orgSlug,
  orgName,
  lines,
  lang,
  onUpdateQuantity,
  onCartCleared,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [room, setRoom] = useState('');
  const [table, setTable] = useState('');
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setError(null);
      setPaying(false);
    }
  }, [visible]);

  const total = cartTotal(lines);

  const handlePay = async () => {
    if (lines.length === 0) return;
    const customerName = name.trim();
    const customerEmail = email.trim();
    if (customerName.length < 2) {
      setError(t('publicKitchenMenuNameRequired'));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      setError(t('publicKitchenMenuEmailRequired'));
      return;
    }
    setError(null);
    setPaying(true);
    try {
      const result = await checkoutPublicKitchenMenu({
        orgSlug,
        items: lines.map((l) => ({ menu_item_id: l.itemId, quantity: l.quantity })),
        customerName,
        customerEmail,
        roomNumber: room.trim() || undefined,
        tableNumber: table.trim() || undefined,
        lang,
      });
      clearPublicMenuCart(orgSlug);
      onCartCleared();
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.href = result.pay_url;
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
            <View>
              <Text style={styles.title}>{t('publicKitchenMenuCheckoutTitle')}</Text>
              <Text style={styles.sub}>{orgName}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={menuUi.navy} />
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
                      <Ionicons name="restaurant-outline" size={20} color={menuUi.accent} />
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
                      >
                        <Ionicons name="remove" size={18} color={menuUi.navy} />
                      </TouchableOpacity>
                      <Text style={styles.qtyVal}>{line.quantity}</Text>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => onUpdateQuantity(line.itemId, line.quantity + 1)}
                      >
                        <Ionicons name="add" size={18} color={menuUi.navy} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text style={styles.lineTotal}>{formatMenuPrice(line.price * line.quantity)}</Text>
                </View>
              ))
            )}

            {lines.length > 0 ? (
              <View style={styles.form}>
                <Text style={styles.formHint}>{t('publicKitchenMenuCheckoutHint')}</Text>
                <Text style={styles.fieldLabel}>{t('publicKitchenMenuYourName')} *</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder={t('publicKitchenMenuYourName')}
                  placeholderTextColor={menuUi.webMuted}
                  autoComplete="name"
                />
                <Text style={styles.fieldLabel}>{t('publicKitchenMenuYourEmail')} *</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder={t('publicKitchenMenuYourEmail')}
                  placeholderTextColor={menuUi.webMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
                <View style={styles.formRow}>
                  <View style={styles.formHalf}>
                    <Text style={styles.fieldLabel}>{t('publicKitchenMenuRoomNumber')}</Text>
                    <TextInput
                      style={styles.input}
                      value={room}
                      onChangeText={setRoom}
                      placeholder="101"
                      placeholderTextColor={menuUi.webMuted}
                    />
                  </View>
                  <View style={styles.formHalf}>
                    <Text style={styles.fieldLabel}>{t('publicKitchenMenuTableNumber')}</Text>
                    <TextInput
                      style={styles.input}
                      value={table}
                      onChangeText={setTable}
                      placeholder="12"
                      placeholderTextColor={menuUi.webMuted}
                    />
                  </View>
                </View>
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
                style={[styles.payBtn, paying && styles.payBtnDisabled]}
                onPress={() => void handlePay()}
                disabled={paying}
                activeOpacity={0.9}
              >
                {paying ? (
                  <ActivityIndicator color={menuUi.navy} />
                ) : (
                  <>
                    <Ionicons name="card-outline" size={20} color={menuUi.navy} />
                    <Text style={styles.payBtnText}>{t('publicKitchenMenuPayNow')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(12, 18, 34, 0.55)',
    justifyContent: 'flex-end',
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(6px)' } as object) : {}),
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: { fontSize: 22, fontWeight: '800', color: menuUi.navy, letterSpacing: -0.4 },
  sub: { fontSize: 13, color: menuUi.webMuted, marginTop: 4, fontWeight: '600' },
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
  thumb: { width: 64, height: 64, borderRadius: 14, backgroundColor: menuUi.imagePlaceholder },
  thumbPh: { alignItems: 'center', justifyContent: 'center' },
  lineBody: { flex: 1, minWidth: 0 },
  lineName: { fontSize: 15, fontWeight: '700', color: menuUi.navy },
  linePrice: { fontSize: 13, color: menuUi.webMuted, marginTop: 2 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: menuUi.warmBg,
    borderWidth: 1,
    borderColor: menuUi.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyVal: { fontSize: 15, fontWeight: '800', color: menuUi.navy, minWidth: 20, textAlign: 'center' },
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
    backgroundColor: menuUi.accent,
    borderRadius: 16,
    paddingVertical: 16,
    ...menuUi.shadowMd,
  },
  payBtnDisabled: { opacity: 0.7 },
  payBtnText: { fontSize: 17, fontWeight: '800', color: menuUi.navy },
});
