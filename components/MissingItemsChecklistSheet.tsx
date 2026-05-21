import { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { theme } from '@/constants/theme';
import { getMissingAreaMeta, getMissingCatalog, type MissingItemArea } from '@/lib/missingItemsCatalog';
import type { CreateMissingReportItem, MissingItemPriority } from '@/lib/missingItems';

type Props = {
  visible: boolean;
  area: MissingItemArea;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    items: CreateMissingReportItem[];
    note?: string;
    priority: MissingItemPriority;
  }) => void;
};

const MAX_WRITTEN_ITEMS = 30;
const MAX_ITEM_LEN = 100;

function splitDraftLines(text: string): string[] {
  return text
    .split(/\n|,|;/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function MissingItemsChecklistSheet({ visible, area, saving, onClose, onSubmit }: Props) {
  const { t, i18n } = useTranslation();
  const meta = getMissingAreaMeta(area);
  const catalog = useMemo(() => getMissingCatalog(area), [area, i18n.language]);
  const priorityOptions = useMemo(
    (): { value: MissingItemPriority; label: string }[] => [
      { value: 'low', label: t('missingItemsPriorityLow') },
      { value: 'medium', label: t('missingItemsPriorityMedium') },
      { value: 'high', label: t('missingItemsPriorityHigh') },
    ],
    [t, i18n.language]
  );
  const [writtenItems, setWrittenItems] = useState<string[]>([]);
  const [draftText, setDraftText] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [note, setNote] = useState('');
  const [priority, setPriority] = useState<MissingItemPriority>('medium');
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(catalog.map((c) => [c.id, false]))
  );

  const catalogCount = useMemo(() => Object.values(selected).filter(Boolean).length, [selected]);

  const totalCount = writtenItems.length + catalogCount;

  const toggle = (key: string) => {
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const addFromDraft = () => {
    const parts = splitDraftLines(draftText);
    if (parts.length === 0) return;
    setWrittenItems((prev) => {
      const next = [...prev];
      for (const p of parts) {
        if (next.length >= MAX_WRITTEN_ITEMS) break;
        const line = p.slice(0, MAX_ITEM_LEN);
        if (!next.some((x) => x.toLowerCase() === line.toLowerCase())) {
          next.push(line);
        }
      }
      return next;
    });
    setDraftText('');
  };

  const buildItems = (): CreateMissingReportItem[] => {
    const items: CreateMissingReportItem[] = writtenItems.map((label) => ({ label }));
    for (const cat of catalog) {
      for (const item of cat.items) {
        if (selected[item.key]) {
          const exists = items.some((i) => i.label.toLowerCase() === item.label.toLowerCase());
          if (!exists) items.push({ key: item.key, label: item.label });
        }
      }
    }
    return items;
  };

  const handleSubmit = () => {
    const items = buildItems();
    if (items.length === 0) return;
    onSubmit({ items, note: note.trim() || undefined, priority });
  };

  const resetAndClose = () => {
    setWrittenItems([]);
    setDraftText('');
    setSelected({});
    setCatalogOpen(false);
    setNote('');
    setPriority('medium');
    onClose();
  };

  const removeWritten = (index: number) => {
    setWrittenItems((prev) => prev.filter((_, i) => i !== index));
  };

  const catalogToggleLabel =
    catalogCount > 0
      ? `${t('missingItemsCatalogToggle')} ${t('missingItemsCatalogToggleCount', { count: catalogCount })}`
      : `${t('missingItemsCatalogToggle')} ${t('missingItemsCatalogOptional')}`;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={resetAndClose}>
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.topRow}>
          <View style={[styles.areaBadge, { backgroundColor: meta.color + '22' }]}>
            <Ionicons name={meta.icon as keyof typeof Ionicons.glyphMap} size={22} color={meta.color} />
          </View>
          <View style={styles.topText}>
            <Text style={styles.title}>{t('missingItemsSheetTitle', { area: meta.title })}</Text>
            <Text style={styles.subtitle}>{t('missingItemsSheetSub')}</Text>
          </View>
          <TouchableOpacity onPress={resetAndClose} hitSlop={12}>
            <Ionicons name="close" size={26} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={styles.counterBar}>
          <Text style={styles.counterText}>
            {totalCount > 0
              ? t('missingItemsCounterAdded', { count: totalCount })
              : t('missingItemsCounterEmpty')}
          </Text>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={[styles.writeCard, { borderColor: meta.color + '55' }]}>
            <View style={styles.writeCardHeader}>
              <Ionicons name="create-outline" size={20} color={meta.color} />
              <Text style={styles.writeCardTitle}>{t('missingItemsWriteAdd')}</Text>
            </View>
            <Text style={styles.writeHint}>{t('missingItemsWriteHint')}</Text>
            <TextInput
              value={draftText}
              onChangeText={setDraftText}
              placeholder={t('missingItemsWritePlaceholder')}
              style={[styles.input, styles.writeInput]}
              multiline
              maxLength={400}
              onSubmitEditing={addFromDraft}
              blurOnSubmit={false}
            />
            <TouchableOpacity
              style={[styles.addLineBtn, { backgroundColor: meta.color }, !draftText.trim() && styles.addLineBtnDisabled]}
              onPress={addFromDraft}
              disabled={!draftText.trim()}
            >
              <Ionicons name="add-circle-outline" size={20} color="#fff" />
              <Text style={styles.addLineBtnText}>{t('missingItemsAddToList')}</Text>
            </TouchableOpacity>

            {writtenItems.length > 0 ? (
              <View style={styles.writtenList}>
                {writtenItems.map((label, index) => (
                  <View key={`${index}-${label}`} style={styles.writtenChip}>
                    <Text style={styles.writtenChipText} numberOfLines={2}>
                      {label}
                    </Text>
                    <TouchableOpacity onPress={() => removeWritten(index)} hitSlop={8}>
                      <Ionicons name="close-circle" size={20} color={theme.colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.writeEmpty}>{t('missingItemsNoWrittenYet')}</Text>
            )}
          </View>

          <Pressable style={styles.catalogToggle} onPress={() => setCatalogOpen((v) => !v)}>
            <Ionicons name="list-outline" size={18} color={theme.colors.textSecondary} />
            <Text style={styles.catalogToggleText}>{catalogToggleLabel}</Text>
            <Ionicons name={catalogOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textMuted} />
          </Pressable>

          {catalogOpen
            ? catalog.map((cat) => {
                const open = expandedCats[cat.id] === true;
                const catSelected = cat.items.filter((i) => selected[i.key]).length;
                return (
                  <View key={cat.id} style={styles.category}>
                    <Pressable
                      style={styles.categoryHeader}
                      onPress={() => setExpandedCats((p) => ({ ...p, [cat.id]: !open }))}
                    >
                      <Ionicons name={cat.icon as keyof typeof Ionicons.glyphMap} size={18} color={meta.color} />
                      <Text style={styles.categoryTitle}>{cat.title}</Text>
                      {catSelected > 0 ? (
                        <View style={[styles.catCount, { backgroundColor: meta.color }]}>
                          <Text style={styles.catCountText}>{catSelected}</Text>
                        </View>
                      ) : null}
                      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textMuted} />
                    </Pressable>
                    {open
                      ? cat.items.map((item) => {
                          const on = !!selected[item.key];
                          return (
                            <TouchableOpacity
                              key={item.key}
                              style={[styles.checkRow, on && styles.checkRowOn]}
                              onPress={() => toggle(item.key)}
                              activeOpacity={0.7}
                            >
                              <View style={[styles.checkbox, on && { borderColor: meta.color, backgroundColor: meta.color }]}>
                                {on ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                              </View>
                              <Text style={[styles.checkLabel, on && styles.checkLabelOn]}>{item.label}</Text>
                            </TouchableOpacity>
                          );
                        })
                      : null}
                  </View>
                );
              })
            : null}

          <Text style={styles.sectionLabel}>{t('missingItemsNoteOptional')}</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={t('missingItemsNotePlaceholder')}
            style={[styles.input, styles.textarea]}
            multiline
            maxLength={300}
          />

          <Text style={styles.sectionLabel}>{t('missingItemsPriorityLabel')}</Text>
          <View style={styles.priorityRow}>
            {priorityOptions.map((p) => (
              <TouchableOpacity
                key={p.value}
                style={[styles.priorityChip, priority === p.value && { borderColor: meta.color, backgroundColor: meta.color + '18' }]}
                onPress={() => setPriority(p.value)}
              >
                <Text style={[styles.priorityChipText, priority === p.value && { color: meta.color, fontWeight: '800' }]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.cancelBtn} onPress={resetAndClose} disabled={saving}>
            <Text style={styles.cancelBtnText}>{t('missingItemsGiveUp')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: meta.color }, (totalCount === 0 || saving) && styles.submitDisabled]}
            onPress={handleSubmit}
            disabled={totalCount === 0 || saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="send" size={18} color="#fff" />
                <Text style={styles.submitBtnText}>{t('missingItemsSendReport')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: theme.colors.background },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    marginTop: 8,
    marginBottom: 4,
  },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: theme.spacing.lg, paddingBottom: 8 },
  areaBadge: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  topText: { flex: 1 },
  title: { fontSize: 17, fontWeight: '800', color: theme.colors.text },
  subtitle: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4, lineHeight: 18 },
  counterBar: { paddingHorizontal: theme.spacing.lg, paddingBottom: 8 },
  counterText: { fontSize: 13, fontWeight: '700', color: theme.colors.primary },
  scroll: { flex: 1 },
  scrollContent: { padding: theme.spacing.lg, paddingTop: 0, paddingBottom: 24 },
  writeCard: {
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  writeCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  writeCardTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text },
  writeHint: { fontSize: 12, color: theme.colors.textMuted, lineHeight: 18, marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: 12,
    fontSize: 15,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
  },
  writeInput: { minHeight: 72, textAlignVertical: 'top' },
  addLineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
  },
  addLineBtnDisabled: { opacity: 0.45 },
  addLineBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  writtenList: { marginTop: 12, gap: 8 },
  writtenChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: theme.radius.md,
    padding: 10,
  },
  writtenChipText: { flex: 1, fontSize: 14, color: theme.colors.text },
  writeEmpty: { fontSize: 12, color: theme.colors.textMuted, marginTop: 10, fontStyle: 'italic' },
  catalogToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    marginBottom: 8,
  },
  catalogToggleText: { flex: 1, fontSize: 14, fontWeight: '600', color: theme.colors.textSecondary },
  category: { marginBottom: 8, borderRadius: theme.radius.md, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: theme.colors.surface,
  },
  categoryTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: theme.colors.text },
  catCount: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  catCountText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: theme.colors.background },
  checkRowOn: { backgroundColor: theme.colors.primaryLight + '22' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkLabel: { flex: 1, fontSize: 14, color: theme.colors.text },
  checkLabelOn: { fontWeight: '700' },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary, marginTop: 12, marginBottom: 6 },
  textarea: { minHeight: 72, textAlignVertical: 'top' },
  priorityRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  priorityChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  priorityChipText: { fontSize: 13, color: theme.colors.textSecondary },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    backgroundColor: theme.colors.borderLight,
  },
  cancelBtnText: { fontSize: 15, fontWeight: '700', color: theme.colors.textSecondary },
  submitBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
  },
  submitDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
