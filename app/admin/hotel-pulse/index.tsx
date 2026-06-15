import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  FlatList,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { adminTheme as T } from '@/constants/adminTheme';
import { AdminCard, AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrganizationQueryScope } from '@/hooks/useAdminOrganizationQueryScope';
import { supabase } from '@/lib/supabase';
import {
  addHotelPulseManualActivity,
  deleteHotelPulseManualActivity,
  flowRowsToCsv,
  fetchHotelPulseConfig,
  fetchHotelPulseManualActivities,
  invalidateGuestHotelPulseCache,
  previewHotelPulseLive,
  saveHotelPulseConfig,
  type HotelPulseActivitiesSource,
  type HotelPulseConfigRow,
  type HotelPulseManualActivity,
  type HotelPulseReceptionSource,
  type HotelPulseSource,
} from '@/lib/hotelPulseAdmin';
import { notifyHotelPulseFacilitiesIfChanged } from '@/lib/technicalAssetNotifications';
import { HOTEL_PULSE_TEMPLATES, applyHotelPulseTemplate, type HotelPulseTemplateId } from '@/lib/hotelPulseTemplates';
import { facilitiesFromPulseConfig } from '@/lib/hotelPulseGuestPreview';

type StaffOpt = { id: string; full_name: string | null; department: string | null; role: string | null };

function StaffPickField({
  label,
  selectedId,
  staffList,
  onPress,
  onClear,
}: {
  label: string;
  selectedId: string | null;
  staffList: StaffOpt[];
  onPress: () => void;
  onClear: () => void;
}) {
  const selected = staffList.find((s) => s.id === selectedId);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.staffPickRow}>
        <TouchableOpacity style={styles.staffPickBtn} onPress={onPress} activeOpacity={0.85}>
          <Text style={styles.staffPickBtnText} numberOfLines={1}>
            {selected?.full_name?.trim() || 'Personel seçin'}
          </Text>
          <Text style={styles.staffPickBtnHint}>{selected?.department || selected?.role || 'Listeden seç'}</Text>
        </TouchableOpacity>
        {selectedId ? (
          <TouchableOpacity style={styles.staffPickClear} onPress={onClear}>
            <Text style={styles.staffPickClearText}>Temizle</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function numOrNull(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function SourceToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: HotelPulseSource;
  onChange: (v: HotelPulseSource) => void;
}) {
  return (
    <View style={styles.sourceRow}>
      <Text style={styles.sourceLabel}>{label}</Text>
      <View style={styles.sourceBtns}>
        {(['live', 'manual'] as const).map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[styles.sourceBtn, value === opt && styles.sourceBtnOn]}
            onPress={() => onChange(opt)}
          >
            <Text style={[styles.sourceBtnText, value === opt && styles.sourceBtnTextOn]}>
              {opt === 'live' ? 'Canlı' : 'Manuel'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function NumField({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType="number-pad"
        placeholder="Boş = canlı veri"
        placeholderTextColor={T.colors.textMuted}
      />
    </View>
  );
}

function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMulti]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={T.colors.textMuted}
        multiline={multiline}
      />
    </View>
  );
}

export default function AdminHotelPulseScreen() {
  const insets = useSafeAreaInsets();
  const { staff, canQuery, orgScoped } = useAdminOrganizationQueryScope();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<HotelPulseConfigRow | null>(null);
  const [activities, setActivities] = useState<HotelPulseManualActivity[]>([]);
  const [newActivity, setNewActivity] = useState('');
  const [staffList, setStaffList] = useState<StaffOpt[]>([]);
  const [pickTarget, setPickTarget] = useState<'manager' | 'reception' | null>(null);
  const [showPreview, setShowPreview] = useState(true);

  const applyTemplate = (id: HotelPulseTemplateId) => {
    if (!config) return;
    setConfig(applyHotelPulseTemplate(config, id));
    Alert.alert('Şablon uygulandı', 'Değişiklikleri görmek için önizlemeye bakın; kaydetmeyi unutmayın.');
  };

  const load = useCallback(async () => {
    if (!canQuery || !orgScoped) {
      setConfig(null);
      setActivities([]);
      setStaffList([]);
      setLoading(false);
      return;
    }
    const [cfg, acts, staffRes] = await Promise.all([
      fetchHotelPulseConfig(orgScoped),
      fetchHotelPulseManualActivities(orgScoped),
      supabase
        .from('staff')
        .select('id, full_name, department, role')
        .eq('organization_id', orgScoped)
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('full_name'),
    ]);
    setConfig(cfg);
    setActivities(acts);
    setStaffList((staffRes.data as StaffOpt[]) ?? []);
    setLoading(false);
  }, [canQuery, orgScoped]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const patch = (partial: Partial<HotelPulseConfigRow>) => {
    setConfig((c) => (c ? { ...c, ...partial } : c));
  };

  const fillFromLive = async () => {
    if (!orgScoped) return;
    const live = await previewHotelPulseLive(orgScoped);
    if (!live) {
      Alert.alert('Hata', 'Canlı veri alınamadı. Migration 368/369 uygulandı mı?');
      return;
    }
    patch({
      manual_guests_in_house: live.stats.guestsInHouse,
      manual_occupied_rooms: live.stats.occupiedRooms,
      manual_vacant_rooms: live.stats.vacantRooms,
      manual_total_rooms: live.stats.totalRooms,
      manual_check_ins_today: live.stats.checkInsToday,
      manual_check_outs_today: live.stats.checkOutsToday,
      manual_total_guests_hosted: live.lifetime.totalGuestsHosted,
      manual_completed_stays: live.lifetime.completedStays,
      manual_contract_approvals: live.lifetime.contractApprovals,
      manual_staff_online: live.ops.staffOnline,
      manual_occupancy_percent: live.ops.occupancyPercent,
      manual_rooms_ready: live.ops.roomsReady,
      manual_breakfast_served: live.ops.breakfastServed,
      manual_active_contracts: live.ops.activeContracts,
      manual_flow_check_in_rooms: flowRowsToCsv(live.todayCheckIns),
      manual_flow_check_out_rooms: flowRowsToCsv(live.todayCheckOuts),
      manual_flow_upcoming_rooms: flowRowsToCsv(live.upcomingCheckOuts),
      manual_flow_late_checkout_rooms: flowRowsToCsv(live.lateCheckoutRooms),
      manual_reception_staff_name: live.reception.staffName !== 'Resepsiyon' ? live.reception.staffName : null,
      manual_reception_staff_id: live.reception.staffId,
      manual_reception_shift_label: live.reception.shiftLabel || null,
      manual_reception_note: live.reception.note || null,
      manual_manager_staff_id: live.manager.staffId,
      manual_manager_title: live.manager.roleLabel !== 'Otel Sorumlusu' ? live.manager.roleLabel : null,
      manual_manager_note: live.manager.note || null,
      manual_boiler_label: live.facilities.boilerLabel,
      manual_boiler_active: live.facilities.boilerActive,
      manual_breakfast_hours: live.facilities.breakfastHours || null,
      manual_spa_label: live.facilities.spaLabel || null,
      manual_wifi_status: live.facilities.wifiStatus || null,
      manual_wifi_network: live.facilities.wifiNetwork || 'Valoria',
      manual_wifi_password: live.facilities.wifiPassword || 'valoria!',
      manual_parking_label: live.facilities.parkingLabel || null,
      manual_elevator_label: live.facilities.elevatorLabel || null,
      manual_restaurant_label: live.facilities.restaurantLabel || null,
      manual_announcement_label: live.facilities.announcementLabel || null,
      manual_weather_label: live.facilities.weatherLabel || null,
    });
    Alert.alert('Tamam', 'Manuel alanlar canlı verilerle dolduruldu. Kaydetmeyi unutmayın.');
  };

  const save = async () => {
    if (!orgScoped || !config || !staff?.id) return;
    setSaving(true);
    const previous = await fetchHotelPulseConfig(orgScoped);
    const { error } = await saveHotelPulseConfig(config, staff.id);
    setSaving(false);
    if (error) {
      Alert.alert('Hata', error);
      return;
    }
    invalidateGuestHotelPulseCache();
    void notifyHotelPulseFacilitiesIfChanged({
      organizationId: orgScoped,
      previous,
      next: config,
      updatedByStaffId: staff.id,
    });
    Alert.alert('Kaydedildi', 'Misafir otel nabzı güncellendi.');
  };

  const addActivity = async () => {
    if (!orgScoped || !newActivity.trim()) return;
    const { error } = await addHotelPulseManualActivity(orgScoped, newActivity.trim());
    if (error) {
      Alert.alert('Hata', error);
      return;
    }
    setNewActivity('');
    const acts = await fetchHotelPulseManualActivities(orgScoped);
    setActivities(acts);
    invalidateGuestHotelPulseCache();
  };

  const removeActivity = async (id: string) => {
    const { error } = await deleteHotelPulseManualActivity(id);
    if (error) {
      Alert.alert('Hata', error);
      return;
    }
    setActivities((prev) => prev.filter((a) => a.id !== id));
    invalidateGuestHotelPulseCache();
  };

  if (!canQuery) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.muted}>Admin yetkisi gerekli.</Text>
      </View>
    );
  }

  return (
    <>
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24, padding: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <AdminOrganizationPicker canUseAll={!!staff?.app_permissions?.super_admin || staff?.role === 'admin'} ownOrganizationId={staff?.organization_id} />

      {loading ? (
        <ActivityIndicator color={T.colors.accent} style={{ marginTop: 24 }} />
      ) : !orgScoped ? (
        <Text style={styles.muted}>İşletme seçin.</Text>
      ) : !config ? (
        <Text style={styles.muted}>Yapılandırma yüklenemedi.</Text>
      ) : (
        <>
          <AdminCard style={styles.card}>
            <Text style={styles.title}>Misafir otel nabzı</Text>
            <Text style={styles.hint}>Misafir ana ekranındaki canlı kartlar. Canlı veya manuel kaynak seçebilirsiniz.</Text>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Misafir ekranında göster</Text>
              <Switch value={config.is_enabled} onValueChange={(v) => patch({ is_enabled: v })} />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Marka adı (kurumsal kart)</Text>
              <TextInput
                style={styles.input}
                value={config.brand_name}
                onChangeText={(v) => patch({ brand_name: v })}
                placeholder="Valoria"
              />
            </View>
          </AdminCard>

          <AdminCard style={styles.card}>
            <Text style={styles.sectionTitle}>Hızlı şablonlar</Text>
            <Text style={styles.hint}>Tesis durumu ve duyuruyu tek dokunuşla doldurur. Sonra Kaydet.</Text>
            <View style={styles.templateRow}>
              {HOTEL_PULSE_TEMPLATES.map((tpl) => (
                <TouchableOpacity key={tpl.id} style={styles.templateChip} onPress={() => applyTemplate(tpl.id)} activeOpacity={0.85}>
                  <Text style={styles.templateChipTitle}>{tpl.title}</Text>
                  <Text style={styles.templateChipSub} numberOfLines={2}>
                    {tpl.description}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </AdminCard>

          <AdminCard style={styles.card}>
            <View style={styles.previewHead}>
              <Text style={styles.sectionTitle}>Misafir önizlemesi</Text>
              <TouchableOpacity onPress={() => setShowPreview((v) => !v)}>
                <Text style={styles.previewToggle}>{showPreview ? 'Gizle' : 'Göster'}</Text>
              </TouchableOpacity>
            </View>
            {showPreview && config ? (
              <>
                <Text style={styles.hint}>Kaydedilmemiş form — misafir tesis sekmesinde böyle görünür.</Text>
                {(() => {
                  const f = facilitiesFromPulseConfig(config);
                  const lines = [
                    f.boilerLabel && `• ${f.boilerLabel}${f.boilerActive ? '' : ' ⚠'}`,
                    f.breakfastHours && `• Kahvaltı: ${f.breakfastHours}`,
                    f.wifiNetwork && `• Ağ: ${f.wifiNetwork}`,
                    f.wifiPassword && `• Şifre: ${f.wifiPassword}`,
                    f.wifiStatus && `• ${f.wifiStatus}`,
                    f.spaLabel && `• ${f.spaLabel}`,
                    f.restaurantLabel && `• ${f.restaurantLabel}`,
                    f.parkingLabel && `• ${f.parkingLabel}`,
                    f.elevatorLabel && `• ${f.elevatorLabel}`,
                    f.announcementLabel && `• ${f.announcementLabel}`,
                    f.weatherLabel && `• ${f.weatherLabel}`,
                  ].filter(Boolean);
                  return lines.length > 0 ? (
                    <View style={styles.previewBox}>
                      {lines.map((line) => (
                        <Text key={line} style={styles.previewLine}>
                          {line}
                        </Text>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.muted}>Tesis alanları boş.</Text>
                  );
                })()}
              </>
            ) : null}
          </AdminCard>

          <AdminCard style={styles.card}>
            <Text style={styles.sectionTitle}>Veri kaynağı</Text>
            <SourceToggle label="Günlük sayılar" value={config.daily_source} onChange={(v) => patch({ daily_source: v })} />
            <SourceToggle label="Kurumsal (toplam)" value={config.lifetime_source} onChange={(v) => patch({ lifetime_source: v })} />
            <SourceToggle label="Bugünün akışı (oda listesi)" value={config.flow_source} onChange={(v) => patch({ flow_source: v })} />
            <View style={styles.sourceRow}>
              <Text style={styles.sourceLabel}>Otel sorumlusu</Text>
              <View style={styles.sourceBtns}>
                {(['live', 'manual', 'both'] as HotelPulseReceptionSource[]).map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.sourceBtn, config.manager_source === opt && styles.sourceBtnOn]}
                    onPress={() => patch({ manager_source: opt })}
                  >
                    <Text style={[styles.sourceBtnText, config.manager_source === opt && styles.sourceBtnTextOn]}>
                      {opt === 'live' ? 'Canlı' : opt === 'manual' ? 'Manuel' : 'İkisi'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.sourceRow}>
              <Text style={styles.sourceLabel}>Resepsiyon</Text>
              <View style={styles.sourceBtns}>
                {(['live', 'manual', 'both'] as HotelPulseReceptionSource[]).map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.sourceBtn, config.reception_source === opt && styles.sourceBtnOn]}
                    onPress={() => patch({ reception_source: opt })}
                  >
                    <Text style={[styles.sourceBtnText, config.reception_source === opt && styles.sourceBtnTextOn]}>
                      {opt === 'live' ? 'Canlı' : opt === 'manual' ? 'Manuel' : 'İkisi'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <SourceToggle label="Tesis durumu" value={config.facilities_source} onChange={(v) => patch({ facilities_source: v })} />
            <SourceToggle label="Operasyon widget" value={config.ops_source} onChange={(v) => patch({ ops_source: v })} />
            <View style={styles.sourceRow}>
              <Text style={styles.sourceLabel}>Aktivite akışı</Text>
              <View style={styles.sourceBtns}>
                {(['live', 'manual', 'both'] as HotelPulseActivitiesSource[]).map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.sourceBtn, config.activities_source === opt && styles.sourceBtnOn]}
                    onPress={() => patch({ activities_source: opt })}
                  >
                    <Text style={[styles.sourceBtnText, config.activities_source === opt && styles.sourceBtnTextOn]}>
                      {opt === 'live' ? 'Canlı' : opt === 'manual' ? 'Manuel' : 'İkisi'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => void fillFromLive()}>
              <Text style={styles.secondaryBtnText}>Canlı veriden doldur</Text>
            </TouchableOpacity>
          </AdminCard>

          <AdminCard style={styles.card}>
            <Text style={styles.sectionTitle}>Günlük sayılar (manuel)</Text>
            <NumField label="İçerideki misafir" value={String(config.manual_guests_in_house ?? '')} onChangeText={(v) => patch({ manual_guests_in_house: numOrNull(v) })} />
            <NumField label="Dolu oda" value={String(config.manual_occupied_rooms ?? '')} onChangeText={(v) => patch({ manual_occupied_rooms: numOrNull(v) })} />
            <NumField label="Boş oda" value={String(config.manual_vacant_rooms ?? '')} onChangeText={(v) => patch({ manual_vacant_rooms: numOrNull(v) })} />
            <NumField label="Toplam oda" value={String(config.manual_total_rooms ?? '')} onChangeText={(v) => patch({ manual_total_rooms: numOrNull(v) })} />
            <NumField label="Bugün giriş" value={String(config.manual_check_ins_today ?? '')} onChangeText={(v) => patch({ manual_check_ins_today: numOrNull(v) })} />
            <NumField label="Bugün çıkış" value={String(config.manual_check_outs_today ?? '')} onChangeText={(v) => patch({ manual_check_outs_today: numOrNull(v) })} />
          </AdminCard>

          <AdminCard style={styles.card}>
            <Text style={styles.sectionTitle}>Bugünün akışı — oda listeleri</Text>
            <Text style={styles.hint}>
              Manuel modda misafir ekranında görünür. Oda numaralarını virgülle ayırın: 104, 203, 305
            </Text>
            <TextField
              label="Yeni girişler"
              value={config.manual_flow_check_in_rooms ?? ''}
              onChangeText={(v) => patch({ manual_flow_check_in_rooms: v || null })}
              placeholder="104, 108, 203"
            />
            <TextField
              label="Çıkışlar"
              value={config.manual_flow_check_out_rooms ?? ''}
              onChangeText={(v) => patch({ manual_flow_check_out_rooms: v || null })}
              placeholder="102, 215"
            />
            <TextField
              label="Yaklaşan çıkışlar"
              value={config.manual_flow_upcoming_rooms ?? ''}
              onChangeText={(v) => patch({ manual_flow_upcoming_rooms: v || null })}
              placeholder="301, 402"
            />
            <TextField
              label="Geç check-out riski"
              value={config.manual_flow_late_checkout_rooms ?? ''}
              onChangeText={(v) => patch({ manual_flow_late_checkout_rooms: v || null })}
              placeholder="118"
            />
          </AdminCard>

          <AdminCard style={styles.card}>
            <Text style={styles.sectionTitle}>Otel sorumlusu</Text>
            <Text style={styles.hint}>Misafir kartının üstünde görünür — otelin başı (ör. Soner).</Text>
            <StaffPickField
              label="Gösterilecek personel"
              selectedId={config.manual_manager_staff_id}
              staffList={staffList}
              onPress={() => setPickTarget('manager')}
              onClear={() => patch({ manual_manager_staff_id: null })}
            />
            <TextField
              label="Unvan"
              value={config.manual_manager_title ?? ''}
              onChangeText={(v) => patch({ manual_manager_title: v || null })}
              placeholder="Otel Sorumlusu"
            />
            <TextField
              label="Not (isteğe bağlı)"
              value={config.manual_manager_note ?? ''}
              onChangeText={(v) => patch({ manual_manager_note: v || null })}
              placeholder="7/24 ulaşılabilir"
            />
          </AdminCard>

          <AdminCard style={styles.card}>
            <Text style={styles.sectionTitle}>Resepsiyon</Text>
            <Text style={styles.hint}>Üst kartta anlık resepsiyon görevlisi görünür.</Text>
            <StaffPickField
              label="Resepsiyon görevlisi"
              selectedId={config.manual_reception_staff_id}
              staffList={staffList}
              onPress={() => setPickTarget('reception')}
              onClear={() => patch({ manual_reception_staff_id: null })}
            />
            <TextField
              label="Görünen ad (isteğe bağlı)"
              value={config.manual_reception_staff_name ?? ''}
              onChangeText={(v) => patch({ manual_reception_staff_name: v || null })}
              placeholder="Seçilen personel adı otomatik gelir"
            />
            <TextField
              label="Vardiya saati"
              value={config.manual_reception_shift_label ?? ''}
              onChangeText={(v) => patch({ manual_reception_shift_label: v || null })}
              placeholder="08:00 – 16:00"
            />
            <TextField
              label="Not (isteğe bağlı)"
              value={config.manual_reception_note ?? ''}
              onChangeText={(v) => patch({ manual_reception_note: v || null })}
              placeholder="7/24 resepsiyon açık"
            />
          </AdminCard>

          <AdminCard style={styles.card}>
            <Text style={styles.sectionTitle}>Tesis durumu</Text>
            <TextField
              label="Kazan / sıcak su mesajı"
              value={config.manual_boiler_label ?? ''}
              onChangeText={(v) => patch({ manual_boiler_label: v || null })}
              placeholder="Sıcak su hazır"
            />
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Kazan aktif</Text>
              <Switch
                value={config.manual_boiler_active !== false}
                onValueChange={(v) => patch({ manual_boiler_active: v })}
              />
            </View>
            <TextField
              label="Kahvaltı saati"
              value={config.manual_breakfast_hours ?? ''}
              onChangeText={(v) => patch({ manual_breakfast_hours: v || null })}
              placeholder="07:30 – 10:30"
            />
            <TextField
              label="Spa / hamam"
              value={config.manual_spa_label ?? ''}
              onChangeText={(v) => patch({ manual_spa_label: v || null })}
              placeholder="Hamam 18:00'e kadar açık"
            />
            <TextField
              label="Wi‑Fi durumu"
              value={config.manual_wifi_status ?? ''}
              onChangeText={(v) => patch({ manual_wifi_status: v || null })}
              placeholder="İnternet sorunsuz"
            />
            <TextField
              label="Wi‑Fi ağ adı"
              value={config.manual_wifi_network ?? 'Valoria'}
              onChangeText={(v) => patch({ manual_wifi_network: v || null })}
              placeholder="Valoria"
            />
            <TextField
              label="Wi‑Fi şifresi"
              value={config.manual_wifi_password ?? 'valoria!'}
              onChangeText={(v) => patch({ manual_wifi_password: v || null })}
              placeholder="valoria!"
            />
            <TextField
              label="Restoran"
              value={config.manual_restaurant_label ?? ''}
              onChangeText={(v) => patch({ manual_restaurant_label: v || null })}
              placeholder="Restoran 07:00 – 22:00 açık"
            />
            <TextField
              label="Otopark"
              value={config.manual_parking_label ?? ''}
              onChangeText={(v) => patch({ manual_parking_label: v || null })}
              placeholder="Otopark: yer var"
            />
            <TextField
              label="Asansör"
              value={config.manual_elevator_label ?? ''}
              onChangeText={(v) => patch({ manual_elevator_label: v || null })}
              placeholder="Tüm asansörler çalışıyor"
            />
            <TextField
              label="Genel duyuru"
              value={config.manual_announcement_label ?? ''}
              onChangeText={(v) => patch({ manual_announcement_label: v || null })}
              placeholder="Check-out saati 12:00"
            />
            <TextField
              label="Hava durumu"
              value={config.manual_weather_label ?? ''}
              onChangeText={(v) => patch({ manual_weather_label: v || null })}
              placeholder="Trabzon 14° · parçalı bulutlu"
            />
          </AdminCard>

          <AdminCard style={styles.card}>
            <Text style={styles.sectionTitle}>Kurumsal toplamlar (manuel)</Text>
            <NumField label="Toplam ağırlanan misafir" value={String(config.manual_total_guests_hosted ?? '')} onChangeText={(v) => patch({ manual_total_guests_hosted: numOrNull(v) })} />
            <NumField label="Tamamlanan konaklama" value={String(config.manual_completed_stays ?? '')} onChangeText={(v) => patch({ manual_completed_stays: numOrNull(v) })} />
            <NumField label="Sözleşme onayı" value={String(config.manual_contract_approvals ?? '')} onChangeText={(v) => patch({ manual_contract_approvals: numOrNull(v) })} />
          </AdminCard>

          <AdminCard style={styles.card}>
            <Text style={styles.sectionTitle}>Widget sayıları (manuel)</Text>
            <NumField label="Aktif personel" value={String(config.manual_staff_online ?? '')} onChangeText={(v) => patch({ manual_staff_online: numOrNull(v) })} />
            <NumField label="Doluluk %" value={String(config.manual_occupancy_percent ?? '')} onChangeText={(v) => patch({ manual_occupancy_percent: numOrNull(v) })} />
            <NumField label="Hazır oda" value={String(config.manual_rooms_ready ?? '')} onChangeText={(v) => patch({ manual_rooms_ready: numOrNull(v) })} />
            <NumField label="Kahvaltı servisi" value={String(config.manual_breakfast_served ?? '')} onChangeText={(v) => patch({ manual_breakfast_served: numOrNull(v) })} />
            <NumField label="Aktif sözleşme" value={String(config.manual_active_contracts ?? '')} onChangeText={(v) => patch({ manual_active_contracts: numOrNull(v) })} />
          </AdminCard>

          <AdminCard style={styles.card}>
            <Text style={styles.sectionTitle}>Manuel aktivite kartları</Text>
            <Text style={styles.hint}>Misafir feed üstünde görünen duyuru satırları.</Text>
            {activities.map((a) => (
              <View key={a.id} style={styles.actRow}>
                <Text style={styles.actLabel} numberOfLines={2}>{a.label}</Text>
                <TouchableOpacity onPress={() => void removeActivity(a.id)}>
                  <Text style={styles.actDelete}>Sil</Text>
                </TouchableOpacity>
              </View>
            ))}
            <View style={styles.addRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={newActivity}
                onChangeText={setNewActivity}
                placeholder="Örn: Spa alanı yenilendi"
              />
              <TouchableOpacity style={styles.addBtn} onPress={() => void addActivity()}>
                <Text style={styles.addBtnText}>Ekle</Text>
              </TouchableOpacity>
            </View>
          </AdminCard>

          <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={() => void save()} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Kaydet</Text>}
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
      <Modal visible={pickTarget != null} transparent animationType="slide" onRequestClose={() => setPickTarget(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickTarget(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>
              {pickTarget === 'manager' ? 'Otel sorumlusu seç' : 'Resepsiyon görevlisi seç'}
            </Text>
            <FlatList
              data={staffList}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 360 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalRow}
                  onPress={() => {
                    if (!config) return;
                    if (pickTarget === 'manager') {
                      patch({
                        manual_manager_staff_id: item.id,
                        manual_manager_title: config.manual_manager_title || 'Otel Sorumlusu',
                      });
                    } else {
                      patch({
                        manual_reception_staff_id: item.id,
                        manual_reception_staff_name: item.full_name?.trim() || null,
                      });
                    }
                    setPickTarget(null);
                  }}
                >
                  <Text style={styles.modalRowText}>{item.full_name?.trim() || item.id.slice(0, 8)}</Text>
                  <Text style={styles.modalRowSub}>{item.department || item.role || '—'}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.muted}>Aktif personel bulunamadı.</Text>}
            />
            <TouchableOpacity style={styles.modalClose} onPress={() => setPickTarget(null)}>
              <Text style={styles.modalCloseText}>Kapat</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: T.colors.textMuted, textAlign: 'center', marginTop: 16 },
  card: { marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '700', color: T.colors.text, marginBottom: 6 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: T.colors.text, marginBottom: 10 },
  hint: { fontSize: 13, color: T.colors.textSecondary, lineHeight: 19, marginBottom: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  switchLabel: { fontSize: 14, fontWeight: '600', color: T.colors.text },
  field: { marginBottom: 10 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: T.colors.textMuted, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: T.colors.text,
    backgroundColor: T.colors.surface,
  },
  inputMulti: { minHeight: 56, textAlignVertical: 'top' },
  sourceRow: { marginBottom: 10 },
  sourceLabel: { fontSize: 13, fontWeight: '600', color: T.colors.text, marginBottom: 6 },
  sourceBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sourceBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  sourceBtnOn: { backgroundColor: T.colors.accent, borderColor: T.colors.accent },
  sourceBtnText: { fontSize: 12, fontWeight: '700', color: T.colors.textSecondary },
  sourceBtnTextOn: { color: '#fff' },
  secondaryBtn: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.colors.accent,
    alignItems: 'center',
  },
  secondaryBtnText: { color: T.colors.accent, fontWeight: '700' },
  actRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.colors.border,
  },
  actLabel: { flex: 1, fontSize: 14, color: T.colors.text },
  actDelete: { color: T.colors.error, fontWeight: '700', fontSize: 13 },
  addRow: { flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'center' },
  addBtn: {
    backgroundColor: T.colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
  },
  addBtnText: { color: '#fff', fontWeight: '700' },
  saveBtn: {
    backgroundColor: T.colors.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  staffPickRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  staffPickBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: T.colors.surface,
  },
  staffPickBtnText: { fontSize: 15, fontWeight: '700', color: T.colors.text },
  staffPickBtnHint: { fontSize: 11, color: T.colors.textMuted, marginTop: 2 },
  staffPickClear: { paddingHorizontal: 10, paddingVertical: 8 },
  staffPickClearText: { fontSize: 12, fontWeight: '700', color: T.colors.accent },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: T.colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    maxHeight: '70%',
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: T.colors.text, marginBottom: 12 },
  modalRow: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.colors.border },
  modalRowText: { fontSize: 15, fontWeight: '700', color: T.colors.text },
  modalRowSub: { fontSize: 12, color: T.colors.textMuted, marginTop: 2 },
  modalClose: { marginTop: 12, alignItems: 'center', paddingVertical: 10 },
  modalCloseText: { fontSize: 14, fontWeight: '700', color: T.colors.accent },
  templateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  templateChip: {
    width: '48%',
    minWidth: 140,
    flexGrow: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.colors.border,
    backgroundColor: T.colors.surface,
  },
  templateChipTitle: { fontSize: 13, fontWeight: '800', color: T.colors.text },
  templateChipSub: { fontSize: 11, color: T.colors.textMuted, marginTop: 4, lineHeight: 15 },
  previewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  previewToggle: { fontSize: 13, fontWeight: '700', color: T.colors.accent },
  previewBox: {
    backgroundColor: T.colors.background,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  previewLine: { fontSize: 13, color: T.colors.text, lineHeight: 20, marginBottom: 4 },
});
