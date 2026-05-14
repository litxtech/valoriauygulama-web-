import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
  Modal,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { getExpoPushTokenAsync, savePushTokenForStaff, isExpoGo } from '@/lib/notificationsPush';
import { useAuthStore } from '@/stores/authStore';
import { useStaffNotificationStore } from '@/stores/staffNotificationStore';
import {
  type StaffPersonnelWarningSeverity,
  SEVERITY_LABEL_TR,
} from '@/lib/staffPersonnelWarnings';

type NotifRow = {
  id: string;
  title: string;
  body: string | null;
  category: string | null;
  notification_type: string | null;
  read_at: string | null;
  created_at: string;
  data?: {
    postId?: string;
    url?: string;
    missingItemId?: string;
    kind?: string;
    note?: string;
    conversationId?: string;
    warningId?: string;
    screen?: string;
  } | null;
};

type MissingItemDetail = {
  id: string;
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'resolved';
  created_at: string;
  resolved_at: string | null;
  reminder_count: number;
  creator?: { full_name: string | null } | null;
  resolver?: { full_name: string | null } | null;
};

type PersonnelWarningDetail = {
  id: string;
  severity: StaffPersonnelWarningSeverity;
  subject_line: string | null;
  body: string;
  created_at: string;
  acknowledged_at: string | null;
  acknowledgement_note: string | null;
  image_urls: unknown;
};

function warningIdFromNotifData(data: Record<string, unknown> | NotifRow['data'] | null | undefined): string {
  if (!data || typeof data !== 'object') return '';
  const o = data as Record<string, unknown>;
  const w = o.warningId ?? o.warning_id;
  return typeof w === 'string' ? w.trim() : '';
}

export default function StaffNotificationsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { staff } = useAuthStore();
  const scrollRef = useRef<ScrollView>(null);
  const [list, setList] = useState<NotifRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingAll, setDeletingAll] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<NotifRow | null>(null);
  const [missingItemDetail, setMissingItemDetail] = useState<MissingItemDetail | null>(null);
  const [personnelWarningDetail, setPersonnelWarningDetail] = useState<PersonnelWarningDetail | null>(null);
  const [pushPerm, setPushPerm] = useState<'granted' | 'denied' | 'undetermined' | 'unknown'>('unknown');
  const [enablingPush, setEnablingPush] = useState(false);

  const markAllAsRead = useCallback(async () => {
    if (!staff?.id) return;
    const now = new Date().toISOString();
    await supabase
      .from('notifications')
      .update({ read_at: now })
      .eq('staff_id', staff.id)
      .is('read_at', null);
    setList((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    setUnreadCount(0);
    refreshBadge();
  }, [staff?.id, refreshBadge, setUnreadCount]);

  const load = useCallback(async (opts?: { scrollToTop?: boolean }) => {
    if (!staff?.id) {
      setLoading(false);
      return;
    }
    // Push iznini otomatik isteme: sadece durum kontrol et.
    if (!isExpoGo) {
      try {
        const Notifications = await import('expo-notifications').then((m) => m.default);
        const { status } = await Notifications.getPermissionsAsync();
        setPushPerm(status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined');
      } catch {
        setPushPerm('unknown');
      }
    }
    const { data } = await supabase
      .from('notifications')
      .select('id, title, body, category, notification_type, read_at, created_at, data')
      .eq('staff_id', staff.id)
      .order('created_at', { ascending: false })
      .limit(100);
    setList((data as NotifRow[]) ?? []);
    setLoading(false);
    if (opts?.scrollToTop) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      });
    }
  }, [staff?.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Yeni bildirim gelince listeyi güncelle (beğeni/yorum push’u anında görünsün)
  useEffect(() => {
    if (!staff?.id) return;
    const channel = supabase
      .channel('staff_notifications_list')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `staff_id=eq.${staff.id}` },
        () => {
          load({ scrollToTop: true });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [staff?.id]);

  const { refresh: refreshBadge, setUnreadCount, setNotificationsScreenFocused } = useStaffNotificationStore();

  useFocusEffect(
    useCallback(() => {
      setUnreadCount(0);
      setNotificationsScreenFocused(true);
      load().then(() => {
        markAllAsRead();
      });
      return () => setNotificationsScreenFocused(false);
    }, [setUnreadCount, setNotificationsScreenFocused, load, markAllAsRead])
  );

  const enablePush = useCallback(async () => {
    if (enablingPush) return;
    if (isExpoGo) {
      Alert.alert(
        'Push bildirimleri desteklenmiyor',
        'Push bildirimleri Expo Go içinde çalışmaz. Lütfen development build veya yüklenmiş uygulama (App Store / Play Store) ile deneyin.',
        [{ text: 'Tamam' }]
      );
      return;
    }
    if (!staff?.id) return;
    setEnablingPush(true);
    try {
      const token = await getExpoPushTokenAsync();
      if (token) {
        await savePushTokenForStaff(staff.id);
        setPushPerm('granted');
      } else {
        try {
          const Notifications = await import('expo-notifications').then((m) => m.default);
          const { status } = await Notifications.getPermissionsAsync();
          setPushPerm(status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined');
          if (status === 'denied') {
            Alert.alert(
              'Bildirim izni reddedildi',
              'Bildirim almak için lütfen ayarlardan izin verin.',
              [
                { text: 'İptal', style: 'cancel' },
                { text: 'Ayarları aç', onPress: () => Linking.openSettings() },
              ]
            );
          }
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      Alert.alert(t('error'), t('notificationPermissionFetchFailed'));
    } finally {
      setEnablingPush(false);
    }
  }, [staff?.id, enablingPush]);

  const markRead = async (id: string) => {
    if (!staff?.id) return;
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).eq('staff_id', staff.id);
    setList((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    refreshBadge();
  };

  const isMissingNotification = (n: NotifRow) =>
    (n.notification_type ?? '').startsWith('missing_item_') || (n.data?.kind ?? '').startsWith('missing_item_');

  const formatMissingPriority = (priority?: MissingItemDetail['priority']) => {
    if (!priority) return '-';
    if (priority === 'high') return 'Yuksek';
    if (priority === 'medium') return 'Orta';
    return 'Dusuk';
  };

  const formatMissingStatus = (status?: MissingItemDetail['status']) => {
    if (!status) return '-';
    return status === 'resolved' ? 'Giderildi' : 'Acik';
  };

  const fetchMissingItemDetail = async (missingItemId: string) => {
    setDetailLoading(true);
    const { data, error } = await supabase
      .from('missing_items')
      .select(
        `
        id,
        title,
        description,
        priority,
        status,
        created_at,
        resolved_at,
        reminder_count,
        creator:staff!missing_items_created_by_staff_id_fkey(full_name),
        resolver:staff!missing_items_resolved_by_staff_id_fkey(full_name)
      `
      )
      .eq('id', missingItemId)
      .maybeSingle();
    setDetailLoading(false);
    if (error) {
      setMissingItemDetail(null);
      return;
    }
    setMissingItemDetail((data as MissingItemDetail | null) ?? null);
  };

  const openNotificationDetail = async (n: NotifRow) => {
    setSelectedNotification(n);
    setMissingItemDetail(null);
    setPersonnelWarningDetail(null);
    setDetailVisible(true);
    if (n.data?.missingItemId) {
      await fetchMissingItemDetail(n.data.missingItemId);
    } else {
      setDetailLoading(false);
    }
  };

  const fetchPersonnelWarningDetail = async (warningId: string) => {
    if (!staff?.id || !warningId) {
      setPersonnelWarningDetail(null);
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    const { data, error } = await supabase
      .from('staff_personnel_warnings')
      .select('id, severity, subject_line, body, created_at, acknowledged_at, acknowledgement_note, image_urls')
      .eq('id', warningId)
      .eq('subject_staff_id', staff.id)
      .maybeSingle();
    setDetailLoading(false);
    if (error || !data) {
      setPersonnelWarningDetail(null);
      return;
    }
    setPersonnelWarningDetail(data as PersonnelWarningDetail);
  };

  const openPersonnelWarningsFromDetail = () => {
    const wid =
      personnelWarningDetail?.id?.trim() ||
      (selectedNotification ? warningIdFromNotifData(selectedNotification.data) : '');
    setDetailVisible(false);
    setSelectedNotification(null);
    setMissingItemDetail(null);
    setPersonnelWarningDetail(null);
    if (wid) {
      router.push({ pathname: '/staff/warnings', params: { focus: wid } });
    } else {
      router.push('/staff/warnings');
    }
  };

  const displayTitle = (n: NotifRow) => {
    if (isMissingNotification(n)) return 'Eksik Var';
    return n.title;
  };

  const onNotificationPress = (n: NotifRow) => {
    if (!n.read_at) markRead(n.id);
    if (n.notification_type === 'staff_personnel_warning') {
      setSelectedNotification(n);
      setMissingItemDetail(null);
      setPersonnelWarningDetail(null);
      setDetailVisible(true);
      setDetailLoading(true);
      const wid = warningIdFromNotifData(n.data);
      if (wid) {
        void fetchPersonnelWarningDetail(wid);
      } else {
        setDetailLoading(false);
      }
      return;
    }
    if (n.notification_type === 'staff_personnel_warning_ack') {
      const raw = n.data as Record<string, unknown> | undefined;
      const sid =
        typeof raw?.subjectStaffId === 'string'
          ? raw.subjectStaffId.trim()
          : typeof raw?.subject_staff_id === 'string'
            ? raw.subject_staff_id.trim()
            : '';
      if (sid) {
        router.push({ pathname: '/admin/staff/[id]', params: { id: sid } } as never);
      }
      return;
    }
    if (n.data?.postId) {
      router.push({ pathname: '/staff/feed', params: { openPostId: n.data.postId } });
      return;
    }
    const cid = typeof n.data?.conversationId === 'string' ? n.data.conversationId.trim() : '';
    if (cid) {
      const u = n.data?.url;
      if (typeof u === 'string' && u.includes('/admin/messages/chat/')) {
        const m = u.match(/\/admin\/messages\/chat\/([^/?#]+)/);
        if (m?.[1]) {
          router.push({ pathname: '/admin/messages/chat/[id]', params: { id: m[1] } });
          return;
        }
      }
      router.push({ pathname: '/staff/chat/[id]', params: { id: cid } });
      return;
    }
    openNotificationDetail(n);
  };

  const deleteAllNotifications = () => {
    if (!staff?.id || list.length === 0) return;
    Alert.alert(
      'Tüm bildirimleri sil',
      'Tüm bildirimleriniz kalıcı olarak silinecek. Emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            setDeletingAll(true);
            await supabase.from('notifications').delete().eq('staff_id', staff.id);
            setList([]);
            setUnreadCount(0);
            refreshBadge();
            setDeletingAll(false);
          },
        },
      ]
    );
  };

  const categoryLabel = (c: string | null) => {
    const m: Record<string, string> = {
      emergency: 'Acil',
      guest: 'Misafir',
      staff: 'Görev',
      admin: 'Admin',
      bulk: 'Duyuru',
    };
    return c ? m[c] ?? c : '';
  };

  if (!staff) {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>Oturum gerekli.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load()} />}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Text style={styles.title}>Bildirimlerim</Text>
      <Text style={styles.subtitle}>Yeni görevler, acil durumlar ve duyurular burada.</Text>
      {!isExpoGo && (pushPerm === 'denied' || pushPerm === 'undetermined') && (
        <View style={styles.pushCard}>
          <View style={styles.pushCardRow}>
            <Ionicons name="notifications-outline" size={20} color="#2b6cb0" />
            <Text style={styles.pushCardTitle}>Bildirim izni gerekli</Text>
          </View>
          <Text style={styles.pushCardDesc}>
            {pushPerm === 'denied'
              ? 'Bildirim izni daha önce reddedildi. Ayarlardan izin verebilirsiniz.'
              : 'Görevler ve duyurular için bildirim izni verin. İzni istemek için butona dokunun.'}
          </Text>
          <View style={styles.pushCardBtnRow}>
            <TouchableOpacity
              style={[styles.pushCardBtn, enablingPush && styles.pushCardBtnDisabled]}
              onPress={enablePush}
              disabled={enablingPush}
              activeOpacity={0.8}
            >
              {enablingPush ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.pushCardBtnText}>
                  {pushPerm === 'denied' ? 'Tekrar iste' : 'Bildirim izni ver'}
                </Text>
              )}
            </TouchableOpacity>
            {pushPerm === 'denied' && (
              <TouchableOpacity
                style={styles.pushCardBtnSecondary}
                onPress={() => Linking.openSettings()}
                activeOpacity={0.8}
              >
                <Text style={styles.pushCardBtnSecondaryText}>Ayarları aç</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
      {list.length > 0 && (
        <TouchableOpacity
          style={[styles.deleteAllBtn, deletingAll && styles.deleteAllBtnDisabled]}
          onPress={deleteAllNotifications}
          disabled={deletingAll}
          activeOpacity={0.7}
        >
          {deletingAll ? (
            <ActivityIndicator size="small" color="#e53e3e" />
          ) : (
            <>
              <Ionicons name="trash-outline" size={14} color="#e53e3e" />
              <Text style={styles.deleteAllBtnText}>Tümünü sil</Text>
            </>
          )}
        </TouchableOpacity>
      )}
      {list.length === 0 && !loading ? (
        <Text style={styles.empty}>Henüz bildirim yok.</Text>
      ) : (
        list.map((n) => (
          <TouchableOpacity
            key={n.id}
            style={[styles.row, n.read_at ? styles.rowRead : null]}
            onPress={() => onNotificationPress(n)}
            activeOpacity={0.8}
          >
            {categoryLabel(n.category) ? (
              <Text style={styles.rowCategory}>{categoryLabel(n.category)}</Text>
            ) : null}
            <Text style={styles.rowTitle}>{displayTitle(n)}</Text>
            {n.body ? <Text style={styles.rowBody}>{n.body}</Text> : null}
            <Text style={styles.rowTime}>{new Date(n.created_at).toLocaleString('tr-TR')}</Text>
          </TouchableOpacity>
        ))
      )}
      <Modal
        visible={detailVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setDetailVisible(false);
          setPersonnelWarningDetail(null);
        }}
      >
        <View style={styles.detailBackdrop}>
          <View style={styles.detailCard}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>{selectedNotification ? displayTitle(selectedNotification) : 'Bildirim'}</Text>
              <TouchableOpacity
                onPress={() => {
                  setDetailVisible(false);
                  setPersonnelWarningDetail(null);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={20} color="#718096" />
              </TouchableOpacity>
            </View>
            {!!selectedNotification?.body &&
              !(
                selectedNotification.notification_type === 'staff_personnel_warning' &&
                personnelWarningDetail
              ) && <Text style={styles.detailBody}>{selectedNotification.body}</Text>}
            {!!selectedNotification && (
              <Text style={styles.detailMeta}>Tarih: {new Date(selectedNotification.created_at).toLocaleString('tr-TR')}</Text>
            )}
            {!!selectedNotification && categoryLabel(selectedNotification.category) ? (
              <Text style={styles.detailMeta}>Kategori: {categoryLabel(selectedNotification.category)}</Text>
            ) : null}

            {detailLoading ? (
              <ActivityIndicator size="small" color="#2b6cb0" style={{ marginTop: 10 }} />
            ) : missingItemDetail ? (
              <View style={styles.detailBox}>
                <Text style={styles.detailSectionTitle}>Eksik Detayi</Text>
                <Text style={styles.detailLine}>Baslik: {missingItemDetail.title}</Text>
                <Text style={styles.detailLine}>Durum: {formatMissingStatus(missingItemDetail.status)}</Text>
                <Text style={styles.detailLine}>Oncelik: {formatMissingPriority(missingItemDetail.priority)}</Text>
                <Text style={styles.detailLine}>Hatirlatma sayisi: {missingItemDetail.reminder_count}</Text>
                <Text style={styles.detailLine}>Ekleyen: {missingItemDetail.creator?.full_name || '-'}</Text>
                <Text style={styles.detailLine}>Eklenme: {new Date(missingItemDetail.created_at).toLocaleString('tr-TR')}</Text>
                {missingItemDetail.status === 'resolved' ? (
                  <Text style={styles.detailLine}>
                    Gideren: {missingItemDetail.resolver?.full_name || '-'} / {missingItemDetail.resolved_at ? new Date(missingItemDetail.resolved_at).toLocaleString('tr-TR') : '-'}
                  </Text>
                ) : null}
                <Text style={styles.detailSectionTitle}>Not</Text>
                <Text style={styles.detailNote}>{missingItemDetail.description?.trim() || 'Not girilmemis.'}</Text>
              </View>
            ) : selectedNotification?.notification_type === 'staff_personnel_warning' ? (
              <View style={{ marginTop: 8 }}>
                {personnelWarningDetail ? (
                  <View style={styles.detailBox}>
                    <Text style={styles.detailSectionTitle}>Uyarı kaydı</Text>
                    <Text style={styles.detailLine}>
                      Seviye:{' '}
                      {SEVERITY_LABEL_TR[personnelWarningDetail.severity] ?? personnelWarningDetail.severity}
                    </Text>
                    {personnelWarningDetail.subject_line?.trim() ? (
                      <Text style={styles.detailLine}>Konu: {personnelWarningDetail.subject_line.trim()}</Text>
                    ) : null}
                    <Text style={styles.detailSectionTitle}>Metin</Text>
                    <Text style={styles.detailNote}>{personnelWarningDetail.body.trim()}</Text>
                    <Text style={styles.detailMeta}>
                      {new Date(personnelWarningDetail.created_at).toLocaleString('tr-TR')}
                      {personnelWarningDetail.acknowledged_at
                        ? ` · Okundu: ${new Date(personnelWarningDetail.acknowledged_at).toLocaleString('tr-TR')}`
                        : ' · Okuma bekliyor'}
                    </Text>
                    {personnelWarningDetail.acknowledgement_note?.trim() ? (
                      <Text style={[styles.detailLine, { marginTop: 8 }]}>
                        Sizin notunuz: {personnelWarningDetail.acknowledgement_note.trim()}
                      </Text>
                    ) : null}
                  </View>
                ) : selectedNotification.body?.trim() ? (
                  <Text style={styles.detailMeta}>
                    Tam kayıt yüklenemedi veya kimlik eksik; yukarıdaki özet geçerlidir. Görseller ve tam kayıt için
                    uyarılar sayfasını açın.
                  </Text>
                ) : (
                  <Text style={styles.detailWarn}>
                    Tam kayıt yüklenemedi veya kimlik eksik; tam metin ve görseller için aşağıdan uyarılar sayfasını
                    açın.
                  </Text>
                )}
                <TouchableOpacity
                  style={styles.warningDetailBtn}
                  onPress={openPersonnelWarningsFromDetail}
                  activeOpacity={0.85}
                >
                  <Ionicons name="document-text-outline" size={18} color="#fff" />
                  <Text style={styles.warningDetailBtnText}>Resmi uyarılar sayfasında aç</Text>
                </TouchableOpacity>
              </View>
            ) : selectedNotification && isMissingNotification(selectedNotification) ? (
              <Text style={styles.detailWarn}>Eksik kaydinin detaylari su an alinamadi.</Text>
            ) : null}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7fafc' },
  content: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  message: { fontSize: 16, color: '#718096' },
  title: { fontSize: 20, fontWeight: '700', color: '#1a202c', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#718096', marginBottom: 20 },
  pushCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    marginBottom: 14,
  },
  pushCardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  pushCardTitle: { fontSize: 15, fontWeight: '700', color: '#1a202c' },
  pushCardDesc: { fontSize: 13, color: '#4a5568', lineHeight: 18 },
  pushCardBtnRow: { marginTop: 12, gap: 10 },
  pushCardBtn: {
    backgroundColor: '#2b6cb0',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  pushCardBtnDisabled: { opacity: 0.7 },
  pushCardBtnText: { color: '#fff', fontWeight: '700' },
  pushCardBtnSecondary: {
    marginTop: 6,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2b6cb0',
  },
  pushCardBtnSecondaryText: { color: '#2b6cb0', fontWeight: '600' },
  deleteAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 12,
    borderRadius: 6,
    backgroundColor: 'transparent',
  },
  deleteAllBtnDisabled: { opacity: 0.6 },
  deleteAllBtnText: { fontSize: 12, fontWeight: '500', color: '#e53e3e' },
  empty: { color: '#a0aec0', fontSize: 14 },
  row: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  rowRead: { opacity: 0.85 },
  rowCategory: { fontSize: 12, color: '#b8860b', fontWeight: '600', marginBottom: 4 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: '#1a202c', marginBottom: 4 },
  rowBody: { fontSize: 14, color: '#4a5568', marginBottom: 8 },
  rowTime: { fontSize: 12, color: '#a0aec0' },
  detailBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: 20 },
  detailCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
  },
  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 },
  detailTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: '#1a202c' },
  detailBody: { fontSize: 14, lineHeight: 20, color: '#334155', marginBottom: 8 },
  detailMeta: { fontSize: 12, color: '#64748b', marginBottom: 4 },
  detailBox: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 10,
    gap: 4,
  },
  detailSectionTitle: { marginTop: 6, marginBottom: 2, fontSize: 13, fontWeight: '700', color: '#1e293b' },
  detailLine: { fontSize: 13, color: '#334155' },
  detailNote: { fontSize: 13, color: '#1f2937', lineHeight: 20 },
  detailWarn: { marginTop: 10, fontSize: 13, color: '#b45309' },
  warningDetailBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#991b1b',
    paddingVertical: 12,
    borderRadius: 10,
  },
  warningDetailBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
