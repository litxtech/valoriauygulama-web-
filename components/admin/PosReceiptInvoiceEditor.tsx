import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import { CachedImage } from '@/components/CachedImage';
import { ChatFullscreenImageModal } from '@/components/ChatFullscreenImageModal';
import { chooseInvoiceDocumentSource } from '@/lib/financeInvoiceDocumentPick';
import { isImageContractUrl } from '@/lib/financeAgreementContract';
import { scanPosReceiptDocuments } from '@/lib/posReceiptInvoice/scanPosReceipt';
import { rescanPosReceiptFromStoredUrls } from '@/lib/posReceiptInvoice/rescanPosReceipt';
import { aiAuditSingleReceiptDate } from '@/lib/posReceiptInvoice/aiAuditPosDates';
import { blankPosLine, computePosInvoiceTotals, formatTry, recalcPosLine } from '@/lib/posReceiptInvoice/totals';
import { parsePosMoney } from '@/lib/posReceiptInvoice/extractPosFields';
import type { PosExtraField, PosInvoiceLineItem, PosRelatedRef, PosVenueScope } from '@/lib/posReceiptInvoice/types';
import { DEFAULT_POS_VAT_RATE, POS_VENUE_LABELS } from '@/lib/posReceiptInvoice/types';
import { savePosReceiptInvoice, type SavePosReceiptInput } from '@/lib/posReceiptInvoice/api';

type Props = {
  organizationId: string;
  createdByStaffId?: string | null;
  initial?: Partial<SavePosReceiptInput> & { id?: string; existingReceiptUrls?: string[] };
  readOnly?: boolean;
  onSaved: (id: string) => void;
  onCancel?: () => void;
};

export function PosReceiptInvoiceEditor({
  organizationId,
  createdByStaffId,
  initial,
  readOnly = false,
  onSaved,
  onCancel,
}: Props) {
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [localUris, setLocalUris] = useState<string[]>([]);
  const [existingUrls, setExistingUrls] = useState<string[]>(initial?.existingReceiptUrls ?? []);
  const [receiptNo, setReceiptNo] = useState(initial?.receiptNo ?? '');
  const [merchantName, setMerchantName] = useState(initial?.merchantName ?? '');
  const [merchantTaxId, setMerchantTaxId] = useState(initial?.merchantTaxId ?? '');
  const [buyerName, setBuyerName] = useState(initial?.buyerName ?? '');
  const [receiptDate, setReceiptDate] = useState(initial?.receiptDate ?? '');
  const [receiptTime, setReceiptTime] = useState(initial?.receiptTime ?? '');
  const [invoiceDueOn, setInvoiceDueOn] = useState(initial?.invoiceDueOn ?? '');
  const [paidBy, setPaidBy] = useState(initial?.paidBy ?? '');
  const [paymentBank, setPaymentBank] = useState(initial?.paymentBank ?? '');
  const [paymentMethod, setPaymentMethod] = useState(initial?.paymentMethod ?? '');
  const [paymentReceivedOn, setPaymentReceivedOn] = useState(initial?.paymentReceivedOn ?? '');
  const [cardLast4, setCardLast4] = useState(initial?.cardLast4 ?? '');
  const [receiptTotalStr, setReceiptTotalStr] = useState(
    initial?.receiptTotal != null && initial.receiptTotal > 0 ? String(initial.receiptTotal) : ''
  );
  const [lineItems, setLineItems] = useState<PosInvoiceLineItem[]>(
    (initial?.lineItems ?? []).map(recalcPosLine)
  );
  const [relatedOrders, setRelatedOrders] = useState<PosRelatedRef[]>(initial?.relatedOrders ?? []);
  const [relatedWaybills, setRelatedWaybills] = useState<PosRelatedRef[]>(initial?.relatedWaybills ?? []);
  const [extraFields, setExtraFields] = useState<PosExtraField[]>(initial?.extraFields ?? []);
  const [kdvExemption, setKdvExemption] = useState(initial?.kdvExemptionReason ?? '');
  const [note, setNote] = useState(initial?.descriptionNote ?? '');
  const [warnings, setWarnings] = useState<string[]>(initial?.ocrWarnings ?? []);
  const [rawText, setRawText] = useState(initial?.ocrRawText ?? '');
  const [confidence, setConfidence] = useState(initial?.ocrConfidence ?? '');
  const [status, setStatus] = useState(initial?.status ?? 'draft');
  const [venueScope, setVenueScope] = useState<PosVenueScope>(
    initial?.venueScope === 'restaurant' ? 'restaurant' : 'hotel'
  );

  useEffect(() => {
    if (!initial) return;
    setExistingUrls(initial.existingReceiptUrls ?? []);
    setReceiptNo(initial.receiptNo ?? '');
    setMerchantName(initial.merchantName ?? '');
    setMerchantTaxId(initial.merchantTaxId ?? '');
    setBuyerName(initial.buyerName ?? '');
    setReceiptDate(initial.receiptDate ?? '');
    setReceiptTime(initial.receiptTime ?? '');
    setInvoiceDueOn(initial.invoiceDueOn ?? '');
    setPaidBy(initial.paidBy ?? '');
    setPaymentBank(initial.paymentBank ?? '');
    setPaymentMethod(initial.paymentMethod ?? '');
    setPaymentReceivedOn(initial.paymentReceivedOn ?? '');
    setCardLast4(initial.cardLast4 ?? '');
    setReceiptTotalStr(
      initial.receiptTotal != null && initial.receiptTotal > 0
        ? formatTry(initial.receiptTotal)
        : ''
    );
    setLineItems((initial.lineItems ?? []).map(recalcPosLine));
    setRelatedOrders(initial.relatedOrders ?? []);
    setRelatedWaybills(initial.relatedWaybills ?? []);
    setExtraFields(initial.extraFields ?? []);
    setKdvExemption(initial.kdvExemptionReason ?? '');
    setNote(initial.descriptionNote ?? '');
    setWarnings(initial.ocrWarnings ?? []);
    setRawText(initial.ocrRawText ?? '');
    setConfidence(initial.ocrConfidence ?? '');
    setStatus(initial.status ?? 'draft');
    setVenueScope(initial.venueScope === 'restaurant' ? 'restaurant' : 'hotel');
  }, [initial?.id]);

  const receiptTotalNum = useMemo(() => parsePosMoney(receiptTotalStr), [receiptTotalStr]);

  const totals = useMemo(
    () => computePosInvoiceTotals(lineItems, { receiptTotal: receiptTotalNum }),
    [lineItems, receiptTotalNum]
  );
  const previewUris = [...existingUrls, ...localUris];
  const locked = readOnly || status === 'invoiced' || status === 'cancelled';

  const updateLine = useCallback((id: string, patch: Partial<PosInvoiceLineItem>) => {
    setLineItems((prev) =>
      prev.map((l) => (l.id === id ? recalcPosLine({ ...l, ...patch }) : l))
    );
  }, []);

  const applyParsed = (parsed: {
    receiptNo: string | null;
    merchantName: string | null;
    merchantTaxId: string | null;
    buyerName: string | null;
    receiptDate: string | null;
    receiptTime: string | null;
    invoiceDueOn: string | null;
    paidBy: string | null;
    paymentBank: string | null;
    paymentMethod: string | null;
    paymentReceivedOn: string | null;
    cardLast4: string | null;
    receiptTotal: number | null;
    lineItems: PosInvoiceLineItem[];
    warnings: string[];
    rawText: string;
    confidence: string;
  }) => {
    setReceiptNo(parsed.receiptNo ?? '');
    setMerchantName(parsed.merchantName ?? '');
    setMerchantTaxId(parsed.merchantTaxId ?? '');
    setBuyerName(parsed.buyerName ?? '');
    setReceiptDate(parsed.receiptDate ?? '');
    setReceiptTime(parsed.receiptTime ?? '');
    setPaidBy(parsed.paidBy ?? '');
    setPaymentBank(parsed.paymentBank ?? '');
    setPaymentMethod(parsed.paymentMethod ?? '');
    setCardLast4(parsed.cardLast4 ?? '');
    // Mutfak: kesim / ödeme tarihi otomatik dolmasın
    if (venueScope === 'restaurant') {
      setWarnings([
        ...parsed.warnings,
        'Mutfak: kesim ve ödeme tarihini elle kontrol edin',
      ]);
    } else {
      setInvoiceDueOn(parsed.invoiceDueOn ?? parsed.receiptDate ?? '');
      setPaymentReceivedOn(parsed.paymentReceivedOn ?? parsed.receiptDate ?? '');
      setWarnings(parsed.warnings);
    }
    setReceiptTotalStr(
      parsed.receiptTotal != null && parsed.receiptTotal > 0 ? formatTry(parsed.receiptTotal) : ''
    );
    setLineItems(parsed.lineItems.map(recalcPosLine));
    setRawText(parsed.rawText);
    setConfidence(parsed.confidence);
  };

  const runScan = async () => {
    chooseInvoiceDocumentSource(async (docs) => {
      if (!docs.length) return;
      setScanning(true);
      try {
        const parsed = await scanPosReceiptDocuments(docs);
        setLocalUris(parsed.sourceUris ?? [parsed.sourceUri]);
        applyParsed(parsed);
        setStatus('draft');
      } catch (e) {
        Alert.alert('Okuma hatası', (e as Error)?.message ?? 'Fiş okunamadı.');
      } finally {
        setScanning(false);
      }
    });
  };

  /** Kayıtlı görselleri son OCR ile yeniden oku (tarih düzeltme) */
  const runRescanExisting = async () => {
    if (locked) return;
    const urls = existingUrls.filter(Boolean);
    if (!urls.length) {
      Alert.alert('Görsel yok', 'Yeniden okumak için kayıtlı fiş görseli gerekli.');
      return;
    }
    setScanning(true);
    try {
      const parsed = await rescanPosReceiptFromStoredUrls(urls);
      applyParsed(parsed);
      Alert.alert(
        'Yeniden okundu',
        parsed.receiptDate
          ? `Tarih: ${parsed.receiptDate}${parsed.receiptTime ? ` ${parsed.receiptTime.slice(0, 5)}` : ''}`
          : 'Tarih yine okunamadı — elle girin.'
      );
    } catch (e) {
      Alert.alert('Okuma hatası', (e as Error)?.message ?? 'Yeniden okunamadı.');
    } finally {
      setScanning(false);
    }
  };

  /** OCR metninden AI ile tarih doğrula / doldur */
  const runAiDateCheck = async () => {
    if (locked) return;
    if (!rawText?.trim()) {
      Alert.alert('Metin yok', 'Önce fişi OCR ile okuyun; AI OCR metninden tarihi kontrol eder.');
      return;
    }
    setScanning(true);
    try {
      const r = await aiAuditSingleReceiptDate({
        rawText,
        currentDate: receiptDate || invoiceDueOn || null,
      });
      if (!r) {
        Alert.alert('AI', 'Tarih bulunamadı.');
        return;
      }
      if ((r.action === 'fix' || r.action === 'fill') && r.date) {
        setReceiptDate(r.date);
        setInvoiceDueOn(r.date);
        setPaymentReceivedOn(r.date);
        if (r.time) setReceiptTime(r.time.slice(0, 5));
        setWarnings((w) => [...w.filter((x) => !x.startsWith('🤖')), `🤖 AI tarih: ${r.date} — ${r.reason}`]);
        Alert.alert('AI tarih', `${r.date}${r.time ? ` ${r.time.slice(0, 5)}` : ''}\n${r.reason}`);
      } else if (r.action === 'keep') {
        Alert.alert('AI tarih', `Mevcut tarih doğru görünüyor (${r.date ?? receiptDate}).\n${r.reason}`);
      } else {
        Alert.alert(
          'AI tarih — kontrol',
          `${r.reason}${r.date ? `\nÖneri: ${r.date}` : ''}\nGüven: ${r.confidence}`
        );
      }
    } catch (e) {
      Alert.alert('AI hata', (e as Error)?.message ?? 'Tarih kontrolü başarısız');
    } finally {
      setScanning(false);
    }
  };

  const save = async (nextStatus?: typeof status) => {
    if (locked) {
      Alert.alert('Kilitli', 'Kesilmiş veya iptal edilmiş fiş düzenlenemez.');
      return;
    }
    if (!organizationId) {
      Alert.alert('Organizasyon', 'Önce organizasyon seçin.');
      return;
    }
    if (!previewUris.length && !lineItems.some((l) => l.name.trim())) {
      Alert.alert('Eksik', 'Fiş yükleyin veya en az bir kalem girin.');
      return;
    }
    setSaving(true);
    const res = await savePosReceiptInvoice({
      id: initial?.id,
      organizationId,
      createdByStaffId,
      status: nextStatus ?? status,
      receiptUris: localUris,
      existingReceiptUrls: existingUrls,
      receiptNo,
      merchantName,
      merchantTaxId,
      buyerName,
      receiptDate: receiptDate || null,
      receiptTime: receiptTime || null,
      receiptAt:
        receiptDate && receiptTime
          ? `${receiptDate}T${receiptTime.length === 5 ? `${receiptTime}:00` : receiptTime}`
          : receiptDate
            ? `${receiptDate}T12:00:00`
            : null,
      invoiceDueOn: invoiceDueOn || receiptDate || null,
      paidBy,
      paymentBank,
      paymentMethod,
      paymentReceivedOn: paymentReceivedOn || receiptDate || null,
      cardLast4,
      receiptTotal: receiptTotalNum,
      lineItems,
      venueScope,
      relatedOrders,
      relatedWaybills,
      extraFields,
      vatRate: DEFAULT_POS_VAT_RATE,
      kdvExemptionReason: kdvExemption,
      descriptionNote: note,
      ocrRawText: rawText || null,
      ocrConfidence: confidence || null,
      ocrWarnings: warnings,
    });
    setSaving(false);
    if ('error' in res) {
      Alert.alert('Kaydedilemedi', res.error);
      return;
    }
    onSaved(res.id);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        {locked ? (
          <View style={styles.lockedBanner}>
            <Ionicons name="lock-closed" size={18} color="#92400e" />
            <Text style={styles.lockedText}>
              {status === 'invoiced'
                ? 'Fatura kesildi — kayıt salt okunur.'
                : status === 'cancelled'
                  ? 'İptal edildi — düzenlenemez.'
                  : 'Salt okunur mod.'}
            </Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.scanBtn, locked && styles.scanBtnDisabled]}
          onPress={() => void runScan()}
          disabled={scanning || locked}
        >
          {scanning ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="scan-outline" size={22} color="#fff" />
              <Text style={styles.scanBtnText}>Fişi oku (yüksek kalite OCR)</Text>
            </>
          )}
        </TouchableOpacity>

        {!locked && existingUrls.length > 0 ? (
          <TouchableOpacity
            style={[styles.rescanBtn, scanning && styles.scanBtnDisabled]}
            onPress={() => void runRescanExisting()}
            disabled={scanning}
          >
            <Ionicons name="refresh-outline" size={20} color="#0f766e" />
            <Text style={styles.rescanBtnText}>Kayıtlı görselden yeniden oku (tarih düzelt)</Text>
          </TouchableOpacity>
        ) : null}

        {!locked && rawText?.trim() ? (
          <TouchableOpacity
            style={[styles.rescanBtn, styles.aiDateBtn, scanning && styles.scanBtnDisabled]}
            onPress={() => void runAiDateCheck()}
            disabled={scanning}
          >
            <Ionicons name="sparkles-outline" size={20} color="#6d28d9" />
            <Text style={[styles.rescanBtnText, { color: '#6d28d9' }]}>AI ile tarihi kontrol et</Text>
          </TouchableOpacity>
        ) : null}

        {previewUris.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.previewRow}>
            {previewUris.map((uri) =>
              isImageContractUrl(uri) || uri.startsWith('file:') || uri.startsWith('content:') ? (
                <Pressable key={uri} onPress={() => setPreviewUri(uri)}>
                  <CachedImage uri={uri} style={styles.previewImg} contentFit="cover" />
                </Pressable>
              ) : (
                <View key={uri} style={styles.previewPdf}>
                  <Ionicons name="document" size={22} color="#0d9488" />
                </View>
              )
            )}
          </ScrollView>
        ) : null}

        {warnings.length > 0 ? (
          <View style={styles.warnBox}>
            {warnings.map((w, i) => (
              <Text key={i} style={styles.warnText}>
                • {w}
              </Text>
            ))}
          </View>
        ) : null}

        <Text style={styles.section}>Hesap seçimi (Otel / Mutfak)</Text>
        <View style={styles.venueRow}>
          {(['hotel', 'restaurant'] as const).map((v) => (
            <TouchableOpacity
              key={v}
              style={[styles.venueChip, venueScope === v && styles.venueChipOn, locked && styles.venueChipDisabled]}
              onPress={() => setVenueScope(v)}
              activeOpacity={0.85}
              disabled={locked}
            >
              <Ionicons
                name={v === 'hotel' ? 'business-outline' : 'restaurant-outline'}
                size={18}
                color={venueScope === v ? '#fff' : '#0f766e'}
              />
              <Text style={[styles.venueChipText, venueScope === v && styles.venueChipTextOn]}>
                {POS_VENUE_LABELS[v]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.venueHint}>
          {POS_VENUE_LABELS[venueScope]} hesabına kaydedilir. Otel ve mutfak defterleri ayrıdır;
          toplamlar karışmaz.
        </Text>

        {receiptTotalNum != null ? (
          <View style={styles.cutBanner}>
            <Text style={styles.cutLabel}>e-Fatura / arşive yazılacak tutar (matrah)</Text>
            <Text style={styles.cutAmount}>{formatTry(totals.invoiceCutAmount)}</Text>
            <Text style={styles.cutSub}>
              Bu tutarı yazarsanız fiş tutarı ({formatTry(receiptTotalNum)}) ile aynı olur
              {'\n'}
              Fiş (KDV dahil): {formatTry(receiptTotalNum)} · KDV %{totals.cutPercent}:{' '}
              {formatTry(totals.cutAmount)}
            </Text>
          </View>
        ) : (
          <View style={styles.cutBannerEmpty}>
            <Text style={styles.cutBannerEmptyText}>
              Fiş tutarını okutun veya aşağıya kuruşlu girin — yazılacak matrah burada çıkar.
            </Text>
          </View>
        )}

        <Text style={styles.section}>Fiş / ödeme bilgileri</Text>
        <View pointerEvents={locked ? 'none' : 'auto'} style={locked ? styles.lockedFields : undefined}>
        <Field
          label="Fiş tutarı (TRY, KDV dahil) *"
          value={receiptTotalStr}
          onChange={setReceiptTotalStr}
          placeholder="Örn: 7000,50"
          keyboardType="decimal-pad"
        />
        {receiptTotalNum != null ? (
          <Text style={styles.totalReadout}>Okunan / girilen: {formatTry(receiptTotalNum)} TRY</Text>
        ) : null}
        <Field label="İşyeri / satıcı" value={merchantName} onChange={setMerchantName} />
        <Field label="Fiş no" value={receiptNo} onChange={setReceiptNo} />
        <Field label="VKN" value={merchantTaxId} onChange={setMerchantTaxId} keyboardType="number-pad" />
        <Field label="Alıcı" value={buyerName} onChange={setBuyerName} />
        <View style={styles.row2}>
          <View style={{ flex: 1 }}>
            <Field label="Fiş tarihi *" value={receiptDate} onChange={setReceiptDate} placeholder="YYYY-MM-DD" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Saat" value={receiptTime} onChange={setReceiptTime} placeholder="HH:MM:SS" />
          </View>
        </View>
        <Field
          label="Fatura kesilmesi gereken tarih *"
          value={invoiceDueOn}
          onChange={setInvoiceDueOn}
          placeholder="YYYY-MM-DD"
        />
        <Field label="Kimden ödeme alındı" value={paidBy} onChange={setPaidBy} placeholder="Kart sahibi / ödeyen" />
        <Field label="Banka" value={paymentBank} onChange={setPaymentBank} placeholder="Ziraat, Garanti…" />
        <Field label="Ödeme yöntemi" value={paymentMethod} onChange={setPaymentMethod} placeholder="Kart / Nakit" />
        <View style={styles.row2}>
          <View style={{ flex: 1 }}>
            <Field
              label="Ödeme alındı tarihi"
              value={paymentReceivedOn}
              onChange={setPaymentReceivedOn}
              placeholder="YYYY-MM-DD"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Kart son 4" value={cardLast4} onChange={setCardLast4} keyboardType="number-pad" />
          </View>
        </View>

        <MetaCount title="İlişkili sipariş" items={relatedOrders} onChange={setRelatedOrders} placeholder="Sipariş no" />
        <MetaCount
          title="İlişkili irsaliyeler"
          items={relatedWaybills}
          onChange={setRelatedWaybills}
          placeholder="İrsaliye no"
        />
        <ExtraFieldsEditor fields={extraFields} onChange={setExtraFields} />

        <View style={styles.linesHead}>
          <Text style={styles.section}>Ürün / Hizmet bilgileri</Text>
          <TouchableOpacity
            onPress={() => setLineItems((p) => [...p, blankPosLine()])}
            hitSlop={8}
          >
            <Text style={styles.link}>Yeni satır ekle</Text>
          </TouchableOpacity>
        </View>

        {lineItems.length === 0 ? (
          <Text style={styles.empty}>Henüz kalem yok — fiş okutun veya satır ekleyin.</Text>
        ) : (
          lineItems.map((line, idx) => (
            <View key={line.id} style={styles.lineCard}>
              <View style={styles.lineTop}>
                <Text style={styles.lineIdx}>{idx + 1}.</Text>
                <TouchableOpacity
                  onPress={() => setLineItems((p) => p.filter((l) => l.id !== line.id))}
                  hitSlop={8}
                >
                  <Ionicons name="trash-outline" size={18} color="#dc2626" />
                </TouchableOpacity>
              </View>
              <Field
                label="Ürün/Hizmet kodu"
                value={line.code}
                onChange={(t) => updateLine(line.id, { code: t })}
              />
              <Field
                label="Ürün/Hizmet adı *"
                value={line.name}
                onChange={(t) => updateLine(line.id, { name: t })}
              />
              <View style={styles.row3}>
                <Mini
                  label="Miktar *"
                  value={line.quantity != null ? String(line.quantity) : ''}
                  onChange={(t) =>
                    updateLine(line.id, { quantity: t ? parseFloat(t.replace(',', '.')) : null })
                  }
                />
                <Mini label="Birim *" value={line.unit ?? ''} onChange={(t) => updateLine(line.id, { unit: t || null })} />
                <Mini
                  label="Birim fiyat"
                  value={line.unitPrice != null ? String(line.unitPrice) : ''}
                  onChange={(t) =>
                    updateLine(line.id, { unitPrice: t ? parseFloat(t.replace(',', '.')) : null })
                  }
                />
              </View>
              <View style={styles.row3}>
                <Mini label="Tutar" value={formatTry(line.amount)} editable={false} />
                <Mini
                  label="İskonto %"
                  value={line.discountRate != null ? String(line.discountRate) : ''}
                  onChange={(t) =>
                    updateLine(line.id, {
                      discountRate: t ? parseFloat(t.replace(',', '.')) : null,
                    })
                  }
                />
                <Mini
                  label="İskonto tutar"
                  value={String(line.discountAmount || '')}
                  onChange={(t) =>
                    updateLine(line.id, {
                      discountAmount: parseFloat(t.replace(',', '.')) || 0,
                      discountRate: null,
                    })
                  }
                />
              </View>
              <View style={styles.row3}>
                <Mini
                  label="KDV %"
                  value={String(line.vatRate)}
                  onChange={(t) =>
                    updateLine(line.id, { vatRate: parseFloat(t.replace(',', '.')) || 0 })
                  }
                />
                <Mini label="KDV tutar" value={formatTry(line.vatAmount)} editable={false} />
                <Mini label="Toplam" value={formatTry(line.total)} editable={false} />
              </View>
            </View>
          ))
        )}

        <Field
          label="KDV istisna / muafiyet sebebi"
          value={kdvExemption}
          onChange={setKdvExemption}
          placeholder="Varsa yazın"
        />
        <Field
          label="Açıklama / Not"
          value={note}
          onChange={setNote}
          placeholder="Açıklamanızı buraya yazabilirsiniz...."
          multiline
        />
        </View>

        <View style={styles.totalsCard}>
          <TotalRow label="Ara toplam (matrah)" value={totals.subtotal} />
          <TotalRow label="Toplam iskonto" value={totals.discountTotal} />
          <TotalRow label="İskontolu matrah" value={totals.discountedSubtotal} />
          <TotalRow label={`KDV %${totals.cutPercent}`} value={totals.cutAmount} />
          <TotalRow label="Fiş tutarı (KDV dahil)" value={totals.payableAmount} bold accent />
          <TotalRow
            label="e-Faturaya yazılacak (KDV hariç)"
            value={totals.invoiceCutAmount}
            bold
            accent
          />
        </View>

        <View style={styles.actions}>
          {onCancel ? (
            <TouchableOpacity style={styles.ghostBtn} onPress={onCancel}>
              <Text style={styles.ghostText}>İptal</Text>
            </TouchableOpacity>
          ) : null}
          {!locked ? (
            <>
              <TouchableOpacity style={styles.saveBtn} onPress={() => void save('draft')} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Taslak kaydet</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.readyBtn} onPress={() => void save('ready')} disabled={saving}>
                <Text style={styles.saveText}>Faturaya hazır</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      </ScrollView>
      <ChatFullscreenImageModal uri={previewUri} onClose={() => setPreviewUri(null)} />
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.area]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        keyboardType={keyboardType}
        multiline={multiline}
      />
    </View>
  );
}

function Mini({
  label,
  value,
  onChange,
  editable = true,
}: {
  label: string;
  value: string;
  onChange?: (t: string) => void;
  editable?: boolean;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.miniLabel}>{label}</Text>
      <TextInput
        style={[styles.miniInput, !editable && styles.miniReadonly]}
        value={value}
        onChangeText={onChange}
        editable={editable}
        keyboardType="decimal-pad"
        placeholderTextColor="#94a3b8"
      />
    </View>
  );
}

function TotalRow({
  label,
  value,
  bold,
  accent,
  negative,
}: {
  label: string;
  value: number;
  bold?: boolean;
  accent?: boolean;
  negative?: boolean;
}) {
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.totalLbl, bold && styles.bold]}>{label}</Text>
      <Text
        style={[
          styles.totalVal,
          bold && styles.bold,
          accent && styles.accent,
          negative && styles.neg,
        ]}
      >
        {negative ? '−' : ''}
        {formatTry(value)} TRY
      </Text>
    </View>
  );
}

function MetaCount({
  title,
  items,
  onChange,
  placeholder,
}: {
  title: string;
  items: PosRelatedRef[];
  onChange: (items: PosRelatedRef[]) => void;
  placeholder: string;
}) {
  return (
    <View style={styles.metaBlock}>
      <View style={styles.metaHead}>
        <Text style={styles.metaTitle}>
          {title} · {items.length}
        </Text>
        <TouchableOpacity
          onPress={() =>
            onChange([...items, { id: `r-${Date.now()}`, label: '' }])
          }
        >
          <Text style={styles.link}>Ekle</Text>
        </TouchableOpacity>
      </View>
      {items.map((it) => (
        <View key={it.id} style={styles.metaRow}>
          <TextInput
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
            value={it.label}
            onChangeText={(t) =>
              onChange(items.map((x) => (x.id === it.id ? { ...x, label: t } : x)))
            }
            placeholder={placeholder}
            placeholderTextColor="#94a3b8"
          />
          <TouchableOpacity onPress={() => onChange(items.filter((x) => x.id !== it.id))} hitSlop={8}>
            <Ionicons name="close" size={18} color="#64748b" />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

function ExtraFieldsEditor({
  fields,
  onChange,
}: {
  fields: PosExtraField[];
  onChange: (f: PosExtraField[]) => void;
}) {
  return (
    <View style={styles.metaBlock}>
      <View style={styles.metaHead}>
        <Text style={styles.metaTitle}>Ek alanlar · {fields.length}</Text>
        <TouchableOpacity
          onPress={() =>
            onChange([...fields, { id: `e-${Date.now()}`, key: '', value: '' }])
          }
        >
          <Text style={styles.link}>Ekle</Text>
        </TouchableOpacity>
      </View>
      {fields.map((f) => (
        <View key={f.id} style={styles.metaRow}>
          <TextInput
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
            value={f.key}
            onChangeText={(t) =>
              onChange(fields.map((x) => (x.id === f.id ? { ...x, key: t } : x)))
            }
            placeholder="Alan adı"
            placeholderTextColor="#94a3b8"
          />
          <TextInput
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
            value={f.value}
            onChangeText={(t) =>
              onChange(fields.map((x) => (x.id === f.id ? { ...x, value: t } : x)))
            }
            placeholder="Değer"
            placeholderTextColor="#94a3b8"
          />
          <TouchableOpacity onPress={() => onChange(fields.filter((x) => x.id !== f.id))} hitSlop={8}>
            <Ionicons name="close" size={18} color="#64748b" />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 16, paddingBottom: 48 },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#0d9488',
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 14,
  },
  scanBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  scanBtnDisabled: { opacity: 0.45 },
  rescanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ecfdf5',
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#99f6e4',
  },
  aiDateBtn: {
    backgroundColor: '#f5f3ff',
    borderColor: '#ddd6fe',
  },
  rescanBtnText: { color: '#0f766e', fontWeight: '700', fontSize: 14 },
  lockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fffbeb',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  lockedText: { flex: 1, color: '#92400e', fontWeight: '700', fontSize: 13 },
  lockedFields: { opacity: 0.72 },
  venueChipDisabled: { opacity: 0.6 },
  previewRow: { marginBottom: 12 },
  previewImg: { width: 88, height: 112, borderRadius: 8, marginRight: 8, backgroundColor: '#e2e8f0' },
  previewPdf: {
    width: 88,
    height: 112,
    borderRadius: 8,
    marginRight: 8,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  warnBox: {
    backgroundColor: '#fff7ed',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  warnText: { color: '#9a3412', fontSize: 13, marginBottom: 2 },
  cutBanner: {
    backgroundColor: '#042f2e',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
  },
  cutLabel: { color: '#99f6e4', fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  cutAmount: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '800',
    marginTop: 8,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
  },
  cutSub: { color: '#5eead4', fontSize: 13, marginTop: 10, lineHeight: 19 },
  cutBannerEmpty: {
    backgroundColor: '#f1f5f9',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cutBannerEmptyText: { color: '#64748b', fontSize: 14, lineHeight: 20 },
  totalReadout: {
    marginTop: -6,
    marginBottom: 10,
    fontSize: 15,
    fontWeight: '800',
    color: '#0f766e',
    fontVariant: ['tabular-nums'],
  },
  venueRow: { flexDirection: 'row', gap: 10, marginBottom: 6 },
  venueChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#99f6e4',
    backgroundColor: '#ecfdf5',
  },
  venueChipOn: { backgroundColor: '#0f766e', borderColor: '#0f766e' },
  venueChipText: { fontWeight: '700', color: '#0f766e', fontSize: 14 },
  venueChipTextOn: { color: '#fff' },
  venueHint: { color: '#64748b', fontSize: 12, marginBottom: 14 },
  section: {
    fontSize: 16,
    fontWeight: '700',
    color: adminTheme.colors.text,
    marginBottom: 10,
    marginTop: 8,
  },
  field: { marginBottom: 10 },
  label: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.textMuted, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: adminTheme.colors.text,
    backgroundColor: '#fff',
    marginBottom: 0,
  },
  area: { minHeight: 72, textAlignVertical: 'top' },
  row2: { flexDirection: 'row', gap: 10 },
  row3: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  miniLabel: { fontSize: 11, color: '#64748b', marginBottom: 3, fontWeight: '600' },
  miniInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 13,
    backgroundColor: '#fff',
    color: adminTheme.colors.text,
  },
  miniReadonly: { backgroundColor: '#f8fafc', color: '#475569' },
  linesHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  link: { color: '#0d9488', fontWeight: '700', fontSize: 14 },
  empty: { color: '#94a3b8', marginBottom: 12 },
  lineCard: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  lineTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  lineIdx: { fontWeight: '700', color: '#64748b' },
  totalsCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 8,
    marginBottom: 16,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  totalLbl: { color: '#475569', fontSize: 14 },
  totalVal: { color: '#0f172a', fontSize: 14 },
  bold: { fontWeight: '800' },
  accent: { color: '#0d9488' },
  neg: { color: '#dc2626' },
  actions: { gap: 10 },
  saveBtn: {
    backgroundColor: '#0f766e',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  readyBtn: {
    backgroundColor: '#0369a1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  ghostBtn: { alignItems: 'center', paddingVertical: 10 },
  ghostText: { color: '#64748b', fontWeight: '600' },
  metaBlock: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  metaHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  metaTitle: { fontWeight: '700', color: adminTheme.colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
});
