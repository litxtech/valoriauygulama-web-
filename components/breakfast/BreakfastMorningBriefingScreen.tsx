import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCachedFocusLoad } from '@/hooks/useCachedFocusLoad';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
  RefreshControl,
} from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { AdminOrganizationPicker } from '@/components/admin';
import { adminTheme } from '@/constants/adminTheme';
import { getOccupancyScope } from '@/lib/occupancyOpsPaths';
import {
  BREAKFAST_BRIEFING_TARGETS,
  canManageBreakfastBriefing,
  canViewBreakfastBriefing,
  fetchBreakfastBriefingForDate,
  formatBriefingDateLabel,
  loadSavedBriefingTargets,
  submitBreakfastBriefing,
  suggestHotelGuestCount,
  todayIstanbulDate,
  type BreakfastBriefingTarget,
  type BreakfastMorningBriefing,
} from '@/lib/breakfastMorningBriefing';
import { BreakfastBriefingNotifCard } from '@/components/breakfast/BreakfastBriefingNotifCard';

type Props = {
  /** occupancy/admin: düzenleme; view: salt okunur (mutfak/resepsiyon bildirim ekranı) */
  mode?: 'edit' | 'view';
};

function parseCount(raw: string): number | null {
  const n = parseInt(raw.replace(/\D/g, ''), 10);
  if (Number.isNaN(n) || n < 0) return null;
  return n;
}

type BriefingCache = {
  row: BreakfastMorningBriefing | null;
  savedTargets: BreakfastBriefingTarget[];
  suggested: number | null;
};

export function BreakfastMorningBriefingScreen({ mode: modeProp }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { staff } = useAuthStore();
  const { selectedOrganizationId } = useAdminOrgStore();

  const scope = getOccupancyScope(pathname);
  const inferredMode = modeProp ?? (pathname.includes('/staff/breakfast-briefing') ? 'view' : 'edit');
  const canEdit = canManageBreakfastBriefing(staff) && inferredMode === 'edit';
  const canView = canViewBreakfastBriefing(staff);

  const canUseAll = staff?.app_permissions?.super_admin === true || staff?.role === 'admin';
  const orgScoped = useMemo(() => {
    const orgId = canUseAll ? selectedOrganizationId : staff?.organization_id;
    return orgId && orgId !== 'all' ? orgId : null;
  }, [canUseAll, selectedOrganizationId, staff?.organization_id]);

  const recordDate = todayIstanbulDate();
  const [breakfastCount, setBreakfastCount] = useState('');
  const [hotelCount, setHotelCount] = useState('');
  const [note, setNote] = useState('');
  const [targets, setTargets] = useState<BreakfastBriefingTarget[]>(['kitchen']);
  const [submitting, setSubmitting] = useState(false);
  const [prefilledHotel, setPrefilledHotel] = useState(false);

  const fetchData = useCallback(async (): Promise<BriefingCache | null> => {
    if (!orgScoped || !canView) return null;
    const [row, savedTargets, suggested] = await Promise.all([
      fetchBreakfastBriefingForDate(orgScoped, recordDate),
      loadSavedBriefingTargets(),
      suggestHotelGuestCount(orgScoped),
    ]);
    return { row, savedTargets, suggested };
  }, [canView, orgScoped, recordDate]);

  const {
    data,
    loading,
    refreshing,
    refresh,
    reload,
  } = useCachedFocusLoad<BriefingCache>({
    cacheKey: orgScoped ? `breakfast-briefing:${orgScoped}:${recordDate}` : 'breakfast-briefing:none',
    enabled: !!orgScoped && canView,
    fetchData,
  });

  const briefing = data?.row ?? null;

  useEffect(() => {
    if (!data) return;
    if (data.row) {
      setBreakfastCount(String(data.row.breakfast_guest_count));
      setHotelCount(String(data.row.hotel_guest_count));
      setNote(data.row.note ?? '');
      setTargets(data.row.notify_targets.length ? data.row.notify_targets : data.savedTargets);
    } else {
      setTargets(data.savedTargets);
      if (data.suggested != null && !prefilledHotel) {
        setHotelCount(String(data.suggested));
        setPrefilledHotel(true);
      }
    }
  }, [data, prefilledHotel]);

  const toggleTarget = (id: BreakfastBriefingTarget) => {
    if (!canEdit) return;
    setTargets((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((t) => t !== id);
        return next.length ? next : prev;
      }
      return [...prev, id];
    });
  };

  const onRefresh = () => {
    refresh();
  };

  const onSubmit = async () => {
    if (!canEdit || !orgScoped || !staff?.id) return;
    const breakfastGuestCount = parseCount(breakfastCount);
    const hotelGuestCount = parseCount(hotelCount);
    if (breakfastGuestCount == null) {
      Alert.alert('Eksik bilgi', 'Kahvaltı misafir sayısını girin.');
      return;
    }
    if (hotelGuestCount == null) {
      Alert.alert('Eksik bilgi', 'Otel nüfusunu (konaklayan misafir sayısı) girin.');
      return;
    }
    if (targets.length === 0) {
      Alert.alert('Bölüm seçin', 'Bildirim en az bir bölüme gönderilmeli (Mutfak veya Resepsiyon).');
      return;
    }

    setSubmitting(true);
    const res = await submitBreakfastBriefing({
      organizationId: orgScoped,
      breakfastGuestCount,
      hotelGuestCount,
      notifyTargets: targets,
      note,
      createdByStaffId: staff.id,
      recordDate,
    });
    setSubmitting(false);

    if (res.error) {
      Alert.alert('Gönderilemedi', res.error);
      return;
    }

    void reload();
    Alert.alert(
      'Gönderildi',
      res.notifiedCount > 0
        ? `${res.notifiedCount} personele push bildirimi iletildi.`
        : 'Kayıt güncellendi. Seçili bölümde aktif personel bulunamadı.'
    );
  };

  if (!canView) {
    return (
      <View style={styles.centered}>
        <Ionicons name="lock-closed-outline" size={40} color="#94a3b8" />
        <Text style={styles.deniedTitle}>Erişim yok</Text>
        <Text style={styles.deniedText}>Bu ekranı görüntüleme yetkiniz bulunmuyor.</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Geri dön</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!orgScoped) {
    return (
      <View style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Sabah kahvaltı sayısı</Text>
          <Text style={styles.subtitle}>Devam etmek için işletme seçin.</Text>
          {canUseAll ? <AdminOrganizationPicker canUseAll={canUseAll} ownOrganizationId={staff?.organization_id} /> : null}
        </ScrollView>
      </View>
    );
  }

  if (loading && !briefing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
        <Text style={styles.loadingText}>Yükleniyor…</Text>
      </View>
    );
  }

  const displayBreakfast = parseCount(breakfastCount) ?? briefing?.breakfast_guest_count ?? null;
  const displayHotel = parseCount(hotelCount) ?? briefing?.hotel_guest_count ?? null;
  const dateLabel = formatBriefingDateLabel(recordDate);

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
      >
        {canUseAll ? <AdminOrganizationPicker canUseAll={canUseAll} ownOrganizationId={staff?.organization_id} /> : null}

        <View style={styles.hero}>
          <View style={styles.heroBadge}>
            <Ionicons name="sunny-outline" size={16} color="#b45309" />
            <Text style={styles.heroBadgeText}>Sabah brifingi</Text>
          </View>
          <Text style={styles.heroDate}>{dateLabel}</Text>
          <Text style={styles.heroHint}>
            İki sayıyı karıştırmayın: turuncu mutfak servisi, mavi konaklayan toplam.
          </Text>
        </View>

        <View style={styles.metricRow}>
          <View style={[styles.metricCard, styles.metricBreakfast]}>
            <Text style={styles.metricRole}>MUTFAK</Text>
            <Ionicons name="restaurant" size={28} color="#b45309" />
            <Text style={styles.metricValue}>{displayBreakfast ?? '—'}</Text>
            <Text style={styles.metricLabel}>Kahvaltı servisi</Text>
            <Text style={styles.metricSub}>Hazırlanacak kişi</Text>
          </View>
          <View style={[styles.metricCard, styles.metricHotel]}>
            <Text style={[styles.metricRole, styles.metricRoleBlue]}>REFERANS</Text>
            <Ionicons name="bed-outline" size={28} color="#2563eb" />
            <Text style={styles.metricValue}>{displayHotel ?? '—'}</Text>
            <Text style={styles.metricLabel}>Konaklayan</Text>
            <Text style={styles.metricSub}>Otel nüfusu</Text>
          </View>
        </View>

        {briefing?.updated_at ? (
          <Text style={styles.metaLine}>
            Son güncelleme:{' '}
            {new Date(briefing.updated_at).toLocaleTimeString('tr-TR', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'Europe/Istanbul',
            })}
            {briefing.updated_by_name ? ` · ${briefing.updated_by_name}` : ''}
          </Text>
        ) : null}

        {canEdit ? (
          <>
            <Text style={styles.sectionTitle}>Sayıları girin</Text>
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>🍳 Mutfağın hazırlaması gereken (kahvaltı servisi)</Text>
              <TextInput
                style={styles.countInput}
                value={breakfastCount}
                onChangeText={setBreakfastCount}
                keyboardType="number-pad"
                placeholder="Örn. 42"
                placeholderTextColor="#94a3b8"
              />
              <Text style={styles.inputLabel}>🏨 Konaklayan toplam (referans — otel nüfusu)</Text>
              <TextInput
                style={styles.countInput}
                value={hotelCount}
                onChangeText={setHotelCount}
                keyboardType="number-pad"
                placeholder="Otomatik doluluk verisi"
                placeholderTextColor="#94a3b8"
              />
              <TouchableOpacity
                style={styles.suggestBtn}
                onPress={() => {
                  void suggestHotelGuestCount(orgScoped).then((n) => {
                    if (n != null) setHotelCount(String(n));
                  });
                }}
              >
                <Ionicons name="refresh-outline" size={16} color="#2563eb" />
                <Text style={styles.suggestBtnText}>Doluluktan otomatik doldur</Text>
              </TouchableOpacity>
              <Text style={styles.inputLabel}>Not (isteğe bağlı)</Text>
              <TextInput
                style={[styles.countInput, styles.noteInput]}
                value={note}
                onChangeText={setNote}
                placeholder="Örn. 2 grup tur, erken servis…"
                placeholderTextColor="#94a3b8"
                multiline
              />
            </View>

            <Text style={styles.sectionTitle}>Bildirim gönderilecek bölümler</Text>
            <Text style={styles.sectionHint}>Son seçiminiz bir sonraki girişte korunur.</Text>
            <View style={styles.targetRow}>
              {BREAKFAST_BRIEFING_TARGETS.map((t) => {
                const active = targets.includes(t.id);
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[
                      styles.targetChip,
                      { backgroundColor: active ? t.bg : '#fff', borderColor: active ? t.tint : '#e2e8f0' },
                    ]}
                    onPress={() => toggleTarget(t.id)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name={t.icon} size={22} color={active ? t.tint : '#94a3b8'} />
                    <Text style={[styles.targetChipText, active && { color: t.tint, fontWeight: '700' }]}>
                      {t.label}
                    </Text>
                    {active ? <Ionicons name="checkmark-circle" size={18} color={t.tint} /> : null}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
              onPress={() => void onSubmit()}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="notifications-outline" size={20} color="#fff" />
                  <Text style={styles.submitBtnText}>Kaydet ve bildirim gönder</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.staffBanner}>
              <Ionicons name="information-circle" size={22} color="#b45309" />
              <Text style={styles.staffBannerText}>
                Turuncu kutu mutfağın hazırlaması gereken kahvaltı sayısıdır. Mavi satır konaklayan
                toplamıdır — karıştırmayın.
              </Text>
            </View>
            {displayBreakfast != null && displayHotel != null ? (
              <BreakfastBriefingNotifCard
                snapshot={{
                  breakfastGuestCount: displayBreakfast,
                  hotelGuestCount: displayHotel,
                  recordDate,
                  note: (briefing?.note ?? note.trim()) || null,
                }}
              />
            ) : (
              <View style={styles.readOnlyCard}>
                <Ionicons name="time-outline" size={20} color="#64748b" />
                <Text style={styles.readOnlyText}>Bugün için henüz kahvaltı brifingi gönderilmedi.</Text>
              </View>
            )}
          </>
        )}

        {canEdit && scope === 'staff' ? (
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => router.push('/staff/occupancy/operations' as never)}
          >
            <Text style={styles.linkRowText}>Konaklama operasyon merkezi</Text>
            <Ionicons name="chevron-forward" size={18} color="#64748b" />
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#f8fafc' },
  loadingText: { marginTop: 12, color: '#64748b' },
  deniedTitle: { marginTop: 12, fontSize: 18, fontWeight: '700', color: '#0f172a' },
  deniedText: { marginTop: 6, color: '#64748b', textAlign: 'center' },
  backBtn: { marginTop: 20, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#0f172a', borderRadius: 10 },
  backBtnText: { color: '#fff', fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 14, color: '#64748b', marginTop: 8, marginBottom: 16 },
  hero: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#fffbeb',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 10,
  },
  heroBadgeText: { color: '#b45309', fontWeight: '700', fontSize: 12 },
  heroDate: { fontSize: 20, fontWeight: '800', color: '#0f172a', textTransform: 'capitalize' },
  heroHint: { marginTop: 8, fontSize: 14, color: '#64748b', lineHeight: 20 },
  metricRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  metricCard: {
    flex: 1,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
  },
  metricBreakfast: { backgroundColor: '#fffbeb', borderColor: '#fde68a', borderWidth: 2 },
  metricHotel: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
  metricRole: {
    fontSize: 10,
    fontWeight: '800',
    color: '#b45309',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  metricRoleBlue: { color: '#2563eb' },
  metricValue: { fontSize: 40, fontWeight: '900', color: '#0f172a', marginTop: 8 },
  metricLabel: { fontSize: 13, color: '#475569', marginTop: 4, textAlign: 'center', fontWeight: '700' },
  metricSub: { fontSize: 11, color: '#94a3b8', marginTop: 2, textAlign: 'center' },
  metaLine: { fontSize: 12, color: '#94a3b8', marginBottom: 16, textAlign: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 8, marginTop: 8 },
  sectionHint: { fontSize: 13, color: '#64748b', marginBottom: 12 },
  inputCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 8,
  },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 6, marginTop: 4 },
  countInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  noteInput: { fontSize: 15, fontWeight: '400', minHeight: 72, textAlignVertical: 'top' },
  suggestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    marginBottom: 4,
    alignSelf: 'flex-start',
  },
  suggestBtnText: { color: '#2563eb', fontWeight: '600', fontSize: 13 },
  targetRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  targetChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 2,
  },
  targetChipText: { fontSize: 15, color: '#64748b', fontWeight: '600' },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#b45309',
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 4,
  },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  readOnlyCard: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 8,
  },
  readOnlyText: { flex: 1, color: '#475569', lineHeight: 20, fontSize: 14 },
  staffBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  staffBannerText: { flex: 1, fontSize: 13, color: '#92400e', lineHeight: 19, fontWeight: '600' },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    paddingVertical: 12,
  },
  linkRowText: { color: '#64748b', fontWeight: '600' },
});
