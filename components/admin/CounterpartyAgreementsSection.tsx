import { useCallback, useState } from 'react';
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
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
  fetchAgreementMovements,
  formatAgreementSummary,
  type CounterpartyAgreementRow,
} from '@/lib/financeCounterpartyAgreements';
import type { FinanceReportFooter } from '@/lib/financeCounterpartyReport';

type Props = {
  counterpartyId: string;
  organizationId: string;
  personName: string;
  partyTypeLabel: string;
  phone?: string | null;
  profileImageUrl?: string | null;
  defaultLedgerScope: 'hotel' | 'personal';
  agreements: CounterpartyAgreementRow[];
  onRefresh: () => void;
  reportFooter: FinanceReportFooter;
  documentBrandTitle?: string;
  createdByStaffId?: string | null;
};

export function CounterpartyAgreementsSection({
  counterpartyId,
  organizationId,
  personName,
  partyTypeLabel,
  phone,
  profileImageUrl,
  defaultLedgerScope,
  agreements,
  onRefresh,
  reportFooter,
  documentBrandTitle,
  createdByStaffId,
}: Props) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [planPayments, setPlanPayments] = useState<
    Record<string, Awaited<ReturnType<typeof fetchAgreementMovements>>>
  >({});
  const [loadingPayments, setLoadingPayments] = useState<string | null>(null);
  const [newModal, setNewModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newContractUrls, setNewContractUrls] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [uploadingContract, setUploadingContract] = useState(false);
  const [uploadingContractPlanId, setUploadingContractPlanId] = useState<string | null>(null);
  const [contractLightbox, setContractLightbox] = useState<string | null>(null);

  const toggleExpand = useCallback(
    async (id: string) => {
      if (expandedId === id) {
        setExpandedId(null);
        return;
      }
      setExpandedId(id);
      if (planPayments[id]) return;
      setLoadingPayments(id);
      try {
        const rows = await fetchAgreementMovements(id);
        setPlanPayments((p) => ({ ...p, [id]: rows }));
      } catch (e) {
        Alert.alert('Hata', e instanceof Error ? e.message : 'Ödemeler yüklenemedi');
      } finally {
        setLoadingPayments(null);
      }
    },
    [expandedId, planPayments]
  );

  const openNewPlan = () => {
    setNewTitle('');
    setNewAmount('');
    setNewNotes('');
    setNewContractUrls([]);
    setNewModal(true);
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
    setCreating(true);
    const res = await createCounterpartyAgreement({
      organizationId,
      counterpartyId,
      title: newTitle,
      targetAmount: amount,
      notes: newNotes,
      contractUrls: newContractUrls,
      createdByStaffId,
    });
    setCreating(false);
    if ('error' in res) {
      Alert.alert('Hata', res.error);
      return;
    }
    setNewModal(false);
    onRefresh();
  };

  const confirmCancel = (row: CounterpartyAgreementRow) => {
    Alert.alert('Planı kapat', 'İptal edilen plana yeni ödeme bağlanamaz. Mevcut kayıtlar kalır.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'İptal et',
        style: 'destructive',
        onPress: async () => {
          const err = await cancelCounterpartyAgreement(row.id);
          if (err) Alert.alert('Hata', err);
          else onRefresh();
        },
      },
    ]);
  };

  const payTowardPlan = (row: CounterpartyAgreementRow) => {
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

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <View style={styles.headText}>
          <Text style={styles.sectionTitle}>Ödeme planı</Text>
          <Text style={styles.sectionHint}>
            Belirli bir iş için hedef tutar. Plana bağladığınız ödemeler kalanı otomatik düşürür.
          </Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openNewPlan} activeOpacity={0.85}>
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {agreements.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="flag-outline" size={28} color={adminTheme.colors.textMuted} />
          <Text style={styles.emptyText}>Henüz plan yok. Örn. 200.000 TL iş için plan oluşturun.</Text>
        </View>
      ) : (
        agreements.map((row) => {
          const colors = AGREEMENT_STATUS_COLORS[row.status];
          const pct = agreementProgressPercent(row.amount_paid, row.target_amount);
          const expanded = expandedId === row.id;
          const payments = planPayments[row.id];
          const isDone = row.status === 'paid';
          const isCancelled = row.status === 'cancelled';
          return (
            <View
              key={row.id}
              style={[
                styles.planCard,
                isDone && styles.planCardDone,
                isCancelled && styles.planCardCancelled,
              ]}
            >
              <TouchableOpacity activeOpacity={0.92} onPress={() => void toggleExpand(row.id)}>
                <View style={styles.planHero}>
                  <View style={styles.planHeroTop}>
                    <View style={styles.planIconWrap}>
                      <Ionicons
                        name={isDone ? 'checkmark-circle' : isCancelled ? 'close-circle' : 'flag'}
                        size={18}
                        color={isDone ? '#15803d' : isCancelled ? '#64748b' : '#7c3aed'}
                      />
                    </View>
                    <View style={styles.planHeroText}>
                      <Text style={styles.planTitle} numberOfLines={2}>
                        {row.title}
                      </Text>
                      <Text style={styles.planDate}>
                        Başlangıç · {formatDateShort(row.started_on)}
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
                      <Text style={styles.planHeroLbl}>Kalan</Text>
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

                <View style={styles.statRow}>
                  <View style={styles.statChip}>
                    <Ionicons name="flag-outline" size={14} color="#64748b" />
                    <View>
                      <Text style={styles.statLbl}>Hedef</Text>
                      <Text style={styles.statVal}>{fmtMoneyTry(row.target_amount)}</Text>
                    </View>
                  </View>
                  <View style={[styles.statChip, styles.statChipPaid]}>
                    <Ionicons name="arrow-up-outline" size={14} color="#dc2626" />
                    <View>
                      <Text style={styles.statLbl}>Ödenen</Text>
                      <Text style={[styles.statVal, styles.paid]}>{fmtMoneyTry(row.amount_paid)}</Text>
                    </View>
                  </View>
                </View>

                {row.contract_urls.length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.contractScroll}
                    contentContainerStyle={styles.contractScrollContent}
                  >
                    {row.contract_urls.map((url, i) => (
                      <TouchableOpacity
                        key={`${url}-${i}`}
                        style={styles.contractChip}
                        onPress={() => openContractUrl(url)}
                        activeOpacity={0.85}
                      >
                        <Ionicons
                          name={isImageContractUrl(url) ? 'image-outline' : 'document-text-outline'}
                          size={15}
                          color="#5b21b6"
                        />
                        <Text style={styles.contractChipText} numberOfLines={1}>
                          {contractFileLabel(url, i)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                ) : null}

                <View style={styles.planExpandHint}>
                  <Text style={styles.progressHint} numberOfLines={1}>
                    {formatAgreementSummary(row)}
                  </Text>
                  <View style={styles.planExpandBtn}>
                    <Text style={styles.planExpandText}>{expanded ? 'Daralt' : 'Detay'}</Text>
                    <Ionicons
                      name={expanded ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color="#7c3aed"
                    />
                  </View>
                </View>
              </TouchableOpacity>

              {expanded ? (
                <View style={styles.expanded}>
                  {loadingPayments === row.id ? (
                    <ActivityIndicator color={adminTheme.colors.accent} style={{ marginVertical: 8 }} />
                  ) : (
                    <>
                      <Text style={styles.expandedTitle}>Sözleşme ve belgeler</Text>
                      {row.contract_urls.length === 0 ? (
                        <Text style={styles.mutedSmall}>Henüz sözleşme eklenmedi.</Text>
                      ) : (
                        row.contract_urls.map((url, i) => (
                          <TouchableOpacity
                            key={`${url}-doc-${i}`}
                            style={styles.contractRow}
                            onPress={() => openContractUrl(url)}
                            activeOpacity={0.85}
                          >
                            <View style={styles.contractRowIcon}>
                              <Ionicons
                                name={isImageContractUrl(url) ? 'image-outline' : 'document-text-outline'}
                                size={18}
                                color="#5b21b6"
                              />
                            </View>
                            <View style={styles.contractRowBody}>
                              <Text style={styles.contractRowTitle}>{contractFileLabel(url, i)}</Text>
                              <Text style={styles.contractRowSub}>Dokun — sözleşmeyi aç</Text>
                            </View>
                            <Ionicons name="open-outline" size={18} color="#7c3aed" />
                          </TouchableOpacity>
                        ))
                      )}
                      <TouchableOpacity
                        style={styles.contractAddBtn}
                        onPress={() => addExistingPlanContracts(row.id)}
                        disabled={uploadingContractPlanId === row.id}
                        activeOpacity={0.85}
                      >
                        {uploadingContractPlanId === row.id ? (
                          <ActivityIndicator size="small" color="#7c3aed" />
                        ) : (
                          <>
                            <Ionicons name="attach-outline" size={18} color="#7c3aed" />
                            <Text style={styles.contractAddText}>Sözleşme / PDF / görsel ekle</Text>
                          </>
                        )}
                      </TouchableOpacity>

                      <Text style={[styles.expandedTitle, styles.expandedTitleSpaced]}>
                        Plana bağlı ödemeler
                      </Text>
                      {(payments ?? []).length === 0 ? (
                        <View style={styles.emptyPayments}>
                          <Ionicons name="receipt-outline" size={22} color={adminTheme.colors.textMuted} />
                          <Text style={styles.mutedSmall}>Bu plana henüz ödeme bağlanmadı.</Text>
                        </View>
                      ) : (
                        (payments ?? []).map((m) => (
                          <View key={m.id} style={styles.payRow}>
                            <View style={styles.payIcon}>
                              <Ionicons name="arrow-up" size={14} color="#dc2626" />
                            </View>
                            <View style={styles.payBody}>
                              <Text style={styles.payAmt}>−{fmtMoneyTry(m.amount)}</Text>
                              <Text style={styles.payMeta} numberOfLines={2}>
                                {formatDateShort(m.movement_date)} · {resolveCategoryLabel(m.category)}
                                {m.description?.trim() ? ` · ${m.description.trim()}` : ''}
                              </Text>
                            </View>
                          </View>
                        ))
                      )}
                      <FinanceReportExportButtons
                        compact
                        fileName={`plan-${row.id.slice(0, 8)}`}
                        mailSubject={`Ödeme planı: ${row.title} — ${personName}`}
                        shareDialogTitle={`${row.title} — plan raporu`}
                        getHtml={async () => {
                          const movs = payments ?? (await fetchAgreementMovements(row.id));
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
                  <View style={styles.planActions}>
                    {!isDone && !isCancelled ? (
                      <TouchableOpacity
                        style={styles.planPayBtn}
                        onPress={() => payTowardPlan(row)}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="add-circle" size={18} color="#fff" />
                        <Text style={styles.planPayBtnText}>Ödeme ekle</Text>
                      </TouchableOpacity>
                    ) : null}
                    {!isCancelled ? (
                      <TouchableOpacity style={styles.planCancelBtn} onPress={() => confirmCancel(row)}>
                        <Ionicons name="ban-outline" size={16} color={adminTheme.colors.textMuted} />
                        <Text style={styles.planCancelText}>İptal</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </View>
          );
        })
      )}

      <Modal visible={newModal} transparent animationType="fade" onRequestClose={() => setNewModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setNewModal(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Yeni ödeme planı</Text>
            <Text style={styles.modalHint}>Sadece bu iş için hedef tutar. Genel cari özeti aşağıda ayrı kalır.</Text>
            <Text style={styles.inputLbl}>Plan adı</Text>
            <TextInput
              style={styles.input}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="Örn. Elektrik tadilat işi"
              placeholderTextColor={adminTheme.colors.textMuted}
            />
            <Text style={styles.inputLbl}>Hedef tutar (TL)</Text>
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
  payBody: { flex: 1, minWidth: 0 },
  payAmt: { fontSize: 14, fontWeight: '800', color: '#dc2626' },
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
  inputLbl: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.textMuted, marginBottom: 4 },
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
  modalCancel: { alignItems: 'center', marginTop: 12, padding: 8 },
  modalCancelText: { color: adminTheme.colors.textMuted, fontWeight: '600' },
});
