import { useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { theme } from '@/constants/theme';
import { fetchMyStaffTips, isPaidStaffTip, subscribeMyStaffTips, type StaffTipRow } from '@/lib/staffTips';
import { promptStaffTipReceiptShare } from '@/lib/staffTipReceiptPdf';
import { staffTipText, tipPaymentMethodLabel, formatTipAmount, staffTipLang } from '@/lib/staffTipsI18n';
import { useCachedList } from '@/hooks/useCachedList';

export default function CustomerTipsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { i18n } = useTranslation();
  const locale = staffTipLang();

  const fetchItems = useCallback(async () => {
    try {
      return await fetchMyStaffTips();
    } catch {
      return [];
    }
  }, []);

  const { items: rows, loading, refreshing, refresh, load } = useCachedList<StaffTipRow>({
    cacheKey: 'customer-staff-tips',
    fetchItems,
  });

  useEffect(() => subscribeMyStaffTips(() => void load({ silent: true })), [load]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{staffTipText('tipHistoryTitle')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading && rows.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        >
          {rows.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="gift-outline" size={40} color="#b8860b" />
              <Text style={styles.emptyText}>{staffTipText('tipHistoryEmpty')}</Text>
            </View>
          ) : (
            rows.filter(isPaidStaffTip).map((row) => {
              const staffName =
                (row.staff as { full_name?: string | null } | null)?.full_name?.trim() ||
                staffTipText('tipStaffFallback');
              const currency = (row.currency ?? 'TRY').toLowerCase();

              return (
                <View key={row.id} style={[styles.card, styles.cardPaid]}>
                  <View style={styles.paidBanner}>
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    <Text style={styles.paidBannerText}>{staffTipText('tipStatus_paidGuest')}</Text>
                  </View>

                  <View style={styles.cardTop}>
                    <Text style={styles.cardStaff}>{staffTipText('tipToStaff', { name: staffName })}</Text>
                  </View>
                  <Text style={[styles.cardAmount, styles.cardAmountPaid]}>
                    {formatTipAmount(Number(row.amount), currency)}
                  </Text>
                  <Text style={styles.cardMeta}>{tipPaymentMethodLabel(row.payment_method)}</Text>
                  {row.room_number ? (
                    <Text style={styles.cardMeta}>{staffTipText('tipRoomLabel', { room: row.room_number })}</Text>
                  ) : null}
                  {row.note ? <Text style={styles.cardNote}>{row.note}</Text> : null}
                  {row.thank_you_message ? (
                    <View style={styles.thankYouBox}>
                      <Ionicons name="heart" size={14} color="#22c55e" />
                      <View style={styles.thankYouTextCol}>
                        <Text style={styles.thankYouLabel}>{staffTipText('tipGuestThankYouReceived')}</Text>
                        <Text style={styles.thankYouMsg}>{row.thank_you_message}</Text>
                      </View>
                    </View>
                  ) : null}
                  {row.confirmed_at ? (
                    <Text style={styles.paidAt}>
                      {new Date(row.confirmed_at).toLocaleString(i18n.language || locale, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  ) : null}

                  <TouchableOpacity
                    style={styles.receiptBtn}
                    onPress={() => promptStaffTipReceiptShare(row)}
                    activeOpacity={0.88}
                  >
                    <Ionicons name="document-text-outline" size={18} color="#fff" />
                    <Text style={styles.receiptBtnText}>{staffTipText('tipReceiptShareButton')}</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.text },
  content: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyText: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center' },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    overflow: 'hidden',
  },
  cardPaid: {
    borderColor: '#22c55e',
    borderWidth: 2,
    backgroundColor: '#f0fdf4',
  },
  paidBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#16a34a',
    marginHorizontal: -16,
    marginTop: -16,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  paidBannerText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef3c7',
    marginHorizontal: -16,
    marginTop: -16,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#fde68a',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardStaff: { flex: 1, fontSize: 15, fontWeight: '800', color: theme.colors.text },
  cardAmount: { fontSize: 28, fontWeight: '900', color: '#b8860b', marginTop: 8 },
  cardAmountPaid: { color: '#16a34a' },
  cardMeta: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 4 },
  cardNote: { fontSize: 13, color: theme.colors.text, fontStyle: 'italic', marginTop: 8 },
  thankYouBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.18)',
  },
  thankYouTextCol: { flex: 1, gap: 2 },
  thankYouLabel: { fontSize: 11, fontWeight: '800', color: '#16a34a', textTransform: 'uppercase', letterSpacing: 0.4 },
  thankYouMsg: { fontSize: 13, color: theme.colors.text, lineHeight: 18 },
  cardDate: { fontSize: 11, color: theme.colors.textMuted, marginTop: 10 },
  paidAt: { fontSize: 11, color: '#16a34a', fontWeight: '700', marginTop: 10 },
  receiptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#b8860b',
  },
  receiptBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
