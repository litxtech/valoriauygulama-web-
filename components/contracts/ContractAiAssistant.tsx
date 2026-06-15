import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { adminTheme } from '@/constants/adminTheme';
import type { ManagedContractType } from '@/lib/managedContracts/constants';
import type { PartyFormState } from '@/components/contracts/PartyFormFields';
import {
  generateManagedContractWithAi,
  mergePartyForm,
  type GeneratedManagedContract,
} from '@/lib/generateManagedContractAi';

type Props = {
  organizationId: string;
  organizationName?: string;
  contractType: ManagedContractType;
  title: string;
  startDate: string;
  endDate: string;
  bodyText: string;
  specialClauses: string;
  party1: PartyFormState;
  party2: PartyFormState;
  onApply: (result: {
    title: string;
    contractType: ManagedContractType;
    startDate: string;
    endDate: string;
    bodyText: string;
    specialClauses: string;
    party1: PartyFormState;
    party2: PartyFormState;
  }) => void;
};

function hasExistingDraft(bodyText: string, title: string): boolean {
  return bodyText.trim().length > 80 || title.trim().length > 0;
}

function applyGenerated(
  generated: GeneratedManagedContract,
  current: {
    contractType: ManagedContractType;
    title: string;
    startDate: string;
    endDate: string;
    bodyText: string;
    specialClauses: string;
    party1: PartyFormState;
    party2: PartyFormState;
  },
) {
  return {
    title: generated.title?.trim() || current.title,
    contractType: generated.contractType ?? current.contractType,
    startDate: generated.startDate ?? current.startDate,
    endDate: generated.endDate ?? current.endDate,
    bodyText: generated.bodyText?.trim() || current.bodyText,
    specialClauses:
      generated.specialClauses === null
        ? ''
        : generated.specialClauses?.trim() || current.specialClauses,
    party1: mergePartyForm(current.party1, generated.party1),
    party2: mergePartyForm(current.party2, generated.party2),
  };
}

export function ContractAiAssistant({
  organizationId,
  organizationName,
  contractType,
  title,
  startDate,
  endDate,
  bodyText,
  specialClauses,
  party1,
  party2,
  onApply,
}: Props) {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const runGenerate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      Alert.alert('Eksik', 'Sözleşme talebinizi yazın. Örn: "Mutfak işletme sözleşmesi hazırla, 2 yıl, aylık 40.000 TL"');
      return;
    }

    const execute = async () => {
      setBusy(true);
      try {
        const generated = await generateManagedContractWithAi({
          prompt: trimmed,
          organizationId,
          contractType,
          context: {
            title,
            startDate,
            endDate,
            bodyText,
            specialClauses,
            party1,
            party2,
            organizationName,
          },
        });
        onApply(
          applyGenerated(generated, {
            contractType,
            title,
            startDate,
            endDate,
            bodyText,
            specialClauses,
            party1,
            party2,
          }),
        );
        Alert.alert('Hazır', 'DeepSeek sözleşme taslağını forma ekledi. Kontrol edip düzenleyebilirsiniz.');
      } catch (e) {
        Alert.alert('Hata', e instanceof Error ? e.message : 'Sözleşme oluşturulamadı');
      } finally {
        setBusy(false);
      }
    };

    if (hasExistingDraft(bodyText, title)) {
      Alert.alert(
        'Mevcut metin değişecek',
        'AI yeni bir taslak üretecek. Başlık, metin ve ilgili alanlar güncellenebilir. Devam edilsin mi?',
        [
          { text: 'Vazgeç', style: 'cancel' },
          { text: 'Hazırla', onPress: () => void execute() },
        ],
      );
      return;
    }

    await execute();
  };

  return (
    <View style={styles.wrap}>
      <TouchableOpacity style={styles.headRow} onPress={() => setExpanded((v) => !v)} activeOpacity={0.85}>
        <LinearGradient colors={['#667eea', '#764ba2']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.iconBadge}>
          <Ionicons name="sparkles" size={16} color="#fff" />
        </LinearGradient>
        <View style={styles.headTextWrap}>
          <Text style={styles.headTitle}>DeepSeek ile sözleşme hazırla</Text>
          <Text style={styles.headSub}>Talebinizi yazın; AI taslağı forma doldursun</Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={adminTheme.colors.textMuted} />
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.body}>
          <TextInput
            style={styles.input}
            value={prompt}
            onChangeText={setPrompt}
            multiline
            textAlignVertical="top"
            editable={!busy}
            placeholder={'Örn: "Mutfak işletme sözleşmesi olacak, Taraf 2 ABC Gıda Ltd, 2 yıl, aylık 45.000 TL, hijyen maddeleri sıkı olsun — sen hazırla"'}
            placeholderTextColor={adminTheme.colors.textMuted}
          />
          <TouchableOpacity
            style={[styles.btn, (busy || !prompt.trim()) && styles.btnDisabled]}
            onPress={() => void runGenerate()}
            disabled={busy || !prompt.trim()}
            activeOpacity={0.9}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="document-text-outline" size={18} color="#fff" />
                <Text style={styles.btnText}>Sözleşmeyi hazırla</Text>
              </>
            )}
          </TouchableOpacity>
          <Text style={styles.note}>
            AI taslağı hukuki danışmanlık yerine geçmez. Kaydetmeden önce metni kontrol edin.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#c7d2fe',
    backgroundColor: '#f5f3ff',
    overflow: 'hidden',
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headTextWrap: { flex: 1 },
  headTitle: { fontSize: 15, fontWeight: '800', color: adminTheme.colors.text },
  headSub: { marginTop: 2, fontSize: 12, color: adminTheme.colors.textMuted, lineHeight: 17 },
  body: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  input: {
    minHeight: 96,
    maxHeight: 160,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: 20,
    color: adminTheme.colors.text,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#5b21b6',
    borderRadius: 10,
    paddingVertical: 12,
  },
  btnDisabled: { opacity: 0.55 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  note: { fontSize: 11, color: adminTheme.colors.textMuted, lineHeight: 16 },
});
