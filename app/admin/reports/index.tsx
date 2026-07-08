import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { sendNotification } from '@/lib/notificationService';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard } from '@/components/admin';

const REASON_LABELS: Record<string, string> = {
  spam: 'Spam / tekrarlayan içerik',
  inappropriate: 'Uygunsuz içerik',
  violence: 'Şiddet veya tehdit',
  hate: 'Nefret söylemi veya ayrımcılık',
  false_info: 'Yanıltıcı bilgi',
  other: 'Diğer',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Beklemede',
  reviewed: 'İncelendi',
  resolved: 'Çözüldü',
  dismissed: 'Reddedildi',
};

type ReportRow = {
  id: string;
  post_id: string;
  reporter_staff_id: string | null;
  reporter_guest_id: string | null;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  admin_note: string | null;
  feed_posts: { id: string; title: string | null; media_type: string } | null;
  staff: { id: string; full_name: string | null; department: string | null } | null;
  guests: { id: string; full_name: string | null } | null;
};

export default function AdminReportsIndex() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const [list, setList] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'reviewed' | 'resolved' | 'dismissed'>('pending');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const loadPendingCount = useCallback(async () => {
    const { count } = await supabase
      .from('feed_post_reports')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    setPendingCount(count ?? 0);
  }, []);

  const load = useCallback(async () => {
    let query = supabase
      .from('feed_post_reports')
      .select(
        'id, post_id, reporter_staff_id, reporter_guest_id, reason, details, status, created_at, reviewed_at, admin_note, feed_posts(id, title, media_type), staff!reporter_staff_id(id, full_name, department), guests!reporter_guest_id(id, full_name)'
      )
      .order('created_at', { ascending: false });
    if (filter !== 'all') {
      query = query.eq('status', filter);
    }
    const { data } = await query;
    setList((data as ReportRow[]) ?? []);
    loadPendingCount();
  }, [filter, loadPendingCount]);

  useEffect(() => {
    load();
    setLoading(false);
  }, [load]);

  useEffect(() => {
    loadPendingCount();
  }, [loadPendingCount]);

  const onRefresh = useCallback(async () => {
    setLoading(true);
    await load();
    setLoading(false);
  }, [load]);

  const setStatus = async (
    reportId: string,
    newStatus: 'reviewed' | 'resolved' | 'dismissed',
    r: ReportRow,
    postTitle: string | null
  ) => {
    if (!staff?.id) return;
    setUpdatingId(reportId);
    const { error } = await supabase
      .from('feed_post_reports')
      .update({
        status: newStatus,
        reviewed_at: new Date().toISOString(),
        reviewed_by: staff.id,
      })
      .eq('id', reportId);
    if (error) {
      setUpdatingId(null);
      Alert.alert('Hata', error.message);
      return;
    }
    const statusLabel = STATUS_LABELS[newStatus] ?? newStatus;
    const notifTitle = `Bildiriminiz ${statusLabel.toLowerCase()}`;
    const notifBody = postTitle
      ? `"${postTitle}" paylaşımına dair bildiriminiz ${statusLabel} olarak işlendi.`
      : `Paylaşım bildiriminiz ${statusLabel} olarak işlendi.`;
    if (r.reporter_staff_id) {
      await sendNotification({
        staffId: r.reporter_staff_id,
        title: notifTitle,
        body: notifBody,
        category: 'staff',
        notificationType: 'report_status',
        data: { reportId, status: newStatus },
        createdByStaffId: staff.id,
      });
    } else if (r.reporter_guest_id) {
      await sendNotification({
        guestId: r.reporter_guest_id,
        title: notifTitle,
        body: notifBody,
        category: 'guest',
        notificationType: 'report_status',
        data: { reportId, status: newStatus },
        createdByStaffId: staff.id,
      });
    }
    setUpdatingId(null);
    await load();
  };

  const confirmSetStatus = (
    r: ReportRow,
    newStatus: 'reviewed' | 'resolved' | 'dismissed'
  ) => {
    const action = STATUS_LABELS[newStatus];
    const who = r.reporter_guest_id ? 'bildiren kullanıcı' : 'bildiren personel';
    Alert.alert(
      action,
      `Bu bildirimi "${action}" olarak işaretlemek istediğinize emin misiniz? ${who} bilgilendirilecektir.`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Evet',
          onPress: () =>
            setStatus(
              r.id,
              newStatus,
              r,
              r.feed_posts?.title ?? null
            ),
        },
      ]
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={adminTheme.colors.accent} />}
    >
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle" size={22} color={adminTheme.colors.info} />
        <Text style={styles.infoText}>
          Paylaşım bildirimleri (şikayetler) burada listelenir. Bildirimlere 24 saat içinde dönüş yapılır.
        </Text>
      </View>

      <View style={styles.filterRow}>
        {(['pending', 'all', 'reviewed', 'resolved', 'dismissed'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
            activeOpacity={0.8}
          >
            <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
              {f === 'all' ? 'Tümü' : STATUS_LABELS[f]}
            </Text>
            {f === 'pending' && pendingCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{pendingCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {loading && list.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={adminTheme.colors.accent} />
        </View>
      ) : list.length === 0 ? (
        <AdminCard>
          <Text style={styles.empty}>Bu filtrede bildirim yok.</Text>
        </AdminCard>
      ) : (
        list.map((r) => (
          <AdminCard key={r.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.statusDot, { backgroundColor: r.status === 'pending' ? adminTheme.colors.warning : r.status === 'reviewed' || r.status === 'resolved' ? adminTheme.colors.success : adminTheme.colors.textMuted }]} />
              <Text style={styles.statusLabel}>{STATUS_LABELS[r.status] ?? r.status}</Text>
              <Text style={styles.date}>{new Date(r.created_at).toLocaleString('tr-TR')}</Text>
            </View>
            <Text style={styles.postTitle} numberOfLines={2}>
              {r.feed_posts?.title || 'Paylaşım'} (ID: {r.post_id.slice(0, 8)}…)
            </Text>
            <Text style={styles.meta}>
              Bildiren: {r.reporter_guest_id
                ? `Misafir · ${r.guests?.full_name ?? '—'}`
                : `${r.staff?.full_name ?? '—'}${r.staff?.department ? ` · ${r.staff.department}` : ''}`}
            </Text>
            <Text style={styles.reason}>Sebep: {REASON_LABELS[r.reason] ?? r.reason}</Text>
            {r.details ? (
              <Text style={styles.details} numberOfLines={3}>{r.details}</Text>
            ) : null}
            {r.status === 'pending' && (
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionReviewed]}
                  onPress={() => confirmSetStatus(r, 'reviewed')}
                  disabled={updatingId === r.id}
                >
                  {updatingId === r.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={18} color="#fff" />
                      <Text style={styles.actionBtnText}>İncelendi</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionResolved]}
                  onPress={() => confirmSetStatus(r, 'resolved')}
                  disabled={updatingId === r.id}
                >
                  <Ionicons name="checkmark-done-circle" size={18} color="#fff" />
                  <Text style={styles.actionBtnText}>Çözüldü</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionDismissed]}
                  onPress={() => confirmSetStatus(r, 'dismissed')}
                  disabled={updatingId === r.id}
                >
                  <Ionicons name="close-circle" size={18} color="#fff" />
                  <Text style={styles.actionBtnText}>Reddet</Text>
                </TouchableOpacity>
              </View>
            )}
          </AdminCard>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: adminTheme.colors.infoLight,
    padding: 14,
    borderRadius: adminTheme.radius.md,
    marginBottom: 20,
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: adminTheme.colors.info,
    lineHeight: 20,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: adminTheme.radius.full,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  filterChipActive: {
    backgroundColor: adminTheme.colors.primary,
    borderColor: adminTheme.colors.primary,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: adminTheme.colors.text,
  },
  filterChipTextActive: {
    color: '#fff',
  },
  filterBadge: {
    marginLeft: 6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  loadingWrap: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  empty: {
    fontSize: 15,
    color: adminTheme.colors.textMuted,
    textAlign: 'center',
    paddingVertical: 24,
  },
  card: {
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: adminTheme.colors.textSecondary,
  },
  date: {
    fontSize: 12,
    color: adminTheme.colors.textMuted,
    marginLeft: 'auto',
  },
  postTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: adminTheme.colors.text,
    marginBottom: 4,
  },
  meta: {
    fontSize: 13,
    color: adminTheme.colors.textSecondary,
    marginBottom: 4,
  },
  reason: {
    fontSize: 13,
    color: adminTheme.colors.accent,
    fontWeight: '600',
    marginBottom: 6,
  },
  details: {
    fontSize: 13,
    color: adminTheme.colors.textMuted,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: adminTheme.radius.sm,
  },
  actionReviewed: {
    backgroundColor: adminTheme.colors.success,
  },
  actionResolved: {
    backgroundColor: adminTheme.colors.accent,
  },
  actionDismissed: {
    backgroundColor: adminTheme.colors.textMuted,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
