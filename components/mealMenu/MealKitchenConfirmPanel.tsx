import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { MealKitchenConfirmation } from '@/lib/staffMealMenu';
import { formatTrFullDayLabelFromYmd } from '@/lib/mealMenuDate';

type Props = {
  ymd: string;
  existing: MealKitchenConfirmation | null;
  canSubmit: boolean;
  saving: boolean;
  onSubmit: (payload: { prepared: boolean; samples: boolean; preserved: boolean; note: string }) => void;
  palette: { primary: string; border: string; text: string; muted: string; surface: string };
};

function CheckRow({
  label,
  value,
  onToggle,
  disabled,
}: {
  label: string;
  value: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.checkRow}
      onPress={onToggle}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Ionicons name={value ? 'checkbox' : 'square-outline'} size={24} color={value ? '#16a34a' : '#94a3b8'} />
      <Text style={styles.checkLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

export function MealKitchenConfirmPanel({ ymd, existing, canSubmit, saving, onSubmit, palette }: Props) {
  const { t } = useTranslation();
  const [prepared, setPrepared] = useState(existing?.prepared_meals ?? false);
  const [samples, setSamples] = useState(existing?.took_samples ?? false);
  const [preserved, setPreserved] = useState(existing?.preserved_samples ?? false);
  const [note, setNote] = useState(existing?.note ?? '');

  const allChecked = prepared && samples && preserved;
  const readOnly = !canSubmit;
  const confirmedName = existing?.confirmed_by?.full_name?.trim();

  const handleSubmit = () => {
    if (!allChecked) {
      Alert.alert(t('staffMealKitchenConfirmTitle'), t('staffMealKitchenConfirmNeedAll'));
      return;
    }
    onSubmit({ prepared, samples, preserved, note });
  };

  return (
    <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <View style={styles.head}>
        <Ionicons name="checkmark-done-circle-outline" size={22} color={palette.primary} />
        <View style={styles.headText}>
          <Text style={[styles.title, { color: palette.text }]}>{t('staffMealKitchenConfirmTitle')}</Text>
          <Text style={[styles.sub, { color: palette.muted }]}>{formatTrFullDayLabelFromYmd(ymd)}</Text>
        </View>
        {existing ? (
          <View style={styles.badgeOk}>
            <Text style={styles.badgeOkText}>{t('staffMealKitchenConfirmed')}</Text>
          </View>
        ) : null}
      </View>

      {existing && confirmedName ? (
        <Text style={[styles.byline, { color: palette.muted }]}>
          {t('staffMealKitchenConfirmedBy', { name: confirmedName })}
        </Text>
      ) : null}

      <CheckRow
        label={t('staffMealKitchenCheckPrepared')}
        value={prepared}
        onToggle={() => !readOnly && setPrepared((v) => !v)}
        disabled={readOnly}
      />
      <CheckRow
        label={t('staffMealKitchenCheckSamples')}
        value={samples}
        onToggle={() => !readOnly && setSamples((v) => !v)}
        disabled={readOnly}
      />
      <CheckRow
        label={t('staffMealKitchenCheckPreserved')}
        value={preserved}
        onToggle={() => !readOnly && setPreserved((v) => !v)}
        disabled={readOnly}
      />

      {canSubmit ? (
        <>
          <TextInput
            style={[styles.note, { borderColor: palette.border, color: palette.text }]}
            placeholder={t('staffMealKitchenNotePh')}
            placeholderTextColor={palette.muted}
            value={note}
            onChangeText={setNote}
            multiline
          />
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: palette.primary }, (!allChecked || saving) && styles.btnDisabled]}
            onPress={handleSubmit}
            disabled={!allChecked || saving}
            activeOpacity={0.88}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>
                {existing ? t('staffMealKitchenUpdate') : t('staffMealKitchenSubmit')}
              </Text>
            )}
          </TouchableOpacity>
        </>
      ) : (
        <Text style={[styles.readonlyHint, { color: palette.muted }]}>{t('staffMealKitchenReadonly')}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  headText: { flex: 1 },
  title: { fontSize: 16, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 2 },
  badgeOk: { backgroundColor: '#dcfce7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeOkText: { color: '#166534', fontSize: 11, fontWeight: '700' },
  byline: { fontSize: 12, marginBottom: 10 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  checkLabel: { flex: 1, fontSize: 15, color: '#0f172a', lineHeight: 22 },
  note: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    minHeight: 56,
    fontSize: 14,
    marginTop: 4,
    marginBottom: 10,
    textAlignVertical: 'top',
  },
  btn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnDisabled: { opacity: 0.55 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  readonlyHint: { fontSize: 12, lineHeight: 18, marginTop: 4 },
});
