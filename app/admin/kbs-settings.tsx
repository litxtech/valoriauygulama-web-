import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { theme } from '@/constants/theme';
import { apiGet, apiPost, getLastApiDebug, kbsOpsBridgeLabel } from '@/lib/kbsApi';
import { isKbsUiEnabled } from '@/lib/kbsUiEnabled';
import * as Clipboard from 'expo-clipboard';

type FormValues = {
  facilityCode: string;
  username: string;
  password?: string;
  apiKey?: string;
  providerType: string;
  isActive: boolean;
};

type OpsRoomRow = { id: string; room_number: string; floor: string | null; capacity: number | null; is_active: boolean };

export default function AdminKbsSettingsScreen() {
  const { t } = useTranslation();
  const kbsUi = isKbsUiEnabled();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [healthInfo, setHealthInfo] = useState<string>('');
  const [lastApiInfo, setLastApiInfo] = useState<string>('');
  const [opsRooms, setOpsRooms] = useState<OpsRoomRow[]>([]);
  const [opsRoomsLoading, setOpsRoomsLoading] = useState(false);
  const [newOpsRoom, setNewOpsRoom] = useState('');
  const [newOpsFloor, setNewOpsFloor] = useState('');
  const [addingRoom, setAddingRoom] = useState(false);

  const { control, handleSubmit, reset } = useForm<FormValues>({
    defaultValues: { facilityCode: '', username: '', password: '', apiKey: '', providerType: 'default', isActive: true },
  });

  const formatUnknownError = (e: unknown) => {
    if (e instanceof Error) return e.message;
    return typeof e === 'string' ? e : t('unknownError');
  };

  const sanitizeDetailsForAlert = (d: unknown): string => {
    if (d == null) return '';
    const s = typeof d === 'string' ? d : JSON.stringify(d);
    if (/<!DOCTYPE|<html[\s>]/i.test(s)) return t('kbsApiErrorHtmlSnippetHidden');
    const short = s.length > 280 ? `${s.slice(0, 280)}…` : s;
    return short ? `\n\n${short}` : '';
  };

  const formatApiError = (res: any) => {
    const message = res?.error?.message ?? t('requestFailed');
    const code = String(res?.error?.code ?? '');
    const detailsObj = res?.error?.details;
    const details = sanitizeDetailsForAlert(detailsObj);

    let hint = '';
    if (/gateway token|Invalid or missing gateway/i.test(message)) {
      hint += t('kbsApiHintGatewayToken');
    }
    if (/User not provisioned|Invalid token|Missing bearer/i.test(message) || code === 'AUTH') {
      hint += t('kbsApiHintAuth');
    }
    if (/ops\.app_users|admin veya manager|Admin only|FORBIDDEN/i.test(message) || code === 'FORBIDDEN') {
      hint += t('kbsApiHintForbidden');
    }
    if (/NON_JSON|JSON değil|Unexpected server response|NETWORK/i.test(message) || code === 'NON_JSON') {
      hint += t('kbsApiHintNonJson');
    }
    if (code === 'GATEWAY_HTML' || /HTML hata sayfası|GATEWAY_HTML/i.test(message)) {
      hint += t('kbsApiHintGatewayHtml');
    }

    return `${message}${details}${hint}`;
  };

  /** Köprü üzerinden (gateway service role); RN anon key ile `ops` şemasına doğrudan erişim PostgREST’te kapalı olabilir. */
  const loadOpsRooms = async () => {
    setOpsRoomsLoading(true);
    try {
      const res = await apiGet<OpsRoomRow[]>('/admin/ops-rooms');
      if (!res.ok) {
        setOpsRooms([]);
        return;
      }
      setOpsRooms(Array.isArray(res.data) ? res.data : []);
    } catch {
      setOpsRooms([]);
    } finally {
      setOpsRoomsLoading(false);
    }
  };

  useEffect(() => {
    void loadOpsRooms();
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await apiGet<{
          facility_code?: string | null;
          username?: string | null;
          provider_type?: string | null;
          is_active?: boolean | null;
        } | null>('/admin/kbs-settings');

        if (!res.ok) {
          setLoading(false);
          Alert.alert(t('adminLoadErrorTitle'), formatApiError(res));
          return;
        }

        const creds = res.data;
        if (creds && typeof creds === 'object') {
          reset({
            facilityCode: creds.facility_code ?? '',
            username: creds.username ?? '',
            password: '',
            apiKey: '',
            providerType: creds.provider_type ?? 'default',
            isActive: !!creds.is_active,
          });
        } else {
          reset({
            facilityCode: '',
            username: '',
            password: '',
            apiKey: '',
            providerType: 'default',
            isActive: true,
          });
        }
        setLoading(false);
      } catch (e) {
        setLoading(false);
        Alert.alert(t('adminLoadErrorTitle'), formatUnknownError(e));
      }
    };
    load();
    // Initial load only; formatters read latest t() when alerts run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reset]);

  const copyDebugToClipboard = async () => {
    const payload = {
      bridge: kbsOpsBridgeLabel,
      healthInfo: healthInfo || null,
      lastApiDebug: getLastApiDebug(),
    };
    const text = JSON.stringify(payload, null, 2);
    await Clipboard.setStringAsync(text);
    Alert.alert(t('adminDebugLogCopiedTitle'), t('adminDebugLogCopiedBody'));
  };

  const refreshLastApiInfo = () => {
    const d = getLastApiDebug();
    setLastApiInfo(d ? JSON.stringify(d, null, 2) : '');
  };

  const onSave = handleSubmit(async (values) => {
    setLoading(true);
    const payload: any = {
      facilityCode: values.facilityCode,
      username: values.username,
      providerType: values.providerType || 'default',
      isActive: values.isActive,
    };
    if (values.password && values.password.trim()) payload.password = values.password.trim();
    if (values.apiKey && values.apiKey.trim()) payload.apiKey = values.apiKey.trim();

    try {
      const res = await apiPost('/admin/kbs-settings', payload);
      setLoading(false);
      if (!res.ok) {
        refreshLastApiInfo();
        Alert.alert(t('adminSaveErrorTitle'), formatApiError(res));
        return;
      }
      Alert.alert(t('saved'), t('adminKbsSettingsUpdatedBody'));
      reset({ ...values, password: '', apiKey: '' });

      const verify = await apiGet<{ facility_code?: string | null } | null>('/admin/kbs-settings');
      refreshLastApiInfo();
      if (verify.ok && verify.data && typeof verify.data === 'object' && verify.data.facility_code) {
        Alert.alert(t('adminKbsVerifiedTitle'), t('adminKbsVerifiedReadbackBody'));
      }
    } catch (e) {
      setLoading(false);
      refreshLastApiInfo();
      Alert.alert(t('adminSaveErrorTitle'), formatUnknownError(e));
    }
  });

  const onAddOpsRoom = async () => {
    const n = newOpsRoom.trim();
    if (!n) {
      Alert.alert(t('kbsOpsRoomNumberTitle'), t('kbsOpsRoomNumberPrompt'));
      return;
    }
    setAddingRoom(true);
    try {
      const res = await apiPost('/admin/ops-rooms', {
        roomNumber: n,
        floor: newOpsFloor.trim() || null,
      });
      setAddingRoom(false);
      if (!res.ok) {
        refreshLastApiInfo();
        const msg = formatApiError(res);
        if (/zaten kayıtlı|23505|conflict/i.test(msg)) {
          Alert.alert(t('kbsRoomAddFailedTitle'), t('kbsRoomDuplicateBody'));
        } else {
          Alert.alert(t('kbsRoomAddFailedTitle'), msg);
        }
        return;
      }
      setNewOpsRoom('');
      setNewOpsFloor('');
      await loadOpsRooms();
      Alert.alert(t('ok'), t('kbsRoomAddedBody', { room: n }));
    } catch (e) {
      setAddingRoom(false);
      Alert.alert(t('kbsRoomAddFailedTitle'), formatUnknownError(e));
    }
  };

  const onTest = async () => {
    setTesting(true);
    try {
      const res = await apiPost<any>('/admin/kbs-settings/test-connection', {});
      setTesting(false);
      if (!res.ok) {
        refreshLastApiInfo();
        Alert.alert(t('adminConnectionTestTitle'), formatApiError(res));
        return;
      }
      Alert.alert(t('adminConnectionTestTitle'), res.data?.message ?? t('connectionTestOkShort'));
    } catch (e) {
      setTesting(false);
      refreshLastApiInfo();
      Alert.alert(t('adminConnectionTestTitle'), formatUnknownError(e));
    }
  };

  const debugHealth = async () => {
    try {
      const res = await apiGet<{ ok?: boolean; service?: string }>('/health');
      setHealthInfo(
        JSON.stringify(
          res.ok
            ? { bridge: kbsOpsBridgeLabel, data: res.data }
            : { bridge: kbsOpsBridgeLabel, error: res.error },
          null,
          2
        )
      );
      refreshLastApiInfo();
    } catch (e) {
      setHealthInfo(JSON.stringify({ bridge: kbsOpsBridgeLabel, error: e instanceof Error ? e.message : String(e) }, null, 2));
      refreshLastApiInfo();
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('adminKbsSettingsScreenTitle')}</Text>
      {!kbsUi ? <Text style={styles.banner}>{t('adminKbsStaffTabDisabledBanner')}</Text> : null}
      <Text style={styles.sub}>{t('adminKbsSettingsPasswordHint')}</Text>
      <Text style={styles.hintBox}>{t('adminKbsSettingsBridgeHint')}</Text>

      <View style={styles.opsBox}>
        <Text style={styles.opsTitle}>{t('adminKbsOpsRoomsTitle')}</Text>
        <Text style={styles.sub}>{t('adminKbsOpsRoomsSub')}</Text>
        {opsRoomsLoading ? <ActivityIndicator /> : null}
        {!opsRoomsLoading && opsRooms.length === 0 ? (
          <Text style={styles.opsEmpty}>{t('adminKbsOpsRoomsEmpty')}</Text>
        ) : null}
        {opsRooms.map((r) => (
          <Text key={r.id} style={styles.opsLine}>
            • {r.room_number}
            {r.floor ? t('adminKbsRoomLineFloor', { floor: r.floor }) : ''}
            {r.capacity != null ? t('adminKbsRoomLineCapacity', { capacity: r.capacity }) : ''}
          </Text>
        ))}
        <Text style={styles.label}>{t('adminKbsNewRoomNumberLabel')}</Text>
        <TextInput value={newOpsRoom} onChangeText={setNewOpsRoom} style={styles.input} placeholder="101" keyboardType="default" />
        <Text style={styles.label}>{t('adminKbsFloorOptionalLabel')}</Text>
        <TextInput value={newOpsFloor} onChangeText={setNewOpsFloor} style={styles.input} placeholder="1" />
        <TouchableOpacity style={styles.btnGhost} onPress={onAddOpsRoom} disabled={addingRoom}>
          <Text style={styles.btnGhostText}>{addingRoom ? t('adminKbsAddingRoom') : t('adminKbsAddRoomButton')}</Text>
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator /> : null}

      <View style={styles.debugBox}>
        <Text style={styles.debugTitle}>{t('adminApiDebugTitle')}</Text>
        <Text style={styles.debugText}>{t('adminKbsBridgeLabel', { label: kbsOpsBridgeLabel })}</Text>
        <View style={styles.row}>
          <TouchableOpacity style={styles.btnGhost} onPress={debugHealth}>
            <Text style={styles.btnGhostText}>{t('adminHealthTestButton')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnGhost} onPress={copyDebugToClipboard}>
            <Text style={styles.btnGhostText}>{t('adminCopyDebugForTerminal')}</Text>
          </TouchableOpacity>
        </View>
        {healthInfo ? <Text style={styles.debugMono}>{healthInfo}</Text> : null}
        {lastApiInfo ? <Text style={styles.debugMono}>{lastApiInfo}</Text> : null}
      </View>

      <Text style={styles.label}>{t('adminFacilityCodeLabel')}</Text>
      <Controller
        control={control}
        name="facilityCode"
        rules={{ required: true }}
        render={({ field: { value, onChange } }) => (
          <TextInput value={value} onChangeText={onChange} style={styles.input} placeholder="TESIS123" />
        )}
      />

      <Text style={styles.label}>{t('adminUsernameLabel')}</Text>
      <Controller
        control={control}
        name="username"
        rules={{ required: true }}
        render={({ field: { value, onChange } }) => (
          <TextInput value={value} onChangeText={onChange} style={styles.input} placeholder="kbs-user" autoCapitalize="none" />
        )}
      />

      <Text style={styles.label}>{t('adminPasswordMaskedLabel')}</Text>
      <Controller
        control={control}
        name="password"
        render={({ field: { value, onChange } }) => (
          <TextInput value={value} onChangeText={onChange} style={styles.input} placeholder="••••••••" secureTextEntry />
        )}
      />

      <Text style={styles.label}>{t('adminApiKeyOptionalLabel')}</Text>
      <Controller
        control={control}
        name="apiKey"
        render={({ field: { value, onChange } }) => (
          <TextInput value={value} onChangeText={onChange} style={styles.input} placeholder={t('adminOptionalPlaceholder')} secureTextEntry />
        )}
      />

      <Text style={styles.label}>Provider tipi</Text>
      <Controller
        control={control}
        name="providerType"
        render={({ field: { value, onChange } }) => (
          <TextInput value={value} onChangeText={onChange} style={styles.input} placeholder="default" />
        )}
      />

      <View style={styles.row}>
        <Controller
          control={control}
          name="isActive"
          render={({ field: { value, onChange } }) => (
            <TouchableOpacity style={[styles.pill, value ? styles.pillOn : styles.pillOff]} onPress={() => onChange(!value)}>
              <Text style={styles.pillText}>{value ? t('statusActive') : t('statusInactive')}</Text>
            </TouchableOpacity>
          )}
        />
        <TouchableOpacity style={styles.btnGhost} onPress={onTest} disabled={testing}>
          <Text style={styles.btnGhostText}>{testing ? t('adminTestingEllipsis') : t('adminConnectionTestTitle')}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.btnPrimary} onPress={onSave} disabled={loading}>
        <Text style={styles.btnPrimaryText}>{loading ? t('adminSavingEllipsis') : t('save')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  title: { fontSize: 18, fontWeight: '900', color: theme.colors.text },
  banner: {
    fontSize: 13,
    lineHeight: 19,
    color: '#92400e',
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fcd34d',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  sub: { color: theme.colors.textSecondary, lineHeight: 20, marginBottom: 6 },
  hintBox: {
    color: theme.colors.textSecondary,
    lineHeight: 20,
    fontSize: 13,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  hintMono: { fontFamily: 'Courier', fontSize: 12, color: theme.colors.text },
  label: { color: theme.colors.text, fontWeight: '800', marginTop: 6 },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: theme.colors.text,
  },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 6 },
  pill: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999 },
  pillOn: { backgroundColor: '#e6f7ee' },
  pillOff: { backgroundColor: '#f6f6f6' },
  pillText: { fontWeight: '900', color: theme.colors.text },
  btnGhost: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.borderLight },
  btnGhostText: { fontWeight: '900', color: theme.colors.text },
  btnPrimary: { marginTop: 6, backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  debugBox: { marginTop: 6, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.borderLight, backgroundColor: theme.colors.surface },
  debugTitle: { fontWeight: '900', color: theme.colors.text, marginBottom: 6 },
  debugText: { color: theme.colors.textSecondary, marginBottom: 8 },
  debugMono: { marginTop: 8, fontFamily: 'Courier', fontSize: 11, color: theme.colors.text },
  opsBox: {
    marginTop: 8,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
    gap: 8,
  },
  opsTitle: { fontWeight: '900', color: theme.colors.text, fontSize: 16 },
  opsEmpty: { color: theme.colors.textSecondary, lineHeight: 20 },
  opsLine: { color: theme.colors.text, fontWeight: '600' },
});

