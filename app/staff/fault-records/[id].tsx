import { useCallback, useState, type ReactNode } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, TouchableOpacity, Image, Linking } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import {
  getFaultRecord,
  setFaultRecordStatus,
  deleteFaultRecord,
  faultCategoryIcon,
  faultCategoryLabel,
  faultStatusMeta,
  FAULT_RECORD_STATUSES,
  type FaultRecordRow,
  type FaultRecordMediaRow,
  type FaultRecordStatus,
} from '@/lib/faultRecords';

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function Field({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: ReactNode }) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldHead}>
        <Ionicons name={icon} size={16} color={theme.colors.primary} />
        <Text style={styles.fieldLabel}>{label}</Text>
      </View>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

export default function FaultRecordDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const isAdmin = staff?.role === 'admin';

  const [record, setRecord] = useState<FaultRecordRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const { data, error } = await getFaultRecord(id);
    if (!error && data) {
      const row = data as Record<string, unknown>;
      const creatorRaw = row.creator as { full_name: string | null } | { full_name: string | null }[] | null;
      const creator = Array.isArray(creatorRaw) ? creatorRaw[0] ?? null : creatorRaw ?? null;
      setRecord({ ...(row as unknown as FaultRecordRow), creator });
    } else if (!error) {
      setRecord(null);
    }
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const canManage = isAdmin || (!!record && record.created_by_staff_id === staff?.id);

  const changeStatus = async (status: FaultRecordStatus) => {
    if (!record || busy) return;
    setBusy(true);
    const { error } = await setFaultRecordStatus(record.id, status);
    setBusy(false);
    if (error) {
      Alert.alert('Hata', error.message ?? 'Güncellenemedi');
      return;
    }
    setRecord((r) => (r ? { ...r, status, resolved_at: status === 'resolved' ? new Date().toISOString() : null } : r));
  };

  const confirmDelete = () => {
    if (!record) return;
    Alert.alert('Kaydı sil', 'Bu arıza kaydı silinsin mi? Bu işlem geri alınamaz.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          const { error } = await deleteFaultRecord(record.id);
          setBusy(false);
          if (error) {
            Alert.alert('Hata', error.message ?? 'Silinemedi');
            return;
          }
          router.back();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (!record) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={40} color={theme.colors.textMuted} />
        <Text style={styles.emptyText}>Kayıt bulunamadı.</Text>
      </View>
    );
  }

  const meta = faultStatusMeta(record.status);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: `${meta.color}18` }]}>
          <Ionicons name={faultCategoryIcon(record.category) as never} size={28} color={meta.color} />
        </View>
        <Text style={styles.headerTitle}>
          {record.room_number ? `Oda ${record.room_number}` : record.location_label || 'Konum belirtilmedi'}
        </Text>
        <View style={styles.headerMetaRow}>
          <View style={[styles.statusPill, { backgroundColor: `${meta.color}18` }]}>
            <Text style={[styles.statusPillText, { color: meta.color }]}>{meta.label}</Text>
          </View>
          <Text style={styles.headerRecordNo}>{record.record_no ?? ''}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Field icon="pricetag-outline" label="Arıza türü" value={faultCategoryLabel(record.category)} />
        {record.location_label ? (
          <Field icon="location-outline" label="Alan / açıklama" value={record.location_label} />
        ) : null}
        <Field icon="alert-circle-outline" label="Arıza nedir?" value={record.fault_description} />
        <Field icon="hammer-outline" label="Ne yapıldı?" value={record.work_done || '—'} />
        <Field icon="cube-outline" label="Kullanılan malzeme" value={record.materials_used || '—'} />
        <Field icon="person-outline" label="Arızayı gideren personel" value={record.resolved_by_name || '—'} />
        <Field icon="checkmark-done-outline" label="Sonuç notu" value={record.result_note || '—'} />
      </View>

      {record.media && record.media.length > 0 ? (
        <View style={styles.card}>
          <View style={styles.fieldHead}>
            <Ionicons name="images-outline" size={16} color={theme.colors.primary} />
            <Text style={styles.fieldLabel}>Fotoğraf / video</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mediaStrip}>
            {record.media
              .slice()
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((m: FaultRecordMediaRow) => (
                <TouchableOpacity
                  key={m.id}
                  style={styles.mediaThumb}
                  activeOpacity={0.85}
                  onPress={() => Linking.openURL(m.public_url).catch(() => {})}
                >
                  <Image source={{ uri: m.thumbnail_url ?? m.public_url }} style={styles.mediaImg} />
                  {m.media_type === 'video' ? (
                    <View style={styles.videoPlayDot} pointerEvents="none">
                      <Ionicons name="play" size={16} color="#fff" />
                    </View>
                  ) : null}
                </TouchableOpacity>
              ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.card}>
        <Field icon="person-outline" label="Kaydeden" value={record.creator?.full_name || '—'} />
        <Field icon="calendar-outline" label="Kayıt tarihi" value={formatDateTime(record.created_at)} />
        <Field icon="checkmark-circle-outline" label="Giderilme tarihi" value={formatDateTime(record.resolved_at)} />
      </View>

      {canManage ? (
        <>
          <Text style={styles.actionLabel}>Durumu güncelle</Text>
          <View style={styles.statusRow}>
            {FAULT_RECORD_STATUSES.map((s) => {
              const active = record.status === s.value;
              return (
                <TouchableOpacity
                  key={s.value}
                  style={[styles.statusBtn, active && { backgroundColor: `${s.color}18`, borderColor: s.color }]}
                  onPress={() => changeStatus(s.value)}
                  disabled={busy}
                  activeOpacity={0.85}
                >
                  <View style={[styles.statusDot, { backgroundColor: s.color }]} />
                  <Text style={[styles.statusBtnText, active && { color: s.color, fontWeight: '700' }]}>{s.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {isAdmin ? (
            <TouchableOpacity style={styles.deleteBtn} onPress={confirmDelete} disabled={busy} activeOpacity={0.85}>
              <Ionicons name="trash-outline" size={18} color="#dc2626" />
              <Text style={styles.deleteBtnText}>Kaydı sil</Text>
            </TouchableOpacity>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  scroll: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: theme.colors.backgroundSecondary },
  emptyText: { color: theme.colors.textMuted, fontSize: 15 },
  header: { alignItems: 'center', marginBottom: 12 },
  headerIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: theme.colors.text, textAlign: 'center' },
  headerMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  statusPill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  statusPillText: { fontSize: 13, fontWeight: '700' },
  headerRecordNo: { fontSize: 13, color: theme.colors.textMuted, fontWeight: '600' },
  card: {
    backgroundColor: theme.colors.background,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  field: { marginBottom: 14 },
  fieldHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary },
  fieldValue: { fontSize: 15, color: theme.colors.text, lineHeight: 21 },
  mediaStrip: { marginTop: 12 },
  mediaThumb: {
    width: 110,
    height: 110,
    marginRight: 10,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: theme.colors.backgroundSecondary,
  },
  mediaImg: { width: '100%', height: '100%' },
  videoPlayDot: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontSize: 14, fontWeight: '700', color: theme.colors.textSecondary, marginBottom: 8, marginLeft: 4 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  statusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.background,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusBtnText: { fontSize: 14, color: theme.colors.textSecondary },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    marginTop: 4,
  },
  deleteBtnText: { color: '#dc2626', fontWeight: '700', fontSize: 15 },
});
