import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import { supabase } from '@/lib/supabase';
import { ImageLightboxModal } from '@/components/admin/ImageLightboxModal';
import {
  appendAgreementContracts,
  chooseAgreementContractSource,
  contractFileLabel,
  isImageContractUrl,
  openAgreementContract,
  uploadAgreementContract,
} from '@/lib/financeAgreementContract';
import { fmtMoneyTry } from '@/lib/financeLedger';
import { formatDateShort } from '@/lib/date';
import { resolveCategoryLabel } from '@/lib/financeCategoriesApi';
import { FinanceReportExportButtons } from '@/components/admin/FinanceReportExportButtons';
import { buildAgreementReportHtml } from '@/lib/financeAgreementReport';
import {
  AGREEMENT_STATUS_COLORS,
  AGREEMENT_STATUS_LABELS,
  agreementProgressPercent,
  cancelCounterpartyAgreement,
  createCounterpartyAgreement,
  defaultAgreementMovementKind,
  agreementKindLabels,
  fetchAgreementMovements,
  fetchUnlinkedCounterpartyMovements,
  formatAgreementSummary,
  linkMovementToAgreement,
  type AgreementMovementKind,
  type CounterpartyAgreementRow,
  type UnlinkedExpenseMovementRow,
} from '@/lib/financeCounterpartyAgreements';
import { notifyCounterpartyAgreementCreated } from '@/lib/financeCounterpartyAgreementNotify';
import type { FinanceCounterpartyType } from '@/lib/financeLedger';
import type { FinanceReportFooter } from '@/lib/financeCounterpartyReport';

type StaffOption = { id: string; full_name: string | null; department: string | null };

type Props = {
  counterpartyId: string;
  organizationId: string;
  personName: string;
  partyType: FinanceCounterpartyType;
  partyTypeLabel: string;
  phone?: string | null;
  profileImageUrl?: string | null;
  defaultLedgerScope: 'hotel' | 'personal';
  agreements: CounterpartyAgreementRow[];
  onRefresh: () => void;
  reportFooter: FinanceReportFooter;
  documentBrandTitle?: string;
  createdByStaffId?: string | null;
  createdByStaffName?: string | null;
  linkedStaffId?: string | null;
  linkedStaffName?: string | null;
  /** Üstteki "Borç aç" butonundan modal açmak için */
  openNewDebtRequest?: number;
  /** Hızlı ödeme sheet — verilirse tam form yerine bu kullanılır */
  onPayDebt?: (row: CounterpartyAgreementRow) => void;
  /** Hızlı tahsilat sheet (alacak kayıtları) */
  onCollectDebt?: (row: CounterpartyAgreementRow) => void;
  /** Fatura OCR ile borç aç */
  onOpenInvoiceScan?: () => void;
  /** Başlık ve + butonunu gizle (üst aksiyon hub kullanılıyorsa) */
  hideHeader?: boolean;
};

export function CounterpartyAgreementsSection({
  counterpartyId,
  organizationId,
  personName,
  partyType,
  partyTypeLabel,
  phone,
  profileImageUrl,
  defaultLedgerScope,
  agreements,
  onRefresh,
  reportFooter,
  documentBrandTitle,
  createdByStaffId,
  createdByStaffName,
  linkedStaffId,
  linkedStaffName,
  openNewDebtRequest,
  onPayDebt,
  onCollectDebt,
  onOpenInvoiceScan,
  hideHeader,
}: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const defaultKind = defaultAgreementMovementKind(partyType);
  const defaultKindLabels = agreementKindLabels(defaultKind);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [planPayments, setPlanPayments] = useState<
    Record<string, Awaited<ReturnType<typeof fetchAgreementMovements>>>
  >({});
  const [loadingPayments, setLoadingPayments] = useState<string | null>(null);
  const [newModal, setNewModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newContractUrls, setNewContractUrls] = useState<string[]>([]);
  const [newMovementKind, setNewMovementKind] = useState<AgreementMovementKind>(defaultKind);
  const [creating, setCreating] = useState(false);
  const [notifyPerson, setNotifyPerson] = useState(false);
  const [notifyStaffId, setNotifyStaffId] = useState<string | null>(null);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [staffDrawerOpen, setStaffDrawerOpen] = useState(false);
  const [staffSearch, setStaffSearch] = useState('');
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [uploadingContract, setUploadingContract] = useState(false);
  const [uploadingContractPlanId, setUploadingContractPlanId] = useState<string | null>(null);
  const [contractLightbox, setContractLightbox] = useState<string | null>(null);
  const [unlinkedPayments, setUnlinkedPayments] = useState<UnlinkedExpenseMovementRow[]>([]);
  const [linkingPaymentId, setLinkingPaymentId] = useState<string | null>(null);

  const { openDebts, closedDebts } = useMemo(() => {
    const open: CounterpartyAgreementRow[] = [];
    const closed: CounterpartyAgreementRow[] = [];
    for (const a of agreements) {
      if (a.status === 'open' || a.status === 'partial') open.push(a);
      else closed.push(a);
    }
    return { openDebts: open, closedDebts: closed };
  }, [agreements]);

  useEffect(() => {
    if (openNewDebtRequest && openNewDebtRequest > 0) {
      openNewPlan();
    }
  }, [openNewDebtRequest]);

  useEffect(() => {
    if (!newModal) return;
    setLoadingStaff(true);
    void supabase
      .from('staff')
      .select('id, full_name, department')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('full_name')
      .then(({ data }) => {
        setStaffOptions((data ?? []) as StaffOption[]);
      })
      .finally(() => setLoadingStaff(false));
  }, [newModal, organizationId]);

  const filteredStaffOptions = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    if (!q) return staffOptions;
    return staffOptions.filter((s) => {
      const name = (s.full_name ?? '').toLowerCase();
      const dept = (s.department ?? '').toLowerCase();
      return name.includes(q) || dept.includes(q);
    });
  }, [staffOptions, staffSearch]);

  const notifyStaffName = useMemo(() => {
    if (!notifyStaffId) return null;
    return staffOptions.find((s) => s.id === notifyStaffId)?.full_name?.trim() ?? linkedStaffName ?? null;
  }, [notifyStaffId, staffOptions, linkedStaffName]);

  const toggleExpand = useCallback(
    async (row: CounterpartyAgreementRow) => {
      const id = row.id;
      if (expandedId === id) {
        setExpandedId(null);
        return;
      }
      setExpandedId(id);
      setLoadingPayments(id);
      try {
        const [rows, unlinked] = await Promise.all([
          planPayments[id] ? Promise.resolve(planPayments[id]) : fetchAgreementMovements(id, row.movement_kind),
          fetchUnlinkedCounterpartyMovements(counterpartyId, row.movement_kind),
        ]);
        setPlanPayments((p) => ({ ...p, [id]: rows }));
        setUnlinkedPayments(unlinked);
      } catch (e) {
        Alert.alert('Hata', e instanceof Error ? e.message : 'Kayıtlar yüklenemedi');
      } finally {
        setLoadingPayments(null);
      }
    },
    [expandedId, planPayments, counterpartyId]
  );

  const openNewPlan = () => {
    setNewMovementKind(defaultKind);
    setNewTitle('');
    setNewAmount('');
    setNewNotes('');
    setNewContractUrls([]);
    setNotifyStaffId(linkedStaffId ?? null);
    setNotifyPerson(!!linkedStaffId);
    setStaffSearch('');
    setStaffDrawerOpen(false);
    setNewModal(true);
  };

  const onNotifyToggle = (value: boolean) => {
    setNotifyPerson(value);
    if (value && !notifyStaffId) {
      setStaffDrawerOpen(true);
    }
  };

  const pickNotifyStaff = (staffId: string) => {
    setNotifyStaffId(staffId);
    setStaffDrawerOpen(false);
    setStaffSearch('');
  };

  const uploadContractUris = async (uris: string[]): Promise<string[]> => {
    const out: string[] = [];
    for (const uri of uris) {
      out.push(await uploadAgreementContract(uri));
    }
    return out;
  };

  const openContractUrl = (url: string) => {
    if (isImageContractUrl(url)) {
      setContractLightbox(url);
      return;
    }
    void openAgreementContract(url);
  };

  const addNewPlanContracts = () => {
    chooseAgreementContractSource(async (uris) => {
      setUploadingContract(true);
      try {
        const uploaded = await uploadContractUris(uris);
        setNewContractUrls((prev) => [...prev, ...uploaded]);
      } catch (e) {
        Alert.alert('Yükleme', (e as Error)?.message ?? 'Belge yüklenemedi');
      } finally {
        setUploadingContract(false);
      }
    });
  };

  const addExistingPlanContracts = (agreementId: string) => {
    chooseAgreementContractSource(async (uris) => {
      setUploadingContractPlanId(agreementId);
      try {
        const uploaded = await uploadContractUris(uris);
        const err = await appendAgreementContracts(agreementId, uploaded);
        if (err) Alert.alert('Hata', err);
        else onRefresh();
      } catch (e) {
        Alert.alert('Yükleme', (e as Error)?.message ?? 'Belge yüklenemedi');
      } finally {
        setUploadingContractPlanId(null);
      }
    });
  };

  const saveNewPlan = async () => {
    const amount = parseFloat(newAmount.replace(',', '.'));
    if (!newTitle.trim()) {
      Alert.alert('Form', 'Plan adı girin (ör. B blok tadilat)');
      return;
    }
    if (!amount || amount <= 0) {
      Alert.alert('Form', 'Hedef tutar girin');
      return;
    }
    if (notifyPerson && !notifyStaffId) {
      Alert.alert('Personel seçin', 'Bildirim göndermek için personel çekmecesinden bir kişi seçin.');
      setStaffDrawerOpen(true);
      return;
    }
    setCreating(true);
    const res = await createCounterpartyAgreement({
      organizationId,
      counterpartyId,
      title: newTitle,
      targetAmount: amount,
      notes: newNotes,
      contractUrls: newContractUrls,
      createdByStaffId,
      movementKind: newMovementKind,
    });
    setCreating(false);
    if ('error' in res) {
      Alert.alert('Hata', res.error);
      return;
    }
    if (notifyPerson && createdByStaffId && notifyStaffId) {
      const notifyRes = await notifyCounterpartyAgreementCreated({
        agreementId: res.id,
        counterpartyId,
        counterpartyName: personName,
        linkedStaffId: notifyStaffId,
        title: newTitle,
        targetAmount: amount,
        movementKind: newMovementKind,
        notes: newNotes,
        startedOn: new Date().toISOString().slice(0, 10),
        createdByStaffId,
        createdByStaffName,
        notifyPerson: true,
      });
      if (notifyRes.sent && notifyStaffId !== linkedStaffId) {
        await supabase
          .from('finance_counterparties')
          .update({ linked_staff_id: notifyStaffId })
          .eq('id', counterpartyId);
      }
      if (!notifyRes.sent && notifyRes.reason === 'no_linked_staff') {
        Alert.alert('Bildirim gönderilemedi', 'Personel seçimi geçersiz.');
      }
    }
    setNewModal(false);
    onRefresh();
  };

  const confirmCancel = (row: CounterpartyAgreementRow) => {
    Alert.alert('Borcu kapat', 'Bu borç kaydı kapatılır. Ödeme geçmişi silinmez.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Kapat',
        style: 'destructive',
        onPress: async () => {
          const err = await cancelCounterpartyAgreement(row.id);
          if (err) Alert.alert('Hata', err);
          else onRefresh();
        },
      },
    ]);
  };

  const settleDebt = (row: CounterpartyAgreementRow) => {
    if (row.movement_kind === 'income') {
      if (onCollectDebt) {
        onCollectDebt(row);
        return;
      }
      router.push({
        pathname: '/admin/accounting/movements/new',
        params: {
          kind: 'income',
          counterpartyId,
          agreementId: row.id,
          ledgerScope: defaultLedgerScope,
          returnCounterpartyId: counterpartyId,
        },
      } as never);
      return;
    }
    if (onPayDebt) {
      onPayDebt(row);
      return;
    }
    router.push({
      pathname: '/admin/accounting/movements/new',
      params: {
        kind: 'expense',
        counterpartyId,
        agreementId: row.id,
        ledgerScope: defaultLedgerScope,
        returnCounterpartyId: counterpartyId,
      },
    } as never);
  };

  const linkPaymentToPlan = async (
    movementId: string,
    agreementId: string,
    movementKind: AgreementMovementKind
  ) => {
    setLinkingPaymentId(movementId);
    const err = await linkMovementToAgreement(movementId, agreementId);
    setLinkingPaymentId(null);
    if (err) {
      Alert.alert('Hata', err);
      return;
    }
    try {
      const [rows, unlinked] = await Promise.all([
        fetchAgreementMovements(agreementId, movementKind),
        fetchUnlinkedCounterpartyMovements(counterpartyId, movementKind),
      ]);
      setPlanPayments((p) => ({ ...p, [agreementId]: rows }));
      setUnlinkedPayments(unlinked);
    } catch {
      setPlanPayments((p) => {
        const next = { ...p };
        delete next[agreementId];
        return next;
      });
    }
    onRefresh();
  };

  const renderDebtCard = (row: CounterpartyAgreementRow) => {
    const colors = AGREEMENT_STATUS_COLORS[row.status];
    const pct = agreementProgressPercent(row.amount_paid, row.target_amount);
    const expanded = expandedId === row.id;
    const payments = planPayments[row.id];
    const isDone = row.status === 'paid';
    const isCancelled = row.status === 'cancelled';
    const isOpen = !isDone && !isCancelled;
    const kindLabels = agreementKindLabels(row.movement_kind);
    const isReceivable = row.movement_kind === 'income';

    return (
      <View
        key={row.id}
        style={[
          styles.planCard,
          isDone && styles.planCardDone,
          isCancelled && styles.planCardCancelled,
        ]}
      >
        <View style={styles.planHero}>
          <View style={styles.planHeroTop}>
            <View style={styles.planIconWrap}>
              <Ionicons
                name={isDone ? 'checkmark-circle' : isCancelled ? 'close-circle' : 'wallet-outline'}
                size={18}
                color={isDone ? '#15803d' : isCancelled ? '#64748b' : '#7c3aed'}
              />
            </View>
            <View style={styles.planHeroText}>
              <Text style={styles.planTitle} numberOfLines={2}>
                {row.title}
              </Text>
              <Text style={styles.planDate}>
                {formatDateShort(row.started_on)} · Hedef {fmtMoneyTry(row.target_amount)}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
              <Text style={[styles.statusText, { color: colors.fg }]}>
                {AGREEMENT_STATUS_LABELS[row.status]}
              </Text>
            </View>
          </View>

          <View style={styles.planHeroAmounts}>
            <View style={styles.planHeroMain}>
              <Text style={styles.planHeroLbl}>Kalan {kindLabels.debtNoun.toLowerCase()}</Text>
              <Text style={[styles.planHeroVal, isDone && styles.planHeroValDone]}>
                {fmtMoneyTry(row.amount_remaining)}
              </Text>
            </View>
            <View style={styles.planPctRing}>
              <Text style={styles.planPctVal}>%{pct}</Text>
              <Text style={styles.planPctLbl}>ödendi</Text>
            </View>
          </View>

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${pct}%` },
                isDone && styles.progressFillDone,
                isCancelled && styles.progressFillCancelled,
              ]}
            />
          </View>
        </View>

        {row.line_items.length > 0 ? (
          <View style={styles.lineItemsBlock}>
            <Text style={styles.lineItemsTitle}>Malzeme kalemleri ({row.line_items.length})</Text>
            {row.line_items.slice(0, 6).map((item) => (
              <View key={item.id} style={styles.lineItemRow}>
                <Text style={styles.lineItemName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.lineItemAmt}>{fmtMoneyTry(item.total)}</Text>
              </View>
            ))}
            {row.line_items.length > 6 ? (
              <Text style={styles.lineItemsMore}>+{row.line_items.length - 6} kalem daha</Text>
            ) : null}
          </View>
        ) : null}

        {isOpen ? (
          <View style={styles.inlineActionsBlock}>
            <View style={styles.inlinePrimaryRow}>
              <TouchableOpacity
                style={[
                  styles.inlineActionBtn,
                  styles.inlineActionPrimary,
                  isReceivable && styles.inlineActionCollect,
                ]}
                onPress={() => settleDebt(row)}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={isReceivable ? 'arrow-down-circle' : 'arrow-up-circle'}
                  size={16}
                  color="#fff"
                />
                <Text style={styles.inlineActionPrimaryText}>{kindLabels.settleVerb}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.inlineActionBtn, styles.inlineActionGhost]}
                onPress={() => confirmCancel(row)}
                activeOpacity={0.85}
              >
                <Ionicons name="close-circle-outline" size={16} color={adminTheme.colors.textMuted} />
                <Text style={styles.inlineActionGhostText}>Kapat</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.inlineReportRow}>
              <FinanceReportExportButtons
                compact
                fileName={`${isReceivable ? 'alacak' : 'borc'}-${row.id.slice(0, 8)}`}
                mailSubject={`${kindLabels.debtNoun}: ${row.title} — ${personName}`}
                shareDialogTitle={`${row.title} — rapor`}
                getHtml={async () => {
                  const movs = payments ?? (await fetchAgreementMovements(row.id, row.movement_kind));
                  return buildAgreementReportHtml({
                    personName,
                    partyTypeLabel,
                    phone,
                    profileImageUrl,
                    agreement: row,
                    movements: movs,
                    footer: reportFooter,
                    documentBrandTitle,
                  });
                }}
              />
            </View>
          </View>
        ) : null}

        <TouchableOpacity style={styles.planExpandHint} onPress={() => void toggleExpand(row)} activeOpacity={0.85}>
          <Text style={styles.progressHint} numberOfLines={1}>
            {formatAgreementSummary(row)}
          </Text>
          <View style={styles.planExpandBtn}>
            <Text style={styles.planExpandText}>{expanded ? 'Gizle' : 'Detay'}</Text>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="#7c3aed" />
          </View>
        </TouchableOpacity>

        {expanded ? (
          <View style={styles.expanded}>
            {loadingPayments === row.id ? (
              <ActivityIndicator color={adminTheme.colors.accent} style={{ marginVertical: 8 }} />
            ) : (
              <>
                <Text style={styles.expandedTitle}>{kindLabels.paidLabel}</Text>
                {(payments ?? []).length === 0 ? (
                  <Text style={styles.mutedSmall}>Henüz kayıt yok.</Text>
                ) : (
                  (payments ?? []).map((m) => (
                    <View key={m.id} style={styles.payRow}>
                      <View style={[styles.payIcon, isReceivable && styles.payIconIn]}>
                        <Ionicons
                          name={isReceivable ? 'arrow-down' : 'arrow-up'}
                          size={14}
                          color={isReceivable ? '#16a34a' : '#dc2626'}
                        />
                      </View>
                      <View style={styles.payBody}>
                        <Text style={[styles.payAmt, isReceivable && styles.payAmtIn]}>
                          {isReceivable ? '+' : '−'}
                          {fmtMoneyTry(m.amount)}
                        </Text>
                        <Text style={styles.payMeta} numberOfLines={2}>
                          {formatDateShort(m.movement_date)} · {resolveCategoryLabel(m.category)}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
                {isOpen && unlinkedPayments.length > 0 ? (
                  <View style={styles.unlinkedBlock}>
                    <Text style={styles.unlinkedTitle}>
                      Bağlanmamış {isReceivable ? 'tahsilatlar' : 'ödemeler'}
                    </Text>
                    {unlinkedPayments.map((m) => (
                      <View key={m.id} style={styles.unlinkedRow}>
                        <View style={styles.payBody}>
                          <Text style={[styles.payAmt, isReceivable && styles.payAmtIn]}>
                            {isReceivable ? '+' : '−'}
                            {fmtMoneyTry(m.amount)}
                          </Text>
                          <Text style={styles.payMeta} numberOfLines={1}>
                            {formatDateShort(m.movement_date)}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.linkBtn}
                          onPress={() => void linkPaymentToPlan(m.id, row.id, row.movement_kind)}
                          disabled={linkingPaymentId === m.id}
                        >
                          {linkingPaymentId === m.id ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Text style={styles.linkBtnText}>Bağla</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                ) : null}
                <FinanceReportExportButtons
                  compact
                  fileName={`borc-${row.id.slice(0, 8)}`}
                  mailSubject={`Borç: ${row.title} — ${personName}`}
                  shareDialogTitle={`${row.title} — rapor`}
                  getHtml={async () => {
                    const movs = payments ?? (await fetchAgreementMovements(row.id, row.movement_kind));
                    return buildAgreementReportHtml({
                      personName,
                      partyTypeLabel,
                      phone,
                      profileImageUrl,
                      agreement: row,
                      movements: movs,
                      footer: reportFooter,
                      documentBrandTitle,
                    });
                  }}
                />
              </>
            )}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.wrap}>
      {!hideHeader ? (
        <View style={styles.headRow}>
          <View style={styles.headText}>
            <Text style={styles.sectionTitle}>Açık {defaultKindLabels.debtNoun.toLowerCase()}lar</Text>
            <Text style={styles.sectionHint}>{defaultKindLabels.debtHint}</Text>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={openNewPlan} activeOpacity={0.85}>
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : null}

      {openDebts.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="wallet-outline" size={28} color={adminTheme.colors.textMuted} />
          <Text style={styles.emptyText}>
            Açık {defaultKindLabels.debtNoun.toLowerCase()} yok. Üstten “{defaultKindLabels.debtOpen}” ile yeni kayıt ekleyin.
          </Text>
        </View>
      ) : (
        openDebts.map((row) => renderDebtCard(row))
      )}

      {closedDebts.length > 0 ? (
        <TouchableOpacity style={styles.closedToggle} onPress={() => setShowClosed((v) => !v)} activeOpacity={0.85}>
          <Text style={styles.closedToggleText}>
            Kapalı borçlar ({closedDebts.length})
          </Text>
          <Ionicons name={showClosed ? 'chevron-up' : 'chevron-down'} size={18} color={adminTheme.colors.textMuted} />
        </TouchableOpacity>
      ) : null}
      {showClosed ? closedDebts.map((row) => renderDebtCard(row)) : null}

      <Modal visible={newModal} transparent animationType="fade" onRequestClose={() => setNewModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setNewModal(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{defaultKindLabels.debtOpen}</Text>
            <Text style={styles.modalHint}>{defaultKindLabels.debtHint}</Text>
            {onOpenInvoiceScan ? (
              <TouchableOpacity
                style={styles.invoiceScanBanner}
                onPress={() => {
                  setNewModal(false);
                  onOpenInvoiceScan();
                }}
                activeOpacity={0.88}
              >
                <Ionicons name="scan-outline" size={22} color="#7c3aed" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.invoiceScanTitle}>Faturadan otomatik oku</Text>
                  <Text style={styles.invoiceScanSub}>Fotoğraf/PDF → kalemler + toplam</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#7c3aed" />
              </TouchableOpacity>
            ) : null}
            <Text style={styles.inputLbl}>Kayıt yönü</Text>
            <View style={styles.kindRow}>
              {(['income', 'expense'] as AgreementMovementKind[]).map((k) => {
                const lbl = agreementKindLabels(k);
                const active = newMovementKind === k;
                return (
                  <TouchableOpacity
                    key={k}
                    style={[styles.kindChip, active && styles.kindChipOn]}
                    onPress={() => setNewMovementKind(k)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.kindChipText, active && styles.kindChipTextOn]}>
                      {k === 'income' ? 'Bana borçlu' : 'Ben borçluyum'}
                    </Text>
                    <Text style={[styles.kindChipSub, active && styles.kindChipTextOn]}>{lbl.debtNoun}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.inputLbl}>Ne için? (kısa ad)</Text>
            <TextInput
              style={styles.input}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder={newMovementKind === 'income' ? 'Örn. Günü birlik oda' : 'Örn. Elektrik tadilat işi'}
              placeholderTextColor={adminTheme.colors.textMuted}
            />
            <Text style={styles.inputLbl}>{agreementKindLabels(newMovementKind).debtNoun} tutarı (TL)</Text>
            <TextInput
              style={styles.input}
              value={newAmount}
              onChangeText={setNewAmount}
              keyboardType="decimal-pad"
              placeholder="200000"
              placeholderTextColor={adminTheme.colors.textMuted}
            />
            <Text style={styles.inputLbl}>Not (isteğe bağlı)</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={newNotes}
              onChangeText={setNewNotes}
              multiline
              placeholder="İş kapsamı, sözleşme no…"
              placeholderTextColor={adminTheme.colors.textMuted}
            />
            <Text style={styles.inputLbl}>Sözleşme / belge (isteğe bağlı)</Text>
            <TouchableOpacity
              style={styles.contractPickBtn}
              onPress={addNewPlanContracts}
              disabled={uploadingContract}
              activeOpacity={0.85}
            >
              {uploadingContract ? (
                <ActivityIndicator size="small" color="#7c3aed" />
              ) : (
                <>
                  <Ionicons name="attach-outline" size={20} color="#7c3aed" />
                  <Text style={styles.contractPickText}>PDF veya görsel ekle</Text>
                </>
              )}
            </TouchableOpacity>
            {newContractUrls.length > 0 ? (
              <View style={styles.newContractList}>
                {newContractUrls.map((url, i) => (
                  <TouchableOpacity
                    key={`${url}-new-${i}`}
                    style={styles.newContractItem}
                    onPress={() => openContractUrl(url)}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name={isImageContractUrl(url) ? 'image-outline' : 'document-text-outline'}
                      size={16}
                      color="#5b21b6"
                    />
                    <Text style={styles.newContractItemText} numberOfLines={1}>
                      {contractFileLabel(url, i)}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setNewContractUrls((u) => u.filter((_, j) => j !== i))}
                      hitSlop={8}
                    >
                      <Ionicons name="close-circle" size={18} color={adminTheme.colors.textMuted} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            <View style={styles.notifyRow}>
              <View style={styles.notifyText}>
                <Text style={styles.notifyTitle}>Kişiye bildirim gönder</Text>
                <Text style={styles.notifyHint}>
                  {notifyPerson
                    ? notifyStaffName
                      ? `${notifyStaffName} uygulamada tutar ve detayı görür.`
                      : 'Personel çekmecesinden bildirim alacak kişiyi seçin.'
                    : 'Açınca tüm personel listesinden seçim yapabilirsiniz.'}
                </Text>
              </View>
              <Switch
                value={notifyPerson}
                onValueChange={onNotifyToggle}
                trackColor={{ false: '#cbd5e1', true: '#c4b5fd' }}
                thumbColor={notifyPerson ? '#7c3aed' : '#f8fafc'}
              />
            </View>
            {notifyPerson ? (
              <TouchableOpacity
                style={styles.notifyPickBtn}
                onPress={() => setStaffDrawerOpen(true)}
                activeOpacity={0.85}
              >
                <Ionicons name="people-outline" size={18} color="#7c3aed" />
                <View style={styles.notifyPickBody}>
                  <Text style={styles.notifyPickLbl}>Bildirim alacak personel</Text>
                  <Text style={styles.notifyPickVal} numberOfLines={1}>
                    {notifyStaffName ?? 'Personel seçin…'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={adminTheme.colors.textMuted} />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.saveBtn, creating && styles.saveBtnDisabled]}
              onPress={() => void saveNewPlan()}
              disabled={creating}
            >
              {creating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Oluştur</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setNewModal(false)}>
              <Text style={styles.modalCancelText}>Vazgeç</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={staffDrawerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setStaffDrawerOpen(false)}
      >
        <View style={styles.drawerOverlay}>
          <Pressable style={styles.drawerBackdrop} onPress={() => setStaffDrawerOpen(false)} />
          <View style={[styles.drawerSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.drawerHandle} />
            <Text style={styles.drawerTitle}>Personel seçin</Text>
            <Text style={styles.drawerSub}>Borç/alacak bildirimi bu personele gider.</Text>
            <View style={styles.drawerSearchWrap}>
              <Ionicons name="search-outline" size={18} color={adminTheme.colors.textMuted} />
              <TextInput
                style={styles.drawerSearchInput}
                value={staffSearch}
                onChangeText={setStaffSearch}
                placeholder="Ad veya departman ara…"
                placeholderTextColor={adminTheme.colors.textMuted}
                autoCorrect={false}
              />
            </View>
            {loadingStaff ? (
              <ActivityIndicator color="#7c3aed" style={{ marginVertical: 20 }} />
            ) : filteredStaffOptions.length === 0 ? (
              <Text style={styles.drawerEmpty}>Personel bulunamadı.</Text>
            ) : (
              <ScrollView style={styles.drawerScroll} keyboardShouldPersistTaps="handled">
                {filteredStaffOptions.map((s) => {
                  const active = notifyStaffId === s.id;
                  const label = s.full_name?.trim() || 'Personel';
                  return (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.drawerItem, active && styles.drawerItemActive]}
                      onPress={() => pickNotifyStaff(s.id)}
                      activeOpacity={0.85}
                    >
                      <View style={[styles.drawerAvatar, active && styles.drawerAvatarActive]}>
                        <Text style={[styles.drawerAvatarText, active && styles.drawerAvatarTextActive]}>
                          {label.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.drawerItemBody}>
                        <Text style={[styles.drawerItemName, active && styles.drawerItemNameActive]} numberOfLines={1}>
                          {label}
                        </Text>
                        {s.department ? (
                          <Text style={styles.drawerItemMeta} numberOfLines={1}>
                            {s.department}
                          </Text>
                        ) : null}
                      </View>
                      {active ? <Ionicons name="checkmark-circle" size={22} color="#7c3aed" /> : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <ImageLightboxModal
        visible={!!contractLightbox}
        uri={contractLightbox}
        onClose={() => setContractLightbox(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 20 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  headText: { flex: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: adminTheme.colors.text },
  sectionHint: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 4, lineHeight: 17 },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#7c3aed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBox: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    gap: 8,
  },
  emptyText: { fontSize: 13, color: adminTheme.colors.textMuted, textAlign: 'center', lineHeight: 18 },
  planCard: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e9e5ff',
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  planCardDone: { borderColor: '#bbf7d0' },
  planCardCancelled: { borderColor: adminTheme.colors.border, opacity: 0.88 },
  planHero: {
    backgroundColor: '#faf5ff',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ede9fe',
  },
  planHeroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  planIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#ede9fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planHeroText: { flex: 1, minWidth: 0 },
  planTitle: { fontSize: 16, fontWeight: '800', color: '#4c1d95', lineHeight: 21 },
  planDate: { fontSize: 11, color: '#7c3aed', marginTop: 3, fontWeight: '500' },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.2 },
  planHeroAmounts: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    gap: 12,
  },
  planHeroMain: { flex: 1 },
  planHeroLbl: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7c3aed',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  planHeroVal: { fontSize: 26, fontWeight: '800', color: '#5b21b6', marginTop: 2 },
  planHeroValDone: { color: '#15803d' },
  planPctRing: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: '#ddd6fe',
  },
  planPctVal: { fontSize: 18, fontWeight: '800', color: '#7c3aed' },
  planPctLbl: { fontSize: 10, color: adminTheme.colors.textMuted, marginTop: 1 },
  progressTrack: {
    height: 8,
    backgroundColor: '#e9e5ff',
    borderRadius: 4,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#7c3aed', borderRadius: 4 },
  progressFillDone: { backgroundColor: '#16a34a' },
  progressFillCancelled: { backgroundColor: '#94a3b8' },
  statRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingTop: 12 },
  statChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  statChipPaid: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  statLbl: { fontSize: 10, color: adminTheme.colors.textMuted, fontWeight: '600' },
  statVal: { fontSize: 13, fontWeight: '800', color: adminTheme.colors.text, marginTop: 1 },
  paid: { color: '#dc2626' },
  inlineActionsBlock: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 8,
  },
  inlinePrimaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  inlineActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 42,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 10,
  },
  inlineActionPrimary: {
    backgroundColor: '#dc2626',
  },
  inlineActionCollect: {
    backgroundColor: '#16a34a',
  },
  inlineActionPrimaryText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  inlineActionGhost: {
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  inlineActionGhostText: {
    color: adminTheme.colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  inlineReportRow: {
    marginTop: 0,
  },
  closedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  closedToggleText: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.textMuted },
  planExpandHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  progressHint: { flex: 1, fontSize: 11, color: adminTheme.colors.textMuted },
  planExpandBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  planExpandText: { fontSize: 12, fontWeight: '700', color: '#7c3aed' },
  expanded: {
    marginTop: 0,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  expandedTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: adminTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 10,
  },
  expandedTitleSpaced: { marginTop: 14 },
  contractScroll: { marginTop: 0 },
  contractScrollContent: { paddingHorizontal: 14, paddingBottom: 8, gap: 8 },
  contractChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#f5f3ff',
    borderWidth: 1,
    borderColor: '#ddd6fe',
    maxWidth: 160,
  },
  contractChipText: { fontSize: 11, fontWeight: '700', color: '#5b21b6', flexShrink: 1 },
  contractRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 11,
    borderRadius: 12,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: '#ddd6fe',
    marginBottom: 8,
  },
  contractRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#f5f3ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contractRowBody: { flex: 1, minWidth: 0 },
  contractRowTitle: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.text },
  contractRowSub: { fontSize: 11, color: '#7c3aed', marginTop: 2 },
  contractAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd6fe',
    borderStyle: 'dashed',
    marginBottom: 4,
  },
  contractAddText: { fontSize: 12, fontWeight: '700', color: '#7c3aed' },
  contractPickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd6fe',
    backgroundColor: '#faf5ff',
    marginBottom: 10,
  },
  contractPickText: { fontSize: 13, fontWeight: '700', color: '#7c3aed' },
  newContractList: { gap: 6, marginBottom: 12 },
  newContractItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  newContractItemText: { flex: 1, fontSize: 12, fontWeight: '600', color: adminTheme.colors.text },
  emptyPayments: { alignItems: 'center', gap: 6, paddingVertical: 12, marginBottom: 8 },
  unlinkedBlock: {
    marginTop: 10,
    marginBottom: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  unlinkedTitle: { fontSize: 12, fontWeight: '800', color: '#92400e', marginBottom: 4 },
  unlinkedHint: { fontSize: 11, color: '#b45309', lineHeight: 15, marginBottom: 8 },
  unlinkedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    padding: 8,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  linkBtn: {
    backgroundColor: '#7c3aed',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 88,
    alignItems: 'center',
  },
  linkBtnText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  payRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  payIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  payIconIn: { backgroundColor: '#dcfce7' },
  payBody: { flex: 1, minWidth: 0 },
  payAmt: { fontSize: 14, fontWeight: '800', color: '#dc2626' },
  payAmtIn: { color: '#16a34a' },
  payMeta: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 3, lineHeight: 16 },
  mutedSmall: { fontSize: 12, color: adminTheme.colors.textMuted },
  planActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  planPayBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#7c3aed',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
  },
  planPayBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  planCancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  planCancelText: { color: adminTheme.colors.textMuted, fontSize: 13, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modalSheet: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 16,
    padding: 18,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: adminTheme.colors.text },
  modalHint: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 6, marginBottom: 14, lineHeight: 17 },
  invoiceScanBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f5f3ff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#ddd6fe',
  },
  invoiceScanTitle: { fontSize: 14, fontWeight: '800', color: '#5b21b6' },
  invoiceScanSub: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 2 },
  lineItemsBlock: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: adminTheme.colors.border,
  },
  lineItemsTitle: { fontSize: 12, fontWeight: '800', color: adminTheme.colors.textMuted, marginBottom: 6 },
  lineItemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  lineItemName: { flex: 1, fontSize: 13, color: adminTheme.colors.text },
  lineItemAmt: { fontSize: 13, fontWeight: '700', color: '#7c3aed' },
  lineItemsMore: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 4, fontStyle: 'italic' },
  inputLbl: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.textMuted, marginBottom: 4 },
  kindRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  kindChip: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  kindChipOn: { borderColor: '#7c3aed', backgroundColor: '#faf5ff' },
  kindChipText: { fontSize: 13, fontWeight: '800', color: adminTheme.colors.text },
  kindChipSub: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 2 },
  kindChipTextOn: { color: '#5b21b6' },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: adminTheme.colors.text,
    marginBottom: 12,
  },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
  saveBtn: {
    backgroundColor: '#7c3aed',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  notifyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    marginBottom: 12,
  },
  notifyText: { flex: 1, minWidth: 0 },
  notifyTitle: { fontSize: 13, fontWeight: '800', color: adminTheme.colors.text },
  notifyHint: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 4, lineHeight: 15 },
  notifyPickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#faf5ff',
    borderWidth: 1,
    borderColor: '#ddd6fe',
    marginBottom: 12,
  },
  notifyPickBody: { flex: 1, minWidth: 0 },
  notifyPickLbl: { fontSize: 10, fontWeight: '700', color: '#7c3aed', textTransform: 'uppercase' },
  notifyPickVal: { fontSize: 14, fontWeight: '800', color: adminTheme.colors.text, marginTop: 2 },
  drawerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' },
  drawerBackdrop: { ...StyleSheet.absoluteFillObject },
  drawerSheet: {
    backgroundColor: adminTheme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    maxHeight: '78%',
  },
  drawerHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    alignSelf: 'center',
    marginBottom: 10,
  },
  drawerTitle: { fontSize: 17, fontWeight: '800', color: adminTheme.colors.text },
  drawerSub: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 4, marginBottom: 12 },
  drawerSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  drawerSearchInput: { flex: 1, fontSize: 15, color: adminTheme.colors.text, padding: 0 },
  drawerScroll: { maxHeight: 420 },
  drawerEmpty: { textAlign: 'center', color: adminTheme.colors.textMuted, paddingVertical: 24, fontSize: 13 },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  drawerItemActive: { backgroundColor: '#faf5ff', borderColor: '#c4b5fd' },
  drawerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ede9fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerAvatarActive: { backgroundColor: '#7c3aed' },
  drawerAvatarText: { fontSize: 16, fontWeight: '800', color: '#5b21b6' },
  drawerAvatarTextActive: { color: '#fff' },
  drawerItemBody: { flex: 1, minWidth: 0 },
  drawerItemName: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.text },
  drawerItemNameActive: { color: '#5b21b6' },
  drawerItemMeta: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 2 },
  modalCancel: { alignItems: 'center', marginTop: 12, padding: 8 },
  modalCancelText: { color: adminTheme.colors.textMuted, fontWeight: '600' },
});
