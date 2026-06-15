import { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard, AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { pickGalleryImages } from '@/lib/galleryPicker';
import {
  MOVEMENT_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
  fmtMoneyTry,
  type FinanceMovementKind,
  type FinanceLedgerScope,
  type FinanceCounterpartyType,
  type MovementPaymentMethod,
} from '@/lib/financeLedger';
import { invalidateCounterpartyBalanceCache } from '@/lib/financeCounterpartyBalances';
import { fetchAgreementById } from '@/lib/financeCounterpartyAgreements';
import { loadMovementCategories } from '@/lib/financeCategoriesApi';
import { CounterpartyPickerSheet } from '@/components/admin/CounterpartyPickerSheet';
import { GuestPickerSheet } from '@/components/admin/GuestPickerSheet';
import { ProjectPickerSheet } from '@/components/admin/ProjectPickerSheet';
import { StripePaymentLinkSheet } from '@/components/admin/StripePaymentLinkSheet';
import {
  buildStripeIncomePrefill,
  fetchStripePaymentsForIncomeLink,
  loadIncomeGuestOptions,
  type IncomeGuestOption,
} from '@/lib/financeIncomeStripe';
import type { AdminPaymentRequestRow } from '@/lib/payments';
import { fetchAdminPaymentRequests } from '@/lib/payments';
import { expenseReceiptPreviewStyle } from '@/lib/expenseReceiptPreviewStyles';

type CpOpt = { id: string; name: string; party_type: FinanceCounterpartyType };
type ProjOpt = { id: string; name: string };

const PAY_METHODS: MovementPaymentMethod[] = ['cash', 'transfer', 'card', 'check', 'other'];
type IncomePayerMode = 'guest' | 'counterparty' | 'free';

function SegmentRow<T extends string>({
  value,
  options,
  onChange,
  disabledValues,
}: {
  value: T;
  options: { id: T; label: string; activeStyle?: object }[];
  onChange: (id: T) => void;
  disabledValues?: T[];
}) {
  return (
    <View style={styles.segmentRow}>
      {options.map((opt) => {
        const active = value === opt.id;
        const disabled = disabledValues?.includes(opt.id);
        return (
          <TouchableOpacity
            key={opt.id}
            style={[styles.segment, active && (opt.activeStyle ?? styles.segmentOn), disabled && styles.segmentDisabled]}
            onPress={() => !disabled && onChange(opt.id)}
            disabled={disabled}
            activeOpacity={0.85}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextOn]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function FieldLabel({ children, first }: { children: string; first?: boolean }) {
  return <Text style={[styles.label, first && styles.labelFirst]}>{children}</Text>;
}

function PickField({
  icon,
  iconColor,
  label,
  value,
  onPress,
  selected,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  label: string;
  value: string;
  onPress: () => void;
  selected?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.fieldRow, selected && styles.fieldRowSelected]}
      onPress={onPress}
      activeOpacity={0.88}
    >
      <Ionicons name={icon} size={20} color={iconColor ?? adminTheme.colors.textSecondary} />
      <View style={styles.fieldRowBody}>
        <Text style={styles.fieldRowLabel}>{label}</Text>
        <Text style={[styles.fieldRowValue, selected && styles.fieldRowValueSelected]} numberOfLines={2}>
          {value}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={adminTheme.colors.textMuted} />
    </TouchableOpacity>
  );
}

export default function AccountingMovementNew() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const counterpartyFreeWrapRef = useRef<View>(null);
  const counterpartyFreeInputRef = useRef<TextInput>(null);
  const descriptionWrapRef = useRef<View>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const {
    kind: kindParam,
    counterpartyId: counterpartyIdParam,
    agreementId: agreementIdParam,
    paymentRequestId: paymentRequestIdParam,
    ledgerScope: ledgerScopeParam,
    returnCounterpartyId: returnCounterpartyIdParam,
  } = useLocalSearchParams<{
    kind?: string;
    counterpartyId?: string;
    agreementId?: string;
    paymentRequestId?: string;
    ledgerScope?: string;
    returnCounterpartyId?: string;
  }>();
  const me = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);

  const initialKind: FinanceMovementKind = kindParam === 'income' ? 'income' : 'expense';
  const initialScope: FinanceLedgerScope =
    ledgerScopeParam === 'personal' ? 'personal' : 'hotel';
  const [kind, setKind] = useState<FinanceMovementKind>(initialKind);
  const [ledgerScope, setLedgerScope] = useState<FinanceLedgerScope>(initialScope);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [amount, setAmount] = useState('');
  const [movementDate, setMovementDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<MovementPaymentMethod>('cash');
  const [category, setCategory] = useState<string>(initialKind === 'income' ? 'sales' : 'other');
  const [counterpartyId, setCounterpartyId] = useState<string | null>(null);
  const [counterpartyFree, setCounterpartyFree] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [receiptUrls, setReceiptUrls] = useState<string[]>([]);
  const [counterparties, setCounterparties] = useState<CpOpt[]>([]);
  const [projects, setProjects] = useState<ProjOpt[]>([]);
  const [pickCp, setPickCp] = useState(false);
  const [pickProj, setPickProj] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<{ code: string; label: string }[]>([]);
  const [incomePayerMode, setIncomePayerMode] = useState<IncomePayerMode>('guest');
  const [guestId, setGuestId] = useState<string | null>(null);
  const [guests, setGuests] = useState<IncomeGuestOption[]>([]);
  const [pickGuest, setPickGuest] = useState(false);
  const [sourcePaymentRequestId, setSourcePaymentRequestId] = useState<string | null>(null);
  const [stripeLinkLabel, setStripeLinkLabel] = useState('');
  const [stripePayments, setStripePayments] = useState<AdminPaymentRequestRow[]>([]);
  const [stripePaymentsLoading, setStripePaymentsLoading] = useState(false);
  const [pickStripe, setPickStripe] = useState(false);
  const [agreementId, setAgreementId] = useState<string | null>(agreementIdParam ?? null);
  const [agreementTitle, setAgreementTitle] = useState<string | null>(null);
  const [agreementRemaining, setAgreementRemaining] = useState<number | null>(null);

  const orgId = useMemo(() => {
    if (me?.app_permissions?.super_admin === true || me?.role === 'admin') {
      return selectedOrganizationId !== 'all' ? selectedOrganizationId : me?.organization_id;
    }
    return me?.organization_id;
  }, [me, selectedOrganizationId]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const scrollFieldIntoView = (target: React.RefObject<View | null>) => {
    const content = contentRef.current;
    const field = target.current;
    if (!content || !field) return;
    requestAnimationFrame(() => {
      field.measureLayout(
        content,
        (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 88), animated: true }),
        () => {}
      );
    });
  };

  useEffect(() => {
    if (kind !== 'income') {
      setSourcePaymentRequestId(null);
      setStripeLinkLabel('');
    }
  }, [kind]);

  useEffect(() => {
    if (!orgId || orgId === 'all') {
      setCategoryOptions([]);
      setCounterparties([]);
      setProjects([]);
      return;
    }
    loadMovementCategories(orgId, kind).then((opts) => {
      setCategoryOptions(opts);
      if (opts.length && !opts.some((o) => o.code === category)) {
        setCategory(opts[0].code);
      }
    });
  }, [orgId, kind]);

  useEffect(() => {
    if (!orgId || orgId === 'all') {
      setCounterparties([]);
      setProjects([]);
      return;
    }
    (async () => {
      const [cp, pr] = await Promise.all([
        supabase
          .from('finance_counterparties')
          .select('id, name, party_type')
          .eq('organization_id', orgId)
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('finance_projects')
          .select('id, name')
          .eq('organization_id', orgId)
          .eq('is_active', true)
          .order('sort_order')
          .order('name'),
      ]);
      const list = ((cp.data ?? []) as CpOpt[]) ?? [];
      setCounterparties(list);
      setProjects(((pr.data ?? []) as ProjOpt[]) ?? []);
      if (counterpartyIdParam && list.some((c) => c.id === counterpartyIdParam)) {
        setCounterpartyId(counterpartyIdParam);
        setCounterpartyFree('');
      }
    })();
  }, [orgId, counterpartyIdParam]);

  useEffect(() => {
    if (!agreementIdParam) {
      setAgreementId(null);
      setAgreementTitle(null);
      setAgreementRemaining(null);
      return;
    }
    setAgreementId(agreementIdParam);
    setKind('expense');
    void fetchAgreementById(agreementIdParam).then((row) => {
      if (!row) return;
      setAgreementTitle(row.title);
      setAgreementRemaining(row.amount_remaining);
      if (row.counterparty_id && !counterpartyId) {
        setCounterpartyId(row.counterparty_id);
      }
    });
  }, [agreementIdParam]);

  useEffect(() => {
    if (!orgId || orgId === 'all' || kind !== 'income') {
      setGuests([]);
      return;
    }
    void loadIncomeGuestOptions()
      .then(setGuests)
      .catch(() => setGuests([]));
  }, [orgId, kind]);

  useEffect(() => {
    if (!orgId || orgId === 'all' || kind !== 'income') {
      setStripePayments([]);
      return;
    }
    setStripePaymentsLoading(true);
    void fetchStripePaymentsForIncomeLink(orgId)
      .then(setStripePayments)
      .catch(() => setStripePayments([]))
      .finally(() => setStripePaymentsLoading(false));
  }, [orgId, kind]);

  const applyStripePrefill = (row: AdminPaymentRequestRow) => {
    const pre = buildStripeIncomePrefill(row);
    setAmount(pre.amount);
    setMovementDate(pre.movementDate);
    setPaymentMethod(pre.paymentMethod);
    setCategory(pre.category);
    setDescription(pre.description);
    setSourcePaymentRequestId(pre.sourcePaymentRequestId);
    setStripeLinkLabel(pre.stripeLabel);
    setIncomePayerMode(pre.incomePayerMode);
    setGuestId(pre.guestId);
    setCounterpartyId(null);
    setCounterpartyFree(pre.counterpartyFree);
  };

  useEffect(() => {
    const pid = paymentRequestIdParam?.trim();
    if (!pid || kind !== 'income') return;
    void fetchAdminPaymentRequests(120).then((rows) => {
      const row = rows.find((r) => r.id === pid);
      if (row?.status === 'paid') applyStripePrefill(row);
    });
  }, [paymentRequestIdParam, kind]);

  const selectedGuest = useMemo(
    () => guests.find((g) => g.id === guestId) ?? null,
    [guests, guestId]
  );

  const cpLabel = () => {
    if (counterpartyId) {
      return counterparties.find((c) => c.id === counterpartyId)?.name ?? 'Seçildi';
    }
    return counterpartyFree.trim() || 'Listeden seç veya ad yaz';
  };

  const selectedCp = useMemo(
    () => counterparties.find((c) => c.id === counterpartyId) ?? null,
    [counterparties, counterpartyId]
  );

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId]
  );

  const addReceipt = async (uri: string) => {
    setUploading(true);
    try {
      const { publicUrl } = await uploadUriToPublicBucket({
        bucketId: 'finance-receipts',
        uri,
        subfolder: 'receipt',
      });
      setReceiptUrls((u) => [...u, publicUrl]);
    } catch (e) {
      Alert.alert('Yükleme', (e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const pickCamera = async () => {
    const ok = await ensureCameraPermission({
      title: 'Kamera',
      message: 'Fiş fotoğrafı için kamera gerekli.',
      settingsMessage: 'Ayarlardan kamera iznini açın.',
    });
    if (!ok) return;
    const r = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.75,
    });
    if (!r.canceled && r.assets[0]?.uri) await addReceipt(r.assets[0].uri);
  };

  const pickLib = async () => {
    const uris = await pickGalleryImages({ quality: 0.75, selectionLimit: 8 });
    for (const uri of uris) await addReceipt(uri);
  };

  const save = async () => {
    if (!me?.id) {
      Alert.alert('Oturum', 'Personel kaydı gerekli.');
      return;
    }
    if (!orgId || orgId === 'all') {
      Alert.alert('İşletme', 'Üstten işletme seçin.');
      return;
    }
    const a = parseFloat(amount.replace(',', '.'));
    if (Number.isNaN(a) || a <= 0) {
      Alert.alert('Form', 'Geçerli tutar girin.');
      return;
    }
    let cpName = '';
    let cpId: string | null = counterpartyId;
    let gId: string | null = null;

    if (kind === 'income') {
      if (incomePayerMode === 'guest') {
        const g = guests.find((x) => x.id === guestId);
        if (!guestId || !g) {
          Alert.alert('Form', 'Misafir seçin veya isim yazın sekmesine geçin.');
          return;
        }
        cpName = g.full_name;
        cpId = null;
        gId = guestId;
      } else if (incomePayerMode === 'counterparty') {
        cpName =
          counterpartyId != null
            ? counterparties.find((c) => c.id === counterpartyId)?.name?.trim() ?? ''
            : counterpartyFree.trim();
        if (!cpName) {
          Alert.alert('Form', 'Cari seçin veya ad yazın.');
          return;
        }
        if (counterpartyId) cpId = counterpartyId;
      } else {
        cpName = counterpartyFree.trim();
        if (!cpName) {
          Alert.alert('Form', 'Kimden alındığını yazın.');
          return;
        }
        cpId = null;
      }
    } else {
      cpName =
        counterpartyId != null
          ? counterparties.find((c) => c.id === counterpartyId)?.name?.trim() ?? ''
          : counterpartyFree.trim();
      if (!cpName) {
        Alert.alert('Form', 'Cari adı girin veya listeden seçin.');
        return;
      }
    }

    if (sourcePaymentRequestId) {
      const { data: existing } = await supabase
        .from('finance_movements')
        .select('id')
        .eq('source_payment_request_id', sourcePaymentRequestId)
        .maybeSingle();
      if (existing?.id) {
        Alert.alert('Zaten kayıtlı', 'Bu Stripe ödemesi için gelir satırı var.', [
          {
            text: 'Kaydı aç',
            onPress: () =>
              router.replace({
                pathname: '/admin/accounting/movements/[id]',
                params: { id: existing.id as string },
              } as never),
          },
          { text: 'Tamam', style: 'cancel' },
        ]);
        return;
      }
    }

    setSaving(true);
    const { data, error } = await supabase
      .from('finance_movements')
      .insert({
        organization_id: orgId,
        kind,
        amount: a,
        currency: 'TRY',
        movement_date: movementDate,
        payment_method: paymentMethod,
        category,
        counterparty_id: cpId,
        counterparty_name: cpId ? null : cpName,
        guest_id: gId,
        project_id: projectId,
        description: description.trim(),
        receipt_urls: receiptUrls,
        source_payment_request_id: sourcePaymentRequestId,
        ledger_scope: ledgerScope,
        agreement_id: agreementId && kind === 'expense' ? agreementId : null,
        created_by_staff_id: me.id,
      })
      .select('id')
      .single();
    setSaving(false);

    if (error) {
      Alert.alert('Kayıt hatası', error.message);
      return;
    }
    invalidateCounterpartyBalanceCache(orgId);
    if (returnCounterpartyIdParam) {
      router.replace({
        pathname: '/admin/accounting/counterparties/[id]',
        params: { id: returnCounterpartyIdParam },
      } as never);
      return;
    }
    router.replace({
      pathname: '/admin/accounting/movements/[id]',
      params: { id: (data as { id: string }).id },
    } as never);
  };

  const contentPadBottom =
    Math.max(insets.bottom, 16) + 56 + (Platform.OS === 'android' ? keyboardHeight : 0);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 56 : 0}
    >
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={{ paddingBottom: contentPadBottom }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets
      showsVerticalScrollIndicator={false}
    >
      <View ref={contentRef} style={styles.content} collapsable={false}>
      <AdminOrganizationPicker
        canUseAll={me?.app_permissions?.super_admin === true || me?.role === 'admin'}
        ownOrganizationId={me?.organization_id}
      />

      {agreementId && agreementTitle ? (
        <View style={styles.planBanner}>
          <Ionicons name="flag-outline" size={18} color="#7c3aed" />
          <View style={styles.planBannerBody}>
            <Text style={styles.planBannerTitle}>{agreementTitle}</Text>
            {agreementRemaining != null ? (
              <Text style={styles.planBannerRem}>Kalan {fmtMoneyTry(agreementRemaining)}</Text>
            ) : null}
          </View>
        </View>
      ) : null}

      <AdminCard style={styles.cardGap}>
        <FieldLabel first>Tür</FieldLabel>
        <SegmentRow
          value={kind}
          onChange={setKind}
          disabledValues={agreementId ? ['income'] : undefined}
          options={[
            { id: 'expense', label: MOVEMENT_KIND_LABELS.expense, activeStyle: styles.segmentExpense },
            { id: 'income', label: MOVEMENT_KIND_LABELS.income, activeStyle: styles.segmentIncome },
          ]}
        />

        <FieldLabel>Tutar</FieldLabel>
        <View style={styles.amountWrap}>
          <Text style={styles.amountCurrency}>₺</Text>
          <TextInput
            style={styles.amountInput}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0,00"
            placeholderTextColor={adminTheme.colors.textMuted}
          />
        </View>

        <FieldLabel>{kind === 'income' ? 'Kimden' : 'Kime'}</FieldLabel>
        {kind === 'income' ? (
          <>
            <SegmentRow
              value={incomePayerMode}
              onChange={(m) => {
                setIncomePayerMode(m);
                if (m === 'guest') {
                  setCounterpartyId(null);
                  setCounterpartyFree('');
                } else if (m === 'counterparty') {
                  setGuestId(null);
                } else {
                  setGuestId(null);
                  setCounterpartyId(null);
                }
              }}
              options={[
                { id: 'guest', label: 'Misafir' },
                { id: 'counterparty', label: 'Cari' },
                { id: 'free', label: 'İsim' },
              ]}
            />
            {incomePayerMode === 'guest' ? (
              <PickField
                icon="bed-outline"
                label="Misafir"
                value={selectedGuest?.full_name ?? 'Seçin'}
                selected={!!selectedGuest}
                onPress={() => setPickGuest(true)}
              />
            ) : null}
            {incomePayerMode === 'counterparty' ? (
              <>
                <PickField
                  icon="person-outline"
                  label="Cari"
                  value={selectedCp?.name ?? cpLabel()}
                  selected={!!selectedCp}
                  onPress={() => setPickCp(true)}
                />
                {!selectedCp ? (
                  <View ref={counterpartyFreeWrapRef} collapsable={false}>
                    <TextInput
                      ref={counterpartyFreeInputRef}
                      style={styles.input}
                      value={counterpartyFree}
                      onChangeText={setCounterpartyFree}
                      onFocus={() => scrollFieldIntoView(counterpartyFreeWrapRef)}
                      placeholder="Listede yoksa ad yazın"
                      placeholderTextColor={adminTheme.colors.textMuted}
                    />
                  </View>
                ) : null}
              </>
            ) : null}
            {incomePayerMode === 'free' ? (
              <View ref={counterpartyFreeWrapRef} collapsable={false}>
                <TextInput
                  ref={counterpartyFreeInputRef}
                  style={styles.input}
                  value={counterpartyFree}
                  onChangeText={setCounterpartyFree}
                  onFocus={() => scrollFieldIntoView(counterpartyFreeWrapRef)}
                  placeholder="Örn. Ahmet Yılmaz"
                  placeholderTextColor={adminTheme.colors.textMuted}
                />
              </View>
            ) : null}
          </>
        ) : (
          <>
            <PickField
              icon="person-outline"
              label="Cari"
              value={selectedCp?.name ?? cpLabel()}
              selected={!!selectedCp}
              onPress={() => setPickCp(true)}
            />
            {!selectedCp ? (
              <View ref={counterpartyFreeWrapRef} collapsable={false}>
                <TextInput
                  ref={counterpartyFreeInputRef}
                  style={styles.input}
                  value={counterpartyFree}
                  onChangeText={setCounterpartyFree}
                  onFocus={() => scrollFieldIntoView(counterpartyFreeWrapRef)}
                  placeholder="Listede yoksa ad yazın"
                  placeholderTextColor={adminTheme.colors.textMuted}
                />
              </View>
            ) : null}
          </>
        )}

        <FieldLabel>Tarih</FieldLabel>
        <TextInput
          style={styles.input}
          value={movementDate}
          onChangeText={setMovementDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={adminTheme.colors.textMuted}
        />
      </AdminCard>

      <AdminCard style={styles.cardGap}>
        <Text style={styles.cardTitle}>Detaylar</Text>

        <FieldLabel first>Kayıt türü</FieldLabel>
        <SegmentRow
          value={ledgerScope}
          onChange={setLedgerScope}
          options={[
            { id: 'hotel', label: 'Otel', activeStyle: styles.segmentScope },
            { id: 'personal', label: 'Kişisel', activeStyle: styles.segmentScope },
          ]}
        />

        <FieldLabel>Ödeme</FieldLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          {PAY_METHODS.map((m) => {
            const lockedStripe = kind === 'income' && !!sourcePaymentRequestId && m !== 'card';
            return (
              <TouchableOpacity
                key={m}
                style={[styles.chip, paymentMethod === m && styles.chipOn, lockedStripe && styles.chipDisabled]}
                onPress={() => !lockedStripe && setPaymentMethod(m)}
                disabled={lockedStripe}
              >
                <Text style={[styles.chipText, paymentMethod === m && styles.chipTextOn]}>
                  {kind === 'income' && sourcePaymentRequestId && m === 'card'
                    ? 'Stripe'
                    : PAYMENT_METHOD_LABELS[m]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <FieldLabel>Kategori</FieldLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          {categoryOptions.map((c) => (
            <TouchableOpacity
              key={c.code}
              style={[styles.chip, category === c.code && styles.chipOn]}
              onPress={() => setCategory(c.code)}
            >
              <Text style={[styles.chipText, category === c.code && styles.chipTextOn]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {kind === 'income' ? (
          <>
            <FieldLabel>Stripe</FieldLabel>
            {sourcePaymentRequestId ? (
              <View style={styles.inlineNote}>
                <Ionicons name="card-outline" size={18} color="#635bff" />
                <Text style={styles.inlineNoteText} numberOfLines={2}>
                  {stripeLinkLabel}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setSourcePaymentRequestId(null);
                    setStripeLinkLabel('');
                  }}
                >
                  <Text style={styles.inlineNoteAction}>Kaldır</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <PickField
                icon="card-outline"
                iconColor="#635bff"
                label="Tahsilat"
                value="Ödenmiş Stripe bağla (opsiyonel)"
                onPress={() => setPickStripe(true)}
              />
            )}
          </>
        ) : null}

        <FieldLabel>Proje</FieldLabel>
        <PickField
          icon="folder-outline"
          iconColor="#7c3aed"
          label="Proje"
          value={selectedProject?.name ?? 'Seçilmedi (opsiyonel)'}
          selected={!!selectedProject}
          onPress={() => setPickProj(true)}
        />

        <View ref={descriptionWrapRef} collapsable={false}>
          <FieldLabel>Açıklama</FieldLabel>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            onFocus={() => scrollFieldIntoView(descriptionWrapRef)}
            multiline
            placeholder="Kısa not (opsiyonel)"
            placeholderTextColor={adminTheme.colors.textMuted}
          />
        </View>
      </AdminCard>

      <AdminCard style={styles.cardGap}>
        <Text style={styles.cardTitle}>Belge</Text>
        <Text style={styles.cardHint}>Fiş veya fatura fotoğrafı — opsiyonel</Text>
        <View style={styles.imgActions}>
          <TouchableOpacity style={styles.imgBtn} onPress={pickCamera} disabled={uploading}>
            <Ionicons name="camera-outline" size={18} color={adminTheme.colors.primary} />
            <Text style={styles.imgBtnText}>Kamera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.imgBtn} onPress={pickLib} disabled={uploading}>
            <Ionicons name="images-outline" size={18} color={adminTheme.colors.primary} />
            <Text style={styles.imgBtnText}>Galeri</Text>
          </TouchableOpacity>
        </View>
        {uploading ? <ActivityIndicator style={{ marginTop: 10 }} color={adminTheme.colors.accent} /> : null}
        {receiptUrls.length > 0 ? (
          <View style={styles.thumbs}>
            {receiptUrls.map((url, i) => (
              <View key={url} style={styles.thumbWrap}>
                <Image source={{ uri: url }} style={styles.thumb} />
                <TouchableOpacity style={styles.thumbDel} onPress={() => setReceiptUrls((u) => u.filter((_, j) => j !== i))}>
                  <Ionicons name="close-circle" size={22} color="#dc2626" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}
      </AdminCard>

      <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving} activeOpacity={0.9}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Kaydet</Text>}
      </TouchableOpacity>
      </View>
    </ScrollView>

      <CounterpartyPickerSheet
        visible={pickCp}
        onClose={() => setPickCp(false)}
        items={counterparties}
        selectedId={counterpartyId}
        onSelect={(id) => {
          setCounterpartyId(id);
          if (id) setCounterpartyFree('');
        }}
        onFreeText={() => {
          setIncomePayerMode('free');
          setCounterpartyFree('');
          setTimeout(() => {
            counterpartyFreeInputRef.current?.focus();
            scrollFieldIntoView(counterpartyFreeWrapRef);
          }, 320);
        }}
        title={kind === 'income' ? 'Parayı kimden aldınız?' : 'Parayı kime ödediniz?'}
      />

      <GuestPickerSheet
        visible={pickGuest}
        onClose={() => setPickGuest(false)}
        items={guests}
        selectedId={guestId}
        onSelect={(id) => {
          setGuestId(id);
          if (id) {
            setCounterpartyId(null);
            setCounterpartyFree('');
          }
        }}
        onFreeText={() => {
          setIncomePayerMode('free');
          setGuestId(null);
          setTimeout(() => {
            counterpartyFreeInputRef.current?.focus();
            scrollFieldIntoView(counterpartyFreeWrapRef);
          }, 320);
        }}
        title="Kimden tahsil edildi?"
      />

      <StripePaymentLinkSheet
        visible={pickStripe}
        onClose={() => setPickStripe(false)}
        items={stripePayments}
        loading={stripePaymentsLoading}
        selectedId={sourcePaymentRequestId}
        onSelect={(row) => applyStripePrefill(row)}
      />

      <ProjectPickerSheet
        visible={pickProj}
        onClose={() => setPickProj(false)}
        items={projects}
        selectedId={projectId}
        onSelect={setProjectId}
        title="Proje seç"
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  scroll: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, gap: 0 },
  cardGap: { marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.text, marginBottom: 4 },
  cardHint: { fontSize: 13, color: adminTheme.colors.textMuted, marginBottom: 12 },
  planBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f5f3ff',
    borderWidth: 1,
    borderColor: '#e9d5ff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  planBannerBody: { flex: 1 },
  planBannerTitle: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.text },
  planBannerRem: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  label: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.textMuted, marginTop: 14, marginBottom: 8 },
  labelFirst: { marginTop: 0 },
  input: {
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: adminTheme.colors.text,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  amountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    paddingHorizontal: 14,
  },
  amountCurrency: { fontSize: 20, fontWeight: '700', color: adminTheme.colors.textMuted, marginRight: 6 },
  amountInput: {
    flex: 1,
    fontSize: 32,
    fontWeight: '800',
    color: adminTheme.colors.text,
    paddingVertical: 12,
  },
  multiline: { minHeight: 64, textAlignVertical: 'top' },
  segmentRow: { flexDirection: 'row', gap: 8 },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  segmentOn: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  segmentExpense: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  segmentIncome: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  segmentScope: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  segmentDisabled: { opacity: 0.4 },
  segmentText: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.text },
  segmentTextOn: { color: '#fff' },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  fieldRowSelected: {
    borderColor: adminTheme.colors.primary,
    backgroundColor: adminTheme.colors.surface,
  },
  fieldRowBody: { flex: 1, minWidth: 0 },
  fieldRowLabel: { fontSize: 11, fontWeight: '600', color: adminTheme.colors.textMuted, textTransform: 'uppercase' },
  fieldRowValue: { fontSize: 15, fontWeight: '500', color: adminTheme.colors.textMuted, marginTop: 2 },
  fieldRowValueSelected: { color: adminTheme.colors.text, fontWeight: '600' },
  chipScroll: { marginBottom: 2 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  chipOn: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  chipDisabled: { opacity: 0.35 },
  chipText: { fontSize: 13, color: adminTheme.colors.text },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  inlineNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  inlineNoteText: { flex: 1, fontSize: 13, color: adminTheme.colors.text },
  inlineNoteAction: { fontSize: 13, fontWeight: '600', color: '#dc2626' },
  imgActions: { flexDirection: 'row', gap: 10 },
  imgBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  imgBtnText: { color: adminTheme.colors.primary, fontWeight: '600', fontSize: 14 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  thumbWrap: { position: 'relative' },
  thumb: expenseReceiptPreviewStyle,
  thumbDel: { position: 'absolute', top: -6, right: -6 },
  saveBtn: {
    backgroundColor: adminTheme.colors.primary,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
