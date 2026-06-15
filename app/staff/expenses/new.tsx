import { useState, useEffect, useMemo, type ReactNode } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import { ReceiptPhotoCameraModal } from '@/components/ReceiptPhotoCameraModal';
import { expenseReceiptPreviewStyle } from '@/lib/expenseReceiptPreviewStyles';
import { FastPress } from '@/components/ui/FastPress';
import { usePersonelDesign } from '@/hooks/usePersonelDesign';
import {
  insertStaffExpenseWithRetry,
  isExpenseUploadError,
  prefetchDefaultExpenseCategoryId,
  staffExpenseSaveUserMessage,
  uploadExpenseReceiptWithRetry,
} from '@/lib/staffExpenseSubmit';
import { isSupabaseUnavailableError } from '@/lib/supabaseTransientErrors';

const PAYMENT_TYPES: {
  value: 'cash' | 'credit_card' | 'company_card';
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { value: 'cash', label: 'Nakit', icon: 'cash-outline' },
  { value: 'credit_card', label: 'Kredi kartı', icon: 'card-outline' },
  { value: 'company_card', label: 'Şirket kartı', icon: 'business-outline' },
];

function FormSection({
  title,
  subtitle,
  icon,
  accent,
  children,
  cardStyle,
  titleColor,
  subtitleColor,
}: {
  title: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  children: ReactNode;
  cardStyle: object;
  titleColor: string;
  subtitleColor: string;
}) {
  return (
    <View style={[styles.section, cardStyle]}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIconWrap, { backgroundColor: `${accent}18` }]}>
          <Ionicons name={icon} size={18} color={accent} />
        </View>
        <View style={styles.sectionHeaderText}>
          <Text style={[styles.sectionTitle, { color: titleColor }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.sectionSubtitle, { color: subtitleColor }]}>{subtitle}</Text>
          ) : null}
        </View>
      </View>
      {children}
    </View>
  );
}

export default function NewExpenseScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const palette = usePersonelDesign();
  const [androidKeyboardInset, setAndroidKeyboardInset] = useState(0);
  const { staff } = useAuthStore();
  const [receiptPreviewUri, setReceiptPreviewUri] = useState<string | null>(null);
  const [receiptUploadedUrl, setReceiptUploadedUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveHint, setSaveHint] = useState<string | null>(null);
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expenseTime, setExpenseTime] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  const [amount, setAmount] = useState('');
  const [paymentType, setPaymentType] = useState<'cash' | 'credit_card' | 'company_card'>('cash');
  const [description, setDescription] = useState('');
  const [noReceipt, setNoReceipt] = useState(false);
  const [noReceiptReason, setNoReceiptReason] = useState('');
  const [receiptCameraOpen, setReceiptCameraOpen] = useState(false);

  const cardShell = useMemo(
    () => ({
      backgroundColor: palette.cardBg,
      borderColor: palette.cardBorder,
    }),
    [palette.cardBg, palette.cardBorder]
  );

  const inputShell = useMemo(
    () => ({
      backgroundColor: palette.secondaryBtn === 'transparent' ? theme.colors.backgroundSecondary : palette.secondaryBtn,
      borderColor: palette.cardBorder,
      color: palette.text,
    }),
    [palette]
  );

  const dynamicStyles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: palette.pageBg },
        heroTitle: { fontSize: 22, fontWeight: '800', color: palette.text, textAlign: 'center' },
        heroHint: {
          marginTop: 8,
          fontSize: 14,
          lineHeight: 21,
          color: palette.subtext,
          textAlign: 'center',
          maxWidth: 320,
        },
        sectionTitle: { fontSize: 16, fontWeight: '700', color: palette.text },
        sectionSubtitle: { fontSize: 13, color: palette.subtext, marginTop: 2, lineHeight: 18 },
        fieldLabel: { fontSize: 12, fontWeight: '700', color: palette.subtext, marginBottom: 8, letterSpacing: 0.3 },
        infoBanner: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 10,
          padding: 14,
          borderRadius: 14,
          backgroundColor: `${theme.colors.primary}12`,
          borderWidth: 1,
          borderColor: `${theme.colors.primary}28`,
          marginBottom: 12,
        },
        infoBannerText: { flex: 1, fontSize: 13, lineHeight: 19, color: palette.text, fontWeight: '500' },
        paymentPill: {
          flex: 1,
          minWidth: '30%',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          paddingVertical: 12,
          paddingHorizontal: 8,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: palette.cardBorder,
          backgroundColor: palette.secondaryBtn === 'transparent' ? palette.pageBg : palette.secondaryBtn,
        },
        paymentPillOn: {
          borderColor: theme.colors.primary,
          backgroundColor: `${theme.colors.primary}14`,
        },
        paymentPillText: { fontSize: 12, fontWeight: '600', color: palette.subtext },
        paymentPillTextOn: { color: theme.colors.primary, fontWeight: '700' },
        amountInput: {
          fontSize: 32,
          fontWeight: '800',
          color: palette.text,
          paddingVertical: 4,
        },
        amountSuffix: { fontSize: 22, fontWeight: '700', color: palette.subtext, marginLeft: 4 },
        noteFooter: { fontSize: 12, color: palette.muted, textAlign: 'center', lineHeight: 18, marginTop: 12 },
      }),
    [palette]
  );

  useEffect(() => {
    if (Platform.OS !== 'android') {
      setAndroidKeyboardInset(0);
      return;
    }
    const onShow = Keyboard.addListener('keyboardDidShow', (e) => {
      setAndroidKeyboardInset(Math.max(0, e.endCoordinates?.height ?? 0));
    });
    const onHide = Keyboard.addListener('keyboardDidHide', () => {
      setAndroidKeyboardInset(0);
    });
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  const queueReceiptUpload = (localUri: string) => {
    setReceiptPreviewUri(localUri);
    setReceiptUploadedUrl(null);
    setNoReceipt(false);
    setNoReceiptReason('');
    setUploading(true);
    void (async () => {
      try {
        const url = await uploadExpenseReceiptWithRetry(localUri);
        setReceiptUploadedUrl(url);
        setReceiptPreviewUri(url);
      } catch (e) {
        setSaveHint(
          isSupabaseUnavailableError((e as Error)?.message)
            ? 'Fiş sunucuya yüklenemedi (522). Kayıt sırasında tekrar denenecek veya «Fiş almadım» kullanın.'
            : 'Fiş yüklenemedi. Kaydet’e basınca tekrar denenecek.'
        );
      } finally {
        setUploading(false);
      }
    })();
  };

  const handleReceiptPick = async (source: 'camera' | 'gallery') => {
    if (source === 'camera') {
      const granted = await ensureCameraPermission({
        title: 'Kamera izni',
        message: 'Fiş fotoğrafı çekmek için kamera erişimi gerekiyor.',
        settingsMessage: 'Kamera izni kapalı. Fiş fotoğrafı için ayarlardan izin verin.',
      });
      if (!granted) return;
      setReceiptCameraOpen(true);
      return;
    }

    const granted = await ensureMediaLibraryPermission({
      title: 'Galeri izni',
      message: 'Fiş fotoğrafı seçmek için galeri erişimi istiyoruz.',
      settingsMessage: 'Galeri izni kapalı. Fiş fotoğrafı için ayarlardan izin verin.',
    });
    if (!granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    queueReceiptUpload(result.assets[0].uri);
  };

  const toggleNoReceipt = () => {
    setNoReceipt((prev) => {
      const next = !prev;
      if (next) {
        setReceiptPreviewUri(null);
        setReceiptUploadedUrl(null);
      } else {
        setNoReceiptReason('');
      }
      return next;
    });
  };

  const save = async () => {
    if (!staff?.id) {
      Alert.alert('Hata', 'Oturum gerekli.');
      return;
    }
    const desc = description.trim();
    if (!desc) {
      Alert.alert('Eksik', 'Harcama açıklaması yazınız.');
      return;
    }
    const num = parseFloat(amount.replace(',', '.'));
    if (isNaN(num) || num <= 0) {
      Alert.alert('Hata', 'Geçerli tutar girin.');
      return;
    }
    if (!receiptOk) {
      Alert.alert('Eksik', noReceipt ? 'Fiş alınmama gerekçesini yazın (en az 10 karakter).' : 'Fiş fotoğrafı ekleyin.');
      return;
    }

    setSaving(true);
    setSaveHint('Kaydediliyor…');
    try {
      let receiptUrl: string | null = receiptUploadedUrl;
      if (!noReceipt) {
        if (!receiptUrl && receiptPreviewUri) {
          setSaveHint('Fiş yükleniyor…');
          receiptUrl = await uploadExpenseReceiptWithRetry(receiptPreviewUri);
          setReceiptUploadedUrl(receiptUrl);
          setReceiptPreviewUri(receiptUrl);
        }
        if (!receiptUrl) {
          setSaveHint(
            'Fiş sunucuya yüklenemedi. Wi‑Fi kontrol edin, tekrar deneyin veya «Fiş almadım / fiş kayboldu» ile kaydedin.'
          );
          return;
        }
      }

      setSaveHint('Sunucuya gönderiliyor…');
      await insertStaffExpenseWithRetry({
        staffId: staff.id,
        expenseDate,
        expenseTime,
        amount: num,
        paymentType,
        description: desc,
        receiptImageUrl: noReceipt ? null : receiptUrl,
        noReceipt,
        noReceiptReason: noReceipt ? noReceiptReason.trim() : null,
      });

      setSaveHint(null);
      router.replace('/staff/expenses');
    } catch (e) {
      const msg = staffExpenseSaveUserMessage(e);
      setSaveHint(msg);
      const showAlert =
        !isSupabaseUnavailableError((e as Error)?.message) ||
        !isExpenseUploadError(e);
      if (showAlert) {
        Alert.alert('Kayıt olmadı', msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const receiptOk =
    noReceipt && noReceiptReason.trim().length >= 10
      ? true
      : !!(receiptUploadedUrl || receiptPreviewUri);
  const canSubmit =
    receiptOk &&
    description.trim().length > 0 &&
    parseFloat(amount.replace(',', '.')) > 0 &&
    !(receiptPreviewUri && noReceipt);

  const NO_RECEIPT_REASON_MIN = 10;
  const noReceiptReasonLen = noReceiptReason.trim().length;
  const noReceiptReasonComplete = noReceiptReasonLen >= NO_RECEIPT_REASON_MIN;

  const contentPaddingBottom =
    Math.max(insets.bottom, 16) + 32 + (Platform.OS === 'android' ? androidKeyboardInset : 0);

  return (
    <>
    <KeyboardAvoidingView
      style={[styles.container, dynamicStyles.container]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 56 : 0}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: contentPaddingBottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <LinearGradient
              colors={['#d97706', '#f59e0b']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroIconGradient}
            >
              <Ionicons name="wallet-outline" size={28} color="#fff" />
            </LinearGradient>
          </View>
          <Text style={dynamicStyles.heroTitle}>{t('staffExpenseNewTitle')}</Text>
          <Text style={dynamicStyles.heroHint}>
            Fiş, tutar ve harcama açıklamasını yazın. Kayıt admin onayından sonra kesinleşir.
          </Text>
        </View>

        <View style={dynamicStyles.infoBanner}>
          <Ionicons name="information-circle-outline" size={22} color={theme.colors.primary} />
          <Text style={dynamicStyles.infoBannerText}>
            Açıklamada ne için harcama yaptığınızı yazın. Fiş yoksa kutucuğu işaretleyip nedenini belirtin.
          </Text>
        </View>

        <FormSection
          title="Fiş fotoğrafı"
          subtitle={noReceipt ? 'Fiş yok — gerekçe zorunlu' : 'Fiş ekleyin veya alınmadıysa aşağıdaki kutuyu işaretleyin'}
          icon="receipt-outline"
          accent="#d97706"
          cardStyle={cardShell}
          titleColor={palette.text}
          subtitleColor={palette.subtext}
        >
          <FastPress
            style={[
              styles.noReceiptRow,
              {
                borderColor: noReceipt ? theme.colors.primary : palette.cardBorder,
                backgroundColor: noReceipt ? `${theme.colors.primary}10` : palette.pageBg,
              },
            ]}
            onPress={toggleNoReceipt}
          >
            <Ionicons
              name={noReceipt ? 'checkbox' : 'square-outline'}
              size={24}
              color={noReceipt ? theme.colors.primary : palette.subtext}
            />
            <View style={styles.noReceiptRowText}>
              <Text style={[styles.noReceiptTitle, { color: palette.text }]}>Fiş almadım / fiş kayboldu</Text>
              <Text style={[styles.noReceiptHint, { color: palette.subtext }]}>
                Fiş olmadan kayıt için gerekçe yazmanız gerekir
              </Text>
            </View>
          </FastPress>

          {noReceipt ? (
            <View style={{ marginTop: 12 }}>
              <Text
                style={[
                  dynamicStyles.fieldLabel,
                  { color: noReceiptReasonComplete ? palette.subtext : theme.colors.error },
                ]}
              >
                Gerekçe *
              </Text>
              <TextInput
                style={[
                  styles.textArea,
                  inputShell,
                  {
                    borderColor: noReceiptReasonComplete ? palette.cardBorder : theme.colors.error,
                    borderWidth: noReceiptReasonComplete ? 1 : 2,
                  },
                ]}
                value={noReceiptReason}
                onChangeText={setNoReceiptReason}
                placeholder="Örn: Nakit ödeme, kasiyer fiş vermedi / fiş kayboldu"
                placeholderTextColor={palette.muted}
                multiline
                numberOfLines={3}
                blurOnSubmit={false}
              />
              <Text
                style={[
                  styles.charHint,
                  { color: noReceiptReasonComplete ? '#16a34a' : theme.colors.error },
                ]}
              >
                En az {NO_RECEIPT_REASON_MIN} karakter ({noReceiptReasonLen}/{NO_RECEIPT_REASON_MIN})
              </Text>
            </View>
          ) : receiptPreviewUri ? (
            <View style={styles.receiptPreviewWrap}>
              <CachedImage uri={receiptPreviewUri} style={styles.receiptImg} contentFit="cover" />
              <FastPress
                style={styles.receiptRemove}
                onPress={() => {
                  setReceiptPreviewUri(null);
                  setReceiptUploadedUrl(null);
                }}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={30} color={theme.colors.error} />
              </FastPress>
              <View style={styles.receiptOkBadge}>
                <Ionicons
                  name={receiptUploadedUrl ? 'checkmark-circle' : uploading ? 'cloud-upload' : 'time-outline'}
                  size={16}
                  color={receiptUploadedUrl ? '#16a34a' : '#d97706'}
                />
                <Text style={styles.receiptOkText}>
                  {receiptUploadedUrl ? 'Yüklendi' : uploading ? 'Yükleniyor…' : 'Kayıtta yüklenecek'}
                </Text>
              </View>
            </View>
          ) : (
            <View style={[styles.receiptDropzone, { borderColor: palette.cardBorder }]}>
              <Ionicons name="cloud-upload-outline" size={36} color={theme.colors.primary} />
              <Text style={[styles.receiptDropTitle, { color: palette.text }]}>Fiş veya fatura ekle</Text>
              <Text style={[styles.receiptDropHint, { color: palette.subtext }]}>Kamera veya galeriden seçin</Text>
              <View style={styles.receiptActions}>
                <FastPress
                  style={[styles.receiptActionBtn, { backgroundColor: `${theme.colors.primary}14` }]}
                  onPress={() => handleReceiptPick('camera')}
                  disabled={uploading}
                >
                  <Ionicons name="camera-outline" size={20} color={theme.colors.primary} />
                  <Text style={styles.receiptActionText}>Çek</Text>
                </FastPress>
                <FastPress
                  style={[styles.receiptActionBtn, { backgroundColor: `${theme.colors.primary}14` }]}
                  onPress={() => handleReceiptPick('gallery')}
                  disabled={uploading}
                >
                  <Ionicons name="images-outline" size={20} color={theme.colors.primary} />
                  <Text style={styles.receiptActionText}>Galeri</Text>
                </FastPress>
              </View>
              {uploading ? (
                <ActivityIndicator size="small" color={theme.colors.primary} style={styles.uploadSpinner} />
              ) : null}
            </View>
          )}
        </FormSection>

        <FormSection
          title="Tutar"
          subtitle="Harcama tutarını Türk Lirası olarak girin"
          icon="cash-outline"
          accent="#16a34a"
          cardStyle={cardShell}
          titleColor={palette.text}
          subtitleColor={palette.subtext}
        >
          <View style={[styles.amountRow, inputShell]}>
            <TextInput
              style={dynamicStyles.amountInput}
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
              placeholderTextColor={palette.muted}
              keyboardType="decimal-pad"
            />
            <Text style={dynamicStyles.amountSuffix}>₺</Text>
          </View>
        </FormSection>

        <FormSection
          title="Harcama açıklaması"
          subtitle="Zorunlu — ne için harcama yaptığınızı yazın"
          icon="create-outline"
          accent={theme.colors.primary}
          cardStyle={cardShell}
          titleColor={palette.text}
          subtitleColor={palette.subtext}
        >
          <TextInput
            style={[styles.textArea, inputShell]}
            value={description}
            onChangeText={setDescription}
            placeholder="Örn: 204 numaralı oda klima yedek parça"
            placeholderTextColor={palette.muted}
            multiline
            numberOfLines={4}
            blurOnSubmit={false}
          />
        </FormSection>

        <FormSection
          title="Tarih ve ödeme"
          icon="calendar-outline"
          accent="#6366f1"
          cardStyle={cardShell}
          titleColor={palette.text}
          subtitleColor={palette.subtext}
        >
          <View style={styles.row2}>
            <View style={styles.fieldCol}>
              <Text style={dynamicStyles.fieldLabel}>Tarih</Text>
              <View style={[styles.inputWrap, inputShell]}>
                <Ionicons name="calendar-outline" size={18} color={palette.subtext} />
                <TextInput
                  style={[styles.inputInner, { color: palette.text }]}
                  value={expenseDate}
                  onChangeText={setExpenseDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={palette.muted}
                />
              </View>
            </View>
            <View style={styles.fieldCol}>
              <Text style={dynamicStyles.fieldLabel}>Saat</Text>
              <View style={[styles.inputWrap, inputShell]}>
                <Ionicons name="time-outline" size={18} color={palette.subtext} />
                <TextInput
                  style={[styles.inputInner, { color: palette.text }]}
                  value={expenseTime}
                  onChangeText={setExpenseTime}
                  placeholder="14:30"
                  placeholderTextColor={palette.muted}
                />
              </View>
            </View>
          </View>

          <Text style={[dynamicStyles.fieldLabel, { marginTop: 14 }]}>Ödeme türü</Text>
          <View style={styles.paymentRow}>
            {PAYMENT_TYPES.map((p) => {
              const on = paymentType === p.value;
              return (
                <FastPress
                  key={p.value}
                  style={[dynamicStyles.paymentPill, on && dynamicStyles.paymentPillOn]}
                  onPress={() => setPaymentType(p.value)}
                >
                  <Ionicons name={p.icon} size={16} color={on ? theme.colors.primary : palette.subtext} />
                  <Text style={[dynamicStyles.paymentPillText, on && dynamicStyles.paymentPillTextOn]}>{p.label}</Text>
                </FastPress>
              );
            })}
          </View>
        </FormSection>

        <FastPress
          style={[styles.saveOuter, (!canSubmit || saving) && styles.saveDisabled]}
          onPress={save}
          disabled={!canSubmit || saving}
        >
          <LinearGradient
            colors={canSubmit && !saving ? ['#d97706', '#f59e0b'] : ['#9ca3af', '#9ca3af']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.saveGradient}
          >
            {saving ? (
              <>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.saveBtnText}>{saveHint ?? 'Kaydediliyor…'}</Text>
              </>
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={22} color="#fff" />
                <Text style={styles.saveBtnText}>Harcamayı kaydet</Text>
              </>
            )}
          </LinearGradient>
        </FastPress>

        {saveHint && !saving ? (
          <Text style={[dynamicStyles.noteFooter, { color: theme.colors.primary, marginTop: 8 }]}>{saveHint}</Text>
        ) : null}

        <Text style={dynamicStyles.noteFooter}>Onay sonrası harcama geçmişinizde görünür.</Text>
      </ScrollView>
    </KeyboardAvoidingView>

    <ReceiptPhotoCameraModal
      visible={receiptCameraOpen}
      onClose={() => setReceiptCameraOpen(false)}
      onCaptured={(uri) => queueReceiptUpload(uri)}
    />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: 16, flexGrow: 1 },
  hero: { alignItems: 'center', paddingVertical: 8, marginBottom: 4 },
  heroIcon: { marginBottom: 12 },
  heroIconGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    ...theme.shadows.sm,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  sectionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderText: { flex: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  sectionSubtitle: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2, lineHeight: 18 },
  receiptDropzone: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 2,
    borderStyle: 'dashed',
    backgroundColor: `${theme.colors.primary}06`,
  },
  receiptDropTitle: { fontSize: 15, fontWeight: '700', marginTop: 10 },
  receiptDropHint: { fontSize: 12, marginTop: 4, marginBottom: 16 },
  receiptActions: { flexDirection: 'row', gap: 10 },
  receiptActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  receiptActionText: { fontSize: 14, fontWeight: '700', color: theme.colors.primary },
  uploadSpinner: { marginTop: 12 },
  receiptPreviewWrap: {
    alignSelf: 'center',
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  receiptImg: expenseReceiptPreviewStyle,
  receiptRemove: { position: 'absolute', top: 8, right: 8 },
  receiptOkBadge: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  receiptOkText: { fontSize: 11, fontWeight: '700', color: '#16a34a' },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  row2: { flexDirection: 'row', gap: 10 },
  fieldCol: { flex: 1 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
  },
  inputInner: { flex: 1, fontSize: 15, fontWeight: '600' },
  textArea: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 96,
    textAlignVertical: 'top',
  },
  paymentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  saveOuter: { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  saveDisabled: { opacity: 0.65 },
  saveGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  saveBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  noReceiptRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  noReceiptRowText: { flex: 1 },
  noReceiptTitle: { fontSize: 15, fontWeight: '700' },
  noReceiptHint: { fontSize: 12, marginTop: 4, lineHeight: 17 },
  charHint: { fontSize: 11, marginTop: 6 },
});
