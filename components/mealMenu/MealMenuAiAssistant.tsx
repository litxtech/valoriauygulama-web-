import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { adminTheme } from '@/constants/adminTheme';
import {
  generateMealMenuWithAi,
  countAffectedMealDays,
  mergeGeneratedMealDays,
  type GeneratedMealMenuDay,
  type MealMenuMergeMode,
} from '@/lib/generateMealMenuAi';
import type { MealFields } from '@/lib/mealMenuUi';
import { dayFillStatus } from '@/lib/mealMenuUi';

const QUICK_PROMPTS = [
  'Bu ayın tüm günleri için standart otel menüsü hazırla',
  'Hafta içi her gün aynı kahvaltı, öğle ve akşam menüsü; hafta sonu farklı',
  '15-30 arası günlük değişen çeşitli Türk mutfağı menüsü',
  'Kahvaltı sabit standart, öğle ve akşam her gün farklı',
];

type Props = {
  organizationId: string;
  organizationName?: string | null;
  periodMonth: string;
  editableDates: string[];
  todayYmd: string;
  daysMap: Record<string, MealFields>;
  onApply: (nextMap: Record<string, MealFields>, generatedCount: number) => void;
  onFocusDate?: (ymd: string) => void;
  onEnsureMenu?: () => Promise<boolean>;
};

function hasExistingContent(daysMap: Record<string, MealFields>): boolean {
  return Object.values(daysMap).some((f) => dayFillStatus(f) !== 'empty');
}

export function MealMenuAiAssistant({
  organizationId,
  organizationName,
  periodMonth,
  editableDates,
  todayYmd,
  daysMap,
  onApply,
  onFocusDate,
  onEnsureMenu,
}: Props) {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const buildExistingDays = (): GeneratedMealMenuDay[] =>
    editableDates
      .map((date) => {
        const f = daysMap[date] ?? { breakfast: '', lunch: '', dinner: '' };
        return {
          date,
          breakfast: f.breakfast,
          lunch: f.lunch,
          dinner: f.dinner,
        };
      })
      .filter((d) => d.breakfast.trim() || d.lunch.trim() || d.dinner.trim());

  const applyGenerated = (generated: GeneratedMealMenuDay[], mode: MealMenuMergeMode) => {
    const next = mergeGeneratedMealDays(daysMap, generated, mode);
    onApply(next, generated.length);
    const first = generated[0]?.date?.slice(0, 10);
    if (first && onFocusDate) onFocusDate(first);
    Alert.alert(
      'Menü hazır',
      `${generated.length} gün forma eklendi. Beğenmediğiniz günleri tek tek düzenleyebilirsiniz.`,
    );
  };

  const confirmAndApply = (generated: GeneratedMealMenuDay[]) => {
    const overwriteStats = countAffectedMealDays(daysMap, generated, 'overwrite');
    const hasConflict = overwriteStats.filled > 0 || overwriteStats.partial > 0;

    if (!hasConflict) {
      applyGenerated(generated, 'empty_only');
      return;
    }

    Alert.alert(
      'Mevcut günler var',
      `${overwriteStats.filled} tam dolu, ${overwriteStats.partial} kısmen dolu gün bulundu. Nasıl uygulansın?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sadece boşları doldur',
          onPress: () => applyGenerated(generated, 'empty_only'),
        },
        {
          text: 'Tümünü değiştir',
          style: 'destructive',
          onPress: () => applyGenerated(generated, 'overwrite'),
        },
      ],
    );
  };

  const runGenerate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      Alert.alert(
        'Eksik',
        'Talebinizi yazın. Örn: "20 haziran - 5 temmuz arası standart kahvaltı, öğle ve akşam menüsü hazırla"',
      );
      return;
    }

    const execute = async () => {
      setBusy(true);
      try {
        if (onEnsureMenu) {
          const ok = await onEnsureMenu();
          if (!ok) return;
        }
        const generated = await generateMealMenuWithAi({
          prompt: trimmed,
          organizationId,
          context: {
            periodMonth,
            editableDates,
            todayYmd,
            organizationName: organizationName ?? undefined,
            existingDays: buildExistingDays(),
          },
        });
        confirmAndApply(generated);
      } catch (e) {
        Alert.alert('Hata', e instanceof Error ? e.message : 'Menü oluşturulamadı');
      } finally {
        setBusy(false);
      }
    };

    if (hasExistingContent(daysMap)) {
      Alert.alert(
        'Mevcut menü var',
        'AI yeni günler üretecek. Dolu günler için uygulama seçeneği sorulacak.',
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
        <LinearGradient
          colors={['#f59e0b', '#ea580c']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconBadge}
        >
          <Ionicons name="sparkles" size={16} color="#fff" />
        </LinearGradient>
        <View style={styles.headTextWrap}>
          <Text style={styles.headTitle}>AI ile menü hazırla</Text>
          <Text style={styles.headSub}>
            Tarih aralığı veya sabit kahvaltı/öğle/akşam kuralları yazın; tüm günleri doldurur
          </Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={adminTheme.colors.textMuted}
        />
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.body}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {QUICK_PROMPTS.map((chip) => (
              <TouchableOpacity
                key={chip}
                style={styles.chip}
                onPress={() => setPrompt(chip)}
                disabled={busy}
                activeOpacity={0.8}
              >
                <Text style={styles.chipText} numberOfLines={2}>{chip}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TextInput
            style={styles.input}
            value={prompt}
            onChangeText={setPrompt}
            multiline
            textAlignVertical="top"
            editable={!busy}
            placeholder={
              'Örn: "18 haziran - 30 haziran arası standart kahvaltı, öğle ve akşam menüsü hazırla" veya "Hafta içi her gün aynı menü, hafta sonu farklı"'
            }
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
                <Ionicons name="restaurant-outline" size={18} color="#fff" />
                <Text style={styles.btnText}>Menüyü hazırla</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.note}>
            AI taslağı mutfak onayı yerine geçmez. Kaydetmeden önce günleri kontrol edin; istemediğiniz günleri tek tek değiştirebilirsiniz.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fed7aa',
    backgroundColor: '#fffbeb',
    overflow: 'hidden',
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headTextWrap: { flex: 1 },
  headTitle: { fontSize: 14, fontWeight: '800', color: adminTheme.colors.text },
  headSub: { marginTop: 2, fontSize: 11, color: adminTheme.colors.textMuted, lineHeight: 16 },
  body: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  chipsRow: { gap: 8, paddingBottom: 4 },
  chip: {
    maxWidth: 220,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#fde68a',
    backgroundColor: '#fff',
  },
  chipText: { fontSize: 12, color: '#92400e', fontWeight: '600', lineHeight: 16 },
  input: {
    minHeight: 72,
    maxHeight: 120,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 12,
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
    backgroundColor: '#c2410c',
    borderRadius: 12,
    paddingVertical: 13,
  },
  btnDisabled: { opacity: 0.55 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  note: { fontSize: 11, color: adminTheme.colors.textMuted, lineHeight: 16 },
});
