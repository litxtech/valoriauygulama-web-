import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { usePartnerAuthStore } from '@/stores/partnerAuthStore';
import {
  fetchPaymentRequestById,
  subscribePaymentRequestStatus,
  type PaymentRequestRow,
} from '@/lib/payments';
import {
  cancelGuestStaffTipIfPending,
  fetchStaffTipByPaymentRequest,
  isPaidStaffTip,
  type StaffTipRow,
} from '@/lib/staffTips';
import { navigateFromPaymentReturn } from '@/lib/paymentReturnNav';
import { useTranslation } from 'react-i18next';
import { staffTipText, formatTipAmount } from '@/lib/staffTipsI18n';
import { paymentText } from '@/lib/paymentsI18n';
import {
  listPaymentReceiptAdminStaff,
  type PaymentReceiptAdminContact,
} from '@/lib/paymentReceiptContact';
import {
  buildPaymentReceiptChatMessage,
  buildTipReceiptChatMessage,
  sendPaymentReceiptViaInAppChat,
} from '@/lib/paymentReceiptMessenger';
import { CachedImage } from '@/components/CachedImage';

type Kind = 'success' | 'cancel';

const AUTO_REDIRECT_MS = 9000;
const TIP_GOLD = '#d4af37';

type Props = {
  kind: Kind;
};

export function PaymentReturnScreen({ kind }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { i18n } = useTranslation();
  void i18n.language;
  const { id } = useLocalSearchParams<{ id?: string; token?: string }>();
  const { user, staff } = useAuthStore();
  const partner = usePartnerAuthStore((s) => s.partner);
  const [row, setRow] = useState<PaymentRequestRow | null>(null);
  const [tipRow, setTipRow] = useState<StaffTipRow | null>(null);
  const [tipStaffName, setTipStaffName] = useState<string | null>(null);
  const [tipAmount, setTipAmount] = useState<number | null>(null);
  const [tipCurrency, setTipCurrency] = useState('try');
  const [loading, setLoading] = useState(!!id);
  const [receiptAdmins, setReceiptAdmins] = useState<PaymentReceiptAdminContact[]>([]);
  const [selectedAdminId, setSelectedAdminId] = useState<string | null>(null);
  const [receiptAdminLoading, setReceiptAdminLoading] = useState(false);
  const [sendingReceipt, setSendingReceipt] = useState(false);
  const [receiptSent, setReceiptSent] = useState(false);
  const redirected = useRef(false);

  const isPartner = !!partner || row?.reference_type === 'breakfast_partner_hotel';
  const isGuest = !!user && !staff && !isPartner;

  const goHome = useCallback(() => {
    if (redirected.current) return;
    redirected.current = true;
    navigateFromPaymentReturn(router, {
      isStaff: !!staff,
      isGuest,
      isPartner,
      paymentId: id,
      referenceType: row?.reference_type,
    });
  }, [router, staff, isGuest, isPartner, id, row?.reference_type]);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let alive = true;
    void fetchPaymentRequestById(id)
      .then(async (data) => {
        if (!alive) return;
        setRow(data);
        if (data?.reference_type === 'staff_tip') {
          const tip = await fetchStaffTipByPaymentRequest(id);
          if (!alive || !tip) return;
          if (kind === 'cancel' && tip.status === 'pending') {
            void cancelGuestStaffTipIfPending(tip.id).catch(() => {});
          }
          setTipRow(tip);
          const name =
            (tip.staff as { full_name?: string | null } | null)?.full_name?.trim() ||
            staffTipText('tipStaffFallback');
          setTipStaffName(name);
          setTipAmount(Number(tip.amount));
          setTipCurrency((tip.currency ?? data.currency ?? 'try').toLowerCase());
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id, kind]);

  useEffect(() => {
    if (kind !== 'success' || !id || !row || row.status === 'paid') return;
    return subscribePaymentRequestStatus(id, (patch) => {
      setRow((prev) => (prev ? { ...prev, ...patch } : prev));
    });
  }, [kind, id, row?.status]);

  useEffect(() => {
    if (kind !== 'success' || !id || row?.reference_type !== 'staff_tip') return;
    if (tipRow && isPaidStaffTip(tipRow)) return;

    const refreshTip = () => {
      void fetchStaffTipByPaymentRequest(id).then((tip) => {
        if (tip) setTipRow(tip);
      });
    };

    if (row?.status === 'paid') refreshTip();
    const poll = setInterval(refreshTip, 2500);
    return () => clearInterval(poll);
  }, [kind, id, row?.reference_type, row?.status, tipRow?.id, tipRow?.confirmed_at, tipRow?.status]);

  useEffect(() => {
    if (kind !== 'success' || !isGuest) return;
    let alive = true;
    setReceiptAdminLoading(true);
    void listPaymentReceiptAdminStaff()
      .then((contacts) => {
        if (!alive) return;
        setReceiptAdmins(contacts);
        if (contacts.length === 1) {
          setSelectedAdminId(contacts[0].id);
        }
      })
      .finally(() => {
        if (alive) setReceiptAdminLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [kind, isGuest]);

  useEffect(() => {
    const timer = setTimeout(goHome, AUTO_REDIRECT_MS);
    return () => clearTimeout(timer);
  }, [goHome]);

  const isTip = row?.reference_type === 'staff_tip';
  const isSuccess = kind === 'success';
  const accent = isSuccess ? (isTip ? TIP_GOLD : '#16a34a') : '#64748b';
  const iconName = isSuccess ? 'checkmark-circle' : 'close-circle';

  const paymentSettled =
    row?.status === 'paid' || (isTip && tipRow != null && isPaidStaffTip(tipRow));

  const staffName = tipStaffName ?? staffTipText('tipStaffFallback');
  const amountLabel =
    tipAmount != null
      ? formatTipAmount(tipAmount, tipCurrency)
      : row
        ? formatTipAmount(Number(row.amount), (row.currency ?? 'try').toLowerCase())
        : '';

  const title = isSuccess
    ? isTip
      ? staffTipText('tipSuccessPaidTitle')
      : paymentText('paymentsPaid').replace(' ✓', '')
    : isTip
      ? staffTipText('tipPayCancelled')
      : paymentText('paymentsCancelled');

  const body = isSuccess
    ? isTip
      ? staffTipText('tipReturnSuccessBody', { amount: amountLabel, name: staffName })
      : staffTipText('tipReturnPaymentSuccessBody')
    : staffTipText('tipReturnPaymentCancelBody');

  const selectedAdmin = receiptAdmins.find((a) => a.id === selectedAdminId) ?? null;

  const adminRoleLabel = (role: string | null | undefined) =>
    role === 'owner' ? staffTipText('paymentReceiptRoleOwner') : staffTipText('paymentReceiptRoleAdmin');

  const handleSendReceipt = useCallback(async () => {
    if (!selectedAdmin?.id || sendingReceipt || receiptSent || !paymentSettled) {
      if (!selectedAdmin?.id && receiptAdmins.length > 0) {
        Alert.alert(staffTipText('tipAlertInfo'), staffTipText('paymentReceiptSelectRequired'));
      }
      return;
    }

    const targetAdmin = selectedAdmin;
    const targetName = (targetAdmin.full_name ?? '').trim() || adminRoleLabel(targetAdmin.role);

    setSendingReceipt(true);
    try {
      let message: string | null = null;
      if (isTip && tipRow) {
        message = await buildTipReceiptChatMessage(tipRow);
      } else if (row) {
        message = buildPaymentReceiptChatMessage(row);
      }
      if (!message) {
        Alert.alert(staffTipText('tipAlertError'), staffTipText('tipReceiptNotReady'));
        return;
      }

      const { conversationId, error } = await sendPaymentReceiptViaInAppChat({
        adminStaffId: targetAdmin.id,
        message,
      });

      if (error || !conversationId) {
        Alert.alert(staffTipText('tipAlertError'), error ?? staffTipText('paymentReceiptSendFailed'));
        return;
      }

      setReceiptSent(true);
      Alert.alert(
        staffTipText('paymentReceiptSentTitle'),
        staffTipText('paymentReceiptSentBody', { name: targetName }),
        [
          { text: staffTipText('tipReturnToApp'), style: 'cancel', onPress: goHome },
          {
            text: staffTipText('paymentReceiptViewChat'),
            onPress: () => {
              redirected.current = true;
              router.replace({
                pathname: '/customer/chat/[id]',
                params: { id: conversationId, name: targetName },
              });
            },
          },
        ]
      );
    } finally {
      setSendingReceipt(false);
    }
  }, [
    selectedAdmin,
    sendingReceipt,
    receiptSent,
    paymentSettled,
    receiptAdmins.length,
    isTip,
    tipRow,
    row,
    goHome,
    router,
  ]);

  const showReceiptBlock = isSuccess && isGuest && paymentSettled && !loading;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <LinearGradient
        colors={isTip && isSuccess ? ['#0f172a', '#1a1508', '#0f172a'] : ['#0f172a', '#1e293b']}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.card, isTip && isSuccess && styles.cardTip]}>
        <View style={[styles.iconWrap, { backgroundColor: `${accent}22`, borderColor: `${accent}44` }]}>
          {loading && isSuccess ? (
            <ActivityIndicator size="large" color={accent} />
          ) : (
            <Ionicons name={iconName} size={52} color={accent} />
          )}
        </View>

        {isTip && isSuccess && amountLabel ? (
          <View style={[styles.amountPill, { borderColor: `${TIP_GOLD}55` }]}>
            <Ionicons name="gift" size={16} color={TIP_GOLD} />
            <Text style={styles.amountPillText}>{amountLabel}</Text>
          </View>
        ) : null}

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>

        {isTip && isSuccess ? (
          <View style={styles.notifyCard}>
            <View style={styles.notifyIconWrap}>
              <Ionicons name="notifications" size={18} color={TIP_GOLD} />
            </View>
            <Text style={styles.notifyText}>{staffTipText('tipReturnStaffNotified')}</Text>
          </View>
        ) : null}

        {showReceiptBlock ? (
          <View style={styles.receiptBlock}>
            <Text style={styles.receiptSectionTitle}>{staffTipText('paymentReceiptSelectAdmin')}</Text>

            {receiptAdminLoading ? (
              <ActivityIndicator size="small" color="#94a3b8" style={{ marginVertical: 12 }} />
            ) : receiptAdmins.length > 0 ? (
              <View style={styles.adminList}>
                {receiptAdmins.map((admin) => {
                  const name = (admin.full_name ?? '').trim() || adminRoleLabel(admin.role);
                  const initial = name.charAt(0).toUpperCase();
                  const selected = selectedAdminId === admin.id;
                  return (
                    <TouchableOpacity
                      key={admin.id}
                      style={[styles.adminCard, selected && styles.adminCardSelected]}
                      onPress={() => setSelectedAdminId(admin.id)}
                      activeOpacity={0.88}
                      disabled={receiptSent}
                    >
                      <View style={styles.adminAvatarWrap}>
                        {admin.profile_image ? (
                          <CachedImage uri={admin.profile_image} style={styles.adminAvatar} contentFit="cover" />
                        ) : (
                          <View style={[styles.adminAvatar, styles.adminAvatarPh]}>
                            <Text style={styles.adminAvatarLetter}>{initial}</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.adminInfo}>
                        <Text style={styles.adminName}>{name}</Text>
                        <Text style={styles.adminCaption}>{adminRoleLabel(admin.role)}</Text>
                      </View>
                      <Ionicons
                        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={selected ? TIP_GOLD : '#64748b'}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.adminMissing}>{staffTipText('paymentReceiptAdminMissing')}</Text>
            )}

            <TouchableOpacity
              style={[
                styles.receiptBtn,
                receiptSent && styles.receiptBtnSent,
                (sendingReceipt || receiptAdminLoading || receiptAdmins.length === 0 || !selectedAdminId) &&
                  styles.receiptBtnDisabled,
              ]}
              onPress={() => void handleSendReceipt()}
              activeOpacity={0.88}
              disabled={
                sendingReceipt || receiptSent || receiptAdminLoading || receiptAdmins.length === 0 || !selectedAdminId
              }
            >
              {sendingReceipt ? (
                <ActivityIndicator size="small" color={TIP_GOLD} />
              ) : (
                <Ionicons
                  name={receiptSent ? 'checkmark-circle' : 'paper-plane-outline'}
                  size={18}
                  color={TIP_GOLD}
                />
              )}
              <Text style={styles.receiptBtnText}>
                {sendingReceipt
                  ? staffTipText('paymentReceiptSending')
                  : receiptSent
                    ? staffTipText('paymentReceiptSentTitle')
                    : staffTipText('tipReceiptButton')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <TouchableOpacity style={[styles.btn, { backgroundColor: accent }]} onPress={goHome} activeOpacity={0.88}>
          <Text style={[styles.btnText, isTip && isSuccess && styles.btnTextDark]}>{staffTipText('tipReturnToApp')}</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>{staffTipText('tipReturnAutoHint')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
  },
  cardTip: {
    borderColor: 'rgba(212,175,55,0.25)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
  },
  amountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(212,175,55,0.12)',
    marginBottom: 16,
  },
  amountPillText: {
    fontSize: 20,
    fontWeight: '900',
    color: TIP_GOLD,
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#f8fafc',
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: '#cbd5e1',
    textAlign: 'center',
    marginBottom: 16,
  },
  notifyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(212,175,55,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.2)',
    marginBottom: 16,
  },
  notifyIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(212,175,55,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifyText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: '#e2e8f0',
  },
  receiptBlock: {
    width: '100%',
    marginBottom: 8,
  },
  receiptSectionTitle: {
    width: '100%',
    fontSize: 13,
    fontWeight: '700',
    color: '#cbd5e1',
    textAlign: 'center',
    marginBottom: 10,
  },
  adminList: {
    width: '100%',
    gap: 8,
    marginBottom: 12,
  },
  receiptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.45)',
    backgroundColor: 'rgba(212,175,55,0.12)',
    marginBottom: 4,
  },
  receiptBtnSent: {
    borderColor: 'rgba(34,197,94,0.45)',
    backgroundColor: 'rgba(34,197,94,0.12)',
  },
  receiptBtnDisabled: {
    opacity: 0.65,
  },
  receiptBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: TIP_GOLD,
  },
  adminCardSelected: {
    borderColor: 'rgba(212,175,55,0.55)',
    backgroundColor: 'rgba(212,175,55,0.14)',
  },
  adminCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  adminAvatarWrap: {
    width: 44,
    height: 44,
  },
  adminAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  adminAvatarPh: {
    backgroundColor: 'rgba(212,175,55,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminAvatarLetter: {
    fontSize: 18,
    fontWeight: '800',
    color: TIP_GOLD,
  },
  adminInfo: {
    flex: 1,
    minWidth: 0,
  },
  adminName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#f8fafc',
  },
  adminCaption: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
  },
  adminMissing: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 16,
  },
  btn: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 999,
  },
  btnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  btnTextDark: {
    color: '#1a1508',
  },
  hint: {
    marginTop: 16,
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
  },
});
