import { useCallback, useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getFloatingTabBarTotalHeight } from '@/constants/floatingTabBarMetrics';
import { PartnerEmptyState, PartnerScreenTitle, PartnerPrimaryButton } from '@/components/breakfastPartner/PartnerUi';
import {
  formatPartnerDate,
  formatPartnerTime,
  listPartnerNotifications,
  markAllPartnerNotificationsRead,
  type PartnerNotification,
} from '@/lib/breakfastPartner';
import { partnerRadii, partnerTheme } from '@/lib/breakfastPartnerTheme';

function notifIcon(type: string): keyof typeof Ionicons.glyphMap {
  if (type.includes('payment')) return 'wallet-outline';
  if (type.includes('price')) return 'pricetag-outline';
  if (type.includes('campaign')) return 'megaphone-outline';
  if (type.includes('approved')) return 'checkmark-done-outline';
  if (type.includes('remind')) return 'alarm-outline';
  if (type.includes('suspended')) return 'pause-circle-outline';
  if (type.includes('breakfast_confirmation')) return 'cafe-outline';
  if (type.includes('guest_pass')) return 'qr-code-outline';
  if (type.includes('camera')) return 'videocam-outline';
  return 'notifications-outline';
}

function NotifRow({ item, onPress }: { item: PartnerNotification; onPress?: () => void }) {
  const unread = !item.read_at;
  const content = (
    <>
      <View style={[styles.rowIcon, unread && styles.rowIconUnread]}>
        <Ionicons name={notifIcon(item.notification_type)} size={20} color={unread ? partnerTheme.accent : partnerTheme.muted} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.rowTop}>
          <Text style={styles.rowTitle}>{item.title}</Text>
          {unread ? <View style={styles.dot} /> : null}
        </View>
        {item.body ? <Text style={styles.rowBody}>{item.body}</Text> : null}
        <Text style={styles.rowMeta}>
          {formatPartnerDate(item.created_at.slice(0, 10))} · {formatPartnerTime(item.created_at)}
        </Text>
      </View>
    </>
  );

  if (!onPress) {
    return <View style={[styles.row, unread && styles.rowUnread]}>{content}</View>;
  }

  return (
    <Pressable style={[styles.row, unread && styles.rowUnread]} onPress={onPress}>
      {content}
    </Pressable>
  );
}

export default function PartnerNotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const listBottomPad = insets.bottom + getFloatingTabBarTotalHeight(insets) + 24;
  const footerBottomPad = insets.bottom + getFloatingTabBarTotalHeight(insets) + 16;
  const [rows, setRows] = useState<PartnerNotification[]>([]);
  const rowsRef = useRef<PartnerNotification[]>([]);
  const lastLoadAtRef = useRef(0);
  const NOTIF_LIST_TTL_MS = 60_000;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const load = useCallback(async (opts?: { background?: boolean }) => {
    const hadRows = rowsRef.current.length > 0;
    if (!opts?.background && !hadRows) {
      setLoading(true);
    }
    try {
      const data = await listPartnerNotifications();
      setRows(data);
      lastLoadAtRef.current = Date.now();
    } catch {
      if (!hadRows) setRows([]);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      const hadRows = rowsRef.current.length > 0;
      const stale = !hadRows || Date.now() - lastLoadAtRef.current >= NOTIF_LIST_TTL_MS;
      void markAllPartnerNotificationsRead();
      if (stale) {
        void load({ background: hadRows });
      }
    }, [load])
  );

  return (
    <View style={styles.root}>
      <PartnerScreenTitle title="Bildirimler" subtitle="Onay, fiyat, tahsilat ve hatırlatmalar" />
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: listBottomPad }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load({ background: true }); }} tintColor={partnerTheme.accent} />
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color={partnerTheme.accent} style={{ marginVertical: 32 }} />
          ) : (
            <PartnerEmptyState
              icon="notifications-off-outline"
              title="Henüz bildirim yok"
              body="Hesap onayı, fiyat güncellemesi ve tahsilatlar burada görünecek."
            />
          )
        }
        renderItem={({ item }) => (
          <NotifRow
            item={item}
            onPress={
              item.notification_type.includes('breakfast_guest_pass_redeemed')
                ? () => {
                    const passId = item.data?.passId ?? item.data?.pass_id;
                    if (typeof passId === 'string' && passId) {
                      router.push(`/partner/guest-passes/${passId}`);
                    } else {
                      router.push('/partner/guest-passes');
                    }
                  }
                : item.notification_type.includes('breakfast_confirmation')
                ? () => router.push('/partner/breakfast-confirmations')
                : item.notification_type.includes('camera')
                  ? () => {
                      const requestId = item.data?.requestId ?? item.data?.request_id;
                      if (typeof requestId === 'string' && requestId) {
                        router.push(`/partner/camera-requests/${requestId}`);
                      } else {
                        router.push('/partner/camera-requests');
                      }
                    }
                  : undefined
            }
          />
        )}
      />
      {rows.some((r) => !r.read_at) ? (
        <View style={[styles.footer, { paddingBottom: footerBottomPad }]}>
          <PartnerPrimaryButton
            label="Tümünü okundu işaretle"
            variant="ghost"
            onPress={() => {
              void markAllPartnerNotificationsRead().then(load);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: partnerTheme.bg },
  list: { paddingHorizontal: 18, paddingBottom: 24, paddingTop: 8, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: partnerTheme.card,
    borderRadius: partnerRadii.lg,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
  },
  rowUnread: { borderColor: partnerTheme.cardBorderFocus, backgroundColor: partnerTheme.cardElevated },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: partnerTheme.cardElevated,
  },
  rowIconUnread: { backgroundColor: partnerTheme.accentSoft },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { color: partnerTheme.text, fontWeight: '800', fontSize: 15, flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: partnerTheme.accent },
  rowBody: { color: partnerTheme.muted, fontSize: 14, marginTop: 4, lineHeight: 20 },
  rowMeta: { color: partnerTheme.mutedSoft, fontSize: 12, marginTop: 8 },
  footer: { paddingHorizontal: 18, paddingBottom: 16 },
});
