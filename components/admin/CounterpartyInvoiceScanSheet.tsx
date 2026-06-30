import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Dimensions,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import { CachedImage } from '@/components/CachedImage';
import { ImageLightboxModal } from '@/components/admin/ImageLightboxModal';
import {
  CounterpartyPickerSheet,
  type CounterpartyPickerItem,
} from '@/components/admin/CounterpartyPickerSheet';
import { chooseInvoiceDocumentSource, type PickedInvoiceDocument } from '@/lib/financeInvoiceDocumentPick';
import { isImageContractUrl } from '@/lib/financeAgreementContract';
import { fmtMoneyTry } from '@/lib/financeLedger';
import type { FinanceCounterpartyType } from '@/lib/financeLedger';
import {
  defaultAgreementMovementKind,
  agreementKindLabels,
} from '@/lib/financeCounterpartyAgreements';
import {
  buildDraftFromScan,
  createDebtFromInvoice,
  scanAndParseInvoiceDocs,
  sourceKindLabel,
} from '@/lib/financeInvoiceImport';
import { sumInvoiceLineItems } from '@/lib/financeInvoiceOcr/parseInvoiceText';
import type { InvoiceLineItem } from '@/lib/financeInvoiceOcr/types';
import { supabase } from '@/lib/supabase';

const SHEET_HEIGHT = Math.round(Dimensions.get('window').height * 0.96);

type Person = {
  id: string;
  organization_id: string;
  name: string;
  party_type: FinanceCounterpartyType;
};

type Props = {
  visible: boolean;
  person: Person | null;
  organizationName?: string | null;
  createdByStaffId?: string | null;
  createdByStaffName?: string | null;
  onClose: () => void;
  onSaved: () => void;
};

type Step = 'pick' | 'scanning' | 'review';

export function CounterpartyInvoiceScanSheet({
  visible,
  person,
  organizationName,
  createdByStaffId,
  createdByStaffName,
  onClose,
  onSaved,
}: Props) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('pick');
  const [sourceUris, setSourceUris] = useState<string[]>([]);
  const [sourceKind, setSourceKind] = useState<string>('—');
  const [previewIndex, setPreviewIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [counterpartyId, setCounterpartyId] = useState<string | null>(null);
  const [counterpartyName, setCounterpartyName] = useState('');
  const [cpPickerOpen, setCpPickerOpen] = useState(false);
  const [cpOptions, setCpOptions] = useState<CounterpartyPickerItem[]>([]);
  const [title, setTitle] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [supplierCompany, setSupplierCompany] = useState('');
  const [supplierTaxId, setSupplierTaxId] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [startedOn, setStartedOn] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<'high' | 'medium' | 'low'>('low');
  const [rawTextOpen, setRawTextOpen] = useState(false);
  const [rawText, setRawText] = useState('');
  const [syncCariName, setSyncCariName] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedPerson = useMemo(() => {
    if (!person) return null;
    if (counterpartyId && counterpartyId !== person.id) {
      const picked = cpOptions.find((c) => c.id === counterpartyId);
      if (picked) return { ...person, id: picked.id, name: picked.name, party_type: picked.party_type };
    }
    return { ...person, name: counterpartyName || person.name };
  }, [person, counterpartyId, counterpartyName, cpOptions]);

  const kindLabels = agreementKindLabels(
    selectedPerson ? defaultAgreementMovementKind(selectedPerson.party_type) : 'expense'
  );

  const reset = useCallback(() => {
    setStep('pick');
    setSourceUris([]);
    setSourceKind('—');
    setPreviewIndex(0);
    setLightboxOpen(false);
    setCounterpartyId(null);
    setCounterpartyName('');
    setTitle('');
    setInvoiceNo('');
    setSupplierCompany('');
    setSupplierTaxId('');
    setBuyerName('');
    setStartedOn('');
    setTargetAmount('');
    setNotes('');
    setLineItems([]);
    setWarnings([]);
    setConfidence('low');
    setRawTextOpen(false);
    setRawText('');
    setSyncCariName(false);
    setSaving(false);
  }, []);

  useEffect(() => {
    if (!visible) {
      reset();
      return;
    }
    if (person) {
      setCounterpartyId(person.id);
      setCounterpartyName(person.name);
    }
  }, [visible, person, reset]);

  useEffect(() => {
    if (!visible || !person?.organization_id) return;
    void supabase
      .from('finance_counterparties')
      .select('id, name, party_type')
      .eq('organization_id', person.organization_id)
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setCpOptions((data as CounterpartyPickerItem[]) ?? []));
  }, [visible, person?.organization_id]);

  const runScan = async (docs: PickedInvoiceDocument[]) => {
    setSourceUris(docs.map((d) => d.uri));
    setPreviewIndex(0);
    setStep('scanning');
    try {
      const scan = await scanAndParseInvoiceDocs(docs);
      const draft = buildDraftFromScan(scan);
      setTitle(draft.title);
      setInvoiceNo(draft.invoiceNo);
      setSupplierCompany(draft.supplierCompany);
      setSupplierTaxId(draft.supplierTaxId);
      setBuyerName(draft.buyerName);
      setStartedOn(draft.startedOn);
      setTargetAmount(draft.targetAmount > 0 ? String(draft.targetAmount) : '');
      setNotes(draft.notes);
      setLineItems(draft.lineItems);
      setWarnings(scan.warnings);
      setConfidence(scan.confidence);
      setRawText(scan.rawText);
      setSourceKind(sourceKindLabel(scan.sourceKind));
      if (draft.supplierCompany && person && draft.supplierCompany !== person.name) {
        setSyncCariName(false);
      }
      setStep('review');
    } catch (e) {
      Alert.alert('Okuma hatası', (e as Error)?.message ?? 'Belge okunamadı.');
      setStep('pick');
    }
  };

  const pickSource = () => {
    chooseInvoiceDocumentSource((docs) => {
      if (docs.length) void runScan(docs);
    });
  };

  const updateLine = (id: string, patch: Partial<InvoiceLineItem>) => {
    setLineItems((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const removeLine = (id: string) => {
    setLineItems((prev) => prev.filter((l) => l.id !== id));
  };

  const addBlankLine = () => {
    setLineItems((prev) => [
      ...prev,
      {
        id: `manual-${Date.now()}`,
        name: '',
        quantity: null,
        unit: null,
        unitPrice: null,
        total: 0,
      },
    ]);
  };

  const recalcTotalFromLines = () => {
    const sum = sumInvoiceLineItems(lineItems.filter((l) => l.name.trim() && l.total > 0));
    if (sum > 0) setTargetAmount(String(sum));
  };

  const rebuildNotes = () => {
    const parts: string[] = [];
    if (buyerName.trim()) parts.push(`Alıcı: ${buyerName.trim()}`);
    if (supplierTaxId.trim()) parts.push(`VKN: ${supplierTaxId.trim()}`);
    if (invoiceNo.trim()) parts.push(`Fatura no: ${invoiceNo.trim()}`);
    const items = lineItems.filter((l) => l.name.trim() && l.total > 0);
    if (items.length) {
      parts.push(items.map((l) => `• ${l.name}: ${l.total.toFixed(2)} TL`).join('\n'));
    }
    setNotes(parts.join('\n\n'));
  };

  const save = async () => {
    if (!selectedPerson || !sourceUris.length) return;
    const amount = parseFloat(targetAmount.replace(',', '.'));
    if (!title.trim()) {
      Alert.alert('Form', 'Borç başlığı girin.');
      return;
    }
    if (!amount || amount <= 0) {
      Alert.alert('Form', 'Geçerli bir toplam tutar girin.');
      return;
    }
    const validLines = lineItems.filter((l) => l.name.trim() && l.total > 0);
    const noteHeader = [
      supplierCompany.trim() ? `Tedarikçi: ${supplierCompany.trim()}` : null,
      buyerName.trim() ? `Alıcı: ${buyerName.trim()}` : null,
      invoiceNo.trim() ? `Fatura no: ${invoiceNo.trim()}` : null,
      supplierTaxId.trim() ? `VKN: ${supplierTaxId.trim()}` : null,
      createdByStaffName?.trim() ? `Kaydı açan: ${createdByStaffName.trim()}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    const fullNotes = [noteHeader, notes.trim()].filter(Boolean).join('\n\n');

    setSaving(true);
    const res = await createDebtFromInvoice({
      organizationId: selectedPerson.organization_id,
      counterpartyId: selectedPerson.id,
      title: title.trim(),
      targetAmount: amount,
      startedOn: startedOn.trim() || undefined,
      notes: fullNotes || undefined,
      lineItems: validLines,
      contractUris: sourceUris,
      createdByStaffId,
      movementKind: defaultAgreementMovementKind(selectedPerson.party_type),
      syncCounterpartyName: syncCariName ? supplierCompany.trim() || counterpartyName.trim() : null,
    });
    setSaving(false);
    if ('error' in res) {
      Alert.alert('Kaydedilemedi', res.error);
      return;
    }
    onSaved();
    onClose();
  };

  const previewUri = sourceUris[previewIndex] ?? null;
  const confidenceLabel =
    confidence === 'high' ? 'Yüksek' : confidence === 'medium' ? 'Orta' : 'Düşük';

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable
            style={[styles.sheet, { maxHeight: SHEET_HEIGHT, paddingBottom: Math.max(insets.bottom, 12) }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.handle} />
            <View style={styles.head}>
              <View style={{ flex: 1 }}>
                <Text style={styles.headTitle}>Fatura oku · {kindLabels.debtOpen.toLowerCase()}</Text>
                <Text style={styles.sub} numberOfLines={1}>
                  Önizleme, düzenleme ve cari seçimi
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={12}>
                <Ionicons name="close" size={24} color={adminTheme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            {step === 'pick' ? (
              <View style={styles.pickBody}>
                <View style={styles.pickHero}>
                  <Ionicons name="scan-outline" size={44} color="#7c3aed" />
                  <Text style={styles.pickTitle}>Herhangi bir belgeden oku</Text>
                  <Text style={styles.pickHint}>
                    Galeriden fotoğraf (birden fazla sayfa), kamera, PDF veya e-Fatura. Okuma sonrası tüm alanları
                    düzenleyebilirsiniz.
                  </Text>
                </View>
                <TouchableOpacity style={styles.pickBtn} onPress={pickSource} activeOpacity={0.88}>
                  <Ionicons name="folder-open-outline" size={22} color="#fff" />
                  <Text style={styles.pickBtnText}>Belge seç</Text>
                </TouchableOpacity>
                <Text style={styles.pickFormats}>
                  JPG · PNG · HEIC · PDF · XML · çoklu sayfa
                </Text>
              </View>
            ) : null}

            {step === 'scanning' ? (
              <View style={styles.scanBody}>
                <ActivityIndicator size="large" color={adminTheme.colors.accent} />
                <Text style={styles.scanText}>Belge okunuyor…</Text>
                <Text style={styles.scanSub}>Fotoğraf OCR · PDF metin · XML</Text>
              </View>
            ) : null}

            {step === 'review' ? (
              <KeyboardAvoidingView
                style={{ flex: 1, minHeight: 240 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              >
                <ScrollView style={styles.reviewScroll} keyboardShouldPersistTaps="handled">
                  <View style={styles.previewSection}>
                    <View style={styles.previewHead}>
                      <Text style={styles.sectionTitle}>Belge önizleme</Text>
                      <View style={styles.kindBadge}>
                        <Text style={styles.kindBadgeText}>{sourceKind}</Text>
                      </View>
                    </View>
                    {previewUri && isImageContractUrl(previewUri) ? (
                      <TouchableOpacity onPress={() => setLightboxOpen(true)} activeOpacity={0.9}>
                        <CachedImage uri={previewUri} style={styles.previewImg} contentFit="contain" />
                        <Text style={styles.previewTap}>Büyütmek için dokunun</Text>
                      </TouchableOpacity>
                    ) : previewUri ? (
                      <View style={styles.pdfBadge}>
                        <Ionicons name="document-outline" size={28} color="#7c3aed" />
                        <Text style={styles.pdfBadgeText}>PDF / dosya eklendi</Text>
                      </View>
                    ) : null}
                    {sourceUris.length > 1 ? (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbRow}>
                        {sourceUris.map((uri, i) => (
                          <TouchableOpacity
                            key={uri}
                            style={[styles.thumb, previewIndex === i && styles.thumbOn]}
                            onPress={() => setPreviewIndex(i)}
                          >
                            {isImageContractUrl(uri) ? (
                              <CachedImage uri={uri} style={styles.thumbImg} contentFit="cover" />
                            ) : (
                              <View style={styles.thumbPdf}>
                                <Ionicons name="document" size={16} color="#7c3aed" />
                              </View>
                            )}
                            <Text style={styles.thumbLbl}>Sayfa {i + 1}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    ) : null}
                    <TouchableOpacity style={styles.changeDocBtn} onPress={pickSource}>
                      <Ionicons name="refresh-outline" size={16} color="#7c3aed" />
                      <Text style={styles.changeDocText}>Belgeyi değiştir</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.metaCard}>
                    <Text style={styles.sectionTitle}>Kim adına?</Text>
                    {organizationName ? (
                      <View style={styles.infoRow}>
                        <Ionicons name="business-outline" size={16} color={adminTheme.colors.textMuted} />
                        <Text style={styles.infoLbl}>İşletme</Text>
                        <Text style={styles.infoVal}>{organizationName}</Text>
                      </View>
                    ) : null}
                    <TouchableOpacity style={styles.cpPickRow} onPress={() => setCpPickerOpen(true)}>
                      <Ionicons name="person-circle-outline" size={20} color="#7c3aed" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cpPickLbl}>Cari (borç kime açılacak)</Text>
                        <TextInput
                          style={styles.cpNameInput}
                          value={counterpartyName}
                          onChangeText={setCounterpartyName}
                          placeholder="Kişi / firma adı"
                        />
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={adminTheme.colors.textMuted} />
                    </TouchableOpacity>
                    {createdByStaffName ? (
                      <View style={styles.infoRow}>
                        <Ionicons name="person-outline" size={16} color={adminTheme.colors.textMuted} />
                        <Text style={styles.infoLbl}>Kaydı açan</Text>
                        <Text style={styles.infoVal}>{createdByStaffName}</Text>
                      </View>
                    ) : null}
                    {supplierCompany.trim() && supplierCompany.trim() !== counterpartyName.trim() ? (
                      <View style={styles.syncRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.syncTitle}>Cari adını faturadaki firma ile güncelle</Text>
                          <Text style={styles.syncSub} numberOfLines={1}>
                            {supplierCompany.trim()}
                          </Text>
                        </View>
                        <Switch
                          value={syncCariName}
                          onValueChange={setSyncCariName}
                          trackColor={{ false: '#cbd5e1', true: '#c4b5fd' }}
                          thumbColor={syncCariName ? '#7c3aed' : '#f8fafc'}
                        />
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.metaCard}>
                    <View style={styles.confRow}>
                      <Text style={styles.sectionTitle}>Fatura bilgileri</Text>
                      <View
                        style={[
                          styles.confPill,
                          confidence === 'high' && styles.confHigh,
                          confidence === 'medium' && styles.confMed,
                          confidence === 'low' && styles.confLow,
                        ]}
                      >
                        <Text style={styles.confPillText}>{confidenceLabel}</Text>
                      </View>
                    </View>
                    {warnings.length > 0 ? (
                      <View style={styles.warnBox}>
                        {warnings.map((w, i) => (
                          <Text key={i} style={styles.warnText}>
                            • {w}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                    <Text style={styles.label}>Tedarikçi / firma (belgeden)</Text>
                    <TextInput
                      style={styles.input}
                      value={supplierCompany}
                      onChangeText={setSupplierCompany}
                      placeholder="Malzemeci, şirket unvanı"
                    />
                    <Text style={styles.label}>Fatura no</Text>
                    <TextInput style={styles.input} value={invoiceNo} onChangeText={setInvoiceNo} placeholder="ABC123" />
                    <Text style={styles.label}>Alıcı / müşteri (belgede)</Text>
                    <TextInput
                      style={styles.input}
                      value={buyerName}
                      onChangeText={setBuyerName}
                      placeholder="Otel / şirket adınız"
                    />
                    <Text style={styles.label}>VKN / vergi no</Text>
                    <TextInput
                      style={styles.input}
                      value={supplierTaxId}
                      onChangeText={setSupplierTaxId}
                      keyboardType="number-pad"
                      placeholder="10 veya 11 hane"
                    />
                    <Text style={styles.label}>Borç başlığı *</Text>
                    <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Kayıt adı" />
                    <Text style={styles.label}>Fatura tarihi</Text>
                    <TextInput
                      style={styles.input}
                      value={startedOn}
                      onChangeText={setStartedOn}
                      placeholder="YYYY-MM-DD"
                    />
                    <Text style={styles.label}>Toplam tutar (TL) *</Text>
                    <View style={styles.totalRow}>
                      <TextInput
                        style={[styles.input, { flex: 1, marginBottom: 0 }]}
                        value={targetAmount}
                        onChangeText={setTargetAmount}
                        keyboardType="decimal-pad"
                        placeholder="0,00"
                      />
                      {lineItems.length > 0 ? (
                        <TouchableOpacity style={styles.sumBtn} onPress={recalcTotalFromLines}>
                          <Text style={styles.sumBtnText}>Kalemlerden</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.metaCard}>
                    <View style={styles.linesHead}>
                      <Text style={styles.sectionTitle}>Malzeme kalemleri ({lineItems.length})</Text>
                      <TouchableOpacity onPress={addBlankLine}>
                        <Text style={styles.linesAdd}>+ Kalem</Text>
                      </TouchableOpacity>
                    </View>
                    {lineItems.length === 0 ? (
                      <Text style={styles.linesEmpty}>Kalem yok — ekleyin veya belgeyi tekrar seçin.</Text>
                    ) : (
                      lineItems.map((line) => (
                        <View key={line.id} style={styles.lineCard}>
                          <TextInput
                            style={styles.lineName}
                            value={line.name}
                            onChangeText={(t) => updateLine(line.id, { name: t })}
                            placeholder="Malzeme adı"
                          />
                          <View style={styles.lineMetaRow}>
                            <TextInput
                              style={styles.lineQty}
                              value={line.quantity != null ? String(line.quantity) : ''}
                              onChangeText={(t) =>
                                updateLine(line.id, { quantity: t ? parseFloat(t.replace(',', '.')) : null })
                              }
                              placeholder="Adet"
                              keyboardType="decimal-pad"
                            />
                            <TextInput
                              style={styles.lineUnit}
                              value={line.unit ?? ''}
                              onChangeText={(t) => updateLine(line.id, { unit: t || null })}
                              placeholder="Birim"
                            />
                            <TextInput
                              style={styles.lineTotal}
                              value={line.total ? String(line.total) : ''}
                              onChangeText={(t) =>
                                updateLine(line.id, { total: parseFloat(t.replace(',', '.')) || 0 })
                              }
                              placeholder="Tutar"
                              keyboardType="decimal-pad"
                            />
                            <TouchableOpacity onPress={() => removeLine(line.id)} hitSlop={8}>
                              <Ionicons name="trash-outline" size={18} color="#dc2626" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))
                    )}
                    {lineItems.length > 0 ? (
                      <Text style={styles.linesSum}>
                        Kalem toplamı:{' '}
                        {fmtMoneyTry(sumInvoiceLineItems(lineItems.filter((l) => l.total > 0)))}
                      </Text>
                    ) : null}
                  </View>

                  <View style={styles.metaCard}>
                    <Text style={styles.label}>Not</Text>
                    <TextInput
                      style={[styles.input, styles.area]}
                      value={notes}
                      onChangeText={setNotes}
                      multiline
                      placeholder="Ek açıklama"
                    />
                    <TouchableOpacity style={styles.rebuildNotesBtn} onPress={rebuildNotes}>
                      <Text style={styles.rebuildNotesText}>Notu fatura bilgilerinden yenile</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.rawToggle} onPress={() => setRawTextOpen((v) => !v)}>
                      <Ionicons
                        name={rawTextOpen ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={adminTheme.colors.textMuted}
                      />
                      <Text style={styles.rawToggleText}>Okunan ham metin</Text>
                    </TouchableOpacity>
                    {rawTextOpen ? (
                      <Text style={styles.rawText} selectable>
                        {rawText.slice(0, 4000) || '—'}
                      </Text>
                    ) : null}
                  </View>
                </ScrollView>

                <TouchableOpacity style={styles.saveBtn} onPress={() => void save()} disabled={saving}>
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={20} color="#fff" />
                      <Text style={styles.saveBtnText}>
                        {kindLabels.debtOpen} ·{' '}
                        {targetAmount ? fmtMoneyTry(parseFloat(targetAmount.replace(',', '.')) || 0) : '—'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </KeyboardAvoidingView>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <ImageLightboxModal
        visible={lightboxOpen}
        uri={previewUri}
        onClose={() => setLightboxOpen(false)}
      />

      <CounterpartyPickerSheet
        visible={cpPickerOpen}
        onClose={() => setCpPickerOpen(false)}
        items={cpOptions}
        selectedId={counterpartyId}
        title="Cari seç"
        allowFreeText={false}
        onSelect={(id) => {
          if (!id) return;
          setCounterpartyId(id);
          const picked = cpOptions.find((c) => c.id === id);
          if (picked) setCounterpartyName(picked.name);
          setCpPickerOpen(false);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: adminTheme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: adminTheme.colors.border,
    marginBottom: 10,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  headTitle: { fontSize: 18, fontWeight: '800', color: adminTheme.colors.text },
  sub: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  pickBody: { paddingVertical: 16, paddingBottom: 28 },
  pickHero: { alignItems: 'center', marginBottom: 20 },
  pickTitle: { fontSize: 17, fontWeight: '800', color: adminTheme.colors.text, marginTop: 10 },
  pickHint: {
    fontSize: 13,
    color: adminTheme.colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 19,
    paddingHorizontal: 8,
  },
  pickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#7c3aed',
    paddingVertical: 16,
    borderRadius: 14,
  },
  pickBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  pickFormats: { textAlign: 'center', fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 10 },
  scanBody: { alignItems: 'center', paddingVertical: 40 },
  scanText: { marginTop: 14, fontSize: 16, fontWeight: '700', color: adminTheme.colors.text },
  scanSub: { marginTop: 6, fontSize: 13, color: adminTheme.colors.textMuted },
  reviewScroll: { maxHeight: SHEET_HEIGHT - 170 },
  previewSection: { marginBottom: 12 },
  previewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: adminTheme.colors.text },
  kindBadge: {
    backgroundColor: '#ede9fe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  kindBadgeText: { fontSize: 10, fontWeight: '800', color: '#5b21b6' },
  previewImg: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  previewTap: { textAlign: 'center', fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 4 },
  pdfBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
    borderRadius: 12,
    backgroundColor: '#f5f3ff',
    borderWidth: 1,
    borderColor: '#ddd6fe',
  },
  pdfBadgeText: { fontSize: 14, fontWeight: '700', color: '#5b21b6' },
  thumbRow: { marginTop: 10, maxHeight: 88 },
  thumb: {
    width: 64,
    marginRight: 8,
    alignItems: 'center',
    padding: 4,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbOn: { borderColor: '#7c3aed', backgroundColor: '#f5f3ff' },
  thumbImg: { width: 52, height: 52, borderRadius: 8 },
  thumbPdf: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: '#ede9fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbLbl: { fontSize: 9, fontWeight: '700', color: adminTheme.colors.textMuted, marginTop: 2 },
  changeDocBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 8,
  },
  changeDocText: { fontSize: 13, fontWeight: '700', color: '#7c3aed' },
  metaCard: {
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  infoLbl: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.textMuted, minWidth: 72 },
  infoVal: { flex: 1, fontSize: 13, fontWeight: '600', color: adminTheme.colors.text },
  cpPickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
    paddingVertical: 4,
  },
  cpPickLbl: { fontSize: 11, fontWeight: '700', color: adminTheme.colors.textMuted, marginBottom: 4 },
  cpNameInput: {
    fontSize: 16,
    fontWeight: '700',
    color: adminTheme.colors.text,
    paddingVertical: 4,
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: adminTheme.colors.border,
  },
  syncTitle: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.text },
  syncSub: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 2 },
  confRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  confPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  confHigh: { backgroundColor: '#dcfce7' },
  confMed: { backgroundColor: '#fef9c3' },
  confLow: { backgroundColor: '#fee2e2' },
  confPillText: { fontSize: 10, fontWeight: '800', color: adminTheme.colors.text },
  warnBox: {
    backgroundColor: '#fffbeb',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  warnText: { fontSize: 12, color: '#b45309', lineHeight: 17 },
  label: { fontSize: 11, fontWeight: '700', color: adminTheme.colors.textMuted, marginBottom: 5, marginTop: 2 },
  input: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 10,
    padding: 11,
    fontSize: 14,
    color: adminTheme.colors.text,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    marginBottom: 8,
  },
  area: { minHeight: 72, textAlignVertical: 'top' },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  sumBtn: { backgroundColor: '#ede9fe', paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10 },
  sumBtnText: { fontSize: 11, fontWeight: '700', color: '#5b21b6' },
  linesHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  linesAdd: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.primary },
  linesEmpty: { fontSize: 12, color: adminTheme.colors.textMuted, fontStyle: 'italic', marginVertical: 6 },
  lineCard: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  lineName: {
    fontSize: 14,
    fontWeight: '600',
    color: adminTheme.colors.text,
    marginBottom: 8,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  lineMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lineQty: {
    flex: 1,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderRadius: 8,
    padding: 8,
    fontSize: 13,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  lineUnit: {
    width: 52,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderRadius: 8,
    padding: 8,
    fontSize: 13,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  lineTotal: {
    flex: 1.2,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderRadius: 8,
    padding: 8,
    fontSize: 13,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  linesSum: { fontSize: 12, fontWeight: '700', color: '#7c3aed', marginTop: 8 },
  rebuildNotesBtn: { alignSelf: 'flex-start', marginTop: 4, marginBottom: 8 },
  rebuildNotesText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.primary },
  rawToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  rawToggleText: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.textMuted },
  rawText: {
    fontSize: 11,
    color: adminTheme.colors.textSecondary,
    lineHeight: 16,
    backgroundColor: adminTheme.colors.surface,
    padding: 10,
    borderRadius: 8,
    maxHeight: 160,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#7c3aed',
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 6,
  },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
