import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  TextInput,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { adminTheme } from '@/constants/adminTheme';
import { CachedImage } from '@/components/CachedImage';
import { ImageLightboxModal } from '@/components/admin/ImageLightboxModal';
import {
  counterpartyInitials,
  resolveCounterpartyTypeMeta,
  formatCounterpartyBalance,
} from '@/lib/financeCounterpartyUi';
import {
  fetchCounterpartyBalanceMap,
  invalidateCounterpartyBalanceCache,
} from '@/lib/financeCounterpartyBalances';
import {
  pickCounterpartyProfileImage,
  uploadCounterpartyProfileImage,
  clearCounterpartyProfileImage,
} from '@/lib/financeCounterpartyAvatar';
import { fmtMoneyTry } from '@/lib/financeLedger';
import { resolveCategoryLabel } from '@/lib/financeCategoriesApi';
import type { FinanceCounterpartyType, FinanceLedgerScope } from '@/lib/financeLedger';
import { LEDGER_SCOPE_LABELS } from '@/lib/financeLedger';
import { formatDateShort } from '@/lib/date';
import { FinanceReportExportButtons } from '@/components/admin/FinanceReportExportButtons';
import {
  buildCounterpartyPersonReportHtml,
  fetchCounterpartyMovementsForReport,
  resolveFinanceReportFooter,
} from '@/lib/financeCounterpartyReport';
import { footerOptsFromOrganization } from '@/lib/financeReportBranding';
import { CounterpartyAgreementsSection } from '@/components/admin/CounterpartyAgreementsSection';
import { CounterpartyQuickPaySheet } from '@/components/admin/CounterpartyQuickPaySheet';
import { CounterpartyInvoiceScanSheet } from '@/components/admin/CounterpartyInvoiceScanSheet';
import { CounterpartyQuickCollectSheet } from '@/components/admin/CounterpartyQuickCollectSheet';
import {
  fetchCounterpartyAgreements,
  defaultAgreementMovementKind,
  agreementKindLabels,
  sumOpenAgreementRemaining,
  type CounterpartyAgreementRow,
} from '@/lib/financeCounterpartyAgreements';
import {
  loadFinanceMovementReceiptInput,
  mailFinanceMovementReceiptToPrinter,
  printFinanceMovementReceipt,
  shareFinanceMovementReceiptPdf,
  shareFinanceMovementReceiptWhatsApp,
} from '@/lib/financeMovementReceiptPdf';
import {
  findCounterpartyMergeSuggestions,
  mergeFinanceCounterparties,
  type CounterpartyMergeSuggestion,
} from '@/lib/financeCounterpartyMerge';

type CpRow = {
  id: string;
  organization_id: string;
  name: string;
  party_type: FinanceCounterpartyType;
  party_type_label: string | null;
  phone: string | null;
  notes: string | null;
  profile_image: string | null;
  linked_staff_id: string | null;
};

type MovRow = {
  id: string;
  kind: string;
  amount: number;
  movement_date: string;
  category: string;
  description: string;
  ledger_scope: FinanceLedgerScope;
  agreement_id: string | null;
};

type ScopeFilter = 'all' | FinanceLedgerScope;

const SCOPE_FILTERS: { key: ScopeFilter; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'hotel', label: LEDGER_SCOPE_LABELS.hotel },
  { key: 'personal', label: LEDGER_SCOPE_LABELS.personal },
];

function openPhoneCall(phone: string) {
  void Linking.openURL(`tel:${phone.trim()}`).catch(() => Alert.alert('Hata', 'Arama açılamadı.'));
}

function openPhoneWhatsApp(phone: string) {
  const digits = phone.trim().replace(/\D/g, '');
  if (!digits) return;
  void Linking.openURL(`https://wa.me/${digits}`).catch(() => Alert.alert('Hata', 'WhatsApp açılamadı.'));
}

export default function CounterpartyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const me = useAuthStore((s) => s.staff);
  const selectedOrg = useAdminOrgStore((s) =>
    s.organizations.find((o) => o.id === (s.selectedOrganizationId !== 'all' ? s.selectedOrganizationId : me?.organization_id))
  );
  const [cp, setCp] = useState<CpRow | null>(null);
  const [movements, setMovements] = useState<MovRow[]>([]);
  const [income, setIncome] = useState(0);
  const [expense, setExpense] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuMovement, setMenuMovement] = useState<MovRow | null>(null);
  const [menuPerson, setMenuPerson] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [imageLightbox, setImageLightbox] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [agreements, setAgreements] = useState<CounterpartyAgreementRow[]>([]);
  const [receiptBusy, setReceiptBusy] = useState<'pdf' | 'print' | 'mail' | 'whatsapp' | null>(null);
  const [paySheetOpen, setPaySheetOpen] = useState(false);
  const [payAgreementId, setPayAgreementId] = useState<string | null>(null);
  const [collectSheetOpen, setCollectSheetOpen] = useState(false);
  const [collectAgreementId, setCollectAgreementId] = useState<string | null>(null);
  const [invoiceScanOpen, setInvoiceScanOpen] = useState(false);
  const [newDebtTick, setNewDebtTick] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [linkedStaffName, setLinkedStaffName] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [orgCounterparties, setOrgCounterparties] = useState<{ id: string; name: string; organization_id: string }[]>([]);
  const [dismissedMergeId, setDismissedMergeId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data: c, error: e1 } = await supabase
      .from('finance_counterparties')
      .select(
        'id, organization_id, name, party_type, party_type_label, phone, notes, profile_image, linked_staff_id'
      )
      .eq('id', id)
      .single();

    if (e1 || !c) {
      setCp(null);
      setLoading(false);
      return;
    }
    const row = c as CpRow;
    setCp(row);
    if (row.linked_staff_id) {
      const { data: staffRow } = await supabase
        .from('staff')
        .select('full_name')
        .eq('id', row.linked_staff_id)
        .maybeSingle();
      setLinkedStaffName((staffRow as { full_name?: string | null } | null)?.full_name?.trim() ?? null);
    } else {
      setLinkedStaffName(null);
    }

    const scope = scopeFilter === 'all' ? null : scopeFilter;
    const [{ data: m }, balMap, agreementRows] = await Promise.all([
      supabase
        .from('finance_movements')
        .select('id, kind, amount, movement_date, category, description, ledger_scope, agreement_id')
        .eq('counterparty_id', id)
        .order('movement_date', { ascending: false })
        .limit(80),
      fetchCounterpartyBalanceMap(row.organization_id, scope),
      fetchCounterpartyAgreements(id),
    ]);

    let list = (m as MovRow[]) ?? [];
    if (scopeFilter !== 'all') list = list.filter((x) => x.ledger_scope === scopeFilter);
    setMovements(list);
    const b = balMap.get(id);
    setIncome(b?.income ?? 0);
    setExpense(b?.expense ?? 0);
    setAgreements(agreementRows);
    setLoading(false);

    const { data: orgCps } = await supabase
      .from('finance_counterparties')
      .select('id, name, organization_id')
      .eq('organization_id', row.organization_id)
      .eq('is_active', true);
    setOrgCounterparties((orgCps as { id: string; name: string; organization_id: string }[]) ?? []);
  }, [id, scopeFilter]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const mergeSuggestion = useMemo((): CounterpartyMergeSuggestion | null => {
    if (!cp || dismissedMergeId) return null;
    const suggestions = findCounterpartyMergeSuggestions(orgCounterparties);
    return suggestions.find((s) => s.counterpartyIds.includes(cp.id) && s.id !== dismissedMergeId) ?? null;
  }, [cp, orgCounterparties, dismissedMergeId]);

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
      </View>
    );
  }

  if (!cp) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Cari bulunamadı.</Text>
      </View>
    );
  }

  const meta = resolveCounterpartyTypeMeta(cp.party_type, cp.party_type_label);
  const debtLabels = agreementKindLabels(defaultAgreementMovementKind(cp.party_type));
  const net = income - expense;
  const balance = formatCounterpartyBalance(net);
  const defaultScope: FinanceLedgerScope =
    cp.party_type === 'private_person' ? 'personal' : 'hotel';
  const agreementTitleById = Object.fromEntries(agreements.map((a) => [a.id, a.title]));
  const reportBrandingOpts = footerOptsFromOrganization(selectedOrg);
  const reportFooter = resolveFinanceReportFooter(reportBrandingOpts);
  const documentBrandTitle = reportFooter.documentBrandTitle;

  const closeMenu = () => {
    setMenuVisible(false);
    setMenuMovement(null);
    setMenuPerson(false);
    setReceiptBusy(null);
  };

  const runMovementReceipt = async (action: 'pdf' | 'print' | 'mail' | 'whatsapp') => {
    if (!menuMovement || receiptBusy) return;
    setReceiptBusy(action);
    try {
      const data = await loadFinanceMovementReceiptInput(menuMovement.id, selectedOrg);
      if (action === 'pdf') await shareFinanceMovementReceiptPdf(data);
      else if (action === 'print') await printFinanceMovementReceipt(data);
      else if (action === 'mail') await mailFinanceMovementReceiptToPrinter(data);
      else await shareFinanceMovementReceiptWhatsApp(data);
      closeMenu();
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'İşlem tamamlanamadı.');
    } finally {
      setReceiptBusy(null);
    }
  };

  const openPersonMenu = () => {
    setMenuPerson(true);
    setMenuMovement(null);
    setMenuVisible(true);
  };

  const openMovementMenu = (m: MovRow) => {
    setMenuMovement(m);
    setMenuPerson(false);
    setMenuVisible(true);
  };

  const removePersonFromList = () => {
    closeMenu();
    Alert.alert(
      'Kişiyi kaldır',
      'Liste dışı bırakılır; geçmiş ödemeler silinmez.',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Kaldır',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('finance_counterparties')
              .update({ is_active: false })
              .eq('id', cp.id);
            if (error) Alert.alert('Hata', error.message);
            else router.replace('/admin/accounting/counterparties' as never);
          },
        },
      ]
    );
  };

  const deleteMovement = (movementId: string) => {
    closeMenu();
    Alert.alert('Sil', 'Bu kayıt silinsin mi?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('finance_movements').delete().eq('id', movementId);
          if (error) {
            Alert.alert('Hata', error.message);
            return;
          }
          invalidateCounterpartyBalanceCache(cp.organization_id);
          load();
        },
      },
    ]);
  };

  const pickAndUploadPhoto = async () => {
    const uri = await pickCounterpartyProfileImage();
    if (!uri) return;
    setUploadingPhoto(true);
    const res = await uploadCounterpartyProfileImage(cp.organization_id, cp.id, uri);
    setUploadingPhoto(false);
    if ('error' in res) {
      Alert.alert('Hata', res.error);
      return;
    }
    setCp((p) => (p ? { ...p, profile_image: res.publicUrl } : null));
  };

  const onAvatarPress = () => {
    if (cp.profile_image) {
      setImageLightbox(true);
      return;
    }
    void pickAndUploadPhoto();
  };

  const confirmDeletePhoto = () => {
    setImageLightbox(false);
    Alert.alert('Sil', 'Profil fotoğrafı kaldırılsın mı?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          setUploadingPhoto(true);
          const err = await clearCounterpartyProfileImage(cp.id);
          setUploadingPhoto(false);
          if (err) Alert.alert('Hata', err);
          else setCp((p) => (p ? { ...p, profile_image: null } : null));
        },
      },
    ]);
  };

  const menuChangePhoto = () => {
    closeMenu();
    void pickAndUploadPhoto();
  };

  const openQuickPay = (agreement?: CounterpartyAgreementRow) => {
    setPayAgreementId(agreement?.id ?? null);
    setPaySheetOpen(true);
  };

  const openQuickCollect = (agreement?: CounterpartyAgreementRow) => {
    setCollectAgreementId(agreement?.id ?? null);
    setCollectSheetOpen(true);
  };

  const openIncome = () => {
    openQuickCollect();
  };

  const openDebtsTotal = sumOpenAgreementRemaining(agreements);

  const startNameEdit = () => {
    if (!cp) return;
    setNameDraft(cp.name);
    setEditingName(true);
  };

  const cancelNameEdit = () => {
    setEditingName(false);
    setNameDraft('');
  };

  const saveNameEdit = async () => {
    if (!cp) return;
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      Alert.alert('Ad gerekli', 'Kişi adını yazın.');
      return;
    }
    if (trimmed === cp.name) {
      cancelNameEdit();
      return;
    }
    setSavingName(true);
    const { error } = await supabase.from('finance_counterparties').update({ name: trimmed }).eq('id', cp.id);
    setSavingName(false);
    if (error) {
      Alert.alert('Kaydedilemedi', error.message);
      return;
    }
    setCp((p) => (p ? { ...p, name: trimmed } : null));
    cancelNameEdit();
  };

  const applyDetailMerge = (suggestion: CounterpartyMergeSuggestion) => {
    const mergeIds = suggestion.counterpartyIds.filter((mid) => mid !== suggestion.keepId);
    Alert.alert(
      'Carileri birleştir',
      `${suggestion.names.join(' · ')}\n\nTek cari: ${suggestion.canonicalName}\n${mergeIds.length} kayıt birleştirilecek.`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Birleştir',
          onPress: async () => {
            setMerging(true);
            const err = await mergeFinanceCounterparties({
              keepId: suggestion.keepId,
              mergeIds: suggestion.counterpartyIds,
              canonicalName: suggestion.canonicalName,
              organizationId: suggestion.organizationId,
            });
            setMerging(false);
            if (err) {
              Alert.alert('Hata', err);
              return;
            }
            if (suggestion.keepId !== cp.id) {
              router.replace({
                pathname: '/admin/accounting/counterparties/[id]',
                params: { id: suggestion.keepId },
              } as never);
            } else {
              load();
            }
          },
        },
      ]
    );
  };

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroRow}>
            <TouchableOpacity
              style={styles.avatarWrap}
              onPress={onAvatarPress}
              onLongPress={menuChangePhoto}
              activeOpacity={0.88}
              disabled={uploadingPhoto}
            >
              {cp.profile_image ? (
                <CachedImage uri={cp.profile_image} style={styles.avatarImg} contentFit="cover" />
              ) : (
                <View style={[styles.avatarPh, { backgroundColor: meta.bg }]}>
                  <Text style={[styles.avatarLetter, { color: meta.color }]}>
                    {counterpartyInitials(cp.name)}
                  </Text>
                </View>
              )}
              <View style={styles.avatarBadge}>
                {uploadingPhoto ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name={cp.profile_image ? 'expand-outline' : 'camera-outline'} size={14} color="#fff" />
                )}
              </View>
            </TouchableOpacity>

            <View style={styles.heroInfo}>
              <View style={styles.nameRow}>
                {editingName ? (
                  <View style={styles.nameEditWrap}>
                    <TextInput
                      style={styles.nameInput}
                      value={nameDraft}
                      onChangeText={setNameDraft}
                      autoFocus
                      placeholder="Kişi adı"
                      placeholderTextColor={adminTheme.colors.textMuted}
                    />
                    <View style={styles.nameEditActions}>
                      <TouchableOpacity
                        style={styles.nameSaveBtn}
                        onPress={() => void saveNameEdit()}
                        disabled={savingName}
                      >
                        {savingName ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.nameSaveText}>Kaydet</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.nameCancelBtn} onPress={cancelNameEdit} disabled={savingName}>
                        <Text style={styles.nameCancelText}>İptal</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <>
                    <TouchableOpacity style={styles.nameTap} onPress={startNameEdit} activeOpacity={0.75}>
                      <Text style={styles.heroName} numberOfLines={2}>
                        {cp.name}
                      </Text>
                      <Ionicons name="pencil-outline" size={14} color={adminTheme.colors.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.moreBtn} onPress={openPersonMenu} hitSlop={12}>
                      <Ionicons name="ellipsis-vertical" size={22} color={adminTheme.colors.textMuted} />
                    </TouchableOpacity>
                  </>
                )}
              </View>
              <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                <Ionicons name={meta.icon} size={13} color={meta.color} />
                <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
              </View>
              {cp.phone ? (
                <View style={styles.phoneRow}>
                  <Text style={styles.phone}>
                    <Ionicons name="call-outline" size={13} color={adminTheme.colors.textMuted} /> {cp.phone}
                  </Text>
                  <TouchableOpacity style={styles.phoneAction} onPress={() => openPhoneCall(cp.phone!)}>
                    <Ionicons name="call" size={14} color="#2563eb" />
                    <Text style={styles.phoneActionText}>Ara</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.phoneAction, styles.phoneActionWa]} onPress={() => openPhoneWhatsApp(cp.phone!)}>
                    <Ionicons name="logo-whatsapp" size={14} color="#25D366" />
                    <Text style={[styles.phoneActionText, styles.phoneActionWaText]}>WhatsApp</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              {cp.notes?.trim() ? (
                <View style={styles.notesBox}>
                  <Ionicons name="document-text-outline" size={13} color={adminTheme.colors.textMuted} />
                  <Text style={styles.notesText}>{cp.notes.trim()}</Text>
                </View>
              ) : null}
              {linkedStaffName ? (
                <Text style={styles.linkedStaff}>
                  <Ionicons name="notifications-outline" size={13} color="#7c3aed" /> Bildirim: {linkedStaffName}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.balanceStrip}>
            {openDebtsTotal > 0 ? (
              <View style={styles.balanceMain}>
                <Text style={styles.balanceLbl}>Açık borç toplamı</Text>
                <Text style={styles.balanceValDebt}>{fmtMoneyTry(openDebtsTotal)}</Text>
              </View>
            ) : (
              <View style={styles.balanceMain}>
                <Text style={styles.balanceLbl}>Genel durum</Text>
                <Text
                  style={[
                    styles.balanceVal,
                    balance.tone === 'positive' && styles.in,
                    balance.tone === 'negative' && styles.out,
                  ]}
                >
                  {balance.tone === 'zero' ? 'Dengede' : balance.text}
                </Text>
              </View>
            )}
            <View style={styles.balanceSide}>
              <TouchableOpacity onPress={() => openQuickPay()} activeOpacity={0.85}>
                <Text style={styles.balanceSideLbl}>Ödenen</Text>
                <Text style={[styles.balanceSideVal, styles.out]}>{fmtMoneyTry(expense)}</Text>
                <Text style={[styles.balanceSideAction, { color: '#dc2626' }]}>Ödeme ekle →</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={openIncome} activeOpacity={0.85} style={{ marginTop: 6 }}>
                <Text style={styles.balanceSideLbl}>Alınan</Text>
                <Text style={[styles.balanceSideVal, styles.in]}>{fmtMoneyTry(income)}</Text>
                <Text style={styles.balanceSideAction}>Tahsilat ekle →</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <Text style={styles.hubTitle}>Ne yapmak istiyorsunuz?</Text>
        <View style={styles.hubRow}>
          <TouchableOpacity
            style={[styles.hubCard, styles.hubInvoice]}
            onPress={() => setInvoiceScanOpen(true)}
            activeOpacity={0.88}
          >
            <Ionicons name="scan-outline" size={22} color="#7c3aed" />
            <Text style={styles.hubCardTitle}>Faturadan borç</Text>
            <Text style={styles.hubCardSub}>Foto / PDF oku</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.hubCard, styles.hubDebt]}
            onPress={() => setNewDebtTick((t) => t + 1)}
            activeOpacity={0.88}
          >
            <Ionicons name="document-text-outline" size={22} color="#7c3aed" />
            <Text style={styles.hubCardTitle}>{debtLabels.debtOpen}</Text>
            <Text style={styles.hubCardSub}>Elle gir</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.hubRow}>
          <TouchableOpacity
            style={[styles.hubCard, styles.hubPay]}
            onPress={() => openQuickPay()}
            activeOpacity={0.88}
          >
            <Ionicons name="arrow-up-circle" size={22} color="#dc2626" />
            <Text style={styles.hubCardTitle}>Ödeme yap</Text>
            <Text style={styles.hubCardSub}>Para ver</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.hubCard, styles.hubIncome]}
            onPress={openIncome}
            activeOpacity={0.88}
          >
            <Ionicons name="arrow-down-circle" size={22} color="#16a34a" />
            <Text style={styles.hubCardTitle}>Tahsilat</Text>
            <Text style={styles.hubCardSub}>Para al</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.debtsSectionTitle}>Açık {debtLabels.debtNoun.toLowerCase()}lar</Text>
        <CounterpartyAgreementsSection
          counterpartyId={cp.id}
          organizationId={cp.organization_id}
          personName={cp.name}
          partyType={cp.party_type}
          partyTypeLabel={meta.label}
          phone={cp.phone}
          profileImageUrl={cp.profile_image}
          defaultLedgerScope={defaultScope}
          agreements={agreements}
          onRefresh={load}
          reportFooter={reportFooter}
          documentBrandTitle={documentBrandTitle}
          createdByStaffId={me?.id ?? null}
          createdByStaffName={me?.full_name ?? null}
          linkedStaffId={cp.linked_staff_id}
          linkedStaffName={linkedStaffName}
          openNewDebtRequest={newDebtTick}
          onPayDebt={(row) => openQuickPay(row)}
          onCollectDebt={(row) => openQuickCollect(row)}
          onOpenInvoiceScan={() => setInvoiceScanOpen(true)}
          hideHeader
        />

        {mergeSuggestion ? (
          <View style={styles.mergeCard}>
            <View style={styles.mergeHead}>
              <Ionicons name="git-merge-outline" size={16} color="#1d4ed8" />
              <Text style={styles.mergeTitle}>Benzer cari bulundu</Text>
            </View>
            <Text style={styles.mergeHint} numberOfLines={2}>
              {mergeSuggestion.names.filter((n) => n !== cp.name).join(' · ')}
            </Text>
            <Text style={styles.mergeMeta}>
              {mergeSuggestion.counterpartyIds.length} cari → {mergeSuggestion.canonicalName}
            </Text>
            <View style={styles.mergeActions}>
              <TouchableOpacity
                style={styles.mergeBtn}
                onPress={() => applyDetailMerge(mergeSuggestion)}
                disabled={merging}
              >
                {merging ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.mergeBtnText}>Birleştir</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.mergeDismiss}
                onPress={() => setDismissedMergeId(mergeSuggestion.id)}
                hitSlop={8}
              >
                <Text style={styles.mergeDismissText}>Yoksay</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scopeFilters}>
          {SCOPE_FILTERS.map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[styles.scopeChip, scopeFilter === f.key && styles.scopeChipOn]}
              onPress={() => setScopeFilter(f.key)}
            >
              <Text style={[styles.scopeChipText, scopeFilter === f.key && styles.scopeChipTextOn]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <TouchableOpacity style={styles.historyHead} onPress={() => setHistoryOpen((v) => !v)} activeOpacity={0.85}>
          <Text style={styles.historyTitle}>İşlem geçmişi ({movements.length})</Text>
          <Ionicons
            name={historyOpen ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={adminTheme.colors.textMuted}
          />
        </TouchableOpacity>

        {historyOpen ? (
          movements.length === 0 ? (
            <Text style={styles.muted}>Henüz kayıt yok.</Text>
          ) : (
            movements.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={styles.movItem}
                onPress={() => openMovementMenu(m)}
                activeOpacity={0.85}
              >
                <View
                  style={[styles.movIcon, m.kind === 'income' ? styles.movIconIn : styles.movIconOut]}
                >
                  <Ionicons
                    name={m.kind === 'income' ? 'arrow-down' : 'arrow-up'}
                    size={16}
                    color={m.kind === 'income' ? '#16a34a' : '#dc2626'}
                  />
                </View>
                <View style={styles.movBody}>
                  <View style={styles.movTop}>
                    <Text style={styles.movKind}>{m.kind === 'income' ? 'Tahsilat' : 'Ödeme'}</Text>
                    <Text style={[styles.movAmt, m.kind === 'income' ? styles.in : styles.out]}>
                      {m.kind === 'income' ? '+' : '−'}
                      {fmtMoneyTry(Number(m.amount))}
                    </Text>
                  </View>
                  <Text style={styles.movMeta}>
                    {formatDateShort(m.movement_date)} · {resolveCategoryLabel(m.category)}
                  </Text>
                  {m.agreement_id && agreementTitleById[m.agreement_id] ? (
                    <Text style={styles.planTag} numberOfLines={1}>
                      Borç: {agreementTitleById[m.agreement_id]}
                    </Text>
                  ) : null}
                </View>
                <Ionicons name="ellipsis-vertical" size={18} color={adminTheme.colors.textMuted} />
              </TouchableOpacity>
            ))
          )
        ) : null}

        {reportOpen ? null : (
          <TouchableOpacity style={styles.reportLink} onPress={() => setReportOpen(true)} activeOpacity={0.85}>
            <Ionicons name="document-text-outline" size={16} color={adminTheme.colors.primary} />
            <Text style={styles.reportLinkText}>Rapor / PDF</Text>
          </TouchableOpacity>
        )}
        {reportOpen ? (
          <View style={styles.reportSection}>
            <FinanceReportExportButtons
              compact
              disabled={!cp}
              fileName={`kisi-${cp.id.slice(0, 8)}`}
              mailSubject={`Kişi ödemeleri: ${cp.name}`}
              shareDialogTitle={`${cp.name} — ödeme raporu`}
              getHtml={async (kind) => {
                const allMovements = await fetchCounterpartyMovementsForReport(cp.id, scopeFilter);
                return buildCounterpartyPersonReportHtml(
                  {
                    personName: cp.name,
                    partyTypeLabel: meta.label,
                    phone: cp.phone,
                    notes: cp.notes,
                    profileImageUrl: cp.profile_image,
                    scopeLabel:
                      scopeFilter === 'all' ? 'Tüm kayıtlar (otel + şahsi)' : LEDGER_SCOPE_LABELS[scopeFilter],
                    income,
                    expense,
                    movements: allMovements,
                    footer: reportFooter,
                    currentDebt: openDebtsTotal,
                  },
                  kind
                );
              }}
            />
          </View>
        ) : null}
      </ScrollView>

      <CounterpartyQuickCollectSheet
        visible={collectSheetOpen}
        person={cp}
        defaultLedgerScope={defaultScope}
        staffId={me?.id}
        preselectedAgreementId={collectAgreementId}
        onClose={() => {
          setCollectSheetOpen(false);
          setCollectAgreementId(null);
        }}
        onSaved={load}
      />

      <CounterpartyInvoiceScanSheet
        visible={invoiceScanOpen}
        person={cp}
        organizationName={selectedOrg?.name ?? null}
        createdByStaffId={me?.id ?? null}
        createdByStaffName={me?.full_name ?? null}
        onClose={() => setInvoiceScanOpen(false)}
        onSaved={load}
      />

      <CounterpartyQuickPaySheet
        visible={paySheetOpen}
        person={cp}
        defaultLedgerScope={defaultScope}
        staffId={me?.id}
        preselectedAgreementId={payAgreementId}
        onClose={() => {
          setPaySheetOpen(false);
          setPayAgreementId(null);
        }}
        onSaved={load}
      />

      <ImageLightboxModal
        visible={imageLightbox}
        uri={cp.profile_image}
        onClose={() => setImageLightbox(false)}
        onDelete={confirmDeletePhoto}
      />

      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={closeMenu}>
        <Pressable style={styles.menuOverlay} onPress={closeMenu}>
          <Pressable style={styles.menuSheet} onPress={(e) => e.stopPropagation()}>
            {menuPerson ? (
              <>
                <Text style={styles.menuSheetTitle}>{cp.name}</Text>
                <TouchableOpacity style={styles.menuItem} onPress={menuChangePhoto}>
                  <Ionicons name="camera-outline" size={20} color={adminTheme.colors.primary} />
                  <Text style={styles.menuItemText}>
                    {cp.profile_image ? 'Fotoğrafı değiştir' : 'Profil fotoğrafı ekle'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    closeMenu();
                    router.push({
                      pathname: '/admin/accounting/counterparties/edit',
                      params: { id: cp.id },
                    } as never);
                  }}
                >
                  <Ionicons name="create-outline" size={20} color={adminTheme.colors.primary} />
                  <Text style={styles.menuItemText}>Kişiyi düzenle</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={removePersonFromList}>
                  <Ionicons name="person-remove-outline" size={20} color="#dc2626" />
                  <Text style={[styles.menuItemText, styles.menuItemDanger]}>Listedeki kaldır</Text>
                </TouchableOpacity>
              </>
            ) : menuMovement ? (
              <>
                <Text style={styles.menuSheetTitle}>
                  {menuMovement.kind === 'income' ? 'Tahsilat' : 'Ödeme'} ·{' '}
                  {fmtMoneyTry(Number(menuMovement.amount))}
                </Text>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    const mid = menuMovement.id;
                    closeMenu();
                    router.push({
                      pathname: '/admin/accounting/movements/[id]',
                      params: { id: mid, returnCounterpartyId: cp.id },
                    } as never);
                  }}
                >
                  <Ionicons name="document-text-outline" size={20} color={adminTheme.colors.text} />
                  <Text style={styles.menuItemText}>Detay</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    const mid = menuMovement.id;
                    closeMenu();
                    router.push({
                      pathname: '/admin/accounting/movements/edit',
                      params: { id: mid, returnCounterpartyId: cp.id },
                    } as never);
                  }}
                >
                  <Ionicons name="create-outline" size={20} color={adminTheme.colors.primary} />
                  <Text style={styles.menuItemText}>Düzenle</Text>
                </TouchableOpacity>
                <View style={styles.menuDivider} />
                <Text style={styles.menuSectionLabel}>Belge</Text>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => runMovementReceipt('pdf')}
                  disabled={!!receiptBusy}
                >
                  {receiptBusy === 'pdf' ? (
                    <ActivityIndicator size="small" color={adminTheme.colors.primary} />
                  ) : (
                    <Ionicons name="document-text-outline" size={20} color={adminTheme.colors.primary} />
                  )}
                  <Text style={styles.menuItemText}>PDF</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => runMovementReceipt('print')}
                  disabled={!!receiptBusy}
                >
                  {receiptBusy === 'print' ? (
                    <ActivityIndicator size="small" color={adminTheme.colors.primary} />
                  ) : (
                    <Ionicons name="print-outline" size={20} color={adminTheme.colors.primary} />
                  )}
                  <Text style={styles.menuItemText}>Yazdır</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => runMovementReceipt('mail')}
                  disabled={!!receiptBusy}
                >
                  {receiptBusy === 'mail' ? (
                    <ActivityIndicator size="small" color={adminTheme.colors.primary} />
                  ) : (
                    <Ionicons name="mail-outline" size={20} color={adminTheme.colors.primary} />
                  )}
                  <Text style={styles.menuItemText}>Yazıcı mail</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => runMovementReceipt('whatsapp')}
                  disabled={!!receiptBusy}
                >
                  {receiptBusy === 'whatsapp' ? (
                    <ActivityIndicator size="small" color="#25D366" />
                  ) : (
                    <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
                  )}
                  <Text style={styles.menuItemText}>WhatsApp</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => deleteMovement(menuMovement.id)}
                >
                  <Ionicons name="trash-outline" size={20} color="#dc2626" />
                  <Text style={[styles.menuItemText, styles.menuItemDanger]}>Sil</Text>
                </TouchableOpacity>
              </>
            ) : null}
            <TouchableOpacity style={styles.menuCancel} onPress={closeMenu}>
              <Text style={styles.menuCancelText}>İptal</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  muted: { textAlign: 'center', color: adminTheme.colors.textMuted, marginTop: 8, fontSize: 14 },
  heroCard: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  avatarWrap: { position: 'relative' },
  avatarImg: { width: 76, height: 76, borderRadius: 38 },
  avatarPh: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { fontSize: 26, fontWeight: '800' },
  avatarBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#7c3aed',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: adminTheme.colors.surface,
  },
  heroInfo: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start' },
  nameTap: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingRight: 4 },
  nameEditWrap: { flex: 1, marginRight: 4 },
  nameInput: {
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 17,
    fontWeight: '700',
    color: adminTheme.colors.text,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  nameEditActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  nameSaveBtn: {
    backgroundColor: adminTheme.colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 72,
    alignItems: 'center',
  },
  nameSaveText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  nameCancelBtn: { paddingHorizontal: 10, paddingVertical: 8, justifyContent: 'center' },
  nameCancelText: { color: adminTheme.colors.textMuted, fontWeight: '600', fontSize: 13 },
  heroName: { flex: 1, fontSize: 19, fontWeight: '800', color: adminTheme.colors.text },
  moreBtn: { padding: 2, marginLeft: 4 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  badgeText: { fontSize: 11, fontWeight: '600' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  phone: { fontSize: 13, color: adminTheme.colors.textMuted },
  phoneAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
  },
  phoneActionWa: { backgroundColor: '#ecfdf5' },
  phoneActionText: { fontSize: 11, fontWeight: '700', color: '#2563eb' },
  phoneActionWaText: { color: '#25D366' },
  notesBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  notesText: { flex: 1, fontSize: 13, color: adminTheme.colors.textSecondary, lineHeight: 18 },
  linkedStaff: { fontSize: 12, color: '#7c3aed', marginTop: 6, fontWeight: '600' },
  balanceStrip: {
    flexDirection: 'row',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: adminTheme.colors.border,
    gap: 12,
  },
  balanceMain: { flex: 1 },
  balanceLbl: { fontSize: 11, fontWeight: '600', color: adminTheme.colors.textMuted },
  balanceVal: { fontSize: 18, fontWeight: '800', color: adminTheme.colors.text, marginTop: 4 },
  balanceValDebt: { fontSize: 22, fontWeight: '900', color: '#dc2626', marginTop: 4 },
  balanceSide: {
    alignItems: 'flex-end',
    paddingLeft: 12,
    borderLeftWidth: 1,
    borderLeftColor: adminTheme.colors.border,
  },
  balanceSideLbl: { fontSize: 10, fontWeight: '600', color: adminTheme.colors.textMuted },
  balanceSideVal: { fontSize: 13, fontWeight: '800' },
  balanceSideAction: { fontSize: 10, fontWeight: '700', color: '#16a34a', marginTop: 2 },
  hubTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: adminTheme.colors.textMuted,
    marginBottom: 8,
    marginTop: 4,
  },
  hubRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  hubCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  hubDebt: { backgroundColor: '#faf5ff', borderColor: '#e9d5ff' },
  hubInvoice: { backgroundColor: '#f5f3ff', borderColor: '#ddd6fe' },
  hubPay: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  hubIncome: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  hubCardTitle: { fontSize: 12, fontWeight: '800', color: adminTheme.colors.text, textAlign: 'center' },
  hubCardSub: { fontSize: 10, color: adminTheme.colors.textMuted, textAlign: 'center' },
  debtsSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: adminTheme.colors.text,
    marginBottom: 8,
  },
  mergeCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  mergeHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  mergeTitle: { fontSize: 14, fontWeight: '800', color: '#1d4ed8' },
  mergeHint: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.text, marginTop: 2 },
  mergeMeta: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 4 },
  mergeActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  mergeBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 88,
    alignItems: 'center',
  },
  mergeBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  mergeDismiss: { padding: 6 },
  mergeDismissText: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.textMuted },
  scopeFilters: { marginBottom: 8, maxHeight: 40 },
  scopeChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  scopeChipOn: { backgroundColor: '#ede9fe', borderColor: '#7c3aed' },
  scopeChipText: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.textMuted },
  scopeChipTextOn: { color: '#5b21b6' },
  historyHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 10,
    paddingVertical: 4,
  },
  historyTitle: { fontSize: 14, fontWeight: '800', color: adminTheme.colors.text },
  reportLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 8,
  },
  reportLinkText: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.primary },
  planTag: { fontSize: 11, color: '#7c3aed', fontWeight: '600', marginTop: 2 },
  movItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  movIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  movIconIn: { backgroundColor: '#dcfce7' },
  movIconOut: { backgroundColor: '#fee2e2' },
  movBody: { flex: 1, minWidth: 0 },
  movTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  movKind: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.text },
  movAmt: { fontSize: 15, fontWeight: '800' },
  movMeta: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 4 },
  in: { color: '#16a34a' },
  out: { color: '#dc2626' },
  reportSection: { marginTop: 8, marginBottom: 12 },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: adminTheme.colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 28,
    paddingTop: 8,
  },
  menuSheetTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: adminTheme.colors.textMuted,
    textAlign: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: adminTheme.colors.border,
    marginHorizontal: 20,
  },
  menuSectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: adminTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.border,
  },
  menuItemText: { fontSize: 16, fontWeight: '600', color: adminTheme.colors.text, flex: 1 },
  menuItemDanger: { color: '#dc2626' },
  menuCancel: { paddingVertical: 16, alignItems: 'center' },
  menuCancelText: { fontSize: 16, color: adminTheme.colors.textMuted, fontWeight: '600' },
});
