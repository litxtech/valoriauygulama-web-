import type { ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  MEAL_SLOTS,
  type MealFields,
  type MealSlotKey,
  parseYmd,
  dayFillStatus,
  fillStatusLabel,
} from '@/lib/mealMenuUi';
import { formatTrFullDayLabelFromYmd, formatTrShortDayLabelFromYmd } from '@/lib/mealMenuDate';

type Palette = {
  primary: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  surface: string;
  surfaceSecondary: string;
  accent?: string;
  todayTint?: string;
  todayBorder?: string;
};

// —— Ay seçici ——

type MealMonthNavigatorProps = {
  periodLabel: string;
  onPrev: () => void;
  onNext: () => void;
  palette: Palette;
  subtitle?: string;
  prevDisabled?: boolean;
  compact?: boolean;
};

export function MealMonthNavigator({
  periodLabel,
  onPrev,
  onNext,
  palette,
  subtitle,
  prevDisabled,
  compact = false,
}: MealMonthNavigatorProps) {
  const navColor = prevDisabled ? palette.textMuted : palette.primary;
  const wrapStyle = compact ? navStyles.wrapCompact : navStyles.wrap;
  const titleStyle = compact ? navStyles.titleCompact : navStyles.title;
  const subStyle = compact ? navStyles.subCompact : navStyles.sub;
  const iconSize = compact ? 16 : 18;
  const chevronSize = compact ? 20 : 22;
  return (
    <View style={[wrapStyle, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <TouchableOpacity
        onPress={onPrev}
        style={navStyles.btn}
        hitSlop={12}
        accessibilityLabel="Önceki ay"
        disabled={prevDisabled}
      >
        <Ionicons name="chevron-back" size={chevronSize} color={navColor} />
      </TouchableOpacity>
      <View style={navStyles.center}>
        <View style={navStyles.titleRow}>
          <Ionicons name="calendar-outline" size={iconSize} color={palette.primary} />
          <Text style={[titleStyle, { color: palette.text }]}>{periodLabel}</Text>
        </View>
        {subtitle ? <Text style={[subStyle, { color: palette.textMuted }]}>{subtitle}</Text> : null}
      </View>
      <TouchableOpacity onPress={onNext} style={navStyles.btn} hitSlop={12} accessibilityLabel="Sonraki ay">
        <Ionicons name="chevron-forward" size={chevronSize} color={palette.primary} />
      </TouchableOpacity>
    </View>
  );
}

// —— Özet şeridi ——

type MealMenuStatsStripProps = {
  filledDays: number;
  partialDays: number;
  totalDays: number;
  todaySlots?: number;
  palette: Palette;
  mode: 'admin' | 'staff';
};

export function MealMenuStatsStrip({
  filledDays,
  partialDays,
  totalDays,
  todaySlots,
  palette,
  mode,
}: MealMenuStatsStripProps) {
  const emptyDays = totalDays - filledDays - partialDays;
  return (
    <View style={[statsStyles.wrap, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <StatPill
        icon="checkmark-circle"
        label="Tam gün"
        value={`${filledDays}`}
        hint={`/ ${totalDays}`}
        color="#059669"
        palette={palette}
      />
      <StatPill
        icon="ellipse-outline"
        label="Eksik"
        value={`${partialDays}`}
        color="#d97706"
        palette={palette}
      />
      {mode === 'admin' ? (
        <StatPill icon="remove-circle-outline" label="Boş" value={`${emptyDays}`} color={palette.textMuted} palette={palette} />
      ) : (
        <StatPill
          icon="today-outline"
          label="Bugün"
          value={todaySlots != null && todaySlots > 0 ? `${todaySlots}/3` : '—'}
          color={palette.primary}
          palette={palette}
        />
      )}
    </View>
  );
}

function StatPill({
  icon,
  label,
  value,
  hint,
  color,
  palette,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  hint?: string;
  color: string;
  palette: Palette;
}) {
  return (
    <View style={[statsStyles.pill, { backgroundColor: palette.surfaceSecondary }]}>
      <Ionicons name={icon} size={13} color={color} />
      <Text style={[statsStyles.pillLabel, { color: palette.textMuted }]}>{label}</Text>
      <Text style={[statsStyles.pillValue, { color: palette.text }]}>
        {value}
        {hint ? <Text style={{ color: palette.textMuted, fontWeight: '500' }}> {hint}</Text> : null}
      </Text>
    </View>
  );
}

// —— Bugün kartı (personel) ——

export function MealTodayHeroCard({ fields, palette }: { fields: MealFields; palette: Palette }) {
  const slots = MEAL_SLOTS.filter((s) => fields[s.key]?.trim());
  if (slots.length === 0) return null;
  return (
    <View
      style={[
        heroStyles.card,
        {
          backgroundColor: palette.todayTint ?? '#fffbeb',
          borderColor: palette.todayBorder ?? palette.primary,
        },
      ]}
    >
      <View style={heroStyles.head}>
        <View style={[heroStyles.badge, { backgroundColor: palette.primary }]}>
          <Text style={heroStyles.badgeText}>Bugün</Text>
        </View>
        <Text style={[heroStyles.headTitle, { color: palette.text }]}>Günün menüsü</Text>
      </View>
      {slots.map((slot) => (
        <MealSlotReadRow key={slot.key} slotKey={slot.key} text={fields[slot.key]} compact />
      ))}
    </View>
  );
}

// —— Hafta başlığı ——

type MealWeekSectionHeaderProps = {
  label: string;
  dayCount: number;
  filledCount: number;
  expanded: boolean;
  onToggle: () => void;
  palette: Palette;
};

export function MealWeekSectionHeader({
  label,
  dayCount,
  filledCount,
  expanded,
  onToggle,
  palette,
}: MealWeekSectionHeaderProps) {
  return (
    <TouchableOpacity
      style={[weekStyles.head, { backgroundColor: palette.surfaceSecondary, borderColor: palette.border }]}
      onPress={onToggle}
      activeOpacity={0.75}
    >
      <View style={weekStyles.headLeft}>
        <Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={18} color={palette.primary} />
        <Text style={[weekStyles.weekLabel, { color: palette.text }]}>{label}</Text>
      </View>
      <Text style={[weekStyles.weekMeta, { color: palette.textMuted }]}>
        {filledCount}/{dayCount} gün dolu
      </Text>
    </TouchableOpacity>
  );
}

// —— Gün kartı: tarih rozeti ——

function MealDayDateBadge({
  ymd,
  isToday,
  status,
  palette,
  compact,
}: {
  ymd: string;
  isToday: boolean;
  status: 'empty' | 'partial' | 'full';
  palette: Palette;
  compact?: boolean;
}) {
  const { day, weekdayShort, isWeekend } = parseYmd(ymd);
  const statusColor = status === 'full' ? '#059669' : status === 'partial' ? '#d97706' : palette.textMuted;
  const colStyle = compact ? badgeStyles.colCompact : badgeStyles.col;
  const boxStyle = compact ? badgeStyles.dateBoxCompact : badgeStyles.dateBox;
  const dayNumStyle = compact ? badgeStyles.dayNumCompact : badgeStyles.dayNum;
  const dowStyle = compact ? badgeStyles.dowCompact : badgeStyles.dow;
  return (
    <View style={colStyle}>
      <View
        style={[
          boxStyle,
          {
            backgroundColor: isToday ? palette.primary : isWeekend ? palette.surfaceSecondary : palette.surface,
            borderColor: isToday ? palette.primary : palette.border,
          },
        ]}
      >
        <Text style={[dayNumStyle, { color: isToday ? '#fff' : palette.text }]}>{day}</Text>
        <Text style={[dowStyle, { color: isToday ? 'rgba(255,255,255,0.85)' : palette.textMuted }]}>
          {weekdayShort}
        </Text>
      </View>
      {!compact ? (
        <>
          <View style={[badgeStyles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[badgeStyles.statusText, { color: statusColor }]}>{fillStatusLabel(status)}</Text>
        </>
      ) : null}
    </View>
  );
}

// —— Öğün satırları ——

function MealSlotReadRow({
  slotKey,
  text,
  compact,
}: {
  slotKey: MealSlotKey;
  text: string;
  compact?: boolean;
}) {
  const slot = MEAL_SLOTS.find((s) => s.key === slotKey)!;
  return (
    <View style={[slotStyles.readRow, { backgroundColor: slot.tint, borderColor: slot.border }, compact && slotStyles.readRowCompact]}>
      <View style={[slotStyles.iconWrap, { backgroundColor: '#fff' }]}>
        <Ionicons name={slot.icon} size={compact ? 16 : 18} color={slot.iconColor} />
      </View>
      <View style={slotStyles.readBody}>
        <Text style={slotStyles.readLabel}>{slot.label}</Text>
        <Text style={slotStyles.readText}>{text.trim()}</Text>
      </View>
    </View>
  );
}

type MealSlotEditorRowProps = {
  slotKey: MealSlotKey;
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  inputColors: { text: string; muted: string; border: string };
};

export function MealSlotEditorRow({ slotKey, value, onChangeText, placeholder, inputColors }: MealSlotEditorRowProps) {
  const slot = MEAL_SLOTS.find((s) => s.key === slotKey)!;
  const filled = !!value.trim();
  return (
    <View style={[slotStyles.editWrap, { backgroundColor: slot.tint, borderColor: slot.border }]}>
      <View style={slotStyles.editHead}>
        <View style={[slotStyles.iconWrap, { backgroundColor: '#fff' }]}>
          <Ionicons name={slot.icon} size={18} color={slot.iconColor} />
        </View>
        <Text style={[slotStyles.editLabel, { color: inputColors.text }]}>{slot.label}</Text>
        {filled ? <Ionicons name="checkmark-circle" size={18} color="#059669" /> : null}
      </View>
      <TextInput
        style={[
          slotStyles.input,
          { color: inputColors.text, borderColor: inputColors.border, backgroundColor: '#fff' },
        ]}
        placeholder={placeholder}
        placeholderTextColor={inputColors.muted}
        value={value}
        onChangeText={onChangeText}
        multiline
      />
    </View>
  );
}

// —— Admin gün kartı ——

const SLOT_PLACEHOLDERS: Record<MealSlotKey, string> = {
  breakfast: 'Örn. Peynir, zeytin, yumurta, çay',
  lunch: 'Örn. Mercimek çorbası, pilav, salata',
  dinner: 'Örn. Izgara tavuk, makarna, ayran',
};

type MealDayEditorCardProps = {
  ymd: string;
  fields: MealFields;
  isToday: boolean;
  onChange: (next: MealFields) => void;
  palette: Palette;
};

export function MealDayEditorCard({ ymd, fields, isToday, onChange, palette }: MealDayEditorCardProps) {
  const status = dayFillStatus(fields);
  const title = formatTrFullDayLabelFromYmd(ymd);
  return (
    <View
      style={[
        dayStyles.card,
        { backgroundColor: palette.surface, borderColor: isToday ? palette.primary : palette.border },
        isToday && dayStyles.cardToday,
      ]}
    >
      <View style={dayStyles.cardTop}>
        <MealDayDateBadge ymd={ymd} isToday={isToday} status={status} palette={palette} />
        <View style={dayStyles.cardTitleCol}>
          <Text style={[dayStyles.cardTitle, { color: palette.text }]} numberOfLines={2}>
            {title}
          </Text>
          {isToday ? (
            <View style={[dayStyles.todayChip, { backgroundColor: palette.primary }]}>
              <Text style={dayStyles.todayChipText}>Bugün</Text>
            </View>
          ) : null}
        </View>
      </View>
      {MEAL_SLOTS.map((slot) => (
        <MealSlotEditorRow
          key={slot.key}
          slotKey={slot.key}
          value={fields[slot.key]}
          onChangeText={(t) => onChange({ ...fields, [slot.key]: t })}
          placeholder={SLOT_PLACEHOLDERS[slot.key]}
          inputColors={{ text: palette.text, muted: palette.textMuted, border: palette.border }}
        />
      ))}
    </View>
  );
}

// —— Personel gün kartı ——

type MealDayViewCardProps = {
  ymd: string;
  fields: MealFields;
  isToday: boolean;
  palette: Palette;
  compact?: boolean;
  /** Boş günler de kart olarak listelensin (bugünden itibaren sıra). */
  showWhenEmpty?: boolean;
  emptyMessage?: string;
  selected?: boolean;
};

export function MealDayViewCard({
  ymd,
  fields,
  isToday,
  palette,
  compact = false,
  showWhenEmpty = false,
  emptyMessage = 'Bu gün için menü henüz girilmedi.',
  selected = false,
}: MealDayViewCardProps) {
  const slots = MEAL_SLOTS.filter((s) => fields[s.key]?.trim());
  if (slots.length === 0 && !showWhenEmpty) return null;
  const title = compact ? formatTrShortDayLabelFromYmd(ymd) : formatTrFullDayLabelFromYmd(ymd);
  const cardStyle = compact ? dayStyles.cardCompact : dayStyles.card;
  const topStyle = compact ? dayStyles.cardTopCompact : dayStyles.cardTop;
  return (
    <View
      style={[
        cardStyle,
        {
          backgroundColor: palette.surface,
          borderColor: selected || isToday ? palette.primary : palette.border,
        },
        (isToday || selected) && dayStyles.cardToday,
      ]}
    >
      <View style={topStyle}>
        <MealDayDateBadge
          ymd={ymd}
          isToday={isToday}
          status={dayFillStatus(fields)}
          palette={palette}
          compact={compact}
        />
        <View style={dayStyles.cardTitleCol}>
          <Text style={[compact ? dayStyles.cardTitleCompact : dayStyles.cardTitle, { color: palette.text }]} numberOfLines={1}>
            {title}
          </Text>
          {isToday && compact ? (
            <View style={[dayStyles.todayChip, { backgroundColor: palette.primary }]}>
              <Text style={dayStyles.todayChipText}>Bugün</Text>
            </View>
          ) : null}
        </View>
      </View>
      {slots.length === 0 ? (
        <Text style={[dayStyles.emptyDayText, { color: palette.textMuted }]}>{emptyMessage}</Text>
      ) : (
        slots.map((slot) => (
          <MealSlotReadRow key={slot.key} slotKey={slot.key} text={fields[slot.key]} compact={compact} />
        ))
      )}
    </View>
  );
}

// —— Boş durum ——

export function MealMenuEmptyState({
  icon,
  title,
  message,
  palette,
  action,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  palette: Palette;
  action?: ReactNode;
}) {
  return (
    <View style={[emptyStyles.wrap, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <View style={[emptyStyles.iconCircle, { backgroundColor: palette.surfaceSecondary }]}>
        <Ionicons name={icon} size={40} color={palette.textMuted} />
      </View>
      <Text style={[emptyStyles.title, { color: palette.text }]}>{title}</Text>
      <Text style={[emptyStyles.message, { color: palette.textMuted }]}>{message}</Text>
      {action}
    </View>
  );
}

// —— Admin aksiyon satırı ——

export function MealAdminActionBar({
  saving,
  pdfLoading,
  printerMailLoading,
  onSave,
  onPdf,
  onPrinterMail,
  showPdf,
  showPrinterMail,
  palette,
}: {
  saving: boolean;
  pdfLoading: boolean;
  printerMailLoading?: boolean;
  onSave: () => void;
  onPdf: () => void;
  onPrinterMail?: () => void;
  showPdf: boolean;
  showPrinterMail?: boolean;
  palette: Palette;
}) {
  const mailBusy = !!printerMailLoading;
  return (
    <View style={actionStyles.row}>
      <TouchableOpacity
        style={[actionStyles.saveBtn, { backgroundColor: palette.primary }, saving && actionStyles.disabled]}
        onPress={onSave}
        disabled={saving}
        activeOpacity={0.85}
      >
        <Ionicons name="save-outline" size={20} color="#fff" />
        <Text style={actionStyles.saveText}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</Text>
      </TouchableOpacity>
      {showPdf ? (
        <TouchableOpacity
          style={[actionStyles.pdfBtn, { borderColor: palette.primary }, pdfLoading && actionStyles.disabled]}
          onPress={onPdf}
          disabled={pdfLoading || mailBusy}
          activeOpacity={0.85}
          accessibilityLabel="PDF yazdır"
        >
          <Ionicons name="print-outline" size={20} color={palette.primary} />
          <Text style={[actionStyles.pdfBtnText, { color: palette.primary }]}>
            {pdfLoading ? '…' : 'PDF'}
          </Text>
        </TouchableOpacity>
      ) : null}
      {showPrinterMail && onPrinterMail ? (
        <TouchableOpacity
          style={[actionStyles.pdfBtn, { borderColor: palette.primary }, mailBusy && actionStyles.disabled]}
          onPress={onPrinterMail}
          disabled={mailBusy || pdfLoading}
          activeOpacity={0.85}
          accessibilityLabel="Yazıcıya mail gönder"
        >
          <Ionicons name="mail-outline" size={20} color={palette.primary} />
          <Text style={[actionStyles.pdfBtnText, { color: palette.primary }]}>
            {mailBusy ? '…' : 'Yazıcı'}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function MealNotifyCard({
  value,
  onValueChange,
  palette,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  palette: Palette;
}) {
  return (
    <View style={[notifyStyles.wrap, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <View style={[notifyStyles.iconBox, { backgroundColor: palette.surfaceSecondary }]}>
        <Ionicons name="notifications-outline" size={22} color={palette.primary} />
      </View>
      <View style={notifyStyles.body}>
        <Text style={[notifyStyles.title, { color: palette.text }]}>Günlük bildirim</Text>
        <Text style={[notifyStyles.sub, { color: palette.textMuted }]}>
          Her sabah (~08:00) personel bugünün menüsünü telefonunda görür.
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#cbd5e1', true: palette.primary }}
      />
    </View>
  );
}

export const adminMealPalette: Palette = {
  primary: '#0f172a',
  text: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#64748b',
  border: '#e2e8f0',
  surface: '#ffffff',
  surfaceSecondary: '#f1f5f9',
  todayTint: '#f8fafc',
  todayBorder: '#0f172a',
};

export const staffMealPalette: Palette = {
  primary: '#b8860b',
  text: '#1a1d21',
  textSecondary: '#6c757d',
  textMuted: '#6b7280',
  border: '#e9ecef',
  surface: '#ffffff',
  surfaceSecondary: '#f8f9fa',
  todayTint: '#fffbeb',
  todayBorder: '#b8860b',
  accent: '#b8860b',
};

const navStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  wrapCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderWidth: 1,
    marginBottom: 6,
  },
  btn: { padding: 8 },
  center: { flex: 1, alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 18, fontWeight: '700' },
  titleCompact: { fontSize: 15, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 4, textAlign: 'center' },
  subCompact: { fontSize: 11, marginTop: 2, textAlign: 'center' },
});

const statsStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
    padding: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  pill: { flex: 1, alignItems: 'center', paddingVertical: 6, paddingHorizontal: 2, borderRadius: 8, gap: 2 },
  pillLabel: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  pillValue: { fontSize: 13, fontWeight: '700' },
});

const heroStyles = StyleSheet.create({
  card: { borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 2, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  headTitle: { fontSize: 17, fontWeight: '700' },
});

const weekStyles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 8,
    marginTop: 4,
    borderWidth: 1,
  },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  weekLabel: { fontSize: 15, fontWeight: '700' },
  weekMeta: { fontSize: 12, fontWeight: '500' },
});

const badgeStyles = StyleSheet.create({
  col: { alignItems: 'center', width: 52 },
  colCompact: { alignItems: 'center', width: 40 },
  dateBox: {
    width: 48,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateBoxCompact: {
    width: 38,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNum: { fontSize: 20, fontWeight: '800', lineHeight: 24 },
  dayNumCompact: { fontSize: 15, fontWeight: '800', lineHeight: 18 },
  dow: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  dowCompact: { fontSize: 9, fontWeight: '600', marginTop: 1 },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  statusText: { fontSize: 9, fontWeight: '700', marginTop: 2 },
});

const slotStyles = StyleSheet.create({
  readRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  readRowCompact: { padding: 10, marginBottom: 0 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readBody: { flex: 1 },
  readLabel: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  readText: { fontSize: 15, lineHeight: 22, color: '#0f172a' },
  editWrap: { borderRadius: 12, borderWidth: 1, padding: 10, marginBottom: 10 },
  editHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  editLabel: { flex: 1, fontSize: 14, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    minHeight: 48,
    textAlignVertical: 'top',
  },
});

const dayStyles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
  },
  cardCompact: {
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
  },
  cardToday: { borderWidth: 2 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  cardTopCompact: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  cardTitleCol: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  cardTitleCompact: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  todayChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  todayChipText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  emptyDayText: { fontSize: 13, lineHeight: 18, marginTop: 2, fontStyle: 'italic' },
});

const emptyStyles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    padding: 28,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 8,
  },
  iconCircle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 17, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  message: { fontSize: 14, lineHeight: 22, textAlign: 'center' },
});

const actionStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  pdfBtn: {
    minWidth: 72,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: '#fff',
  },
  pdfBtnText: { fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.65 },
});

const notifyStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  iconBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700' },
  sub: { fontSize: 12, lineHeight: 18, marginTop: 4 },
});
