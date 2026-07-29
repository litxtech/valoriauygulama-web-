import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AdminOrganizationPicker } from '@/components/admin';
import { CachedImage } from '@/components/CachedImage';
import { ChatFullscreenImageModal } from '@/components/ChatFullscreenImageModal';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { useAuthStore } from '@/stores/authStore';
import { pickGalleryImages } from '@/lib/galleryPicker';
import { pickInvoiceFromCamera, pickInvoiceFromFiles } from '@/lib/financeInvoiceDocumentPick';
import type { PickedInvoiceDocument } from '@/lib/financeInvoiceDocumentPick';
import {
  batchScanPosReceipts,
  batchSaveApprovedPosReceipts,
  batchRereadDatesOnItems,
  formatBatchAmount,
  groupBatchItemsByCaptureHour,
  sumBatchReceiptTotals,
  type BatchReceiptItem,
} from '@/lib/posReceiptInvoice/batchScanPosReceipts';
import { aiAuditBatchReceiptDates } from '@/lib/posReceiptInvoice/aiAuditPosDates';
import { batchRescanPosReceiptInvoices, listPosReceiptInvoices } from '@/lib/posReceiptInvoice/api';
import { preloadPosOcrModule } from '@/lib/posReceiptInvoice/ocrPosReceiptImage';
import type { PosVenueScope } from '@/lib/posReceiptInvoice/types';
import { POS_VENUE_LABELS } from '@/lib/posReceiptInvoice/types';
import { formatTry } from '@/lib/posReceiptInvoice/totals';
import {
  markBatchDuplicates,
  posReceiptDuplicateKey,
  posReceiptDuplicateKeyFromRow,
} from '@/lib/posReceiptInvoice/duplicateReceipt';

type Phase = 'idle' | 'capture' | 'scanning' | 'review' | 'saving' | 'saved';

function toDocs(uris: string[]): PickedInvoiceDocument[] {
  return uris.map((uri, i) => ({
    uri,
    fileName: `fis-${Date.now()}-${i + 1}.jpg`,
    kind: 'image' as const,
  }));
}

function queuedItem(doc: PickedInvoiceDocument, i: number): BatchReceiptItem {
  return {
    key: `${doc.uri}-${Date.now()}-${i}`,
    uri: doc.uri,
    fileName: doc.fileName || `fis-${i + 1}.jpg`,
    status: 'queued',
    selected: true,
    capturedAt: new Date().toISOString(),
  };
}

export default function PosReceiptBatchUpload() {
  const router = useRouter();
  const params = useLocalSearchParams<{ venue?: string; autostart?: string }>();
  const me = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const canUseAll = me?.app_permissions?.super_admin === true || me?.role === 'admin';
  const orgId = canUseAll ? selectedOrganizationId : me?.organization_id ?? null;

  const initialVenue: PosVenueScope = params.venue === 'restaurant' ? 'restaurant' : 'hotel';
  const [venueScope, setVenueScope] = useState<PosVenueScope>(initialVenue);
  /** Değişiklik Uygula ile işlenir — otomatik geçiş yok */
  const [venueDraft, setVenueDraft] = useState<PosVenueScope>(initialVenue);
  const [phase, setPhase] = useState<Phase>('idle');
  const [pending, setPending] = useState<BatchReceiptItem[]>([]);
  const [savedItems, setSavedItems] = useState<BatchReceiptItem[]>([]);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [rereadingDates, setRereadingDates] = useState(false);
  const [rereadProgress, setRereadProgress] = useState<string | null>(null);
  /** DB’deki mevcut fiş parmak izleri — aynı fiş tekrar yüklenmesin */
  const [existingDupKeys, setExistingDupKeys] = useState<Set<string>>(() => new Set());
  const autostartDone = useRef(false);
  const savingRef = useRef(false);
  const captureDocsRef = useRef<PickedInvoiceDocument[]>([]);
  const cameraBusyRef = useRef(false);
  /** Hızlı çekim döngüsü açık mı — Okumaya geç / iptal ile kapanır */
  const captureLoopRef = useRef(false);
  const scanStartedRef = useRef(false);
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;

  useEffect(() => {
    preloadPosOcrModule();
  }, []);

  useEffect(() => {
    if (!orgId || orgId === 'all') {
      setExistingDupKeys(new Set());
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await listPosReceiptInvoices(orgId, { venueScope });
      if (cancelled) return;
      const keys = new Set<string>();
      for (const r of res.rows) {
        const k = posReceiptDuplicateKeyFromRow(r);
        if (k) keys.add(k);
      }
      setExistingDupKeys(keys);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, venueScope]);

  /** Onay listesi: çekim saati grupları */
  const reviewSections = useMemo(() => groupBatchItemsByCaptureHour(pending), [pending]);
  const savedSections = useMemo(() => groupBatchItemsByCaptureHour(savedItems), [savedItems]);
  const pendingTotals = useMemo(
    () => sumBatchReceiptTotals(pending.filter((x) => x.selected !== false)),
    [pending]
  );
  const savedTotals = useMemo(() => sumBatchReceiptTotals(savedItems), [savedItems]);

  const duplicateKeys = useMemo(
    () =>
      markBatchDuplicates(
        pending.filter((x) => x.status === 'review' || x.status === 'done'),
        (item) =>
          posReceiptDuplicateKey({
            receiptNo: item.receiptNo,
            receiptDate: item.receiptDate,
            receiptTotal: item.receiptTotal,
            cardLast4: item.cardLast4,
            paymentBank: item.paymentBank,
            merchantName: item.merchantName,
            venueScope,
          }),
        existingDupKeys
      ),
    [pending, existingDupKeys, venueScope]
  );

  const duplicateKeysSig = useMemo(
    () => [...duplicateKeys].sort().join('\0'),
    [duplicateKeys]
  );

  /** Kopyaları kayda dahil etme — seçimi kapat */
  useEffect(() => {
    if (!duplicateKeysSig) return;
    const keys = new Set(duplicateKeysSig.split('\0').filter(Boolean));
    setPending((prev) => {
      let changed = false;
      const next = prev.map((x) => {
        if (!keys.has(x.key) || x.selected === false) return x;
        changed = true;
        return { ...x, selected: false };
      });
      return changed ? next : prev;
    });
  }, [duplicateKeysSig]);

  const progress = useMemo(() => {
    if (!pending.length) return { done: 0, total: 0, pct: 0 };
    const done = pending.filter(
      (x) => x.status === 'review' || x.status === 'error' || x.status === 'done'
    ).length;
    return { done, total: pending.length, pct: Math.round((done / pending.length) * 100) };
  }, [pending]);

  const patchPending = useCallback((index: number, item: BatchReceiptItem) => {
    setPending((prev) => {
      const next = [...prev];
      const i = next.findIndex((x) => x.key === item.key);
      if (i >= 0) next[i] = item;
      else if (index >= 0 && index < next.length) next[index] = item;
      return next;
    });
  }, []);

  /** Kayıt sonrası: DB’deki fişleri görselden tekrar oku */
  const rereadSavedDates = useCallback(
    async (ids?: string[]) => {
      const targetIds =
        ids?.length ? ids : savedItems.map((x) => x.id).filter((x): x is string => Boolean(x));
      if (!targetIds.length) {
        Alert.alert('Yok', 'Yeniden okunacak kayıt yok.');
        return;
      }
      setRereadingDates(true);
      setRereadProgress(`0 / ${targetIds.length}`);
      try {
        const result = await batchRescanPosReceiptInvoices(targetIds, (done, total) => {
          setRereadProgress(`${done} / ${total}`);
        });
        Alert.alert(
          'Tarihler yeniden okundu',
          `${result.updated} güncellendi · ${result.dateFixed} tarihte değişiklik · ${result.failed} hata`,
          [
            {
              text: 'Listeye git',
              onPress: () =>
                router.replace({
                  pathname: '/admin/accounting/pos-receipts',
                  params: { venue: venueScope },
                }),
            },
            { text: 'Kal', style: 'cancel' },
          ]
        );
      } finally {
        setRereadingDates(false);
        setRereadProgress(null);
      }
    },
    [savedItems, router, venueScope]
  );

  const approveAndSave = useCallback(
    async (itemsOverride?: BatchReceiptItem[]) => {
      if (!orgId || orgId === 'all') {
        Alert.alert('Organizasyon', 'Önce organizasyon seçin.');
        return;
      }
      if (savingRef.current) return;
      const source = itemsOverride ?? pending;
      const toSave = source.filter((x) => x.selected !== false && x.status === 'review');
      if (!toSave.length) {
        Alert.alert('Seçim yok', 'Onaylamak için en az bir fiş seçin.');
        return;
      }

      savingRef.current = true;
      setPhase('saving');
      try {
        const res = await batchSaveApprovedPosReceipts({
          items: source,
          organizationId: orgId,
          createdByStaffId: me?.id,
          venueScope,
          concurrency: 4,
          onItem: (item, index) => patchPending(index, item),
        });

        const newlySaved = res.items.filter((x) => x.status === 'done');
        setSavedItems((prev) => {
          const keys = new Set(prev.map((x) => x.key));
          return [...prev, ...newlySaved.filter((x) => !keys.has(x.key))];
        });
        setPending(res.items.filter((x) => x.status === 'error'));

        if (res.saved > 0) {
          setPhase('saved');
          Alert.alert(
            res.failed === 0 ? 'Kaydedildi' : 'Kısmen tamam',
            `${res.saved} fiş yüklendi${res.failed ? `, ${res.failed} hata` : ''}.`,
            [
              {
                text: 'Listeye git',
                onPress: () =>
                  router.replace({
                    pathname: '/admin/accounting/pos-receipts',
                    params: { venue: venueScope },
                  }),
              },
              { text: 'Tamam', style: 'cancel' },
            ]
          );
          return;
        }
        Alert.alert('Kaydedilemedi', 'Seçili fişler kaydedilemedi.');
        setPhase(source.length ? 'review' : 'idle');
      } finally {
        savingRef.current = false;
      }
    },
    [orgId, pending, me?.id, venueScope, patchPending, router]
  );

  /** Onay ekranında: henüz kaydedilmeden tarihleri tekrar oku */
  const rereadReviewDates = useCallback(() => {
    const targets = pending.filter((x) => x.status === 'review' || x.status === 'error');
    if (!targets.length) {
      Alert.alert('Yok', 'Yeniden okunacak fiş yok.');
      return;
    }
    void (async () => {
      setRereadingDates(true);
      setPhase('scanning');
      setRereadProgress(`0 / ${targets.length}`);
      try {
        let done = 0;
        const res = await batchRereadDatesOnItems({
          items: pending,
          onItem: (item, index) => {
            patchPending(index, item);
            if (item.status === 'review' || item.status === 'error') {
              done += 1;
              setRereadProgress(`${Math.min(done, targets.length)} / ${targets.length}`);
            }
          },
        });
        setPending(res.items);
        setPhase('review');
        Alert.alert(
          'Tarihler güncellendi',
          `${res.updated} okundu · ${res.dateFixed} tarihte değişiklik · ${res.failed} hata`
        );
      } finally {
        setRereadingDates(false);
        setRereadProgress(null);
      }
    })();
  }, [pending, patchPending]);

  /** Yapay zeka ile tüm fiş tarihlerini kontrol et / düzelt */
  const aiCheckReviewDates = useCallback(() => {
    const targets = pending.filter((x) => x.status === 'review' || x.status === 'error');
    if (!targets.length) {
      Alert.alert('Yok', 'Kontrol edilecek fiş yok.');
      return;
    }
    void (async () => {
      setRereadingDates(true);
      setPhase('scanning');
      setRereadProgress(`AI 0 / ${targets.length}`);
      try {
        const res = await aiAuditBatchReceiptDates({
          items: pending,
          onProgress: (done, total) => setRereadProgress(`AI ${done} / ${total}`),
        });
        setPending(res.items);
        setPhase('review');
        Alert.alert(
          'AI tarih kontrolü',
          `${res.fixed} tarih düzeltildi · ${res.flagged} şüpheli / eksik işaretlendi`
        );
      } catch (e) {
        setPhase('review');
        Alert.alert('AI hata', (e as Error)?.message ?? 'Tarih kontrolü başarısız');
      } finally {
        setRereadingDates(false);
        setRereadProgress(null);
      }
    })();
  }, [pending]);

  const runScan = useCallback(
    async (docs: PickedInvoiceDocument[]) => {
      if (!docs.length) return;
      const prevCaptured = new Map(
        pending.filter((p) => p.uri).map((p) => [p.uri, p.capturedAt] as const)
      );
      captureDocsRef.current = [];
      setPhase('scanning');
      setPending(
        docs.map((d, i) => ({
          ...queuedItem(d, i),
          capturedAt: prevCaptured.get(d.uri) ?? new Date().toISOString(),
        }))
      );

      const res = await batchScanPosReceipts({
        docs,
        concurrency: 1,
        onItem: (item, index) => patchPending(index, item),
      });
      const byUri = new Map(res.items.map((x) => [x.uri, x]));
      const isKitchen = venueScope === 'restaurant';
      const reviewed = docs.map((d, i) => {
        const hit = byUri.get(d.uri) ?? res.items[i];
        const base = {
          ...(hit ?? queuedItem(d, i)),
          capturedAt:
            hit?.capturedAt || prevCaptured.get(d.uri) || new Date().toISOString(),
        };
        if (isKitchen && base.status === 'review') {
          return {
            ...base,
            selected: true,
            invoiceDueOn: null,
            warnings: [
              ...(base.warnings ?? []).filter((w) => !/kesim tarih/i.test(w)),
              'Mutfak: kesim tarihini kayıt detayından elle girin',
            ],
            parsed: base.parsed
              ? { ...base.parsed, invoiceDueOn: null, paymentReceivedOn: null }
              : base.parsed,
          };
        }
        return {
          ...base,
          selected: hit?.status === 'review',
        };
      });
      setPending(reviewed);
      setPhase('review');
    },
    [patchPending, venueScope, pending]
  );

  const startScanFromCapture = useCallback(() => {
    if (scanStartedRef.current) return;
    captureLoopRef.current = false;
    const docs = captureDocsRef.current;
    if (!docs.length) {
      setPhase('idle');
      setPending([]);
      return;
    }
    scanStartedRef.current = true;
    void runScan([...docs]);
  }, [runScan]);

  const appendCaptureDocs = useCallback((docs: PickedInvoiceDocument[]) => {
    if (!docs.length) return;
    const base = captureDocsRef.current.length;
    captureDocsRef.current = [...captureDocsRef.current, ...docs];
    setPending((prev) => [...prev, ...docs.map((d, i) => queuedItem(d, base + i))]);
    setPhase('capture');
  }, []);

  /**
   * Hızlı tek tek çekim: fotoğraftan sonra soru sormadan kamerayı yeniden açar.
   * Durmak için kamerayı iptal edin veya alttan "Okumaya geç"e basın.
   */
  const pickOneCamera = useCallback(
    (opts?: { reset?: boolean; afterShot?: boolean }) => {
      void (async () => {
        if (cameraBusyRef.current) return;
        cameraBusyRef.current = true;
        try {
          const reset = opts?.reset === true || phaseRef.current !== 'capture';
          if (reset) {
            captureDocsRef.current = [];
            setPending([]);
            scanStartedRef.current = false;
            captureLoopRef.current = true;
          }
          if (!captureLoopRef.current && opts?.afterShot) {
            return;
          }
          setPhase('capture');
          captureLoopRef.current = true;

          // Android: peş peşe kamera için kısa nefes
          if (opts?.afterShot) {
            await new Promise((r) => setTimeout(r, 200));
          }
          if (!captureLoopRef.current) return;

          const doc = await pickInvoiceFromCamera();
          if (!captureLoopRef.current) return;

          if (!doc) {
            captureLoopRef.current = false;
            if (!captureDocsRef.current.length) {
              setPhase('idle');
              setPending([]);
            }
            return;
          }

          appendCaptureDocs([doc]);
          setTimeout(() => {
            if (!captureLoopRef.current || scanStartedRef.current) return;
            pickOneCamera({ reset: false, afterShot: true });
          }, 0);
        } finally {
          cameraBusyRef.current = false;
        }
      })();
    },
    [appendCaptureDocs]
  );

  const pickGallery = useCallback(() => {
    void (async () => {
      const uris = await pickGalleryImages({
        quality: 0.95,
        selectionLimit: 40,
        permission: {
          title: 'Galeri',
          message: 'Çoklu fiş seçmek için galeri izni gerekli.',
        },
      });
      if (!uris.length) return;
      if (phaseRef.current === 'capture' && captureDocsRef.current.length) {
        appendCaptureDocs(toDocs(uris));
        return;
      }
      scanStartedRef.current = false;
      await runScan(toDocs(uris));
    })();
  }, [appendCaptureDocs, runScan]);

  const pickFiles = useCallback(() => {
    void (async () => {
      const docs = await pickInvoiceFromFiles();
      if (!docs.length) return;
      if (phaseRef.current === 'capture' && captureDocsRef.current.length) {
        appendCaptureDocs(docs);
        return;
      }
      scanStartedRef.current = false;
      await runScan(docs);
    })();
  }, [appendCaptureDocs, runScan]);

  useEffect(() => {
    if (autostartDone.current) return;
    if (!orgId || orgId === 'all') return;
    const mode = params.autostart;
    if (mode !== 'camera' && mode !== 'gallery') return;
    autostartDone.current = true;
    const t = setTimeout(() => {
      if (mode === 'camera') pickOneCamera({ reset: true });
      else pickGallery();
    }, 250);
    return () => clearTimeout(t);
  }, [orgId, params.autostart, pickOneCamera, pickGallery]);

  const toggleSelect = (key: string) => {
    setPending((prev) =>
      prev.map((x) => {
        if (x.key !== key || x.status === 'error') return x;
        return { ...x, selected: !x.selected };
      })
    );
  };

  const removePending = (key: string) => {
    setPending((prev) => {
      const removed = prev.find((p) => p.key === key);
      if (removed) {
        captureDocsRef.current = captureDocsRef.current.filter((d) => d.uri !== removed.uri);
      }
      const next = prev.filter((x) => x.key !== key);
      if (phaseRef.current === 'capture' && next.length === 0) {
        setPhase('idle');
      }
      return next;
    });
  };

  const confirmRemoveDuplicate = (key: string) => {
    Alert.alert('Aynı fiş', 'Bu fiş zaten yüklenmiş / bu oturumda tekrar var. Silinsin mi?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => removePending(key) },
    ]);
  };

  const startNewCapture = () => {
    cameraBusyRef.current = false;
    scanStartedRef.current = false;
    captureDocsRef.current = [];
    setPending([]);
    setPhase('idle');
  };

  if (!orgId || orgId === 'all') {
    return (
      <View style={styles.root}>
        <AdminOrganizationPicker canUseAll={canUseAll} ownOrganizationId={me?.organization_id} />
        <Text style={styles.empty}>Organizasyon seçin.</Text>
      </View>
    );
  }

  const showCaptureButtons = phase === 'idle' || phase === 'saved' || phase === 'capture';
  const listSections =
    phase === 'saved' || (phase === 'idle' && savedItems.length) ? savedSections : reviewSections;
  const captureCount = phase === 'capture' ? pending.length : 0;

  return (
    <View style={styles.root}>
      <AdminOrganizationPicker canUseAll={canUseAll} ownOrganizationId={me?.organization_id} />

      <View style={styles.topBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.topTitle}>
            {phase === 'review'
              ? 'Onay sayfası'
              : phase === 'capture'
                ? `Çekim · ${captureCount} fiş`
                : phase === 'scanning'
                  ? 'Okunuyor…'
                  : phase === 'saving'
                    ? 'Kaydediliyor…'
                    : phase === 'saved'
                      ? 'Kaydedildi'
                      : 'Fiş çekimi'}
          </Text>
          <Text style={styles.topSub}>
            {phase === 'review'
              ? 'Saat grupları · tarihleri kontrol · onaylayın'
              : phase === 'capture'
                ? 'Hızlı çekim · bitince Okumaya geç'
                : phase === 'saved'
                  ? 'İsterseniz tarihleri tekrar okuyun · sonra listeye gidin'
                  : 'Önce Otel/Mutfak seçin (Uygula) · sonra çekin'}
          </Text>
        </View>
        <View style={styles.venueMini}>
          {(['hotel', 'restaurant'] as const).map((v) => (
            <Pressable
              key={v}
              onPress={() => setVenueDraft(v)}
              style={[styles.venueDot, venueDraft === v && styles.venueDotOn]}
            >
              <Text style={[styles.venueDotText, venueDraft === v && styles.venueDotTextOn]}>
                {v === 'hotel' ? 'Otel' : 'Mutfak'}
              </Text>
            </Pressable>
          ))}
          {venueDraft !== venueScope ? (
            <Pressable
              style={styles.venueApplyMini}
              onPress={() => setVenueScope(venueDraft)}
            >
              <Text style={styles.venueApplyMiniText}>Uygula</Text>
            </Pressable>
          ) : (
            <Text style={styles.venueActiveHint}>{POS_VENUE_LABELS[venueScope]}</Text>
          )}
        </View>
      </View>

      {(phase === 'review' || phase === 'saved') && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>Fiş</Text>
            <Text style={styles.summaryValue}>
              {phase === 'review' ? pendingTotals.count : savedTotals.count}
            </Text>
          </View>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>Fiş toplamı</Text>
            <Text style={styles.summaryValue}>
              {formatTry(phase === 'review' ? pendingTotals.receiptTotal : savedTotals.receiptTotal)}
            </Text>
          </View>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>Matrah</Text>
            <Text style={[styles.summaryValue, { color: '#0f766e' }]}>
              {formatTry(phase === 'review' ? pendingTotals.matrahTotal : savedTotals.matrahTotal)}
            </Text>
          </View>
        </View>
      )}

      {(phase === 'scanning' || phase === 'saving' || rereadingDates) && (
        <View style={styles.progressBlock}>
          <View style={styles.progressHead}>
            <Text style={styles.progressTitle}>
              {rereadingDates
                ? `Tarihler okunuyor ${rereadProgress ?? ''}…`
                : phase === 'scanning'
                  ? 'Okunuyor'
                  : 'Kaydediliyor'}{' '}
              {!rereadingDates ? `${progress.done}/${progress.total}` : ''}
            </Text>
            <ActivityIndicator color="#0f766e" />
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${rereadingDates ? 50 : progress.pct}%` }]} />
          </View>
        </View>
      )}

      {showCaptureButtons ? (
        <View style={styles.captureRow}>
          <TouchableOpacity
            style={styles.captureMain}
            onPress={() => {
              if (venueDraft !== venueScope) {
                Alert.alert(
                  'Mekan seçimi',
                  'Önce Otel veya Mutfak seçip Uygula’ya basın. Otomatik değişmez.'
                );
                return;
              }
              pickOneCamera({
                reset: phase !== 'capture',
                afterShot: phase === 'capture',
              });
            }}
            activeOpacity={0.9}
          >
            <Ionicons name="camera" size={26} color="#fff" />
            <Text style={styles.captureMainText}>
              {phase === 'capture'
                ? 'Sonraki fişi çek'
                : savedItems.length
                  ? 'Tekrar çek'
                  : 'Hızlı çek (tek tek)'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.captureSide} onPress={pickGallery}>
            <Ionicons name="images-outline" size={22} color="#0f766e" />
            <Text style={styles.captureSideText}>Galeri</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.captureSide} onPress={pickFiles}>
            <Ionicons name="folder-outline" size={22} color="#0f766e" />
            <Text style={styles.captureSideText}>Dosya</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {phase === 'capture' && captureCount > 0 ? (
        <View style={styles.captureBar}>
          <TouchableOpacity
            style={styles.captureBarSide}
            onPress={() => pickOneCamera({ reset: false, afterShot: true })}
          >
            <Ionicons name="camera-outline" size={18} color="#0f766e" />
            <Text style={styles.captureBarSideText}>Devam çek</Text>
          </TouchableOpacity>
          <Text style={styles.captureBarText}>{captureCount} fiş</Text>
          <TouchableOpacity style={styles.captureBarBtn} onPress={startScanFromCapture}>
            <Text style={styles.captureBarBtnText}>Okumaya geç</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <SectionList
        sections={listSections}
        keyExtractor={(x) => x.key}
        contentContainerStyle={styles.listPad}
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          listSections.length > 0 ? (
            <Text style={styles.sectionLabel}>
              {phase === 'review'
                ? 'Onay · çekim saatine göre gruplu'
                : phase === 'capture'
                  ? 'Çekim devam ediyor · kamerayı kapatınca durur · Okumaya geç'
                  : phase === 'saved' || savedItems.length
                    ? 'Bu oturumda kaydedilenler · saat grupları'
                    : 'Fişler'}
            </Text>
          ) : phase === 'idle' ? (
            <Text style={styles.hint}>
              Otel/Mutfak seçip Uygula → hızlı çek → Okumaya geç → onaylayın.
            </Text>
          ) : null
        }
        ListEmptyComponent={
          phase === 'scanning' ? <Text style={styles.hint}>Fişler okunuyor…</Text> : null
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.hourHead}>
            <Ionicons name="time-outline" size={16} color="#0f766e" />
            <Text style={styles.hourHeadText}>
              {section.title} · {section.data.length} fiş
            </Text>
          </View>
        )}
        renderItem={({ item, index, section }) => {
          const globalIndex =
            listSections
              .slice(0, listSections.findIndex((s) => s.hourKey === section.hourKey))
              .reduce((n, s) => n + s.data.length, 0) + index;
          return (
            <ReceiptCard
              item={item}
              index={globalIndex}
              reviewMode={phase === 'review'}
              captureMode={phase === 'capture'}
              isDuplicate={duplicateKeys.has(item.key)}
              onToggle={() => toggleSelect(item.key)}
              onRemove={() => removePending(item.key)}
              onRemoveDuplicate={() => confirmRemoveDuplicate(item.key)}
              onPreview={() => setPreviewUri(item.uri)}
              onOpen={() => {
                if (item.id) router.push(`/admin/accounting/pos-receipts/${item.id}`);
              }}
            />
          );
        }}
        ListFooterComponent={
          phase === 'review' ? (
            <View style={styles.footerActions}>
              <TouchableOpacity
                style={styles.rereadBtn}
                onPress={rereadReviewDates}
                disabled={rereadingDates}
              >
                <Ionicons name="calendar-outline" size={20} color="#0f766e" />
                <Text style={styles.rereadBtnText}>Tarihleri tekrar oku</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.rereadBtn, styles.aiBtn]}
                onPress={aiCheckReviewDates}
                disabled={rereadingDates}
              >
                <Ionicons name="sparkles-outline" size={20} color="#6d28d9" />
                <Text style={[styles.rereadBtnText, { color: '#6d28d9' }]}>
                  AI ile tüm tarihleri kontrol et
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.rejectAllBtn} onPress={startNewCapture}>
                <Text style={styles.rejectAllText}>İptal / yeniden çek</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.approveBtn}
                onPress={() => void approveAndSave()}
                disabled={rereadingDates}
              >
                <Ionicons name="checkmark-circle" size={22} color="#fff" />
                <Text style={styles.approveBtnText}>
                  Onayla ve kaydet ({pendingTotals.count})
                </Text>
              </TouchableOpacity>
            </View>
          ) : phase === 'saved' ? (
            <View style={styles.footerActions}>
              <TouchableOpacity
                style={[styles.rereadBtn, rereadingDates && { opacity: 0.55 }]}
                onPress={() => void rereadSavedDates()}
                disabled={rereadingDates}
              >
                {rereadingDates ? (
                  <ActivityIndicator color="#0f766e" />
                ) : (
                  <Ionicons name="calendar-outline" size={20} color="#0f766e" />
                )}
                <Text style={styles.rereadBtnText}>
                  {rereadingDates
                    ? `Okunuyor ${rereadProgress ?? ''}…`
                    : 'Yüklenen fişlerde tarihleri tekrar oku'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.listBtn}
                onPress={() =>
                  router.replace({
                    pathname: '/admin/accounting/pos-receipts',
                    params: { venue: venueScope },
                  })
                }
              >
                <Text style={styles.listBtnText}>
                  {POS_VENUE_LABELS[venueScope]} fiş listesine git
                </Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
      />

      <ChatFullscreenImageModal uri={previewUri} onClose={() => setPreviewUri(null)} />
    </View>
  );
}

function ReceiptCard({
  item,
  index,
  reviewMode,
  captureMode,
  isDuplicate,
  onToggle,
  onRemove,
  onRemoveDuplicate,
  onPreview,
  onOpen,
}: {
  item: BatchReceiptItem;
  index: number;
  reviewMode: boolean;
  captureMode?: boolean;
  isDuplicate?: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onRemoveDuplicate: () => void;
  onPreview: () => void;
  onOpen: () => void;
}) {
  const selected = item.selected !== false && item.status !== 'error';
  const Wrapper = reviewMode && item.status === 'review' ? Pressable : View;

  return (
    <Wrapper
      onPress={reviewMode && item.status === 'review' ? onToggle : undefined}
      style={[
        styles.card,
        reviewMode && !selected && styles.cardOff,
        item.status === 'error' && styles.cardErr,
        isDuplicate && styles.cardDup,
      ]}
    >
      <View>
        <View style={styles.ordBadge}>
          <Text style={styles.ordBadgeText}>{index + 1}</Text>
        </View>
        <Pressable onPress={onPreview} hitSlop={4}>
          <CachedImage uri={item.uri} style={styles.thumb} contentFit="cover" />
          <View style={styles.thumbZoom}>
            <Ionicons name="expand-outline" size={12} color="#fff" />
          </View>
        </Pressable>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        {isDuplicate ? (
          <View style={styles.dupBanner}>
            <Ionicons name="copy-outline" size={13} color="#b91c1c" />
            <Text style={styles.dupBannerText}>Aynı fiş tekrar</Text>
          </View>
        ) : null}
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {captureMode
              ? `Fiş ${index + 1}`
              : item.merchantName || `Fiş ${index + 1}`}
          </Text>
          {reviewMode && item.status === 'review' ? (
            <Ionicons
              name={selected ? 'checkbox' : 'square-outline'}
              size={22}
              color={selected ? '#0f766e' : '#94a3b8'}
            />
          ) : (
            <StatusIcon status={item.status} />
          )}
        </View>

        <Text style={styles.cardMeta} numberOfLines={2}>
          {captureMode
            ? item.capturedAt
              ? `Çekim ${new Date(item.capturedAt).toLocaleTimeString('tr-TR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}`
              : 'Okuma bekliyor'
            : [
                item.capturedAt
                  ? new Date(item.capturedAt).toLocaleTimeString('tr-TR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : null,
                item.receiptNo ? `No ${item.receiptNo}` : null,
                item.paymentBank,
                item.receiptDate || item.invoiceDueOn,
                item.cardLast4 ? `**** ${item.cardLast4}` : null,
              ]
                .filter(Boolean)
                .join(' · ') || statusLabel(item.status)}
        </Text>

        {!captureMode ? (
          <View style={styles.amtBlock}>
            <View>
              <Text style={styles.amtLabel}>Fiş tutarı</Text>
              <Text style={styles.amtFis}>{formatBatchAmount(item.receiptTotal)}</Text>
            </View>
            <Ionicons name="arrow-forward" size={14} color="#94a3b8" style={{ marginTop: 14 }} />
            <View>
              <Text style={styles.amtLabel}>Yazılacak matrah</Text>
              <Text style={styles.amtMat}>{formatBatchAmount(item.invoiceCutAmount)}</Text>
            </View>
          </View>
        ) : null}

        {item.vatAmount != null && item.receiptTotal != null ? (
          <Text style={styles.vatLine}>
            KDV {formatBatchAmount(item.vatAmount)} · fiş = matrah + KDV
          </Text>
        ) : null}

        {item.confidence === 'low' ||
        (item.status === 'review' && !(item.receiptTotal != null && item.receiptTotal > 0)) ? (
          <Text style={styles.warn} numberOfLines={1}>
            Kontrol edin — tutar veya alanlar belirsiz
          </Text>
        ) : null}

        {item.error ? <Text style={styles.err}>{item.error}</Text> : null}
        {item.warnings?.[0] && !item.error ? (
          <Text style={styles.warn} numberOfLines={1}>
            {item.warnings[0]}
          </Text>
        ) : null}

        <View style={styles.cardActions}>
          {isDuplicate && reviewMode ? (
            <TouchableOpacity style={styles.dupDeleteBtn} onPress={onRemoveDuplicate} hitSlop={8}>
              <Ionicons name="trash-outline" size={14} color="#fff" />
              <Text style={styles.dupDeleteBtnText}>Silinsin mi?</Text>
            </TouchableOpacity>
          ) : null}
          {(reviewMode || captureMode) && item.status !== 'done' ? (
            <TouchableOpacity onPress={onRemove} hitSlop={8}>
              <Text style={styles.removeText}>Çıkar</Text>
            </TouchableOpacity>
          ) : null}
          {item.id ? (
            <TouchableOpacity onPress={onOpen} hitSlop={8}>
              <Text style={styles.openText}>Detay →</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Wrapper>
  );
}

function statusLabel(s: BatchReceiptItem['status']): string {
  switch (s) {
    case 'queued':
      return 'Sırada';
    case 'scanning':
      return 'Okunuyor';
    case 'review':
      return 'Onay bekliyor';
    case 'saving':
      return 'Kaydediliyor';
    case 'done':
      return 'Kaydedildi';
    case 'error':
      return 'Hata';
    case 'rejected':
      return 'Atlandı';
  }
}

function StatusIcon({ status }: { status: BatchReceiptItem['status'] }) {
  if (status === 'done') return <Ionicons name="checkmark-circle" size={22} color="#15803d" />;
  if (status === 'error') return <Ionicons name="alert-circle" size={22} color="#dc2626" />;
  if (status === 'scanning' || status === 'saving')
    return <ActivityIndicator size="small" color="#0f766e" />;
  if (status === 'review') return <Ionicons name="eye-outline" size={20} color="#0f766e" />;
  return <Ionicons name="ellipse-outline" size={20} color="#94a3b8" />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  empty: { textAlign: 'center', marginTop: 40, color: '#94a3b8' },
  topBar: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#042f2e',
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  topTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  topSub: { color: '#99f6e4', fontSize: 12, marginTop: 4, lineHeight: 16 },
  venueMini: { flexDirection: 'column', gap: 6, alignItems: 'flex-end' },
  venueDot: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0f766e',
  },
  venueDotOn: { backgroundColor: '#99f6e4', borderColor: '#99f6e4' },
  venueDotText: { color: '#99f6e4', fontWeight: '700', fontSize: 11 },
  venueDotTextOn: { color: '#042f2e' },
  venueApplyMini: {
    backgroundColor: '#fbbf24',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  venueApplyMiniText: { color: '#042f2e', fontWeight: '800', fontSize: 11 },
  venueActiveHint: {
    color: '#99f6e4',
    fontSize: 10,
    fontWeight: '600',
    maxWidth: 100,
    textAlign: 'right',
  },
  hourHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  hourHeadText: { color: '#0f766e', fontWeight: '800', fontSize: 13, flex: 1 },
  summaryCard: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
  },
  summaryCol: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  summaryValue: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginTop: 2 },
  captureRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    alignItems: 'stretch',
  },
  captureMain: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0f766e',
    borderRadius: 14,
    paddingVertical: 16,
  },
  captureMainText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  captureSide: {
    flex: 0.7,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#ecfdf5',
    borderRadius: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#99f6e4',
  },
  captureSideText: { color: '#0f766e', fontWeight: '700', fontSize: 12 },
  captureBar: {
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#99f6e4',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  captureBarText: {
    flex: 1,
    textAlign: 'center',
    color: '#0f766e',
    fontWeight: '800',
    fontSize: 13,
  },
  captureBarSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#99f6e4',
  },
  captureBarSideText: { color: '#0f766e', fontWeight: '800', fontSize: 13 },
  captureBarBtn: {
    backgroundColor: '#0f766e',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  captureBarBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  progressBlock: { marginHorizontal: 16, marginTop: 12 },
  progressHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressTitle: { fontWeight: '700', color: '#0f172a' },
  barTrack: {
    marginTop: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
  },
  barFill: { height: '100%', backgroundColor: '#0f766e', borderRadius: 4 },
  listPad: { padding: 16, paddingBottom: 40 },
  sectionLabel: { fontWeight: '800', color: '#0f172a', marginBottom: 10, fontSize: 14 },
  hint: { textAlign: 'center', color: '#94a3b8', marginTop: 12, lineHeight: 20 },
  card: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardOff: { opacity: 0.45 },
  cardErr: { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  cardDup: { borderColor: '#fca5a5', backgroundColor: '#fef2f2' },
  dupBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginBottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#fee2e2',
  },
  dupBannerText: { color: '#b91c1c', fontSize: 11, fontWeight: '800' },
  dupDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#dc2626',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  dupDeleteBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  ordBadge: {
    alignSelf: 'flex-start',
    marginBottom: 4,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#042f2e',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  ordBadgeText: { color: '#fff', fontWeight: '800', fontSize: 11 },
  thumb: { width: 72, height: 96, borderRadius: 10, backgroundColor: '#e2e8f0' },
  thumbZoom: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontWeight: '800', color: '#0f172a', fontSize: 15 },
  cardMeta: { marginTop: 4, color: '#64748b', fontSize: 12, fontWeight: '600' },
  amtBlock: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 8 },
  amtLabel: { fontSize: 10, color: '#64748b', fontWeight: '700' },
  amtFis: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginTop: 2 },
  amtMat: { fontSize: 16, fontWeight: '800', color: '#0f766e', marginTop: 2 },
  vatLine: { marginTop: 4, fontSize: 11, color: '#94a3b8', fontWeight: '600' },
  err: { marginTop: 6, color: '#b91c1c', fontSize: 12, fontWeight: '600' },
  warn: { marginTop: 4, color: '#b45309', fontSize: 11 },
  cardActions: { flexDirection: 'row', gap: 14, marginTop: 8 },
  removeText: { color: '#dc2626', fontWeight: '700', fontSize: 13 },
  openText: { color: '#0f766e', fontWeight: '700', fontSize: 13 },
  footerActions: { flexDirection: 'column', gap: 10, marginTop: 8, paddingBottom: 24 },
  rereadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#99f6e4',
  },
  aiBtn: {
    backgroundColor: '#f5f3ff',
    borderColor: '#ddd6fe',
  },
  rereadBtnText: { color: '#0f766e', fontWeight: '800', fontSize: 15 },
  rejectAllBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
  },
  rejectAllText: { color: '#64748b', fontWeight: '800' },
  approveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#0f766e',
  },
  approveBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  listBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#042f2e',
  },
  listBtnText: { color: '#fff', fontWeight: '800' },
});
