import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
  Switch,
  Platform,
  Pressable,
  KeyboardAvoidingView,
  type NativeSyntheticEvent,
  type TextInputFocusEventData,
} from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme as T } from '@/constants/adminTheme';
import { AdminButton } from '@/components/admin';
import { apiGet, apiPost, getLastApiDebug, kbsOpsBridgeLabel } from '@/lib/kbsApi';
import {
  kbsAdminCredentialsGet,
  kbsAdminCredentialsSave,
  kbsAdminCredentialsTestConnection,
} from '@/lib/kbsAdminCredentialsApi';
import { isDnsOrUnreachableBridgeError, isPlaceholderKbsGatewayError } from '@/lib/kbsBridgeErrors';
import { isKbsUiEnabled } from '@/lib/kbsUiEnabled';
import {
  KBS_DEFAULT_FACILITY_CODE,
  isValidKbsFacilityCode,
  isValidKbsKullaniciTc,
  kbsCredentialsToApiPayload,
  type KbsCredentialsFormValues,
} from '@/lib/kbsHotelCredentials';
import * as Clipboard from 'expo-clipboard';

type OpsRoomRow = { id: string; room_number: string; floor: string | null; capacity: number | null; is_active: boolean };

function SectionHeader({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIconWrap}>
        <Ionicons name={icon} size={18} color={T.colors.accent} />
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function FieldLabel({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}

export default function AdminKbsSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const kbsUi = isKbsUiEnabled();
  const scrollRef = useRef<ScrollView>(null);
  const [credentialsLoading, setCredentialsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [healthInfo, setHealthInfo] = useState('');
  const [lastApiInfo, setLastApiInfo] = useState('');
  const [opsRooms, setOpsRooms] = useState<OpsRoomRow[]>([]);
  const [opsRoomsLoading, setOpsRoomsLoading] = useState(false);
  const [newOpsRoom, setNewOpsRoom] = useState('');
  const [newOpsFloor, setNewOpsFloor] = useState('');
  const [addingRoom, setAddingRoom] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [lastTestedAt, setLastTestedAt] = useState<string | null>(null);

  const { control, handleSubmit, reset } = useForm<KbsCredentialsFormValues>({
    defaultValues: {
      facilityCode: KBS_DEFAULT_FACILITY_CODE,
      kullaniciTc: '',
      password: '',
      apiKey: '',
      providerType: 'default',
      isActive: true,
    },
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
    if (/gateway token|Invalid or missing gateway/i.test(message)) hint += t('kbsApiHintGatewayToken');
    if (/User not provisioned|Invalid token|Missing bearer/i.test(message) || code === 'AUTH') hint += t('kbsApiHintAuth');
    if (/ops\.app_users|admin veya manager|Admin only|FORBIDDEN|yalnızca admin/i.test(message) || code === 'FORBIDDEN') {
      hint += t('kbsApiHintForbidden');
    }
    if (code === 'TIMEOUT' || /yanıt vermedi/i.test(message)) hint += t('kbsApiHintTimeout');
    if (code === 'PGRST106' || /PGRST106|Exposed schemas|ops şeması API/i.test(message)) hint += t('kbsApiHintPgrst');
    if (code === 'RPC' && /284_public_kbs_edge_rpc/i.test(message)) hint += t('kbsApiHintRpc284');
    if (code === 'EDGE_DEPLOY' || /deploy edilmemiş|NOT_FOUND|404/i.test(message)) hint += t('kbsApiHintEdgeDeploy');
    const missingCredSecret = code === 'CONFIG' && /KBS_CREDENTIAL_SECRET/i.test(message);
    if (missingCredSecret) hint += t('kbsApiHintCredentialSecret');
    if (code === 'EDGE_HTTP' && !missingCredSecret) hint += t('kbsApiHintEdgeLogs');
    if (/NON_JSON|JSON değil|Unexpected server response|NETWORK/i.test(message) || code === 'NON_JSON') {
      hint += t('kbsApiHintNonJson');
    }
    if (code === 'GATEWAY_HTML' || /HTML hata sayfası|GATEWAY_HTML/i.test(message)) hint += t('kbsApiHintGatewayHtml');
    if (
      !missingCredSecret &&
      (code === 'CONFIG' ||
        /senin_sunucu|KBS_GATEWAY_URL|failed to lookup|name or service not known/i.test(message) ||
        isPlaceholderKbsGatewayError(message) ||
        isDnsOrUnreachableBridgeError(message))
    ) {
      hint += t('kbsApiHintBadGatewayUrl');
    }

    return `${message}${details}${hint}`;
  };

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

  const scrollRoomFieldsIntoView = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  };

  const onRoomFieldFocus = (_e: NativeSyntheticEvent<TextInputFocusEventData>) => {
    scrollRoomFieldsIntoView();
  };

  useEffect(() => {
    let cancelled = false;

    const loadCredentials = async () => {
      setCredentialsLoading(true);
      try {
        const res = await kbsAdminCredentialsGet();
        if (cancelled) return;
        if (!res.ok) {
          Alert.alert(t('adminLoadErrorTitle'), formatApiError(res));
          return;
        }

        const creds = res.data;
        if (creds && typeof creds === 'object') {
          setHasPassword(!!creds.has_password);
          setLastTestedAt(creds.last_tested_at ?? null);
          reset({
            facilityCode: creds.facility_code ?? KBS_DEFAULT_FACILITY_CODE,
            kullaniciTc: creds.kullanici_tc ?? creds.username ?? '',
            password: '',
            apiKey: '',
            providerType: creds.provider_type ?? 'default',
            isActive: creds.is_active !== false,
          });
        } else {
          setHasPassword(false);
          setLastTestedAt(null);
          reset({
            facilityCode: KBS_DEFAULT_FACILITY_CODE,
            kullaniciTc: '',
            password: '',
            apiKey: '',
            providerType: 'default',
            isActive: true,
          });
        }
      } catch (e) {
        if (!cancelled) Alert.alert(t('adminLoadErrorTitle'), formatUnknownError(e));
      } finally {
        if (!cancelled) setCredentialsLoading(false);
      }
    };

    void loadCredentials();
    void loadOpsRooms();
    return () => {
      cancelled = true;
    };
    // Yalnızca mount — reset bağımlılığı sürekli yeniden yükleme yapıyordu
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyDebugToClipboard = async () => {
    const payload = {
      bridge: kbsOpsBridgeLabel,
      healthInfo: healthInfo || null,
      lastApiDebug: getLastApiDebug(),
    };
    await Clipboard.setStringAsync(JSON.stringify(payload, null, 2));
    Alert.alert(t('adminDebugLogCopiedTitle'), t('adminDebugLogCopiedBody'));
  };

  const refreshLastApiInfo = () => {
    const d = getLastApiDebug();
    setLastApiInfo(d ? JSON.stringify(d, null, 2) : '');
  };

  const onSave = handleSubmit(async (values) => {
    if (!values.kullaniciTc.trim()) {
      Alert.alert(t('adminKbsValidationTitle'), t('adminKbsKullaniciTcRequired'));
      return;
    }
    if (!isValidKbsKullaniciTc(values.kullaniciTc)) {
      Alert.alert(t('adminKbsValidationTitle'), t('adminKbsKullaniciTcInvalid'));
      return;
    }
    if (!isValidKbsFacilityCode(values.facilityCode)) {
      Alert.alert(t('adminKbsValidationTitle'), t('adminKbsFacilityCodeInvalid'));
      return;
    }
    if (!hasPassword && !values.password?.trim()) {
      Alert.alert(t('adminKbsValidationTitle'), t('adminKbsPasswordRequiredFirstSave'));
      return;
    }

    setSaving(true);
    const payload = kbsCredentialsToApiPayload(values);

    try {
      const res = await kbsAdminCredentialsSave(payload);
      if (!res.ok) {
        refreshLastApiInfo();
        Alert.alert(t('adminSaveErrorTitle'), formatApiError(res));
        return;
      }
      if (values.password?.trim()) setHasPassword(true);
      reset({ ...values, password: '', apiKey: '' });

      const verify = await kbsAdminCredentialsGet();
      refreshLastApiInfo();
      if (verify.ok && verify.data) setHasPassword(!!verify.data.has_password);

      const verified = verify.ok && !!verify.data?.has_password;
      Alert.alert(t('saved'), verified ? t('adminKbsSettingsUpdatedBody') : t('adminKbsSettingsSavedVerifyWarn'));
    } catch (e) {
      refreshLastApiInfo();
      Alert.alert(t('adminSaveErrorTitle'), formatUnknownError(e));
    } finally {
      setSaving(false);
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
      Alert.alert(t('kbsRoomAddFailedTitle'), formatUnknownError(e));
    } finally {
      setAddingRoom(false);
    }
  };

  const onTest = async () => {
    setTesting(true);
    try {
      const res = await kbsAdminCredentialsTestConnection();
      if (!res.ok) {
        refreshLastApiInfo();
        Alert.alert(t('adminConnectionTestTitle'), formatApiError(res));
        return;
      }
      setLastTestedAt(new Date().toISOString());
      Alert.alert(t('adminConnectionTestTitle'), res.data?.message ?? t('connectionTestOkShort'));
    } catch (e) {
      refreshLastApiInfo();
      Alert.alert(t('adminConnectionTestTitle'), formatUnknownError(e));
    } finally {
      setTesting(false);
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

  const contentBottomPad = insets.bottom + 120;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingBottom: contentBottomPad }]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets
      showsVerticalScrollIndicator={false}
    >
      {!kbsUi ? (
        <View style={styles.warnBanner}>
          <Ionicons name="information-circle-outline" size={20} color={T.colors.warning} />
          <Text style={styles.warnBannerText}>{t('adminKbsStaffTabDisabledBannerShort')}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <View style={styles.statusRow}>
          <View style={[styles.statusBadge, hasPassword ? styles.statusOk : styles.statusWarn]}>
            <Ionicons
              name={hasPassword ? 'checkmark-circle' : 'alert-circle'}
              size={16}
              color={hasPassword ? T.colors.success : T.colors.warning}
            />
            <Text style={[styles.statusBadgeText, hasPassword ? styles.statusOkText : styles.statusWarnText]}>
              {hasPassword ? t('adminKbsPasswordStored') : t('adminKbsPasswordNotStored')}
            </Text>
          </View>
          {lastTestedAt ? (
            <Text style={styles.statusMeta} numberOfLines={1}>
              {t('adminKbsLastTested', { date: new Date(lastTestedAt).toLocaleString() })}
            </Text>
          ) : null}
        </View>

        <View style={styles.activeRow}>
          <Text style={styles.activeLabel}>{t('adminKbsServiceActiveLabel')}</Text>
          <Controller
            control={control}
            name="isActive"
            render={({ field: { value, onChange } }) => (
              <Switch
                value={value}
                onValueChange={onChange}
                trackColor={{ false: T.colors.border, true: T.colors.successLight }}
                thumbColor={Platform.OS === 'android' ? (value ? T.colors.success : '#f4f3f4') : undefined}
              />
            )}
          />
        </View>
      </View>

      <View style={styles.card}>
        <SectionHeader icon="key-outline" title={t('adminKbsWebServiceTitle')} />

        {credentialsLoading ? (
          <View style={styles.credentialsLoadingRow}>
            <ActivityIndicator size="small" color={T.colors.accent} />
            <Text style={styles.credentialsLoadingText}>{t('adminLoadingEllipsis')}</Text>
          </View>
        ) : null}

        <FieldLabel>{t('adminKbsFacilityCodeLabel')}</FieldLabel>
        <Controller
          control={control}
          name="facilityCode"
          rules={{ required: true }}
          render={({ field: { value, onChange } }) => (
            <TextInput
              value={value}
              onChangeText={onChange}
              style={styles.input}
              placeholder={KBS_DEFAULT_FACILITY_CODE}
              placeholderTextColor={T.colors.textMuted}
              keyboardType="number-pad"
              editable={!credentialsLoading}
            />
          )}
        />

        <FieldLabel>{t('adminKbsHotelPasswordLabel')}</FieldLabel>
        <Controller
          control={control}
          name="password"
          render={({ field: { value, onChange } }) => (
            <TextInput
              value={value}
              onChangeText={onChange}
              style={styles.input}
              placeholder={
                hasPassword ? t('adminKbsPasswordPlaceholderChange') : t('adminKbsPasswordPlaceholderFirst')
              }
              placeholderTextColor={T.colors.textMuted}
              secureTextEntry
              autoCapitalize="none"
              editable={!credentialsLoading}
            />
          )}
        />

        <FieldLabel>{t('adminKbsKullaniciTcLabel')}</FieldLabel>
        <Controller
          control={control}
          name="kullaniciTc"
          rules={{ required: true }}
          render={({ field: { value, onChange } }) => (
            <TextInput
              value={value}
              onChangeText={onChange}
              style={styles.input}
              placeholder="12345678901"
              placeholderTextColor={T.colors.textMuted}
              keyboardType="number-pad"
              maxLength={11}
              editable={!credentialsLoading}
            />
          )}
        />

        <View style={styles.actionRow}>
          <AdminButton
            title={saving ? t('adminSavingEllipsis') : t('save')}
            onPress={onSave}
            variant="accent"
            fullWidth
            disabled={saving || credentialsLoading}
            leftIcon={saving ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="save-outline" size={18} color="#fff" />}
          />
          <AdminButton
            title={testing ? t('adminTestingEllipsis') : t('adminConnectionTestTitle')}
            onPress={onTest}
            variant="outline"
            fullWidth
            disabled={testing || !hasPassword || credentialsLoading}
            leftIcon={<Ionicons name="pulse-outline" size={18} color={T.colors.text} />}
          />
        </View>
      </View>

      <Pressable style={styles.linkRow} onPress={() => router.push('/admin/kbs-permissions')}>
        <Ionicons name="shield-checkmark-outline" size={22} color={T.colors.accent} />
        <Text style={styles.linkRowText}>{t('adminKbsPermissionsTitle')}</Text>
        <Ionicons name="chevron-forward" size={20} color={T.colors.textMuted} />
      </Pressable>

      <Pressable style={styles.linkRow} onPress={() => router.push('/admin/kbs-capture-notify')}>
        <Ionicons name="notifications-outline" size={22} color={T.colors.accent} />
        <Text style={styles.linkRowText}>Kimlik çekim bildirimleri</Text>
        <Ionicons name="chevron-forward" size={20} color={T.colors.textMuted} />
      </Pressable>

      <View style={styles.card}>
        <SectionHeader icon="bed-outline" title={t('adminKbsOpsRoomsTitle')} />

        {opsRoomsLoading ? (
          <ActivityIndicator color={T.colors.accent} style={styles.roomLoader} />
        ) : opsRooms.length === 0 ? (
          <Text style={styles.emptyRooms}>{t('adminKbsOpsRoomsEmptyShort')}</Text>
        ) : (
          <View style={styles.roomChips}>
            {opsRooms.map((r) => (
              <View key={r.id} style={styles.roomChip}>
                <Text style={styles.roomChipText}>{r.room_number}</Text>
                {r.floor ? <Text style={styles.roomChipSub}>{r.floor}</Text> : null}
              </View>
            ))}
          </View>
        )}

        <View style={styles.roomAddRow}>
          <View style={styles.roomAddField}>
            <FieldLabel>{t('adminKbsNewRoomNumberLabel')}</FieldLabel>
            <TextInput
              value={newOpsRoom}
              onChangeText={setNewOpsRoom}
              style={styles.input}
              placeholder="101"
              placeholderTextColor={T.colors.textMuted}
              onFocus={onRoomFieldFocus}
              returnKeyType="next"
            />
          </View>
          <View style={[styles.roomAddField, styles.roomAddFieldNarrow]}>
            <FieldLabel>{t('adminKbsFloorOptionalLabel')}</FieldLabel>
            <TextInput
              value={newOpsFloor}
              onChangeText={setNewOpsFloor}
              style={styles.input}
              placeholder="1"
              placeholderTextColor={T.colors.textMuted}
              onFocus={onRoomFieldFocus}
              returnKeyType="done"
            />
          </View>
        </View>
        <AdminButton
          title={addingRoom ? t('adminKbsAddingRoom') : t('adminKbsAddRoomButton')}
          onPress={onAddOpsRoom}
          variant="secondary"
          fullWidth
          disabled={addingRoom}
          leftIcon={<Ionicons name="add-circle-outline" size={18} color={T.colors.text} />}
        />
      </View>

      <Pressable style={styles.advancedToggle} onPress={() => setShowAdvanced((v) => !v)}>
        <Text style={styles.advancedToggleText}>{t('adminKbsAdvancedSection')}</Text>
        <Ionicons name={showAdvanced ? 'chevron-up' : 'chevron-down'} size={20} color={T.colors.textMuted} />
      </Pressable>

      {showAdvanced ? (
        <View style={styles.card}>
          <FieldLabel>{t('adminApiKeyOptionalLabel')}</FieldLabel>
          <Controller
            control={control}
            name="apiKey"
            render={({ field: { value, onChange } }) => (
              <TextInput
                value={value}
                onChangeText={onChange}
                style={styles.input}
                placeholder={t('adminOptionalPlaceholder')}
                placeholderTextColor={T.colors.textMuted}
                secureTextEntry
              />
            )}
          />

          <FieldLabel>{t('adminKbsProviderTypeLabel')}</FieldLabel>
          <Controller
            control={control}
            name="providerType"
            render={({ field: { value, onChange } }) => (
              <TextInput
                value={value}
                onChangeText={onChange}
                style={styles.input}
                placeholder="default"
                placeholderTextColor={T.colors.textMuted}
              />
            )}
          />

          <Text style={styles.bridgeMeta}>{t('adminKbsBridgeLabel', { label: kbsOpsBridgeLabel })}</Text>
          <View style={styles.debugActions}>
            <AdminButton title={t('adminHealthTestButton')} onPress={debugHealth} variant="ghost" size="sm" />
            <AdminButton title={t('adminCopyDebugForTerminal')} onPress={copyDebugToClipboard} variant="ghost" size="sm" />
          </View>
          {healthInfo ? <Text style={styles.debugMono} selectable>{healthInfo}</Text> : null}
          {lastApiInfo ? <Text style={styles.debugMono} selectable>{lastApiInfo}</Text> : null}
        </View>
      ) : null}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.colors.surfaceSecondary },
  scroll: { flex: 1 },
  content: { padding: T.spacing.lg, gap: T.spacing.md, flexGrow: 1 },
  credentialsLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: T.spacing.sm,
    paddingVertical: T.spacing.xs,
  },
  credentialsLoadingText: { color: T.colors.textSecondary, fontSize: 13 },
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: T.spacing.sm,
    padding: T.spacing.md,
    borderRadius: T.radius.md,
    backgroundColor: T.colors.warningLight,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  warnBannerText: { flex: 1, fontSize: 13, lineHeight: 19, color: T.colors.textSecondary },
  card: {
    backgroundColor: T.colors.surface,
    borderRadius: T.radius.lg,
    padding: T.spacing.lg,
    borderWidth: 1,
    borderColor: T.colors.border,
    gap: T.spacing.sm,
    ...Platform.select({ ios: T.shadow.sm, android: { elevation: 2 } }),
  },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: T.spacing.sm, marginBottom: T.spacing.xs },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: T.radius.full,
  },
  statusOk: { backgroundColor: T.colors.successLight },
  statusWarn: { backgroundColor: T.colors.warningLight },
  statusBadgeText: { fontSize: 13, fontWeight: '700' },
  statusOkText: { color: T.colors.success },
  statusWarnText: { color: T.colors.warning },
  statusMeta: { flex: 1, fontSize: 11, color: T.colors.textMuted },
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: T.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: T.colors.borderLight,
  },
  activeLabel: { fontSize: 15, fontWeight: '600', color: T.colors.text },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: T.spacing.sm, marginBottom: T.spacing.xs },
  sectionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: T.radius.sm,
    backgroundColor: T.colors.warningLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: T.colors.text },
  label: { fontSize: 13, fontWeight: '600', color: T.colors.textSecondary, marginTop: T.spacing.xs },
  input: {
    backgroundColor: T.colors.surfaceTertiary,
    borderRadius: T.radius.md,
    borderWidth: 1,
    borderColor: T.colors.border,
    paddingHorizontal: T.spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: T.colors.text,
  },
  actionRow: { gap: T.spacing.sm, marginTop: T.spacing.sm },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: T.spacing.md,
    padding: T.spacing.lg,
    backgroundColor: T.colors.surface,
    borderRadius: T.radius.lg,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  linkRowText: { flex: 1, fontSize: 15, fontWeight: '700', color: T.colors.text },
  emptyRooms: { fontSize: 14, color: T.colors.textMuted, marginBottom: T.spacing.sm },
  roomLoader: { marginVertical: T.spacing.sm },
  roomChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: T.spacing.sm },
  roomChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: T.radius.md,
    backgroundColor: T.colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  roomChipText: { fontSize: 14, fontWeight: '700', color: T.colors.text },
  roomChipSub: { fontSize: 12, color: T.colors.textMuted },
  roomAddRow: { flexDirection: 'row', gap: T.spacing.sm },
  roomAddField: { flex: 1 },
  roomAddFieldNarrow: { flex: 0.45 },
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: T.spacing.sm,
    paddingHorizontal: T.spacing.xs,
  },
  advancedToggleText: { fontSize: 14, fontWeight: '600', color: T.colors.textMuted },
  bridgeMeta: { fontSize: 12, color: T.colors.textMuted, marginTop: T.spacing.xs },
  debugActions: { flexDirection: 'row', flexWrap: 'wrap', gap: T.spacing.sm },
  debugMono: {
    marginTop: T.spacing.sm,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    color: T.colors.textSecondary,
    backgroundColor: T.colors.surfaceTertiary,
    padding: T.spacing.sm,
    borderRadius: T.radius.sm,
  },
});
