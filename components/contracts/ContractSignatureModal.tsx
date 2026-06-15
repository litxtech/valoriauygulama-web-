import { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, Modal, Pressable } from 'react-native';
import SignatureCanvas from 'react-native-signature-canvas';
import { adminTheme } from '@/constants/adminTheme';
import type { SignatureMethod } from '@/lib/managedContracts/constants';
import { SIGNATURE_METHODS } from '@/lib/managedContracts/constants';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (result: { method: SignatureMethod; data: string; signerName: string; signerTitle?: string }) => void;
  defaultSignerName?: string;
  defaultSignerTitle?: string;
};

const webStyle = `.m-signature-pad { box-shadow: none; border: 1px solid #cbd5e1; border-radius: 8px; }
  .m-signature-pad--body { border: none; }
  .m-signature-pad--footer { display: none; }`;

export function ContractSignatureModal({ visible, onClose, onSubmit, defaultSignerName = '', defaultSignerTitle = '' }: Props) {
  const ref = useRef<SignatureCanvas>(null);
  const [method, setMethod] = useState<SignatureMethod>('draw');
  const [signerName, setSignerName] = useState(defaultSignerName);
  const [signerTitle, setSignerTitle] = useState(defaultSignerTitle);
  const [typedName, setTypedName] = useState('');

  const reset = () => {
    setMethod('draw');
    setSignerName(defaultSignerName);
    setSignerTitle(defaultSignerTitle);
    setTypedName('');
    ref.current?.clearSignature();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const confirmTyped = () => {
    const name = signerName.trim() || typedName.trim();
    if (!name) {
      Alert.alert('Eksik', 'İmzalayan adı girin.');
      return;
    }
    onSubmit({ method: 'typed_name', data: typedName.trim() || name, signerName: name, signerTitle: signerTitle.trim() || undefined });
    handleClose();
  };

  const confirmSms = () => {
    const name = signerName.trim();
    if (!name) {
      Alert.alert('Eksik', 'İmzalayan adı girin.');
      return;
    }
    Alert.alert(
      'SMS doğrulama',
      'SMS doğrulama entegrasyonu yakında eklenecek. Şimdilik onay kaydı oluşturulacak.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Onayla',
          onPress: () => {
            onSubmit({
              method: 'sms',
              data: `sms-pending:${Date.now()}`,
              signerName: name,
              signerTitle: signerTitle.trim() || undefined,
            });
            handleClose();
          },
        },
      ],
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>İmza</Text>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Text style={styles.close}>Kapat</Text>
          </Pressable>
        </View>

        <View style={styles.methodRow}>
          {SIGNATURE_METHODS.map((m) => (
            <TouchableOpacity
              key={m.value}
              style={[styles.methodChip, method === m.value && styles.methodChipActive]}
              onPress={() => setMethod(m.value)}
            >
              <Text style={[styles.methodChipText, method === m.value && styles.methodChipTextActive]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput
          style={styles.input}
          placeholder="İmzalayan ad soyad"
          value={signerName}
          onChangeText={setSignerName}
          placeholderTextColor={adminTheme.colors.textMuted}
        />
        <TextInput
          style={styles.input}
          placeholder="Ünvan (isteğe bağlı)"
          value={signerTitle}
          onChangeText={setSignerTitle}
          placeholderTextColor={adminTheme.colors.textMuted}
        />

        {method === 'draw' ? (
          <View style={styles.canvasWrap}>
            <SignatureCanvas
              ref={ref}
              onOK={(sig) => {
                const name = signerName.trim();
                if (!name) {
                  Alert.alert('Eksik', 'İmzalayan adı girin.');
                  return;
                }
                onSubmit({ method: 'draw', data: sig, signerName: name, signerTitle: signerTitle.trim() || undefined });
                handleClose();
              }}
              onEmpty={() => Alert.alert('Eksik', 'Lütfen imza çizin.')}
              descriptionText=""
              clearText="Temizle"
              confirmText="Kaydet"
              webStyle={webStyle}
              backgroundColor="#fff"
              penColor="#0f172a"
            />
          </View>
        ) : null}

        {method === 'typed_name' ? (
          <>
            <TextInput
              style={[styles.input, styles.typedInput]}
              placeholder="İmza olarak görünecek isim"
              value={typedName}
              onChangeText={setTypedName}
              placeholderTextColor={adminTheme.colors.textMuted}
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={confirmTyped}>
              <Text style={styles.primaryBtnText}>İsim ile imzala</Text>
            </TouchableOpacity>
          </>
        ) : null}

        {method === 'sms' ? (
          <TouchableOpacity style={styles.primaryBtn} onPress={confirmSms}>
            <Text style={styles.primaryBtnText}>SMS ile doğrula</Text>
          </TouchableOpacity>
        ) : null}

        {method === 'pdf_upload' ? (
          <Text style={styles.hint}>PDF imzalama: sözleşme detayından PDF indirip imzalı kopyayı ek dosya olarak yükleyin.</Text>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary, padding: 16, paddingTop: 48 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '800', color: adminTheme.colors.text },
  close: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.primary },
  methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  methodChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  methodChipActive: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  methodChipText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textSecondary },
  methodChipTextActive: { color: '#fff' },
  input: {
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: adminTheme.colors.text,
    marginBottom: 10,
  },
  typedInput: { fontStyle: 'italic', fontSize: 22 },
  canvasWrap: { flex: 1, minHeight: 220, marginTop: 8, borderRadius: 10, overflow: 'hidden' },
  primaryBtn: {
    backgroundColor: adminTheme.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  hint: { marginTop: 12, fontSize: 13, color: adminTheme.colors.textMuted, lineHeight: 20 },
});
