import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme as T } from '@/constants/adminTheme';
import { AdminButton, AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrganizationQueryScope } from '@/hooks/useAdminOrganizationQueryScope';
import { supabase } from '@/lib/supabase';
import {
  NOTIFICATION_SOUND_FEATURES,
  VALORIA_MODULE_FEATURES_SUMMARY,
  clampPlaybackDurationSec,
  getDefaultPlaybackDurationSec,
  getNotificationSoundFeatureDef,
  playbackDurationOptionsForFeature,
} from '@/lib/notificationSoundCatalog';
import {
  ensureOrgNotificationSoundSettings,
  fetchOrgNotificationSoundSettings,
  invalidateNotificationSoundSettingsCache,
  mergeCatalogWithRows,
  type NotificationSoundSettingRow,
} from '@/lib/notificationSoundSettings';
import {
  playNotificationSoundPreset,
  playNotificationSoundUrl,
} from '@/lib/notificationSoundPlayer';
import {
  pickNotificationSoundFile,
  uploadNotificationSoundToStorage,
} from '@/lib/notificationSoundUpload';
import { useAuthStore } from '@/stores/authStore';

function SoundFeatureCard({
  row,
  saving,
  uploading,
  durationSec,
  onDurationChange,
  onToggleActive,
  onToggleSuppressDefault,
  onTest,
  onUpload,
  onReset,
}: {
  row: NotificationSoundSettingRow & { catalog?: (typeof NOTIFICATION_SOUND_FEATURES)[0] };
  saving: boolean;
  uploading: boolean;
  durationSec: number;
  onDurationChange: (sec: number) => void;
  onToggleActive: (v: boolean) => void;
  onToggleSuppressDefault: (v: boolean) => void;
  onTest: () => void;
  onUpload: () => void;
  onReset: () => void;
}) {
  const def = row.catalog ?? getNotificationSoundFeatureDef(row.feature_key);
  const durationOptions = playbackDurationOptionsForFeature(row.feature_key);
  const storedDuration = clampPlaybackDurationSec(row.sound_duration, row.feature_key);

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.cardTitleCol}>
          <Text style={styles.cardTitle}>{row.title || def?.titleTr}</Text>
          <Text style={styles.cardDesc}>{row.description || def?.descriptionTr}</Text>
          {def?.audiences?.length ? (
            <Text style={styles.audienceTag}>
              {def.audiences.map((a) => (a === 'all' ? 'Tümü' : a === 'staff' ? 'Personel' : a === 'customer' ? 'Misafir' : 'Admin')).join(' · ')}
            </Text>
          ) : null}
        </View>
        <Switch
          value={row.is_active}
          disabled={saving || row.feature_key === 'emergency_alert'}
          onValueChange={onToggleActive}
          trackColor={{ false: T.colors.border, true: T.colors.warningLight }}
          thumbColor={row.is_active ? T.colors.accent : T.colors.surface}
        />
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>Çalma süresi</Text>
        <Text style={styles.metaValue}>{storedDuration} sn</Text>
      </View>

      <Text style={styles.durationLabel}>Kaç saniye çalsın?</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.durationChipRow}
      >
        {durationOptions.map((sec) => {
          const selected = durationSec === sec;
          return (
            <TouchableOpacity
              key={sec}
              style={[styles.durationChip, selected && styles.durationChipSelected]}
              disabled={saving}
              onPress={() => onDurationChange(sec)}
            >
              <Text style={[styles.durationChipText, selected && styles.durationChipTextSelected]}>
                {sec} sn
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>Mevcut ses</Text>
        <Text style={styles.metaValue} numberOfLines={1}>
          {row.sound_file_name || row.ios_push_sound || 'Varsayılan'}
        </Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>iOS push (arka plan)</Text>
        <Text style={styles.metaValue}>{row.ios_push_sound}</Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>Android kanal</Text>
        <Text style={styles.metaValue} numberOfLines={1}>
          {row.android_channel_id || def?.defaultAndroidChannelId}
        </Text>
      </View>

      {row.feature_key !== 'emergency_alert' ? (
        <View style={[styles.suppressRow, !row.sound_file_url && styles.suppressRowDisabled]}>
          <View style={styles.suppressTextCol}>
            <Text style={styles.suppressTitle}>Varsayılan sistem sesi</Text>
            <Text style={styles.suppressHint}>
              {row.sound_file_url
                ? 'Özel ses yüklendi — bildirimde yalnızca sizin sesiniz çalar; iOS/Android varsayılanı otomatik kapatılır.'
                : 'Özel ses yüklediğinizde varsayılan sistem sesi otomatik kapanır ve yalnızca sizin sesiniz çalar.'}
            </Text>
          </View>
          <Switch
            value={row.sound_file_url ? true : row.suppress_default_sound === true}
            disabled={saving || !!row.sound_file_url || !row.sound_file_url}
            onValueChange={onToggleSuppressDefault}
            trackColor={{ false: T.colors.border, true: T.colors.warningLight }}
            thumbColor={
              row.sound_file_url || row.suppress_default_sound ? T.colors.accent : T.colors.surface
            }
          />
        </View>
      ) : null}

      {row.feature_key === 'emergency_alert' ? (
        <Text style={styles.warnNote}>
          Acil durum sesi kapatılamaz. Uygulama açıkken yüklediğiniz ses anında çalar; iOS arka plan push için bundle preset kullanılır.
        </Text>
      ) : (
        <Text style={styles.hintNote}>
          Yüklediğiniz ses uygulama açıkken anında geçerli olur (build gerekmez). Android arka plan: personel cihazında uygulama bir kez açıldıktan sonra kanal güncellenir; ses değişince kanal sürümü otomatik artar.
        </Text>
      )}

      <View style={styles.btnRow}>
        <TouchableOpacity style={styles.btnSecondary} onPress={onTest} disabled={saving}>
          <Ionicons name="volume-high-outline" size={18} color={T.colors.accent} />
          <Text style={styles.btnSecondaryText}>Test et</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.btnSecondary}
          onPress={onUpload}
          disabled={saving || uploading}
        >
          {uploading ? (
            <ActivityIndicator size="small" color={T.colors.accent} />
          ) : (
            <Ionicons name="cloud-upload-outline" size={18} color={T.colors.accent} />
          )}
          <Text style={styles.btnSecondaryText}>{uploading ? 'Yükleniyor…' : 'Ses yükle'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnGhost} onPress={onReset} disabled={saving}>
          <Text style={styles.btnGhostText}>Varsayılana dön</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function AdminNotificationSoundsScreen() {
  const insets = useSafeAreaInsets();
  const staff = useAuthStore((s) => s.staff);
  const { orgScoped, canQuery, canUseAll } = useAdminOrganizationQueryScope();
  const [rows, setRows] = useState<NotificationSoundSettingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);

  const merged = useMemo(() => mergeCatalogWithRows(rows), [rows]);

  const load = useCallback(async () => {
    if (!orgScoped) {
      setRows([]);
      setLoading(false);
      return;
    }
    await ensureOrgNotificationSoundSettings(orgScoped);
    const data = await fetchOrgNotificationSoundSettings(orgScoped, { force: true });
    setRows(data);
    setLoading(false);
  }, [orgScoped]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    invalidateNotificationSoundSettingsCache(orgScoped ?? undefined);
    await load();
    setRefreshing(false);
  }, [load, orgScoped]);

  const [uploadingFeatureKey, setUploadingFeatureKey] = useState<string | null>(null);
  const [durationDraft, setDurationDraft] = useState<Record<string, number>>({});

  useEffect(() => {
    const next: Record<string, number> = {};
    for (const row of rows) {
      next[row.feature_key] = clampPlaybackDurationSec(
        row.sound_duration,
        row.feature_key
      );
    }
    setDurationDraft(next);
  }, [rows]);

  const ensureDbRow = useCallback(
    async (featureKey: string): Promise<NotificationSoundSettingRow | null> => {
      if (!orgScoped) return null;
      await ensureOrgNotificationSoundSettings(orgScoped);
      const fresh = await fetchOrgNotificationSoundSettings(orgScoped, { force: true });
      setRows(fresh);
      return fresh.find((r) => r.feature_key === featureKey) ?? null;
    },
    [orgScoped]
  );

  const updateRowById = useCallback(
    async (rowId: string, featureKey: string, patch: Partial<NotificationSoundSettingRow>) => {
      if (!orgScoped) return false;
      setSavingId(rowId);
      let payload = { ...patch, updated_at: new Date().toISOString() };
      let { error } = await supabase
        .from('notification_sound_settings')
        .update(payload)
        .eq('id', rowId);
      if (
        error &&
        'suppress_default_sound' in patch &&
        /suppress_default_sound|schema cache|PGRST204/i.test(error.message ?? '')
      ) {
        const { suppress_default_sound: _omit, ...rest } = payload;
        payload = rest;
        ({ error } = await supabase.from('notification_sound_settings').update(payload).eq('id', rowId));
        if (!error) {
          Alert.alert(
            'Veritabanı güncellemesi gerekli',
            '«Varsayılan sistem sesini kapat» için migration 355 (suppress_default_sound) Supabase’e uygulanmalı. Diğer ayarlar kaydedildi.'
          );
        }
      }
      setSavingId(null);
      if (error) {
        Alert.alert('Hata', error.message);
        return false;
      }
      invalidateNotificationSoundSettingsCache(orgScoped);
      await load();
      return true;
    },
    [load, orgScoped]
  );

  const updateRow = useCallback(
    async (featureKey: string, patch: Partial<NotificationSoundSettingRow>) => {
      if (!orgScoped || !staff?.id) return;
      let existing = rows.find((r) => r.feature_key === featureKey);
      if (!existing?.id) {
        existing = (await ensureDbRow(featureKey)) ?? undefined;
      }
      if (!existing?.id) {
        Alert.alert(
          'Kayıt yok',
          'Ses ayarı veritabanında bulunamadı. Alttaki «Varsayılan kayıtları oluştur» butonuna basın veya migration 340 uygulayın.'
        );
        return;
      }
      await updateRowById(existing.id, featureKey, patch);
    },
    [ensureDbRow, orgScoped, rows, staff?.id, updateRowById]
  );

  const handleUpload = useCallback(
    async (featureKey: string) => {
      if (!orgScoped) {
        Alert.alert('İşletme seçin', 'Ses yüklemek için üstten bir işletme seçmelisiniz.');
        return;
      }

      setUploadingFeatureKey(featureKey);
      try {
        const picked = await pickNotificationSoundFile();
        if (!picked) return;

        const def = getNotificationSoundFeatureDef(featureKey);
        const dbRow = (await ensureDbRow(featureKey)) ?? rows.find((r) => r.feature_key === featureKey);
        if (!dbRow?.id) {
          Alert.alert(
            'Kayıt yok',
            'Önce «Varsayılan kayıtları oluştur» ile veritabanı kayıtlarını oluşturun.'
          );
          return;
        }

        const { publicUrl } = await uploadNotificationSoundToStorage({
          organizationId: orgScoped,
          featureKey,
          picked,
        });

        const nextVersion = (dbRow.android_channel_version ?? 1) + 1;
        const channelBase = def?.defaultAndroidChannelId ?? `valoria_ns_${featureKey}`;
        const durationSec = clampPlaybackDurationSec(
          durationDraft[featureKey] ?? dbRow.sound_duration,
          featureKey
        );
        const ok = await updateRowById(dbRow.id, featureKey, {
          sound_file_url: publicUrl,
          sound_file_name: picked.name,
          sound_duration: durationSec,
          suppress_default_sound: true,
          android_channel_version: nextVersion,
          android_channel_id: `${channelBase}_v${nextVersion}`,
        });

        if (ok) {
          Alert.alert(
            'Kaydedildi',
            `${picked.name} yüklendi. Test et ile dinleyebilirsiniz.\n\nAndroid: personel uygulamayı bir kez açmalı (kanal senkronu). Ardından yeni görev bildirimlerinde özel ses çalar.`
          );
        }
      } catch (e) {
        Alert.alert('Yükleme hatası', (e as Error).message ?? 'Bilinmeyen hata');
      } finally {
        setUploadingFeatureKey(null);
      }
    },
    [durationDraft, ensureDbRow, orgScoped, rows, updateRowById]
  );

  const handleDurationChange = useCallback(
    async (featureKey: string, sec: number) => {
      setDurationDraft((prev) => ({ ...prev, [featureKey]: sec }));
      const clamped = clampPlaybackDurationSec(sec, featureKey);
      await updateRow(featureKey, { sound_duration: clamped });
    },
    [updateRow]
  );

  const handleTest = useCallback(async (row: NotificationSoundSettingRow) => {
    const durationSec = clampPlaybackDurationSec(
      durationDraft[row.feature_key] ?? row.sound_duration,
      row.feature_key
    );
    if (row.sound_file_url) {
      const r = await playNotificationSoundUrl(row.sound_file_url, durationSec);
      if (!r.ok) Alert.alert('Oynatılamadı', r.error ?? 'Ses dosyası bozuk olabilir.');
      return;
    }
    const r = await playNotificationSoundPreset(
      row.ios_push_sound || 'default',
      row.feature_key,
      durationSec
    );
    if (!r.ok && r.error) Alert.alert('Oynatılamadı', r.error);
  }, [durationDraft]);

  const handleReset = useCallback(
    async (featureKey: string) => {
      const def = getNotificationSoundFeatureDef(featureKey);
      if (!def) return;
      const defaultDuration = getDefaultPlaybackDurationSec(featureKey);
      Alert.alert('Varsayılana dön', 'Özel ses silinsin mi?', [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sıfırla',
          style: 'destructive',
          onPress: () => {
            setDurationDraft((prev) => ({ ...prev, [featureKey]: defaultDuration }));
            void updateRow(featureKey, {
              sound_file_url: null,
              sound_file_name: null,
              sound_duration: defaultDuration,
              suppress_default_sound: false,
              ios_push_sound: def.defaultIosPushSound,
              android_push_sound: def.defaultAndroidPushSound,
              android_channel_id: def.defaultAndroidChannelId,
              android_channel_version: 1,
            });
          },
        },
      ]);
    },
    [updateRow]
  );

  return (
    <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
      >
        <AdminOrganizationPicker
          canUseAll={canUseAll}
          ownOrganizationId={staff?.organization_id}
        />

        <TouchableOpacity style={styles.catalogToggle} onPress={() => setShowCatalog((v) => !v)}>
          <Ionicons name={showCatalog ? 'chevron-up' : 'chevron-down'} size={18} color={T.colors.accent} />
          <Text style={styles.catalogToggleText}>Uygulama özellikleri kataloğu (Misafir / Personel / Admin)</Text>
        </TouchableOpacity>

        {showCatalog ? (
          <View style={styles.catalogBox}>
            <Text style={styles.catalogHeading}>Misafir</Text>
            {VALORIA_MODULE_FEATURES_SUMMARY.customer.map((line) => (
              <Text key={line} style={styles.catalogLine}>• {line}</Text>
            ))}
            <Text style={[styles.catalogHeading, { marginTop: 12 }]}>Personel</Text>
            {VALORIA_MODULE_FEATURES_SUMMARY.staff.map((line) => (
              <Text key={line} style={styles.catalogLine}>• {line}</Text>
            ))}
            <Text style={[styles.catalogHeading, { marginTop: 12 }]}>Admin</Text>
            {VALORIA_MODULE_FEATURES_SUMMARY.admin.map((line) => (
              <Text key={line} style={styles.catalogLine}>• {line}</Text>
            ))}
            <Text style={styles.catalogFoot}>
              Aşağıdaki {NOTIFICATION_SOUND_FEATURES.length} bildirim türüne ses atayabilirsiniz. Her tür farklı notification_type değerlerine eşlenir.
            </Text>
          </View>
        ) : null}

        <Text style={styles.intro}>
          Her özellik için ses dosyası yükleyin, süreyi seçin ve test edin. Özel ses yüklediğinizde varsayılan sistem
          sesi otomatik kapanır ve bildirimler yalnızca sizin sesinizle gider (.wav, .mp3, .ogg, …).
        </Text>

        {!canQuery ? (
          <Text style={styles.empty}>İşletme seçin veya admin yetkisi gerekli.</Text>
        ) : loading ? (
          <ActivityIndicator color={T.colors.accent} style={{ marginTop: 24 }} />
        ) : (
          merged.map((row) => (
            <SoundFeatureCard
              key={row.feature_key}
              row={row}
              saving={savingId === row.id || savingId === row.feature_key}
              uploading={uploadingFeatureKey === row.feature_key}
              durationSec={
                durationDraft[row.feature_key] ??
                clampPlaybackDurationSec(row.sound_duration, row.feature_key)
              }
              onDurationChange={(sec) => void handleDurationChange(row.feature_key, sec)}
              onToggleActive={(v) => {
                if (row.feature_key === 'emergency_alert') return;
                void updateRow(row.feature_key, { is_active: v });
              }}
              onToggleSuppressDefault={(v) => {
                void updateRow(row.feature_key, { suppress_default_sound: v });
              }}
              onTest={() => void handleTest(row)}
              onUpload={() => void handleUpload(row.feature_key)}
              onReset={() => void handleReset(row.feature_key)}
            />
          ))
        )}

        <AdminButton
          title="Varsayılan kayıtları oluştur"
          onPress={async () => {
            if (!orgScoped) return;
            const { error } = await supabase.rpc('ensure_notification_sound_settings', {
              p_organization_id: orgScoped,
            });
            if (error) Alert.alert('Hata', error.message);
            else {
              invalidateNotificationSoundSettingsCache(orgScoped);
              await load();
            }
          }}
          style={{ marginTop: 16 }}
        />
      </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: T.colors.surfaceSecondary },
  content: { padding: T.spacing.lg },
  intro: {
    fontSize: 14,
    color: T.colors.textSecondary,
    lineHeight: 20,
    marginBottom: T.spacing.md,
  },
  empty: { color: T.colors.textMuted, marginTop: 24, textAlign: 'center' },
  catalogToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: T.spacing.sm,
    paddingVertical: 8,
  },
  catalogToggleText: { fontSize: 14, fontWeight: '600', color: T.colors.accent, flex: 1 },
  catalogBox: {
    backgroundColor: T.colors.surface,
    borderRadius: 12,
    padding: T.spacing.md,
    marginBottom: T.spacing.md,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  catalogHeading: { fontSize: 13, fontWeight: '700', color: T.colors.text, marginBottom: 4 },
  catalogLine: { fontSize: 12, color: T.colors.textSecondary, lineHeight: 18, marginBottom: 2 },
  catalogFoot: { fontSize: 11, color: T.colors.textMuted, marginTop: 10, lineHeight: 16 },
  card: {
    backgroundColor: T.colors.surface,
    borderRadius: 16,
    padding: T.spacing.lg,
    marginBottom: T.spacing.md,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  cardTitleCol: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: T.colors.text },
  cardDesc: { fontSize: 13, color: T.colors.textSecondary, marginTop: 4, lineHeight: 18 },
  audienceTag: { fontSize: 11, color: T.colors.textMuted, marginTop: 6 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, gap: 8 },
  metaLabel: { fontSize: 12, color: T.colors.textMuted },
  metaValue: { fontSize: 12, fontWeight: '600', color: T.colors.text, flex: 1, textAlign: 'right' },
  suppressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    marginBottom: 4,
    padding: 12,
    borderRadius: 12,
    backgroundColor: T.colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  suppressTextCol: { flex: 1 },
  suppressTitle: { fontSize: 13, fontWeight: '700', color: T.colors.text },
  suppressHint: { fontSize: 11, color: T.colors.textMuted, marginTop: 4, lineHeight: 16 },
  suppressRowDisabled: { opacity: 0.72 },
  durationLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: T.colors.textSecondary,
    marginTop: 4,
    marginBottom: 8,
  },
  durationChipRow: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  durationChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: T.colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  durationChipSelected: {
    backgroundColor: T.colors.accent,
    borderColor: T.colors.accent,
  },
  durationChipText: { fontSize: 13, fontWeight: '600', color: T.colors.textSecondary },
  durationChipTextSelected: { color: T.colors.surface },
  warnNote: {
    fontSize: 11,
    color: '#b45309',
    backgroundColor: '#fffbeb',
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
    lineHeight: 16,
  },
  hintNote: { fontSize: 11, color: T.colors.textMuted, marginTop: 8, lineHeight: 16 },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: T.colors.surfaceTertiary,
  },
  btnSecondaryText: { fontSize: 13, fontWeight: '600', color: T.colors.accent },
  btnGhost: { paddingHorizontal: 10, paddingVertical: 8 },
  btnGhostText: { fontSize: 13, color: T.colors.textMuted, fontWeight: '600' },
});
