import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { invokeEdgeWithAuth } from '@/lib/invokeEdgeWithAuth';
import { getEdgeFunctionErrorMessage } from '@/lib/functionsError';
import { useAuthStore } from '@/stores/authStore';
import { StaffNameWithBadge } from '@/components/VerifiedBadge';
import { CachedImage } from '@/components/CachedImage';
import { AdminCard } from '@/components/admin';
import { adminTheme } from '@/constants/adminTheme';

type StaffRow = {
  id: string;
  auth_id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  department: string | null;
  is_active: boolean | null;
  is_online: boolean | null;
  position: string | null;
  created_at: string;
  verification_badge?: 'blue' | 'yellow' | null;
  banned_until?: string | null;
  deleted_at?: string | null;
  last_login_device_id?: string | null;
  organization?: { name: string } | null;
};

type GuestRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  status: string | null;
  created_at: string;
  room_id: string | null;
  room_number: string | null;
  auth_user_id?: string | null;
  banned_until?: string | null;
  deleted_at?: string | null;
  last_login_device_id?: string | null;
  is_guest_app_account?: boolean;
  photo_url?: string | null;
};

const BAN_DURATIONS = [
  { label: '1 saat', hours: 1 },
  { label: '24 saat', hours: 24 },
  { label: '1 hafta', hours: 24 * 7 },
  { label: '1 ay', hours: 24 * 30 },
  { label: '1 yıl', hours: 24 * 365 },
];

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  reception_chief: 'Resepsiyon Şefi',
  receptionist: 'Resepsiyonist',
  housekeeping: 'Housekeeping',
  technical: 'Teknik',
  security: 'Güvenlik',
};

export default function StaffListScreen() {
  const router = useRouter();
  const currentStaffId = useAuthStore((s) => s.staff?.id);
  const [tab, setTab] = useState<'staff' | 'guests'>('staff');
  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  const [guestList, setGuestList] = useState<GuestRow[]>([]);
  const [riskyDeviceIds, setRiskyDeviceIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StaffRow | GuestRow | null>(null);
  const [adminReason, setAdminReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [banTarget, setBanTarget] = useState<StaffRow | GuestRow | null>(null);
  const [banHours, setBanHours] = useState(24);
  const [banReason, setBanReason] = useState('');
  const [banning, setBanning] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<StaffRow | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [guestLoadError, setGuestLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setGuestLoadError(null);
    const now = new Date().toISOString();
    const [
      staffRes,
      guestsRes,
      staffDeleted,
      staffBanned,
      guestsDeleted,
      guestsBanned,
    ] = await Promise.all([
      supabase
        .from('staff')
        .select(
          'id, auth_id, full_name, email, role, department, is_active, is_online, position, created_at, verification_badge, banned_until, deleted_at, last_login_device_id, organization:organization_id(name)'
        )
        .order('full_name', { ascending: true }),
      supabase.rpc('admin_list_guests', { p_filter: 'all' }),
      supabase.from('staff').select('last_login_device_id').not('deleted_at', 'is', null),
      supabase.from('staff').select('last_login_device_id').gt('banned_until', now),
      supabase.from('guests').select('last_login_device_id').not('deleted_at', 'is', null),
      supabase.from('guests').select('last_login_device_id').gt('banned_until', now),
    ]);
    if (staffRes.error) {
      setStaffList([]);
    } else {
      setStaffList((staffRes.data ?? []) as unknown as StaffRow[]);
    }

    if (guestsRes.error) {
      setGuestLoadError(guestsRes.error.message || 'Misafir listesi yüklenemedi');
      setGuestList([]);
    } else {
      setGuestList((guestsRes.data ?? []) as GuestRow[]);
    }

    const ids = new Set<string>();
    for (const r of [...(staffDeleted.data ?? []), ...(staffBanned.data ?? []), ...(guestsDeleted.data ?? []), ...(guestsBanned.data ?? [])]) {
      const d = (r as { last_login_device_id?: string | null }).last_login_device_id;
      if (d && String(d).trim()) ids.add(String(d).trim());
    }
    setRiskyDeviceIds(ids);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const confirmBan = async () => {
    if (!banTarget || !currentStaffId) return;
    setBanning(true);
    try {
      const until = new Date(Date.now() + banHours * 60 * 60 * 1000).toISOString();
      const payload = { banned_until: until, banned_by: currentStaffId, ban_reason: banReason.trim() || null };
      const isStaff = 'auth_id' in banTarget;
      const { error } = await supabase
        .from(isStaff ? 'staff' : 'guests')
        .update(payload)
        .eq('id', banTarget.id);
      if (error) throw error;
      setBanTarget(null);
      setBanReason('');
      setBanHours(24);
      await load();
      Alert.alert('Başarılı', 'Kullanıcı banlandı.');
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Ban uygulanamadı.');
    } finally {
      setBanning(false);
    }
  };

  const unban = async (row: StaffRow | GuestRow) => {
    try {
      const isStaff = 'auth_id' in row;
      await supabase
        .from(isStaff ? 'staff' : 'guests')
        .update({ banned_until: null, banned_by: null, ban_reason: null })
        .eq('id', row.id);
      await load();
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Ban kaldırılamadı.');
    }
  };

  const confirmChangePassword = async () => {
    if (!passwordTarget || newPassword.length < 6) {
      Alert.alert('Eksik', 'Yeni şifre en az 6 karakter olmalı.');
      return;
    }
    setChangingPassword(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-update-user', {
        body: { target_auth_id: passwordTarget.auth_id, new_password: newPassword },
      });
      const payload = data as { success?: boolean; error?: string };
      const serverError = payload?.error;
      if (error) {
        throw new Error(serverError || (error as Error)?.message || 'Şifre güncellenemedi.');
      }
      if (serverError || payload?.success === false) throw new Error(serverError || 'Şifre güncellenemedi.');
      setPasswordTarget(null);
      setNewPassword('');
      Alert.alert('Başarılı', 'Şifre güncellendi.');
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Şifre güncellenemedi.');
    } finally {
      setChangingPassword(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !adminReason.trim()) {
      Alert.alert('Eksik', 'Silme nedenini girin.');
      return;
    }
    const isStaff = 'auth_id' in deleteTarget;
    if (isStaff && (deleteTarget as StaffRow).id === currentStaffId) {
      Alert.alert('Hata', 'Kendi hesabınızı buradan silemezsiniz. Profil ayarlarından hesabınızı silebilirsiniz.');
      return;
    }
    setDeleting(true);
    try {
      if (isStaff) {
        const { data, error } = await invokeEdgeWithAuth('delete-user-account', {
          mode: 'admin',
          target_auth_id: (deleteTarget as StaffRow).auth_id,
          user_type: 'staff',
          admin_reason: adminReason.trim(),
        });
        if (error) throw error;
        if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      } else {
        const guest = deleteTarget as GuestRow;
        if (guest.auth_user_id) {
          const { data, error } = await invokeEdgeWithAuth('delete-user-account', {
            mode: 'admin',
            target_auth_id: guest.auth_user_id,
            user_type: 'guest',
            admin_reason: adminReason.trim(),
          });
          if (error) throw error;
          if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
        } else {
          const now = new Date().toISOString();
          const { error } = await supabase
            .from('guests')
            .update({
              deleted_at: now,
              deleted_by: currentStaffId,
              deletion_reason: adminReason.trim(),
              email: 'silindi@' + guest.id.slice(0, 8) + '.local',
              full_name: 'Silindi',
              phone: null,
            })
            .eq('id', guest.id);
          if (error) throw error;
        }
      }
      setDeleteTarget(null);
      setAdminReason('');
      await load();
      Alert.alert('Başarılı', 'Hesap silindi. Kullanıcı uygulama açtığında "Hesabınız silindi" görüp lobiye dönecek.');
    } catch (e) {
      const msg = await getEdgeFunctionErrorMessage(e);
      Alert.alert('Hata', msg || 'Hesap silinemedi.');
    } finally {
      setDeleting(false);
    }
  };

  const isRisky = (row: StaffRow) => {
    const did = row.last_login_device_id?.trim();
    if (!did) return false;
    if (!riskyDeviceIds.has(did)) return false;
    const created = new Date(row.created_at).getTime();
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return created >= thirtyDaysAgo;
  };

  const isRiskyGuest = (row: GuestRow) => {
    const did = row.last_login_device_id?.trim();
    if (!did) return false;
    if (!riskyDeviceIds.has(did)) return false;
    const created = new Date(row.created_at).getTime();
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return created >= thirtyDaysAgo;
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={adminTheme.colors.primary} />
      }
    >
      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === 'staff' && styles.tabActive]} onPress={() => setTab('staff')}>
          <Text style={[styles.tabText, tab === 'staff' && styles.tabTextActive]}>Çalışanlar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'guests' && styles.tabActive]} onPress={() => setTab('guests')}>
          <Text style={[styles.tabText, tab === 'guests' && styles.tabTextActive]}>Misafirler</Text>
        </TouchableOpacity>
      </View>
      {tab === 'staff' ? (
        <TouchableOpacity
          style={styles.addStaffButton}
          onPress={() => router.push('/admin/staff/add')}
          activeOpacity={0.9}
        >
          <Ionicons name="person-add-outline" size={18} color="#fff" />
          <Text style={styles.addStaffButtonText}>Çalışan ekle</Text>
        </TouchableOpacity>
      ) : null}

      <AdminCard padded={false} elevated>
        {tab === 'staff' && staffList.length > 0 && (
          <View style={styles.subBar}>
            <Text style={styles.subBarText}>{staffList.length} kayıt</Text>
          </View>
        )}
        {tab === 'guests' && guestList.length > 0 && (
          <View style={styles.subBar}>
            <Text style={styles.subBarText}>{guestList.length} kayıt</Text>
          </View>
        )}

        {tab === 'staff' && staffList.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={48} color={adminTheme.colors.textMuted} />
            <Text style={styles.emptyText}>Henüz çalışan kaydı yok</Text>
          </View>
        ) : null}

        {tab === 'staff' && staffList.length > 0 ? (
          staffList.map((row, index) => (
            <View key={row.id} style={styles.rowWrap}>
              {index > 0 && <View style={styles.divider} />}
              <TouchableOpacity
                style={styles.row}
                activeOpacity={0.7}
                onPress={() => router.push(`/admin/staff/${row.id}`)}
              >
                <View style={styles.rowLeft}>
                  <View style={[styles.avatar, !row.is_active && styles.avatarInactive]}>
                    <Text style={styles.avatarText}>
                      {(row.full_name || row.email || '?').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.rowBody}>
                    <StaffNameWithBadge name={row.full_name || row.email || '—'} badge={row.verification_badge ?? null} textStyle={styles.name} />
                    <Text style={styles.email} numberOfLines={1}>
                      {row.email || '—'}
                    </Text>
                    {row.organization?.name ? (
                      <Text style={styles.orgTag} numberOfLines={1}>
                        {row.organization.name}
                      </Text>
                    ) : null}
                    <View style={styles.meta}>
                      <Text style={styles.role}>{ROLE_LABELS[row.role ?? ''] ?? row.role ?? '—'}</Text>
                      {row.department ? (
                        <Text style={styles.dept}> · {row.department}</Text>
                      ) : null}
                    </View>
                    <View style={styles.badges}>
                      {row.deleted_at && (
                        <View style={styles.badgeDeleted}>
                          <Text style={styles.badgeText}>Silindi</Text>
                        </View>
                      )}
                      {row.banned_until && new Date(row.banned_until) > new Date() && (
                        <View style={styles.badgeBanned}>
                          <Text style={styles.badgeText}>Banlı</Text>
                        </View>
                      )}
                      {isRisky(row) && (
                        <View style={styles.badgeRisky}>
                          <Text style={styles.badgeText}>Riskli</Text>
                        </View>
                      )}
                      {row.is_active === false && !row.deleted_at && (
                        <View style={styles.badgeInactive}>
                          <Text style={styles.badgeText}>Pasif</Text>
                        </View>
                      )}
                      {row.is_online && !row.deleted_at && (
                        <View style={styles.badgeOnline}>
                          <Text style={styles.badgeText}>Çevrimiçi</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={adminTheme.colors.textMuted} />
              </TouchableOpacity>
              {row.id !== currentStaffId && !row.deleted_at && (
                <View style={styles.actionRow}>
                  {row.banned_until && new Date(row.banned_until) > new Date() ? (
                    <TouchableOpacity style={styles.actionBtn} onPress={() => unban(row)} hitSlop={8}>
                      <Text style={styles.unbanBtnText}>Kaldır</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={styles.actionBtn} onPress={() => setBanTarget(row)} hitSlop={8}>
                      <Ionicons name="ban-outline" size={18} color={adminTheme.colors.warning} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.actionBtn} onPress={() => router.push(`/admin/staff/profile/${row.id}`)} hitSlop={8}>
                    <Ionicons name="person-circle-outline" size={18} color={adminTheme.colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => { setPasswordTarget(row); setNewPassword(''); }} hitSlop={8}>
                    <Ionicons name="key-outline" size={18} color={adminTheme.colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => setDeleteTarget(row)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color={adminTheme.colors.error} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        ) : null}

        {tab === 'guests' && guestLoadError ? (
          <View style={[styles.empty, { padding: 20 }]}>
            <Ionicons name="warning-outline" size={48} color={adminTheme.colors.error} />
            <Text style={[styles.emptyText, { color: adminTheme.colors.error, textAlign: 'center' }]}>{guestLoadError}</Text>
            <TouchableOpacity style={{ marginTop: 12, padding: 10 }} onPress={() => load()}>
              <Text style={{ color: adminTheme.colors.primary, fontWeight: '600' }}>Tekrar dene</Text>
            </TouchableOpacity>
          </View>
        ) : tab === 'guests' && guestList.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={48} color={adminTheme.colors.textMuted} />
            <Text style={styles.emptyText}>Henüz misafir kaydı yok</Text>
          </View>
        ) : null}

        {tab === 'guests' && guestList.length > 0 ? (
          guestList.map((row, index) => (
            <View key={row.id} style={styles.rowWrap}>
              {index > 0 && <View style={styles.divider} />}
              <TouchableOpacity
                style={styles.row}
                activeOpacity={0.7}
                onPress={() => router.push(`/admin/guests/${row.id}`)}
              >
                <View style={styles.rowLeft}>
                  <View style={styles.avatarGuest}>
                    {row.photo_url ? (
                      <CachedImage uri={row.photo_url} style={styles.avatarGuestImg} contentFit="cover" />
                    ) : (
                      <Text style={styles.avatarTextDark}>
                        {(row.full_name || row.email || row.phone || '?').charAt(0).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.name} numberOfLines={1}>
                      {row.full_name || 'Misafir'}
                    </Text>
                    <Text style={styles.email} numberOfLines={1}>
                      {row.email || row.phone || '—'}
                    </Text>
                    <View style={styles.badges}>
                      {row.is_guest_app_account && (
                        <View style={styles.badgeGuestApp}>
                          <Text style={styles.badgeText}>Misafir hesap (Guest app)</Text>
                        </View>
                      )}
                      {row.deleted_at && (
                        <View style={styles.badgeDeleted}>
                          <Text style={styles.badgeText}>Silindi</Text>
                        </View>
                      )}
                      {row.banned_until && new Date(row.banned_until) > new Date() && (
                        <View style={styles.badgeBanned}>
                          <Text style={styles.badgeText}>Banlı</Text>
                        </View>
                      )}
                      {isRiskyGuest(row) && (
                        <View style={styles.badgeRisky}>
                          <Text style={styles.badgeText}>Riskli</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={adminTheme.colors.textMuted} />
              </TouchableOpacity>
              {!row.deleted_at && (
                <View style={styles.actionRow}>
                  {row.banned_until && new Date(row.banned_until) > new Date() ? (
                    <TouchableOpacity style={styles.actionBtn} onPress={() => unban(row)} hitSlop={8}>
                      <Text style={styles.unbanBtnText}>Kaldır</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={styles.actionBtn} onPress={() => setBanTarget(row)} hitSlop={8}>
                      <Ionicons name="ban-outline" size={18} color={adminTheme.colors.warning} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.actionBtn} onPress={() => setDeleteTarget(row)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color={adminTheme.colors.error} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        ) : null}
      </AdminCard>

      <Modal visible={!!banTarget} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Kullanıcıyı banla</Text>
            {banTarget && (
              <Text style={styles.modalSubtitle}>
                {banTarget.full_name || banTarget.email || ('phone' in banTarget ? banTarget.phone : null) || '—'} — süre seçin
              </Text>
            )}
            <Text style={styles.modalLabel}>Süre</Text>
            <View style={styles.durationRow}>
              {BAN_DURATIONS.map((d) => (
                <TouchableOpacity
                  key={d.label}
                  style={[styles.durationChip, banHours === d.hours && styles.durationChipActive]}
                  onPress={() => setBanHours(d.hours)}
                >
                  <Text style={[styles.durationChipText, banHours === d.hours && styles.durationChipTextActive]}>{d.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.modalLabel}>Neden (isteğe bağlı)</Text>
            <TextInput
              style={styles.modalInputShort}
              value={banReason}
              onChangeText={setBanReason}
              placeholder="Ban nedeni..."
              placeholderTextColor={adminTheme.colors.textMuted}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { setBanTarget(null); setBanReason(''); setBanHours(24); }}>
                <Text style={styles.modalCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirm, banning && styles.modalConfirmDisabled]} onPress={confirmBan} disabled={banning}>
                {banning ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalConfirmText}>Banla</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!passwordTarget} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Şifre değiştir</Text>
            {passwordTarget && (
              <Text style={styles.modalSubtitle}>
                {passwordTarget.full_name || passwordTarget.email}
              </Text>
            )}
            <Text style={styles.modalLabel}>Yeni şifre (en az 6 karakter)</Text>
            <TextInput
              style={styles.modalInputShort}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Yeni şifre"
              placeholderTextColor={adminTheme.colors.textMuted}
              secureTextEntry
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { setPasswordTarget(null); setNewPassword(''); }}>
                <Text style={styles.modalCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, (changingPassword || newPassword.length < 6) && styles.modalConfirmDisabled]}
                onPress={confirmChangePassword}
                disabled={changingPassword || newPassword.length < 6}
              >
                {changingPassword ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalConfirmText}>Kaydet</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!deleteTarget} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Hesap silme</Text>
            {deleteTarget && (
              <Text style={styles.modalSubtitle}>
                {deleteTarget.full_name || deleteTarget.email || ('phone' in deleteTarget ? deleteTarget.phone : null) || '—'} hesabını platform tarafından silmek istediğinize emin misiniz? Kullanıcı uygulama açtığında "Hesabınız silindi" görüp lobiye dönecek.
              </Text>
            )}
            <Text style={styles.modalLabel}>Silme nedeni (zorunlu)</Text>
            <TextInput
              style={styles.modalInput}
              value={adminReason}
              onChangeText={setAdminReason}
              placeholder="Örn: Kural ihlali, işten ayrıldı..."
              placeholderTextColor={adminTheme.colors.textMuted}
              multiline
              numberOfLines={3}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { setDeleteTarget(null); setAdminReason(''); }}>
                <Text style={styles.modalCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, deleting && styles.modalConfirmDisabled]}
                onPress={confirmDelete}
                disabled={deleting}
              >
                {deleting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalConfirmText}>Hesabı sil</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceTertiary },
  content: { padding: adminTheme.spacing.lg, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabs: { flexDirection: 'row', gap: 10, marginBottom: adminTheme.spacing.md },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: adminTheme.colors.surfaceSecondary, alignItems: 'center', borderWidth: 1, borderColor: adminTheme.colors.border },
  tabActive: { backgroundColor: adminTheme.colors.primary, borderColor: 'transparent' },
  tabText: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.textSecondary },
  tabTextActive: { color: '#fff' },
  subBar: { paddingHorizontal: adminTheme.spacing.xl, paddingVertical: adminTheme.spacing.sm, paddingTop: adminTheme.spacing.md },
  subBarText: { fontSize: 14, color: adminTheme.colors.textSecondary },
  addStaffButton: {
    backgroundColor: adminTheme.colors.primary,
    borderRadius: 12,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: adminTheme.spacing.md,
    paddingHorizontal: 12,
  },
  addStaffButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { fontSize: 16, color: adminTheme.colors.textSecondary, marginTop: 12 },
  rowWrap: { position: 'relative' },
  divider: { height: 1, backgroundColor: adminTheme.colors.border, marginLeft: 56 + 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: adminTheme.spacing.md,
    paddingHorizontal: adminTheme.spacing.lg,
  },
  rowLeft: { flexDirection: 'row', flex: 1, minWidth: 0 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: adminTheme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarGuest: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  avatarGuestImg: { width: 44, height: 44, borderRadius: 22 },
  avatarInactive: { backgroundColor: adminTheme.colors.textMuted, opacity: 0.8 },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#fff' },
  avatarTextDark: { fontSize: 18, fontWeight: '700', color: adminTheme.colors.text },
  rowBody: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.text },
  email: { fontSize: 13, color: adminTheme.colors.textSecondary, marginTop: 2 },
  orgTag: { fontSize: 12, color: adminTheme.colors.accent, marginTop: 4, fontWeight: '600' },
  meta: { flexDirection: 'row', marginTop: 4, flexWrap: 'wrap' },
  role: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.textSecondary },
  dept: { fontSize: 13, color: adminTheme.colors.textMuted },
  badges: { flexDirection: 'row', marginTop: 6, gap: 6, flexWrap: 'wrap' },
  badgeGuestApp: { backgroundColor: '#ccfbf1', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeDeleted: { backgroundColor: adminTheme.colors.errorLight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeBanned: { backgroundColor: adminTheme.colors.warningLight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeRisky: { backgroundColor: '#fef3c7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeInactive: { backgroundColor: adminTheme.colors.errorLight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeOnline: { backgroundColor: adminTheme.colors.successLight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '600', color: adminTheme.colors.textSecondary },
  actionRow: {
    position: 'absolute',
    right: adminTheme.spacing.md,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionBtn: { padding: 8 },
  unbanBtnText: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.primary },
  durationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  durationChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: adminTheme.colors.surfaceSecondary },
  durationChipActive: { backgroundColor: adminTheme.colors.primary },
  durationChipText: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.text },
  durationChipTextActive: { color: '#fff' },
  modalInputShort: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.sm,
    padding: 12,
    fontSize: 14,
    marginBottom: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: adminTheme.radius.lg,
    padding: adminTheme.spacing.xl,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: adminTheme.colors.text, marginBottom: 8 },
  modalSubtitle: { fontSize: 14, color: adminTheme.colors.textSecondary, marginBottom: 16 },
  modalLabel: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.textSecondary, marginBottom: 8 },
  modalInput: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.sm,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  modalActions: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
  modalCancel: { paddingVertical: 10, paddingHorizontal: 20 },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: adminTheme.colors.textSecondary },
  modalConfirm: { backgroundColor: adminTheme.colors.error, paddingVertical: 10, paddingHorizontal: 20, borderRadius: adminTheme.radius.sm, minWidth: 100, alignItems: 'center' },
  modalConfirmDisabled: { opacity: 0.7 },
  modalConfirmText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
