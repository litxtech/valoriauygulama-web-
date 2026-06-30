import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  TextInput,
} from 'react-native';
import {
  pickDocumentSafe,
  BANK_STATEMENT_PICKER_TYPES,
  isSupportedBankStatementFileName,
  resolveBankStatementFileName,
} from '@/lib/documentPickerSafe';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { AdminOrganizationPicker } from '@/components/admin';
import { BankImportLineRow } from '@/components/admin/BankImportLineRow';
import { BankImportColumnMapSheet } from '@/components/admin/BankImportColumnMapSheet';
import { BankImportExcludeChips } from '@/components/admin/BankImportExcludeChips';
import { adminTheme } from '@/constants/adminTheme';
import { fmtMoneyTry, LEDGER_SCOPE_LABELS, type FinanceLedgerScope } from '@/lib/financeLedger';
import { accountingCanUseAllOrg, resolveAccountingOrgScope } from '@/lib/accountingOrgScope';
import {
  BANK_OPTIONS,
  type BankCode,
  type BankStatementFormat,
  type CounterpartyCandidate,
  type ResolvedImportLine,
} from '@/lib/bankStatement/types';
import type { TabularColumnMap } from '@/lib/bankStatement/columnMap';
import { buildImportSmartAnalysis, type ImportSmartAnalysis } from '@/lib/bankStatement/smartAnalysis';
import {
  applyBulkCounterparty,
  applyGroupCounterparty,
  applyLineCounterparty,
  counterpartyLabel,
  groupImportLineTotals,
  groupImportLinesByPerson,
  resolveImportLines,
  toggleAllImportLinesSelected,
  toggleGroupImportLinesSelected,
  toggleImportLineSelected,
} from '@/lib/bankStatement/matchCounterparty';
import {
  commitBankStatementImport,
  deleteBankImportBatch,
  fetchBankAliasesForImport,
  fetchCounterpartiesForImport,
  fetchExistingImportSignatures,
  fetchRecentImportBatches,
  parseBankStatementFromUri,
  prepareImportLinesForPreview,
  type ImportBatchSummary,
  type ParseStatementResult,
} from '@/lib/bankStatementImport';
import { formatDateShort } from '@/lib/date';
import { log } from '@/lib/logger';
import { formatCounterpartyBalance } from '@/lib/financeCounterpartyUi';
import {
  applyAllDuplicateSuggestions,
  applyDuplicateSuggestion,
  findDuplicateTransactionSuggestions,
  findNameMergeSuggestions,
  mergeImportNameGroups,
  type DuplicateTransactionSuggestion,
  type NameMergeSuggestion,
} from '@/lib/bankStatement/importCleanup';
import {
  applyImportCategoryExclusions,
  categoryLabel,
  type ImportCategoryExclusionReport,
  type ImportExcludeCategoryId,
} from '@/lib/bankStatement/importCategories';

type Step = 'setup' | 'preview' | 'done';
type PreviewMode = 'list' | 'group';
type ListFilter = 'all' | 'selected' | 'excluded';

const FORMAT_LABELS: Record<BankStatementFormat, string> = {
  mt940: 'MT940',
  csv: 'CSV',
  xlsx: 'Excel',
  txt: 'TXT',
  xml: 'XML',
  pdf: 'PDF',
  unknown: 'Bilinmeyen',
};

export default function BankStatementImportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);

  const canUseAllOrg = accountingCanUseAllOrg(me);
  const orgScope = useMemo(
    () => resolveAccountingOrgScope(me, selectedOrganizationId),
    [me, selectedOrganizationId]
  );
  const orgId = orgScope && orgScope !== 'all' ? orgScope : null;

  const [step, setStep] = useState<Step>('setup');
  const [previewMode, setPreviewMode] = useState<PreviewMode>('group');
  const [bankCode, setBankCode] = useState<BankCode>('other');
  const [ledgerScope, setLedgerScope] = useState<FinanceLedgerScope>('personal');
  const [fileName, setFileName] = useState('');
  const [fileFormat, setFileFormat] = useState<BankStatementFormat>('unknown');
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [lines, setLines] = useState<ResolvedImportLine[]>([]);
  const [counterparties, setCounterparties] = useState<CounterpartyCandidate[]>([]);
  const [recentBatches, setRecentBatches] = useState<ImportBatchSummary[]>([]);
  const [assignLine, setAssignLine] = useState<ResolvedImportLine | null>(null);
  const [assignBulk, setAssignBulk] = useState(false);
  const [assignSearch, setAssignSearch] = useState('');
  const [commitResult, setCommitResult] = useState<{
    movementCount: number;
    skippedCount: number;
    newCounterpartyCount: number;
    duplicateCount: number;
  } | null>(null);
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const [columnMapSheet, setColumnMapSheet] = useState<{
    headers: string[];
    map: TabularColumnMap;
  } | null>(null);
  const [analysis, setAnalysis] = useState<ImportSmartAnalysis | null>(null);
  const [autoDetectBank, setAutoDetectBank] = useState(true);
  const [listFilter, setListFilter] = useState<ListFilter>('all');
  const [undoStack, setUndoStack] = useState<ResolvedImportLine[][]>([]);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [excludedCategories, setExcludedCategories] = useState<Set<ImportExcludeCategoryId>>(
    () => new Set(['fee'])
  );
  const [preExclusionLines, setPreExclusionLines] = useState<ResolvedImportLine[] | null>(null);
  const [categoryExclusionReport, setCategoryExclusionReport] = useState<ImportCategoryExclusionReport | null>(
    null
  );
  const [duplicatesRemovedCount, setDuplicatesRemovedCount] = useState(0);
  const [skippedExistingCount, setSkippedExistingCount] = useState(0);
  const [dismissedMergeIds, setDismissedMergeIds] = useState<Set<string>>(new Set());
  const [dismissedDuplicateIds, setDismissedDuplicateIds] = useState<Set<string>>(new Set());
  const [bulkDeleteMode, setBulkDeleteMode] = useState(false);
  const [bulkDeleteIds, setBulkDeleteIds] = useState<Set<string>>(new Set());

  const groups = useMemo(() => groupImportLinesByPerson(lines), [lines]);

  const analysisLive = useMemo(() => {
    if (!lines.length) return analysis;
    return buildImportSmartAnalysis({
      lines,
      detectedBank: analysis?.detectedBank ?? bankCode,
      detectedFormat: fileFormat,
    });
  }, [lines, analysis, bankCode, fileFormat]);

  const loadMeta = useCallback(async () => {
    if (!orgId) {
      setCounterparties([]);
      setRecentBatches([]);
      return null;
    }
    try {
      const [cps, aliases, batches] = await Promise.all([
        fetchCounterpartiesForImport(orgId),
        fetchBankAliasesForImport(orgId),
        fetchRecentImportBatches(orgId),
      ]);
      setCounterparties(cps);
      setRecentBatches(batches);
      return { cps, aliases };
    } catch (e) {
      log.warn('bankImport', 'loadMeta failed', e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [orgId]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const reapplyCategoryExclusions = useCallback(
    (source: ResolvedImportLine[], excluded: ReadonlySet<ImportExcludeCategoryId>) => {
      const { lines: filtered, report } = applyImportCategoryExclusions(source, excluded);
      setCategoryExclusionReport(report.totalRemoved > 0 ? report : null);
      setLines(filtered);
      setDismissedMergeIds(new Set());
      setDismissedDuplicateIds(new Set());
      return filtered;
    },
    []
  );

  const toggleExcludedCategory = useCallback(
    (id: ImportExcludeCategoryId) => {
      setExcludedCategories((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        if (preExclusionLines) {
          const { lines: filtered } = applyImportCategoryExclusions(preExclusionLines, next);
          if (!filtered.length) {
            return prev;
          }
          const applied = reapplyCategoryExclusions(preExclusionLines, next);
          setAnalysis((prevAnalysis) =>
            buildImportSmartAnalysis({
              lines: applied,
              detectedBank: prevAnalysis?.detectedBank ?? bankCode,
              detectedFormat: fileFormat,
            })
          );
        }
        return next;
      });
    },
    [preExclusionLines, reapplyCategoryExclusions, bankCode, fileFormat]
  );

  const openColumnMapSheet = useCallback((parsed: ParseStatementResult) => {
    setColumnMapSheet({ headers: parsed.headers ?? [], map: parsed.columnMap ?? {} });
    setFileFormat(parsed.format);
    setBankCode(parsed.detectedBank);
  }, []);

  const finishParse = useCallback(
    async (
      parsed: ParseStatementResult,
      assetName: string,
      options?: { allowRetryAfterDelete?: boolean }
    ) => {
      if (!orgId) return;

      setFileFormat(parsed.format);
      setBankCode(parsed.detectedBank);

      if (!parsed.lines.length) {
        if (parsed.headers?.length) {
          openColumnMapSheet(parsed);
          return;
        }
        Alert.alert(
          'Hareket bulunamadı',
          'Dosyadan işlem satırı çıkarılamadı. CSV, Excel, PDF veya MT940 formatında banka ekstresi seçin. Excel/CSV ise sütun başlıkları tanınmamış olabilir.'
        );
        return;
      }

      const meta = await loadMeta();
      const aliases = meta?.aliases ?? (await fetchBankAliasesForImport(orgId));
      const cps = meta?.cps ?? (await fetchCounterpartiesForImport(orgId));
      const existing = await fetchExistingImportSignatures(orgId);

      const resolved = resolveImportLines({
        lines: parsed.lines,
        counterparties: cps,
        aliases,
      });

      const prepared = prepareImportLinesForPreview({
        lines: resolved,
        accountIban: parsed.accountIban,
        bankCode: parsed.detectedBank,
        existing,
      });

      const parsedCount = parsed.lines.length;

      setPreExclusionLines(prepared.lines);
      setUndoStack([]);
      setDuplicatesRemovedCount(prepared.duplicatesRemoved);
      setSkippedExistingCount(prepared.skippedExisting);
      setListFilter('all');
      let appliedLines = reapplyCategoryExclusions(prepared.lines, excludedCategories);

      if (!appliedLines.length && prepared.lines.length > 0 && excludedCategories.size > 0) {
        setExcludedCategories(new Set());
        appliedLines = reapplyCategoryExclusions(prepared.lines, new Set());
      }

      if (!appliedLines.length) {
        if (prepared.lines.length === 0 && parsedCount > 0 && options?.allowRetryAfterDelete !== false) {
          const matching = recentBatches.filter(
            (b) => b.file_name.toLowerCase() === assetName.toLowerCase()
          );
          if (matching.length >= 1) {
            const batch = matching[0];
            Alert.alert(
              'Daha önce yüklendi',
              `Bu ekstrede ${parsedCount} hareket var; hepsi daha önce içe aktarılmış görünüyor.\n\nSıfırdan yeniden yüklemek için önceki kayıt silinir${
                batch.movement_count > 0
                  ? ` (${batch.movement_count} ödeme hareketi kaldırılır)`
                  : ''
              }. Kişileri listeden kaldırdıysanız yeniden oluşturulur.`,
              [
                { text: 'İptal', style: 'cancel' },
                {
                  text: 'Sil ve yeniden yükle',
                  style: 'destructive',
                  onPress: () =>
                    void (async () => {
                      try {
                        setParsing(true);
                        await deleteBankImportBatch(orgId, batch.id);
                        await loadMeta();
                        await finishParse(parsed, assetName, { allowRetryAfterDelete: false });
                      } catch (e) {
                        Alert.alert('Hata', e instanceof Error ? e.message : 'Silinemedi');
                      } finally {
                        setParsing(false);
                      }
                    })(),
                },
              ]
            );
            return;
          }
          Alert.alert(
            'Yeni hareket yok',
            `Dosyada ${parsedCount} hareket bulundu ancak hepsi daha önce içe aktarılmış görünüyor. Geçmiş listeden "Tekrar yükle" ile önceki kaydı silip deneyin.`
          );
          return;
        }
        if (parsed.needsColumnMapping && parsed.headers?.length) {
          openColumnMapSheet(parsed);
          return;
        }
        Alert.alert(
          'Hareket bulunamadı',
          'İçe aktarılacak hareket kalmadı. Dosya formatını veya hariç tutma filtrelerini kontrol edin.'
        );
        return;
      }

      setAnalysis(
        buildImportSmartAnalysis({
          lines: appliedLines,
          detectedBank: parsed.detectedBank,
          detectedFormat: parsed.format,
        })
      );
      setStep('preview');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [orgId, loadMeta, excludedCategories, reapplyCategoryExclusions, openColumnMapSheet, recentBatches]
  );

  const pickFile = async (options?: {
    suggestedFileName?: string;
    bankCode?: BankCode;
    ledgerScope?: FinanceLedgerScope;
  }) => {
    if (!orgId || !me?.id) {
      Alert.alert('İşletme', 'Önce tek bir işletme seçin.');
      return;
    }
    if (options?.bankCode) {
      setBankCode(options.bankCode);
      setAutoDetectBank(options.bankCode === 'other');
    }
    if (options?.ledgerScope) {
      setLedgerScope(options.ledgerScope);
    }
    const parseBankCode =
      options?.bankCode && options.bankCode !== 'other'
        ? options.bankCode
        : options?.bankCode === 'other' || autoDetectBank
          ? ('other' as BankCode)
          : bankCode;
    try {
      const res = await pickDocumentSafe({
        type: [...BANK_STATEMENT_PICKER_TYPES],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) {
        return;
      }

      const asset = res.assets[0];
      const reportedMime =
        (asset as { mimeType?: string | null }).mimeType ??
        (asset as { type?: string | null }).type ??
        null;
      const name = resolveBankStatementFileName(asset.name, reportedMime);
      if (!isSupportedBankStatementFileName(name)) {
        Alert.alert(
          'Desteklenmeyen dosya',
          'CSV, Excel (.xlsx/.xls), PDF, TXT, XML veya MT940 uzantılı bir ekstre seçin.'
        );
        return;
      }

      if (
        options?.suggestedFileName &&
        name.toLowerCase() !== options.suggestedFileName.toLowerCase()
      ) {
        Alert.alert(
          'Farklı dosya',
          `Önceki içe aktarım: ${options.suggestedFileName}\nSeçilen: ${name}\n\nDevam ediliyor.`
        );
      }

      setParsing(true);
      setFileName(name);
      setPendingUri(asset.uri);
      setAnalysis(null);

      const parsed = await parseBankStatementFromUri(asset.uri, name, parseBankCode);

      if ((parsed.needsColumnMapping || !parsed.lines.length) && parsed.headers?.length) {
        openColumnMapSheet(parsed);
        setParsing(false);
        return;
      }

      await finishParse(parsed, name);
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Dosya okunamadı');
    } finally {
      setParsing(false);
    }
  };

  const reimportFromBatch = (batch: ImportBatchSummary) => {
    Alert.alert(
      'Ekstreyi yeniden yükle',
      `"${batch.file_name}" sıfırdan içe aktarılsın mı?\n\nÖnceki içe aktarım kaydı silinir${
        batch.movement_count > 0 ? ` ve ${batch.movement_count} ödeme hareketi kaldırılır` : ''
      }. Kişileri listeden kaldırdıysanız içe aktarımda yeniden oluşturulur.`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil ve dosya seç',
          style: 'destructive',
          onPress: () =>
            void (async () => {
              if (!orgId) return;
              try {
                setParsing(true);
                await deleteBankImportBatch(orgId, batch.id);
                await loadMeta();
                setParsing(false);
                void pickFile({
                  suggestedFileName: batch.file_name,
                  bankCode: batch.bank_code,
                  ledgerScope: batch.ledger_scope,
                });
              } catch (e) {
                Alert.alert('Hata', e instanceof Error ? e.message : 'Silinemedi');
                setParsing(false);
              }
            })(),
        },
      ]
    );
  };

  const onColumnMapConfirm = async (map: TabularColumnMap) => {
    if (!pendingUri || !fileName || !orgId) return;
    setColumnMapSheet(null);
    setParsing(true);
    try {
      const effectiveBank = autoDetectBank ? ('other' as BankCode) : bankCode;
      const parsed = await parseBankStatementFromUri(pendingUri, fileName, effectiveBank, map);
      await finishParse(parsed, fileName);
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Sütun eşleştirme başarısız');
    } finally {
      setParsing(false);
    }
  };

  const stats = useMemo(() => {
    const selected = lines.filter((l) => l.selected);
    const excluded = lines.filter(
      (l) => !l.selected && (l.resolvedCounterpartyId || l.createNewPerson)
    );
    const income = selected.filter((l) => l.direction === 'credit').reduce((s, l) => s + l.amount, 0);
    const expense = selected.filter((l) => l.direction === 'debit').reduce((s, l) => s + l.amount, 0);
    const importable = lines.filter((l) => l.resolvedCounterpartyId || l.createNewPerson).length;
    const unassigned = lines.filter((l) => !l.resolvedCounterpartyId && !l.createNewPerson).length;
    const newGroups = groups.filter((g) => g.createNewPerson && !g.resolvedCounterpartyId).length;
    return {
      total: lines.length,
      selected: selected.length,
      excluded: excluded.length,
      importable,
      unassigned,
      groups: groups.length,
      newGroups,
      income,
      expense,
      net: income - expense,
      newPersons: selected.filter((l) => l.createNewPerson && !l.resolvedCounterpartyId).length,
    };
  }, [lines, groups]);

  const visibleLines = useMemo(() => {
    if (listFilter === 'selected') {
      return lines.filter((l) => l.selected && (l.resolvedCounterpartyId || l.createNewPerson));
    }
    if (listFilter === 'excluded') {
      return lines.filter((l) => !l.selected && (l.resolvedCounterpartyId || l.createNewPerson));
    }
    return lines;
  }, [lines, listFilter]);

  const visibleGroups = useMemo(() => {
    const keys = new Set(visibleLines.map((l) => l.groupKey));
    return groups.filter((g) => keys.has(g.groupKey));
  }, [groups, visibleLines]);

  const nameMergeSuggestions = useMemo(() => {
    return findNameMergeSuggestions(lines).filter((s) => !dismissedMergeIds.has(s.id));
  }, [lines, dismissedMergeIds]);

  const duplicateSuggestions = useMemo(() => {
    return findDuplicateTransactionSuggestions(lines).filter((s) => !dismissedDuplicateIds.has(s.id));
  }, [lines, dismissedDuplicateIds]);

  const duplicateLocalIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of duplicateSuggestions) {
      for (const id of s.removeLocalIds) ids.add(id);
    }
    return ids;
  }, [duplicateSuggestions]);

  const duplicatesByGroupKey = useMemo(() => {
    const map = new Map<string, DuplicateTransactionSuggestion[]>();
    for (const s of duplicateSuggestions) {
      const keepLine = lines.find((l) => l.localId === s.keepLocalId);
      if (!keepLine) continue;
      const list = map.get(keepLine.groupKey) ?? [];
      list.push(s);
      map.set(keepLine.groupKey, list);
    }
    return map;
  }, [duplicateSuggestions, lines]);

  const pushUndo = useCallback(() => {
    setUndoStack((prev) => [...prev.slice(-4), lines]);
  }, [lines]);

  const applyLines = useCallback((next: ResolvedImportLine[]) => {
    setLines(next);
  }, []);

  const applyDuplicateRemoval = (suggestion: DuplicateTransactionSuggestion) => {
    pushUndo();
    applyLines(applyDuplicateSuggestion(lines, suggestion));
    setDismissedDuplicateIds((prev) => new Set([...prev, suggestion.id]));
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const applyAllDuplicateRemovals = () => {
    if (!duplicateSuggestions.length) return;
    const total = duplicateSuggestions.reduce((s, d) => s + d.duplicateCount, 0);
    Alert.alert(
      'Mükerrerleri sil',
      `${duplicateSuggestions.length} grupta toplam ${total} mükerrer işlem listeden kaldırılsın mı? Her grupta bir kayıt kalır.`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Tümünü sil',
          style: 'destructive',
          onPress: () => {
            pushUndo();
            const result = applyAllDuplicateSuggestions(lines, duplicateSuggestions);
            applyLines(result.lines);
            setDismissedDuplicateIds((prev) => {
              const next = new Set(prev);
              for (const s of duplicateSuggestions) next.add(s.id);
              return next;
            });
            setDuplicatesRemovedCount((prev) => prev + result.removed);
          },
        },
      ]
    );
  };

  const dismissDuplicate = (id: string) => {
    setDismissedDuplicateIds((prev) => new Set([...prev, id]));
  };

  const applyNameMerge = (suggestion: NameMergeSuggestion) => {
    pushUndo();
    applyLines(mergeImportNameGroups(lines, suggestion.groupKeys, suggestion.canonicalName));
    setDismissedMergeIds((prev) => new Set([...prev, suggestion.id]));
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const dismissNameMerge = (id: string) => {
    setDismissedMergeIds((prev) => new Set([...prev, id]));
  };

  const removeLinesFromImport = useCallback((localIds: string[]) => {
    const drop = new Set(localIds);
    pushUndo();
    setLines((prev) => prev.filter((l) => !drop.has(l.localId)));
    setPreExclusionLines((prev) => (prev ? prev.filter((l) => !drop.has(l.localId)) : null));
    setBulkDeleteIds((prev) => {
      const next = new Set(prev);
      for (const id of localIds) next.delete(id);
      return next;
    });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [pushUndo]);

  const removeLine = (localId: string) => {
    removeLinesFromImport([localId]);
  };

  const removeGroup = (groupKey: string) => {
    const count = lines.filter((l) => l.groupKey === groupKey).length;
    Alert.alert(
      'Grubu kaldır',
      `${count} hareket listeden silinsin mi? Sisteme kaydedilmeyecek.`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Kaldır',
          style: 'destructive',
          onPress: () => {
            const ids = lines.filter((l) => l.groupKey === groupKey).map((l) => l.localId);
            removeLinesFromImport(ids);
          },
        },
      ]
    );
  };

  const removeDeselected = () => {
    const count = lines.filter((l) => !l.selected).length;
    if (!count) return;
    Alert.alert(
      'Hariç tutulanları kaldır',
      `${count} işaretlenmemiş hareket listeden silinsin mi?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Kaldır',
          style: 'destructive',
          onPress: () => {
            const ids = lines.filter((l) => !l.selected).map((l) => l.localId);
            removeLinesFromImport(ids);
          },
        },
      ]
    );
  };

  const undoLastRemove = () => {
    if (!undoStack.length) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setLines(prev);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const toggleBulkDeleteMode = () => {
    setBulkDeleteMode((on) => {
      if (on) setBulkDeleteIds(new Set());
      return !on;
    });
  };

  const toggleBulkDeleteId = (localId: string) => {
    setBulkDeleteIds((prev) => {
      const next = new Set(prev);
      if (next.has(localId)) next.delete(localId);
      else next.add(localId);
      return next;
    });
  };

  const selectAllVisibleForDelete = () => {
    setBulkDeleteIds(new Set(visibleLines.map((l) => l.localId)));
  };

  const clearBulkDeleteSelection = () => {
    setBulkDeleteIds(new Set());
  };

  const commitBulkDelete = () => {
    if (!bulkDeleteIds.size) {
      Alert.alert('Toplu sil', 'Silmek için en az bir hareket seçin.');
      return;
    }
    const count = bulkDeleteIds.size;
    Alert.alert(
      'Seçilenleri sil',
      `${count} hareket listeden kalıcı olarak kaldırılsın mı?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: `${count} sil`,
          style: 'destructive',
          onPress: () => {
            removeLinesFromImport([...bulkDeleteIds]);
            setBulkDeleteMode(false);
            setBulkDeleteIds(new Set());
          },
        },
      ]
    );
  };

  const openAssign = (line: ResolvedImportLine, bulk = false) => {
    setAssignLine(line);
    setAssignBulk(bulk);
    setAssignSearch('');
  };

  const closeAssign = () => {
    setAssignLine(null);
    setAssignBulk(false);
    setAssignSearch('');
  };

  const selectCounterparty = (cpId: string) => {
    if (!assignLine) return;
    let next = lines;
    if (assignBulk) {
      next = applyBulkCounterparty(
        lines,
        cpId,
        false,
        (l) => !l.resolvedCounterpartyId && !l.createNewPerson
      );
    } else if (previewMode === 'group') {
      next = applyGroupCounterparty(lines, assignLine.groupKey, cpId, false);
    } else {
      next = applyLineCounterparty(lines, assignLine.localId, cpId, false);
    }
    setLines(next);
    closeAssign();
  };

  const markCreateNew = () => {
    if (!assignLine) return;
    let next = lines;
    if (assignBulk) {
      next = applyBulkCounterparty(
        lines,
        null,
        true,
        (l) => !l.resolvedCounterpartyId && !l.createNewPerson
      );
    } else if (previewMode === 'group') {
      next = applyGroupCounterparty(lines, assignLine.groupKey, null, true);
    } else {
      next = applyLineCounterparty(lines, assignLine.localId, null, true);
    }
    setLines(next);
    closeAssign();
  };

  const markSkipLine = () => {
    if (!assignLine || assignBulk) return;
    const next = applyLineCounterparty(lines, assignLine.localId, null, false);
    setLines(toggleImportLineSelected(next, assignLine.localId, false));
    closeAssign();
  };

  const commit = async () => {
    if (!orgId || !me?.id || !fileName) return;
    const toImport = lines.filter((l) => l.selected);
    if (!toImport.length) {
      Alert.alert('Kayıt', 'En az bir hareket seçin.');
      return;
    }
    const withoutPerson = toImport.filter((l) => !l.resolvedCounterpartyId && !l.createNewPerson);
    if (withoutPerson.length > 0) {
      Alert.alert(
        'Kişi eksik',
        `${withoutPerson.length} seçili satırda kişi atanmadı. Satıra dokunarak kişi seçin veya işareti kaldırın.`
      );
      return;
    }

    Alert.alert(
      'Sisteme kaydet',
      `${toImport.length} hareket kişi ödemelerine kaydedilsin mi?${stats.newPersons > 0 ? `\n${stats.newPersons} yeni kişi oluşturulacak.` : ''}`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Kaydet',
          onPress: async () => {
            setCommitting(true);
            try {
              const result = await commitBankStatementImport({
                organizationId: orgId,
                staffId: me.id,
                fileName,
                fileFormat: fileFormat === 'unknown' ? 'csv' : fileFormat,
                bankCode,
                ledgerScope,
                lines,
              });
              setCommitResult(result);
              setStep('done');
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              void loadMeta();
            } catch (e) {
              Alert.alert('Kayıt hatası', e instanceof Error ? e.message : 'Kayıt başarısız');
            } finally {
              setCommitting(false);
            }
          },
        },
      ]
    );
  };

  const assignGroup = (groupKey: string) => {
    const first = lines.find((l) => l.groupKey === groupKey);
    if (first) openAssign(first);
  };

  const filteredCps = useMemo(() => {
    const q = assignSearch.trim().toLowerCase();
    if (!q) return counterparties.slice(0, 50);
    return counterparties.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 50);
  }, [assignSearch, counterparties]);

  if (!orgId) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <AdminOrganizationPicker canUseAll={canUseAllOrg} ownOrganizationId={me?.organization_id} />
          <View style={styles.hintCard}>
            <Ionicons name="business-outline" size={32} color={adminTheme.colors.primary} />
            <Text style={styles.hintTitle}>İşletme seçin</Text>
            <Text style={styles.hintBody}>Banka ekstresi için üstten tek bir işletme seçin.</Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (step === 'done' && commitResult) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.doneCard}>
            <Ionicons name="checkmark-circle" size={56} color="#16a34a" />
            <Text style={styles.doneTitle}>Kayıt tamamlandı</Text>
            <Text style={styles.doneStat}>{commitResult.movementCount} ödeme kaydı oluşturuldu</Text>
            {commitResult.newCounterpartyCount > 0 ? (
              <Text style={styles.doneMeta}>{commitResult.newCounterpartyCount} yeni kişi eklendi</Text>
            ) : null}
          </View>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.push('/admin/accounting/counterparties')}
          >
            <Text style={styles.primaryBtnText}>Kişi ödemelerine git</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => {
              setStep('setup');
              setLines([]);
              setCommitResult(null);
              setFileName('');
            }}
          >
            <Text style={styles.secondaryBtnText}>Yeni dosya yükle</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}>
        <AdminOrganizationPicker canUseAll={canUseAllOrg} ownOrganizationId={me?.organization_id} />

        <View style={styles.hero}>
          <Ionicons name="cloud-upload-outline" size={28} color="#fff" />
          <View style={styles.heroBody}>
            <Text style={styles.heroTitle}>Hesap dökümü içe aktar</Text>
            <Text style={styles.heroSub}>
              CSV · Excel · PDF · TXT · XML · MT940 — otomatik algılama ile içe aktarın
            </Text>
          </View>
        </View>

        {step === 'setup' ? (
          <>
            <Text style={styles.sectionLabel}>Banka (isteğe bağlı)</Text>
            <TouchableOpacity
              style={[styles.autoBankRow, autoDetectBank && styles.autoBankRowOn]}
              onPress={() => setAutoDetectBank((v) => !v)}
            >
              <Ionicons
                name={autoDetectBank ? 'sparkles' : 'sparkles-outline'}
                size={20}
                color={autoDetectBank ? '#0f766e' : adminTheme.colors.textMuted}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.autoBankTitle}>Otomatik banka algılama</Text>
                <Text style={styles.autoBankSub}>Dosyadan banka ve format tespit edilir</Text>
              </View>
              <Ionicons
                name={autoDetectBank ? 'checkbox' : 'square-outline'}
                size={22}
                color={autoDetectBank ? '#0f766e' : adminTheme.colors.textMuted}
              />
            </TouchableOpacity>
            {!autoDetectBank ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bankScroll}>
                {BANK_OPTIONS.map((b) => (
                  <TouchableOpacity
                    key={b.code}
                    style={[styles.bankChip, bankCode === b.code && styles.bankChipOn]}
                    onPress={() => setBankCode(b.code)}
                  >
                    <Text style={[styles.bankChipText, bankCode === b.code && styles.bankChipTextOn]}>
                      {b.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : null}

            <Text style={styles.sectionLabel}>Kayıt türü</Text>
            <View style={styles.scopeRow}>
              {(['personal', 'hotel'] as FinanceLedgerScope[]).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.scopeBtn, ledgerScope === s && styles.scopeBtnOn]}
                  onPress={() => setLedgerScope(s)}
                >
                  <Text style={[styles.scopeBtnText, ledgerScope === s && styles.scopeBtnTextOn]}>
                    {LEDGER_SCOPE_LABELS[s]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <BankImportExcludeChips excluded={excludedCategories} onToggle={toggleExcludedCategory} />

            <TouchableOpacity
              style={styles.uploadBtn}
              onPress={() => void pickFile()}
              disabled={parsing}
              activeOpacity={0.88}
            >
              {parsing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="document-attach-outline" size={24} color="#fff" />
                  <Text style={styles.uploadBtnText}>Dosya seç</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.helpText}>
              Desteklenen: .csv, .xlsx, .xls, .pdf, .txt, XML (CAMT), MT940. İşaretlediğiniz işlem türleri
              belgeye dahil edilmez. Her farklı kişi otomatik ayrı cari olarak gruplanır.
            </Text>

            {recentBatches.length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>Son içe aktarımlar</Text>
                {recentBatches.map((b) => (
                  <View key={b.id} style={styles.batchRow}>
                    <Ionicons name="document-text-outline" size={20} color={adminTheme.colors.primary} />
                    <View style={styles.batchBody}>
                      <Text style={styles.batchName} numberOfLines={1}>
                        {b.file_name}
                      </Text>
                      <Text style={styles.batchMeta}>
                        {b.movement_count} kayıt · {formatDateShort(b.committed_at.slice(0, 10))}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.batchReloadBtn}
                      onPress={() => reimportFromBatch(b)}
                      disabled={parsing}
                      activeOpacity={0.85}
                      accessibilityLabel={`${b.file_name} tekrar yükle`}
                    >
                      <Ionicons name="refresh-outline" size={16} color="#7c3aed" />
                      <Text style={styles.batchReloadText}>Tekrar yükle</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            ) : null}
          </>
        ) : null}

        {step === 'preview' ? (
          <>
            <View style={styles.previewHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fileName} numberOfLines={1}>
                  {fileName}
                </Text>
                <Text style={styles.formatBadge}>
                  {FORMAT_LABELS[fileFormat]} · {analysisLive?.detectedBankLabel ?? 'Banka'} · {stats.total}{' '}
                  hareket
                </Text>
              </View>
              <TouchableOpacity onPress={() => setStep('setup')}>
                <Text style={styles.changeFile}>Değiştir</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statVal}>{stats.groups}</Text>
                <Text style={styles.statLbl}>Kişi / cari</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statVal, { color: '#dc2626' }]}>{fmtMoneyTry(stats.expense)}</Text>
                <Text style={styles.statLbl}>Ödenen</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statVal, { color: '#16a34a' }]}>{fmtMoneyTry(stats.income)}</Text>
                <Text style={styles.statLbl}>Gelen</Text>
              </View>
              <View style={styles.statBox}>
                <Text
                  style={[
                    styles.statVal,
                    { color: stats.net >= 0 ? '#16a34a' : '#dc2626' },
                  ]}
                >
                  {fmtMoneyTry(Math.abs(stats.net))}
                </Text>
                <Text style={styles.statLbl}>{stats.net >= 0 ? 'Net alacak' : 'Net borç'}</Text>
              </View>
            </View>

            <View style={styles.importSummary}>
              <Text style={styles.importSummaryText}>
                {stats.selected} kayda dahil · {stats.excluded} hariç · {stats.total} toplam
                {stats.newGroups > 0 ? ` · ${stats.newGroups} yeni cari` : ''}
              </Text>
            </View>

            <BankImportExcludeChips
              excluded={excludedCategories}
              onToggle={toggleExcludedCategory}
              compact
            />

            {categoryExclusionReport?.totalRemoved ? (
              <View style={styles.categoryFilterCard}>
                <Ionicons name="filter-outline" size={18} color="#b45309" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.categoryFilterTitle}>
                    {categoryExclusionReport.totalRemoved} işlem hariç tutuldu
                  </Text>
                  {(Object.entries(categoryExclusionReport.byCategory) as [ImportExcludeCategoryId, { count: number; amount: number }][]).map(
                    ([id, v]) => (
                      <Text key={id} style={styles.categoryFilterMeta}>
                        {categoryLabel(id)} · {v.count} · {fmtMoneyTry(v.amount)}
                      </Text>
                    )
                  )}
                </View>
              </View>
            ) : null}

            {duplicatesRemovedCount > 0 || skippedExistingCount > 0 ? (
              <View style={styles.cleanupCard}>
                <Ionicons name="sparkles-outline" size={20} color="#0f766e" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.cleanupTitle}>Temizlik</Text>
                  {duplicatesRemovedCount > 0 ? (
                    <Text style={styles.cleanupMeta}>
                      {duplicatesRemovedCount} mükerrer işlem dosyadan kaldırıldı
                    </Text>
                  ) : null}
                  {skippedExistingCount > 0 ? (
                    <Text style={styles.cleanupMeta}>
                      {skippedExistingCount} işlem daha önce içe aktarılmış (atlandı)
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            {duplicateSuggestions.length > 0 ? (
              <View style={styles.dupCard}>
                <View style={styles.dupCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dupTitle}>Mükerrer işlem önerileri</Text>
                    <Text style={styles.dupHint}>
                      Aynı tarih, saat, tutar ve belge — kişi listesinde tekrarlayan kayıtlar
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.dupAllBtn} onPress={applyAllDuplicateRemovals}>
                    <Text style={styles.dupAllBtnText}>Tümünü sil</Text>
                  </TouchableOpacity>
                </View>
                {duplicateSuggestions.slice(0, 8).map((s) => (
                  <View key={s.id} style={styles.dupRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dupPerson} numberOfLines={1}>
                        {s.displayName}
                      </Text>
                      <Text style={styles.dupMeta}>
                        {formatDateShort(s.valueDate)}
                        {s.valueTime ? ` · ${s.valueTime.slice(0, 8)}` : ''} ·{' '}
                        {s.direction === 'credit' ? 'Gelen' : 'Giden'} · {fmtMoneyTry(s.amount)}
                      </Text>
                      <Text style={styles.dupDoc} numberOfLines={1}>
                        Belge: {s.documentLabel}
                      </Text>
                      <Text style={styles.dupCount}>{s.duplicateCount + 1} kayıt · {s.duplicateCount} mükerrer</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.dupBtn}
                      onPress={() => applyDuplicateRemoval(s)}
                    >
                      <Text style={styles.dupBtnText}>{s.duplicateCount} sil</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.mergeDismiss}
                      onPress={() => dismissDuplicate(s.id)}
                      hitSlop={8}
                    >
                      <Ionicons name="close" size={18} color={adminTheme.colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null}

            {nameMergeSuggestions.length > 0 ? (
              <View style={styles.mergeCard}>
                <Text style={styles.mergeTitle}>Kişi birleştirme önerileri</Text>
                <Text style={styles.mergeHint}>
                  Benzer isimler tek cari altında toplanabilir.
                </Text>
                {nameMergeSuggestions.slice(0, 5).map((s) => (
                  <View key={s.id} style={styles.mergeRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.mergeNames} numberOfLines={2}>
                        {s.names.join(' · ')}
                      </Text>
                      <Text style={styles.mergeMeta}>
                        {s.lineCount} hareket → {s.canonicalName}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.mergeBtn}
                      onPress={() => applyNameMerge(s)}
                    >
                      <Text style={styles.mergeBtnText}>Birleştir</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.mergeDismiss}
                      onPress={() => dismissNameMerge(s.id)}
                      hitSlop={8}
                    >
                      <Ionicons name="close" size={18} color={adminTheme.colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null}

            {undoStack.length > 0 ? (
              <TouchableOpacity style={styles.undoBanner} onPress={undoLastRemove} activeOpacity={0.88}>
                <Ionicons name="arrow-undo-outline" size={18} color="#0f766e" />
                <Text style={styles.undoBannerText}>Son silme işlemini geri al</Text>
              </TouchableOpacity>
            ) : null}

            {stats.unassigned > 0 ? (
              <TouchableOpacity
                style={styles.bulkAssignBanner}
                onPress={() => {
                  const first = lines.find((l) => !l.resolvedCounterpartyId && !l.createNewPerson);
                  if (first) openAssign(first, true);
                }}
                activeOpacity={0.88}
              >
                <Ionicons name="people-outline" size={22} color="#92400e" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.bulkAssignTitle}>
                    {stats.unassigned} satırda kişi bulunamadı
                  </Text>
                  <Text style={styles.bulkAssignSub}>
                    Tedarikçi cari dökümü gibi dosyalarda tüm satırları tek cariye atayabilirsiniz
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#92400e" />
              </TouchableOpacity>
            ) : null}

            {analysisLive?.personTotals.length ? (
              <View style={styles.analysisCard}>
                <TouchableOpacity
                  style={styles.analysisHeader}
                  onPress={() => setShowAnalysis((v) => !v)}
                  activeOpacity={0.85}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.analysisTitle}>Kişi özeti</Text>
                    <Text style={styles.analysisHint}>
                      {analysisLive.personTotals.length} kişi · ödenen / gelen / net
                    </Text>
                  </View>
                  <Ionicons
                    name={showAnalysis ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={adminTheme.colors.textMuted}
                  />
                </TouchableOpacity>
                {showAnalysis
                  ? analysisLive.personTotals.map((p) => {
                      const balance = formatCounterpartyBalance(p.net);
                      return (
                        <View key={p.name} style={styles.personTotalRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.personTotalName} numberOfLines={1}>
                              {p.name}
                            </Text>
                            <Text style={styles.personTotalFlow}>
                              Ödenen {fmtMoneyTry(p.sent)} · Gelen {fmtMoneyTry(p.received)} · {p.count}{' '}
                              işlem
                            </Text>
                            {p.createNew && !p.matched ? (
                              <Text style={styles.personTotalNew}>Yeni cari oluşturulacak</Text>
                            ) : null}
                          </View>
                          <Text
                            style={[
                              styles.personTotalNet,
                              balance.tone === 'positive' && { color: '#16a34a' },
                              balance.tone === 'negative' && { color: '#dc2626' },
                            ]}
                          >
                            {balance.text.replace('Net: ', '')}
                          </Text>
                        </View>
                      );
                    })
                  : null}
              </View>
            ) : null}

            {showAnalysis && analysisLive ? (
              <View style={styles.analysisCard}>
                <Text style={styles.analysisTitle}>Akıllı analiz</Text>
                {analysisLive.monthly.length > 0 ? (
                  <View style={styles.analysisSection}>
                    <Text style={styles.analysisLabel}>Aylık özet</Text>
                    {analysisLive.monthly.map((m) => (
                      <View key={m.month} style={styles.analysisRow}>
                        <Text style={styles.analysisRowKey}>{m.month}</Text>
                        <Text style={[styles.analysisRowVal, { color: '#16a34a' }]}>
                          +{fmtMoneyTry(m.income)}
                        </Text>
                        <Text style={[styles.analysisRowVal, { color: '#dc2626' }]}>
                          -{fmtMoneyTry(m.expense)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {analysisLive.topPayees.length > 0 ? (
                  <View style={styles.analysisSection}>
                    <Text style={styles.analysisLabel}>En çok ödeme yapılan</Text>
                    {analysisLive.topPayees.slice(0, 5).map((p) => (
                      <View key={p.name} style={styles.analysisRow}>
                        <Text style={styles.analysisRowKey} numberOfLines={1}>
                          {p.name}
                        </Text>
                        <Text style={styles.analysisRowVal}>{fmtMoneyTry(p.total)}</Text>
                        <Text style={styles.analysisMeta}>{p.count} işlem</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {analysisLive.categories.length > 0 ? (
                  <View style={styles.analysisSection}>
                    <Text style={styles.analysisLabel}>Kategoriler</Text>
                    {analysisLive.categories.slice(0, 5).map((c) => (
                      <View key={c.label} style={styles.analysisRow}>
                        <Text style={styles.analysisRowKey}>{c.label}</Text>
                        <Text style={styles.analysisRowVal}>{fmtMoneyTry(c.amount)}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={styles.toolbarCard}>
              <View style={styles.filterRow}>
                {(
                  [
                    ['all', `Tümü (${stats.total})`],
                    ['selected', `Kayıt (${stats.selected})`],
                    ['excluded', `Hariç (${stats.excluded})`],
                  ] as const
                ).map(([key, label]) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.filterChip, listFilter === key && styles.filterChipOn]}
                    onPress={() => setListFilter(key)}
                  >
                    <Text style={[styles.filterChipText, listFilter === key && styles.filterChipTextOn]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.selectRow}>
                <TouchableOpacity
                  style={styles.toolBtn}
                  onPress={() => setLines(toggleAllImportLinesSelected(lines, true))}
                >
                  <Ionicons name="checkmark-done-outline" size={16} color={adminTheme.colors.text} />
                  <Text style={styles.toolBtnText}>Tümünü dahil et</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.toolBtn}
                  onPress={() => setLines(toggleAllImportLinesSelected(lines, false))}
                >
                  <Ionicons name="remove-circle-outline" size={16} color={adminTheme.colors.text} />
                  <Text style={styles.toolBtnText}>Tümünü hariç tut</Text>
                </TouchableOpacity>
                {stats.excluded > 0 ? (
                  <TouchableOpacity style={styles.toolBtnDanger} onPress={removeDeselected}>
                    <Ionicons name="trash-outline" size={16} color="#dc2626" />
                    <Text style={styles.toolBtnDangerText}>Hariçleri sil</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={[styles.toolBtn, bulkDeleteMode && styles.toolBtnActive]}
                  onPress={toggleBulkDeleteMode}
                >
                  <Ionicons
                    name={bulkDeleteMode ? 'checkbox' : 'checkbox-outline'}
                    size={16}
                    color={bulkDeleteMode ? '#dc2626' : adminTheme.colors.text}
                  />
                  <Text style={[styles.toolBtnText, bulkDeleteMode && styles.toolBtnTextActive]}>
                    Toplu sil
                  </Text>
                </TouchableOpacity>
              </View>

              {bulkDeleteMode ? (
                <View style={styles.bulkDeleteBar}>
                  <Text style={styles.bulkDeleteMeta}>
                    {bulkDeleteIds.size} / {visibleLines.length} seçili
                  </Text>
                  <View style={styles.bulkDeleteActions}>
                    <TouchableOpacity style={styles.bulkDeleteChip} onPress={selectAllVisibleForDelete}>
                      <Text style={styles.bulkDeleteChipText}>Tümünü seç</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.bulkDeleteChip} onPress={clearBulkDeleteSelection}>
                      <Text style={styles.bulkDeleteChipText}>Temizle</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.bulkDeleteChip,
                        styles.bulkDeleteChipDanger,
                        !bulkDeleteIds.size && styles.bulkDeleteChipDisabled,
                      ]}
                      onPress={commitBulkDelete}
                      disabled={!bulkDeleteIds.size}
                    >
                      <Text style={styles.bulkDeleteChipDangerText}>
                        Sil{bulkDeleteIds.size ? ` (${bulkDeleteIds.size})` : ''}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              <View style={styles.selectRow}>
                <TouchableOpacity
                  style={[styles.modeBtn, previewMode === 'list' && styles.modeBtnOn]}
                  onPress={() => setPreviewMode('list')}
                >
                  <Text style={[styles.modeBtnText, previewMode === 'list' && styles.modeBtnTextOn]}>Liste</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeBtn, previewMode === 'group' && styles.modeBtnOn]}
                  onPress={() => setPreviewMode('group')}
                >
                  <Text style={[styles.modeBtnText, previewMode === 'group' && styles.modeBtnTextOn]}>Kişi</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.toolBtn}
                  onPress={() => setShowAnalysis((v) => !v)}
                >
                  <Ionicons name="analytics-outline" size={16} color={adminTheme.colors.text} />
                  <Text style={styles.toolBtnText}>{showAnalysis ? 'Analizi gizle' : 'Analiz'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {previewMode === 'list' ? (
              <>
                <Text style={styles.sectionLabel}>Hareketler — çöp kutusu ile kalıcı silin</Text>
                {visibleLines.map((line) => (
                  <BankImportLineRow
                    key={line.localId}
                    line={line}
                    counterparties={counterparties}
                    onToggle={(id, sel) => setLines(toggleImportLineSelected(lines, id, sel))}
                    onAssign={openAssign}
                    onRemove={removeLine}
                    isDuplicate={duplicateLocalIds.has(line.localId)}
                    bulkDeleteMode={bulkDeleteMode}
                    bulkDeleteSelected={bulkDeleteIds.has(line.localId)}
                    onBulkDeleteToggle={toggleBulkDeleteId}
                  />
                ))}
                {!visibleLines.length ? (
                  <Text style={styles.emptyFilter}>Bu filtrede hareket yok.</Text>
                ) : null}
              </>
            ) : (
              <>
                <Text style={styles.sectionLabel}>
                  Kişiye göre · {visibleGroups.length} cari
                </Text>
                {visibleGroups.map((g) => {
                  const totals = groupImportLineTotals(g.lines);
                  const selectedTotals = groupImportLineTotals(g.lines.filter((l) => l.selected));
                  const net = selectedTotals.selectedNet;
                  const balance = formatCounterpartyBalance(net);
                  const groupDups = duplicatesByGroupKey.get(g.groupKey) ?? [];
                  const groupDupCount = groupDups.reduce((n, s) => n + s.duplicateCount, 0);
                  const cpLabel = g.resolvedCounterpartyId
                    ? counterpartyLabel(g.resolvedCounterpartyId, counterparties)
                    : g.createNewPerson
                      ? 'Yeni cari oluşturulacak'
                      : 'Kişi atanmadı — dokunun';

                  return (
                    <View key={g.groupKey} style={styles.groupCard}>
                      <View style={styles.groupHeaderRow}>
                        <TouchableOpacity
                          style={{ flex: 1 }}
                          onPress={() => assignGroup(g.groupKey)}
                          activeOpacity={0.85}
                        >
                          <View style={styles.groupTitleRow}>
                            <Text style={styles.groupName}>{g.displayName}</Text>
                            {g.createNewPerson && !g.resolvedCounterpartyId ? (
                              <View style={styles.groupBadgeNew}>
                                <Text style={styles.groupBadgeNewText}>Yeni</Text>
                              </View>
                            ) : g.resolvedCounterpartyId ? (
                              <View style={styles.groupBadgeMatch}>
                                <Text style={styles.groupBadgeMatchText}>Eşleşti</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={styles.groupCpLabel}>{cpLabel}</Text>
                        </TouchableOpacity>
                        <View style={styles.groupActions}>
                          <TouchableOpacity
                            style={styles.groupIconBtn}
                            onPress={() =>
                              setLines(toggleGroupImportLinesSelected(lines, g.groupKey, true))
                            }
                          >
                            <Ionicons name="checkmark-circle-outline" size={20} color="#0f766e" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.groupIconBtn}
                            onPress={() =>
                              setLines(toggleGroupImportLinesSelected(lines, g.groupKey, false))
                            }
                          >
                            <Ionicons name="ellipse-outline" size={20} color="#94a3b8" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.groupIconBtn, styles.groupIconBtnDanger]}
                            onPress={() => removeGroup(g.groupKey)}
                          >
                            <Ionicons name="trash-outline" size={20} color="#dc2626" />
                          </TouchableOpacity>
                        </View>
                      </View>
                      <View style={styles.groupTotalsRow}>
                          <View style={styles.groupTotalChip}>
                            <Text style={styles.groupTotalLbl}>Ödenen</Text>
                            <Text style={[styles.groupTotalVal, { color: '#dc2626' }]}>
                              {fmtMoneyTry(selectedTotals.selectedExpense || totals.expenseTotal)}
                            </Text>
                          </View>
                          <View style={styles.groupTotalChip}>
                            <Text style={styles.groupTotalLbl}>Gelen</Text>
                            <Text style={[styles.groupTotalVal, { color: '#16a34a' }]}>
                              {fmtMoneyTry(selectedTotals.selectedIncome || totals.incomeTotal)}
                            </Text>
                          </View>
                          <View style={styles.groupTotalChip}>
                            <Text style={styles.groupTotalLbl}>Net</Text>
                            <Text
                              style={[
                                styles.groupTotalVal,
                                balance.tone === 'positive' && { color: '#16a34a' },
                                balance.tone === 'negative' && { color: '#dc2626' },
                              ]}
                            >
                              {balance.text.replace('Net: ', '')}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.groupMeta}>
                          {g.lines.length} işlem · kayıt {g.lines.filter((l) => l.selected).length}
                          {groupDupCount > 0 ? ` · ${groupDupCount} mükerrer öneri` : ''}
                        </Text>
                      {groupDups.length > 0 ? (
                        <View style={styles.groupDupStrip}>
                          {groupDups.slice(0, 3).map((s) => (
                            <View key={s.id} style={styles.groupDupRow}>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.groupDupMeta} numberOfLines={1}>
                                  {formatDateShort(s.valueDate)}
                                  {s.valueTime ? ` ${s.valueTime.slice(0, 8)}` : ''} · {fmtMoneyTry(s.amount)} ·{' '}
                                  {s.documentLabel}
                                </Text>
                                <Text style={styles.groupDupCount}>{s.duplicateCount} mükerrer</Text>
                              </View>
                              <TouchableOpacity
                                style={styles.groupDupBtn}
                                onPress={() => applyDuplicateRemoval(s)}
                              >
                                <Text style={styles.groupDupBtnText}>{s.duplicateCount} sil</Text>
                              </TouchableOpacity>
                            </View>
                          ))}
                        </View>
                      ) : null}
                      {g.lines
                        .filter((l) => visibleLines.some((v) => v.localId === l.localId))
                        .map((l) => (
                        <BankImportLineRow
                          key={l.localId}
                          line={l}
                          counterparties={counterparties}
                          compact
                          onToggle={(id, sel) => setLines(toggleImportLineSelected(lines, id, sel))}
                          onAssign={openAssign}
                          onRemove={removeLine}
                          isDuplicate={duplicateLocalIds.has(l.localId)}
                          bulkDeleteMode={bulkDeleteMode}
                          bulkDeleteSelected={bulkDeleteIds.has(l.localId)}
                          onBulkDeleteToggle={toggleBulkDeleteId}
                        />
                      ))}
                    </View>
                  );
                })}
              </>
            )}
          </>
        ) : null}
      </ScrollView>

      {step === 'preview' ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={styles.footerHint}>
            {bulkDeleteMode
              ? `${bulkDeleteIds.size} hareket seçildi — toplu silmek için Sil'e dokunun`
              : `${stats.selected} kayda dahil${stats.excluded > 0 ? ` · ${stats.excluded} hariç` : ''}${stats.newPersons > 0 ? ` · ${stats.newPersons} yeni cari` : ''}`}
          </Text>
          <View style={styles.footerActions}>
            {bulkDeleteMode ? (
              <>
                <TouchableOpacity style={styles.footerSecondaryBtn} onPress={toggleBulkDeleteMode}>
                  <Text style={styles.footerSecondaryText}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.commitBtn, styles.commitBtnDanger, !bulkDeleteIds.size && styles.commitBtnDisabled]}
                  onPress={commitBulkDelete}
                  disabled={!bulkDeleteIds.size}
                >
                  <Text style={styles.commitBtnText}>
                    Sil{bulkDeleteIds.size ? ` (${bulkDeleteIds.size})` : ''}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
            {stats.excluded > 0 ? (
              <TouchableOpacity style={styles.footerSecondaryBtn} onPress={removeDeselected}>
                <Text style={styles.footerSecondaryText}>Hariçleri sil</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[
                styles.commitBtn,
                stats.excluded > 0 && styles.commitBtnCompact,
                committing && styles.commitBtnDisabled,
              ]}
              onPress={() => void commit()}
              disabled={committing || stats.selected === 0}
            >
              {committing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.commitBtnText}>Kaydet ({stats.selected})</Text>
              )}
            </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      ) : null}

      <Modal visible={!!assignLine} transparent animationType="slide" onRequestClose={closeAssign}>
        <Pressable style={styles.modalBackdrop} onPress={closeAssign}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>
              {assignBulk ? 'Tüm atanmamış satırlara cari seç' : assignLine?.displayName}
            </Text>
            <Text style={styles.modalSub}>
              {assignBulk
                ? `${stats.unassigned} satırın tamamı seçilen cariye atanır`
                : `${fmtMoneyTry(assignLine?.amount ?? 0)} · ${assignLine?.direction === 'credit' ? 'Gelen' : 'Giden'}`}
            </Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Kişi ara…"
              placeholderTextColor={adminTheme.colors.textMuted}
              value={assignSearch}
              onChangeText={setAssignSearch}
            />
            <ScrollView style={styles.modalList}>
              {filteredCps.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.cpRow}
                  onPress={() => selectCounterparty(c.id)}
                >
                  <Text style={styles.cpName}>{c.name}</Text>
                  {c.tax_id ? <Text style={styles.cpMeta}>TCKN/VKN: {c.tax_id}</Text> : null}
                </TouchableOpacity>
              ))}
              {!assignBulk ? (
                <TouchableOpacity style={styles.cpRowNew} onPress={markCreateNew}>
                  <Ionicons name="person-add-outline" size={20} color="#2563eb" />
                  <Text style={styles.cpRowNewText}>Yeni kişi olarak oluştur</Text>
                </TouchableOpacity>
              ) : null}
              {!assignBulk ? (
                <TouchableOpacity style={styles.cpRowSkip} onPress={markSkipLine}>
                  <Ionicons name="remove-circle-outline" size={20} color="#b45309" />
                  <Text style={styles.cpRowSkipText}>Hariç tut (kayıda dahil etme)</Text>
                </TouchableOpacity>
              ) : null}
              {!assignBulk ? (
                <TouchableOpacity
                  style={styles.cpRowDelete}
                  onPress={() => {
                    if (!assignLine) return;
                    removeLine(assignLine.localId);
                    closeAssign();
                  }}
                >
                  <Ionicons name="trash-outline" size={20} color="#dc2626" />
                  <Text style={styles.cpRowDeleteText}>Listeden tamamen sil</Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <BankImportColumnMapSheet
        visible={!!columnMapSheet}
        headers={columnMapSheet?.headers ?? []}
        initialMap={columnMapSheet?.map ?? {}}
        onCancel={() => setColumnMapSheet(null)}
        onConfirm={(map) => void onColumnMapConfirm(map)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16 },
  hintCard: {
    alignItems: 'center',
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 14,
    padding: 24,
    marginTop: 16,
    gap: 8,
  },
  hintTitle: { fontSize: 17, fontWeight: '700', color: adminTheme.colors.text },
  hintBody: { fontSize: 14, color: adminTheme.colors.textMuted, textAlign: 'center', lineHeight: 20 },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#0f766e',
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  heroBody: { flex: 1 },
  heroTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.9)', marginTop: 4, lineHeight: 18 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: adminTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 16,
    marginBottom: 8,
  },
  bankScroll: { marginBottom: 4, marginTop: 8 },
  autoBankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  autoBankRowOn: { borderColor: '#0f766e', backgroundColor: '#ecfdf5' },
  autoBankTitle: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.text },
  autoBankSub: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  bankChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    marginRight: 8,
  },
  bankChipOn: { backgroundColor: '#0f766e', borderColor: '#0f766e' },
  bankChipText: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.text },
  bankChipTextOn: { color: '#fff' },
  scopeRow: { flexDirection: 'row', gap: 10 },
  scopeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    alignItems: 'center',
  },
  scopeBtnOn: { backgroundColor: '#ede9fe', borderColor: '#7c3aed' },
  scopeBtnText: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.textMuted },
  scopeBtnTextOn: { color: '#7c3aed' },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#7c3aed',
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 20,
  },
  uploadBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  helpText: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 12, lineHeight: 18 },
  batchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: adminTheme.colors.surface,
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  batchBody: { flex: 1, minWidth: 0 },
  batchName: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.text },
  batchMeta: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  batchReloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f5f3ff',
    borderWidth: 1,
    borderColor: '#ddd6fe',
  },
  batchReloadText: { fontSize: 11, fontWeight: '700', color: '#7c3aed' },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 12,
  },
  fileName: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  formatBadge: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  changeFile: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.primary },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 8 },
  statBox: {
    flex: 1,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  statVal: { fontSize: 14, fontWeight: '800', color: adminTheme.colors.text },
  statLbl: { fontSize: 10, color: adminTheme.colors.textMuted, marginTop: 2 },
  analysisCard: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  analysisTitle: { fontSize: 14, fontWeight: '800', color: adminTheme.colors.text, marginBottom: 10 },
  analysisHint: { fontSize: 12, color: adminTheme.colors.textMuted, marginBottom: 10, lineHeight: 17 },
  importSummary: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  importSummaryText: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.text },
  undoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ecfdf5',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#99f6e4',
  },
  undoBannerText: { fontSize: 13, fontWeight: '700', color: '#0f766e' },
  cleanupCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#ecfdf5',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#99f6e4',
  },
  cleanupTitle: { fontSize: 14, fontWeight: '800', color: '#0f766e' },
  cleanupMeta: { fontSize: 12, color: '#047857', marginTop: 3, lineHeight: 17 },
  categoryFilterCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  categoryFilterTitle: { fontSize: 13, fontWeight: '800', color: '#b45309' },
  categoryFilterMeta: { fontSize: 11, color: '#92400e', marginTop: 3, lineHeight: 16 },
  dupCard: {
    backgroundColor: '#fff1f2',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  dupCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  dupTitle: { fontSize: 14, fontWeight: '800', color: '#b91c1c' },
  dupHint: { fontSize: 12, color: '#dc2626', marginTop: 4, lineHeight: 17 },
  dupAllBtn: {
    backgroundColor: '#dc2626',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dupAllBtnText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  dupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#fecaca',
  },
  dupPerson: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.text },
  dupMeta: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 2 },
  dupDoc: { fontSize: 11, color: '#991b1b', marginTop: 2 },
  dupCount: { fontSize: 11, fontWeight: '700', color: '#b91c1c', marginTop: 2 },
  dupBtn: {
    backgroundColor: '#ef4444',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dupBtnText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  mergeCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  mergeTitle: { fontSize: 14, fontWeight: '800', color: '#1d4ed8' },
  mergeHint: { fontSize: 12, color: '#3b82f6', marginTop: 4, marginBottom: 10, lineHeight: 17 },
  mergeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#dbeafe',
  },
  mergeNames: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.text },
  mergeMeta: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 2 },
  mergeBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  mergeBtnText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  mergeDismiss: { padding: 4 },
  toolbarCard: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    gap: 10,
  },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  filterChipOn: { backgroundColor: '#0f766e', borderColor: '#0f766e' },
  filterChipText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textMuted },
  filterChipTextOn: { color: '#fff' },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  toolBtnText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.text },
  toolBtnActive: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  toolBtnTextActive: { color: '#b91c1c' },
  bulkDeleteBar: {
    backgroundColor: '#fff1f2',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
    gap: 8,
  },
  bulkDeleteMeta: { fontSize: 12, fontWeight: '700', color: '#b91c1c' },
  bulkDeleteActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bulkDeleteChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  bulkDeleteChipText: { fontSize: 12, fontWeight: '700', color: '#991b1b' },
  bulkDeleteChipDanger: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  bulkDeleteChipDangerText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  bulkDeleteChipDisabled: { opacity: 0.45 },
  toolBtnDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  toolBtnDangerText: { fontSize: 12, fontWeight: '700', color: '#dc2626' },
  emptyFilter: {
    fontSize: 14,
    color: adminTheme.colors.textMuted,
    textAlign: 'center',
    paddingVertical: 24,
  },
  analysisHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  bulkAssignBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  bulkAssignTitle: { fontSize: 14, fontWeight: '800', color: '#92400e' },
  bulkAssignSub: { fontSize: 12, color: '#b45309', marginTop: 2, lineHeight: 17 },
  personTotalRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.border,
  },
  personTotalName: { fontSize: 14, fontWeight: '800', color: adminTheme.colors.text },
  personTotalFlow: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  personTotalNew: { fontSize: 11, fontWeight: '700', color: '#2563eb', marginTop: 3 },
  personTotalNet: { fontSize: 12, fontWeight: '800', color: adminTheme.colors.text, maxWidth: 120, textAlign: 'right' },
  analysisSection: { marginBottom: 10 },
  analysisLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: adminTheme.colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  analysisRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  analysisRowKey: { flex: 1, fontSize: 13, color: adminTheme.colors.text },
  analysisRowVal: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.text },
  analysisMeta: { fontSize: 11, color: adminTheme.colors.textMuted, minWidth: 52, textAlign: 'right' },
  selectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  selectBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  selectBtnText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.text },
  modeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  modeBtnOn: { backgroundColor: '#0f766e', borderColor: '#0f766e' },
  modeBtnText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textMuted },
  modeBtnTextOn: { color: '#fff' },
  groupCard: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  groupName: { fontSize: 16, fontWeight: '800', color: adminTheme.colors.text, flex: 1 },
  groupTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  groupActions: { flexDirection: 'row', gap: 4 },
  groupIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupIconBtnDanger: { backgroundColor: '#fef2f2' },
  groupBadgeNew: {
    backgroundColor: '#dbeafe',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  groupBadgeNewText: { fontSize: 10, fontWeight: '800', color: '#2563eb' },
  groupBadgeMatch: {
    backgroundColor: '#d1fae5',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  groupBadgeMatchText: { fontSize: 10, fontWeight: '800', color: '#059669' },
  groupCpLabel: { fontSize: 12, fontWeight: '700', color: '#0f766e', marginTop: 4 },
  groupTotalsRow: { flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 4 },
  groupTotalChip: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
  },
  groupTotalLbl: { fontSize: 10, color: adminTheme.colors.textMuted, fontWeight: '700' },
  groupTotalVal: { fontSize: 13, fontWeight: '800', color: adminTheme.colors.text, marginTop: 2 },
  groupMeta: { fontSize: 12, color: adminTheme.colors.textMuted, marginBottom: 8, marginTop: 4 },
  groupDupStrip: {
    backgroundColor: '#fff1f2',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  groupDupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#fecdd3',
  },
  groupDupMeta: { fontSize: 11, color: adminTheme.colors.text, fontWeight: '600' },
  groupDupCount: { fontSize: 10, fontWeight: '700', color: '#b91c1c', marginTop: 2 },
  groupDupBtn: {
    backgroundColor: '#ef4444',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  groupDupBtnText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: adminTheme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: adminTheme.colors.border,
  },
  footerHint: {
    fontSize: 12,
    color: adminTheme.colors.textMuted,
    textAlign: 'center',
    marginBottom: 8,
  },
  footerActions: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  footerSecondaryBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  footerSecondaryText: { fontSize: 14, fontWeight: '700', color: '#dc2626' },
  commitBtn: {
    flex: 2,
    backgroundColor: '#0f766e',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commitBtnDanger: { backgroundColor: '#dc2626' },
  commitBtnCompact: { flex: 1.4 },
  commitBtnDisabled: { opacity: 0.6 },
  commitBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  doneCard: {
    alignItems: 'center',
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 16,
    padding: 32,
    marginTop: 24,
  },
  doneTitle: { fontSize: 20, fontWeight: '800', color: adminTheme.colors.text, marginTop: 12 },
  doneStat: { fontSize: 16, fontWeight: '600', color: '#16a34a', marginTop: 8 },
  doneMeta: { fontSize: 14, color: adminTheme.colors.textMuted, marginTop: 4 },
  primaryBtn: {
    backgroundColor: '#7c3aed',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  secondaryBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '600', color: adminTheme.colors.text },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: adminTheme.colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    maxHeight: '75%',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: adminTheme.colors.text },
  modalSub: { fontSize: 13, color: adminTheme.colors.textMuted, marginTop: 4, marginBottom: 12 },
  searchInput: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: adminTheme.colors.text,
    marginBottom: 8,
  },
  modalList: { maxHeight: 360 },
  cpRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.border,
  },
  cpName: { fontSize: 15, fontWeight: '600', color: adminTheme.colors.text },
  cpMeta: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  cpRowNew: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
    marginTop: 8,
  },
  cpRowNewText: { fontSize: 15, fontWeight: '600', color: '#2563eb' },
  cpRowSkip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    marginTop: 4,
  },
  cpRowSkipText: { fontSize: 14, fontWeight: '600', color: '#b45309' },
  cpRowDelete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    marginBottom: 16,
  },
  cpRowDeleteText: { fontSize: 14, fontWeight: '600', color: '#dc2626' },
});
