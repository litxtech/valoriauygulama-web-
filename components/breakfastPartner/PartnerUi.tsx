import { ReactNode, ComponentProps, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { partnerRadii, partnerTheme } from '@/lib/breakfastPartnerTheme';
import { switchPartnerToMainApp, switchPartnerToPortal } from '@/stores/partnerAppSurfaceStore';
import {
  formatPartnerClockIstanbul,
  formatPartnerDayMonth,
  formatPartnerWeekday,
  type PartnerEntryTarget,
} from '@/lib/breakfastPartner';

type HeroProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
};

/** Tab layout üstünde sabit — otel adı kaydırınca kaybolmaz */
export function PartnerFixedHotelHeader({
  hotelName,
  subtitle,
  right,
}: {
  hotelName: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient
      colors={[...partnerTheme.heroGradient]}
      style={[styles.fixedHotelHeader, { paddingTop: insets.top + 8 }]}
    >
      <View style={styles.fixedHotelRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.fixedEyebrow}>Partner portal</Text>
          <Text style={styles.fixedHotelName} numberOfLines={1}>
            {hotelName}
          </Text>
          {subtitle ? (
            <Text style={styles.fixedSubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
    </LinearGradient>
  );
}

/** Header sağ üst — bildirimler (tab bar dışı). */
export function PartnerHeaderMessagesButton({
  unread,
  onPress,
  active,
}: {
  unread: number;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.headerNotifBtn}
      hitSlop={8}
      activeOpacity={0.85}
      accessibilityLabel="Mesajlar"
    >
      <Ionicons
        name={active ? 'chatbubbles' : 'chatbubbles-outline'}
        size={22}
        color={active ? partnerTheme.accent : partnerTheme.text}
      />
      {unread > 0 ? (
        <View style={styles.headerNotifBadge}>
          <Text style={styles.headerNotifBadgeText}>{unread > 9 ? '9+' : unread}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

/** Partner portal → misafir uygulamasına geçiş. */
export function PartnerSwitchToMainAppButton({ onPress }: { onPress?: () => void }) {
  const router = useRouter();
  return (
    <TouchableOpacity
      onPress={onPress ?? (() => void switchPartnerToMainApp(router))}
      style={styles.headerAppSwitchBtn}
      hitSlop={8}
      activeOpacity={0.85}
      accessibilityLabel="Uygulamaya git"
    >
      <Ionicons name="compass-outline" size={21} color={partnerTheme.text} />
    </TouchableOpacity>
  );
}

/** Misafir uygulaması → partner portalına dön. */
export function PartnerReturnPortalHeaderButton({
  onPress,
  label = 'Partner portal',
  compact = false,
}: {
  onPress?: () => void;
  label?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  return (
    <TouchableOpacity
      onPress={onPress ?? (() => void switchPartnerToPortal(router))}
      style={[styles.partnerReturnChip, compact && styles.partnerReturnChipCompact]}
      activeOpacity={0.85}
      accessibilityLabel={label}
    >
      <Ionicons name="grid-outline" size={compact ? 14 : 15} color={partnerTheme.accentDark} />
      <Text style={[styles.partnerReturnChipText, compact && styles.partnerReturnChipTextCompact]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/** Header sağ üst — bildirimler (tab bar dışı). */
export function PartnerHeaderNotificationButton({
  unread,
  onPress,
  active,
}: {
  unread: number;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.headerNotifBtn}
      hitSlop={8}
      activeOpacity={0.85}
      accessibilityLabel="Bildirimler"
    >
      <Ionicons
        name={active ? 'notifications' : 'notifications-outline'}
        size={22}
        color={active ? partnerTheme.accent : partnerTheme.text}
      />
      {unread > 0 ? (
        <View style={styles.headerNotifBadge}>
          <Text style={styles.headerNotifBadgeText}>{unread > 9 ? '9+' : unread}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

/** Sekme ekranı başlığı — sabit otel header'ının altında, scroll dışında kullanın */
export function PartnerScreenTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.screenTitleWrap}>
      <Text style={styles.screenTitle}>{title}</Text>
      {subtitle ? <Text style={styles.screenSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function PartnerHero({ title, subtitle, onBack, right }: HeroProps) {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient colors={[...partnerTheme.heroGradient]} style={[styles.hero, { paddingTop: insets.top + 10 }]}>
      <View style={styles.heroRow}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={styles.iconBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={partnerTheme.text} />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconSpacer} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>{title}</Text>
          {subtitle ? <Text style={styles.heroSubtitle}>{subtitle}</Text> : null}
        </View>
        {right ?? <View style={styles.iconSpacer} />}
      </View>
    </LinearGradient>
  );
}

export function PartnerGlassCard({
  children,
  style,
  glow,
}: {
  children: ReactNode;
  style?: ViewStyle;
  glow?: boolean;
}) {
  return (
    <View style={[styles.glassCard, glow && styles.glassGlow, style]}>
      {children}
    </View>
  );
}

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export function PartnerSectionTitle({ icon, title, hint }: { icon: IoniconName; title: string; hint?: string }) {
  return (
    <View style={styles.sectionHead}>
      <View style={styles.sectionIconWrap}>
        <Ionicons name={icon} size={18} color={partnerTheme.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
      </View>
    </View>
  );
}

export function PartnerField(props: TextInputProps & { label: string; editable?: boolean }) {
  const { label, style, editable = true, ...rest } = props;
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...rest}
        editable={editable}
        placeholderTextColor={partnerTheme.mutedSoft}
        style={[styles.fieldInput, !editable && styles.fieldInputReadOnly, style]}
      />
    </View>
  );
}

export function PartnerReadOnlyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.readOnlyBox}>
        <Text style={styles.readOnlyValue}>{value}</Text>
      </View>
      {hint ? <Text style={styles.readOnlyHint}>{hint}</Text> : null}
    </View>
  );
}

export function PartnerPrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  variant = 'accent',
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'accent' | 'ghost' | 'danger';
}) {
  if (variant === 'accent') {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled || loading}
        activeOpacity={0.88}
        style={[styles.primaryBtnWrap, (disabled || loading) && { opacity: 0.55 }]}
      >
        <LinearGradient colors={[...partnerTheme.accentGradient]} style={styles.primaryBtn}>
          {loading ? <ActivityIndicator color="#0f172a" /> : <Text style={styles.primaryBtnText}>{label}</Text>}
        </LinearGradient>
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.88}
      style={[
        styles.ghostBtn,
        variant === 'danger' && { borderColor: 'rgba(248,113,113,0.35)', backgroundColor: partnerTheme.dangerSoft },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={partnerTheme.text} />
      ) : (
        <Text style={[styles.ghostBtnText, variant === 'danger' && { color: partnerTheme.danger }]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

export function PartnerChip({
  label,
  active,
  onPress,
  tone = 'default',
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  tone?: 'default' | 'zero' | 'success';
}) {
  const toneStyle =
    tone === 'zero'
      ? styles.chipZero
      : tone === 'success'
        ? styles.chipSuccess
        : active
          ? styles.chipActive
          : styles.chipIdle;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={[styles.chip, toneStyle]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export type PartnerDateOption = {
  key: string;
  tag: string;
  iso: string;
  disabled?: boolean;
};

function PartnerDateOptionCard({
  option,
  active,
  onPress,
}: {
  option: PartnerDateOption;
  active: boolean;
  onPress: () => void;
}) {
  const weekday = formatPartnerWeekday(option.iso);
  const dayMonth = formatPartnerDayMonth(option.iso);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      disabled={option.disabled && !active}
      style={[
        styles.dateSegment,
        active && styles.dateSegmentActive,
        option.disabled && !active && styles.dateSegmentDisabled,
      ]}
    >
      <View style={styles.dateSegmentTop}>
        {active ? <View style={styles.dateSegmentDot} /> : null}
        <Text style={[styles.dateSegmentTag, active && styles.dateSegmentTagActive]}>{option.tag}</Text>
        {option.disabled && !active ? (
          <Ionicons name="lock-closed" size={11} color={partnerTheme.mutedSoft} />
        ) : null}
      </View>
      <Text style={[styles.dateSegmentDate, active && styles.dateSegmentDateActive]} numberOfLines={1}>
        {dayMonth}
      </Text>
      <Text style={[styles.dateSegmentWeekday, active && styles.dateSegmentWeekdayActive]} numberOfLines={1}>
        {weekday}
      </Text>
    </TouchableOpacity>
  );
}

/** Bugün / yarın — Türkiye tarihi ile seçim kartları. */
export function PartnerDateSelector({
  options,
  value,
  onChange,
  deadlineHint,
  showClock = true,
}: {
  options: PartnerDateOption[];
  value: string;
  onChange: (key: string) => void;
  deadlineHint?: string;
  showClock?: boolean;
}) {
  const [clock, setClock] = useState(() => formatPartnerClockIstanbul());

  useEffect(() => {
    if (!showClock) return;
    setClock(formatPartnerClockIstanbul());
    const id = setInterval(() => setClock(formatPartnerClockIstanbul()), 30_000);
    return () => clearInterval(id);
  }, [showClock]);

  return (
    <View style={styles.dateSelectorWrap}>
      <View style={styles.dateSegmentRow}>
        {options.map((opt) => (
          <PartnerDateOptionCard
            key={opt.key}
            option={opt}
            active={value === opt.key}
            onPress={() => onChange(opt.key)}
          />
        ))}
      </View>
      {(showClock || deadlineHint) ? (
        <View style={styles.dateMetaRow}>
          {showClock ? (
            <View style={styles.dateClockInline}>
              <Ionicons name="time-outline" size={13} color={partnerTheme.mutedSoft} />
              <Text style={styles.dateClockText}>İstanbul · {clock}</Text>
            </View>
          ) : null}
          {deadlineHint ? <Text style={styles.dateDeadlineHint}>{deadlineHint}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

/** Partner ana sayfa — bugün/yarın hedef seçici. */
export function PartnerEntryDateSelector({
  todayIso,
  tomorrowIso,
  value,
  onChange,
  tomorrowDisabled,
  onTomorrowBlocked,
  deadlineHint,
}: {
  todayIso: string;
  tomorrowIso: string;
  value: PartnerEntryTarget;
  onChange: (target: PartnerEntryTarget) => void;
  tomorrowDisabled?: boolean;
  onTomorrowBlocked?: () => void;
  deadlineHint?: string;
}) {
  return (
    <PartnerDateSelector
      value={value}
      onChange={(key) => {
        if (key === 'tomorrow' && tomorrowDisabled) {
          onTomorrowBlocked?.();
          return;
        }
        onChange(key as PartnerEntryTarget);
      }}
      deadlineHint={deadlineHint}
      options={[
        { key: 'today', tag: 'Bugün', iso: todayIso },
        { key: 'tomorrow', tag: 'Yarın', iso: tomorrowIso, disabled: tomorrowDisabled },
      ]}
    />
  );
}

export function PartnerStatTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statTileLabel}>{label}</Text>
      <Text style={[styles.statTileValue, accent && { color: partnerTheme.accent }]}>{value}</Text>
    </View>
  );
}

export function PartnerEmptyState({ icon, title, body }: { icon: IoniconName; title: string; body?: string }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={28} color={partnerTheme.muted} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
    </View>
  );
}

/** Alt sheet — klavye açıkken input görünür kalır. */
export function PartnerBottomSheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <Pressable style={styles.sheetDismiss} onPress={onClose} accessibilityLabel="Kapat" />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.sheetKb}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <View style={[styles.sheetCard, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{title}</Text>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
              contentContainerStyle={styles.sheetScrollContent}
            >
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: 16, paddingBottom: 18 },
  fixedHotelHeader: {
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: partnerTheme.cardBorder,
  },
  fixedHotelRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  fixedEyebrow: {
    color: partnerTheme.accent,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  fixedHotelName: {
    color: partnerTheme.text,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 4,
    letterSpacing: -0.3,
  },
  fixedSubtitle: { color: partnerTheme.muted, fontSize: 13, marginTop: 3 },
  headerNotifBtn: {
    width: 42,
    height: 42,
    borderRadius: partnerRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
    marginTop: 2,
  },
  headerAppSwitchBtn: {
    width: 42,
    height: 42,
    borderRadius: partnerRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: partnerTheme.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    marginTop: 2,
  },
  partnerReturnChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: partnerRadii.pill,
    backgroundColor: partnerTheme.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    marginRight: 6,
    maxWidth: 148,
  },
  partnerReturnChipCompact: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    maxWidth: 108,
  },
  partnerReturnChipText: {
    color: partnerTheme.accentDark,
    fontWeight: '800',
    fontSize: 12,
  },
  partnerReturnChipTextCompact: {
    fontSize: 11,
  },
  headerNotifBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: partnerTheme.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  headerNotifBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  screenTitleWrap: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: partnerTheme.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: partnerTheme.cardBorder,
  },
  screenTitle: { color: partnerTheme.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  screenSubtitle: { color: partnerTheme.muted, fontSize: 13, marginTop: 4, lineHeight: 18 },
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  heroTitle: { color: partnerTheme.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.3 },
  heroSubtitle: { color: partnerTheme.muted, fontSize: 14, marginTop: 4 },
  iconBtn: { width: 40, height: 40, borderRadius: partnerRadii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)' },
  iconSpacer: { width: 40 },
  glassCard: {
    backgroundColor: partnerTheme.card,
    borderRadius: partnerRadii.lg,
    padding: 18,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
  },
  glassGlow: {
    borderColor: partnerTheme.cardBorderFocus,
    shadowColor: partnerTheme.accent,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  sectionHead: { flexDirection: 'row', gap: 12, marginBottom: 14, alignItems: 'flex-start' },
  sectionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: partnerTheme.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { color: partnerTheme.text, fontSize: 17, fontWeight: '700' },
  sectionHint: { color: partnerTheme.muted, fontSize: 13, marginTop: 2 },
  fieldWrap: { marginTop: 10 },
  fieldLabel: { color: partnerTheme.muted, fontSize: 12, fontWeight: '600', marginBottom: 6, letterSpacing: 0.3 },
  fieldInput: {
    backgroundColor: partnerTheme.surfaceInput,
    borderRadius: partnerRadii.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: partnerTheme.text,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
    fontSize: 16,
  },
  fieldInputReadOnly: {
    opacity: 0.72,
    backgroundColor: partnerTheme.cardElevated,
  },
  readOnlyBox: {
    backgroundColor: partnerTheme.cardElevated,
    borderRadius: partnerRadii.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
  },
  readOnlyValue: { color: partnerTheme.text, fontSize: 16, fontWeight: '600' },
  readOnlyHint: { color: partnerTheme.mutedSoft, fontSize: 12, marginTop: 6, lineHeight: 17 },
  primaryBtnWrap: { marginTop: 16, borderRadius: partnerRadii.md, overflow: 'hidden' },
  primaryBtn: { paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: '#0f172a', fontWeight: '800', fontSize: 16 },
  ghostBtn: {
    marginTop: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: partnerRadii.md,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
    backgroundColor: partnerTheme.cardElevated,
  },
  ghostBtnText: { color: partnerTheme.text, fontWeight: '700' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: partnerRadii.pill,
    borderWidth: 1,
  },
  chipIdle: { backgroundColor: partnerTheme.cardElevated, borderColor: partnerTheme.cardBorder },
  chipActive: { backgroundColor: partnerTheme.accentSoft, borderColor: partnerTheme.accent },
  chipZero: { backgroundColor: partnerTheme.infoSoft, borderColor: 'rgba(96,165,250,0.35)' },
  chipSuccess: { backgroundColor: partnerTheme.successSoft, borderColor: 'rgba(52,211,153,0.35)' },
  chipText: { color: partnerTheme.muted, fontWeight: '700', fontSize: 13 },
  chipTextActive: { color: partnerTheme.accent },
  dateSelectorWrap: { marginBottom: 4 },
  dateSegmentRow: {
    flexDirection: 'row',
    gap: 6,
    padding: 4,
    borderRadius: partnerRadii.md,
    backgroundColor: partnerTheme.cardElevated,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
  },
  dateSegment: {
    flex: 1,
    borderRadius: partnerRadii.sm,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
  },
  dateSegmentActive: {
    backgroundColor: partnerTheme.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.45)',
  },
  dateSegmentDisabled: { opacity: 0.42 },
  dateSegmentTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 2,
  },
  dateSegmentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: partnerTheme.accent,
  },
  dateSegmentTag: {
    color: partnerTheme.mutedSoft,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  dateSegmentTagActive: { color: partnerTheme.accent },
  dateSegmentDate: {
    color: partnerTheme.text,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 18,
  },
  dateSegmentDateActive: { color: partnerTheme.text },
  dateSegmentWeekday: {
    color: partnerTheme.mutedSoft,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  dateSegmentWeekdayActive: { color: partnerTheme.muted },
  dateMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 2,
  },
  dateClockInline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dateClockText: { color: partnerTheme.mutedSoft, fontSize: 11, fontWeight: '600' },
  dateDeadlineHint: {
    color: partnerTheme.muted,
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
  },
  statTile: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: partnerTheme.cardElevated,
    borderRadius: partnerRadii.md,
    padding: 12,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
  },
  statTileLabel: { color: partnerTheme.mutedSoft, fontSize: 11, fontWeight: '600' },
  statTileValue: { color: partnerTheme.text, fontSize: 17, fontWeight: '800', marginTop: 6 },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: partnerTheme.cardElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { color: partnerTheme.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  emptyBody: { color: partnerTheme.muted, fontSize: 14, marginTop: 6, textAlign: 'center', lineHeight: 20 },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheetDismiss: { ...StyleSheet.absoluteFillObject },
  sheetKb: { width: '100%', maxHeight: '88%' },
  sheetCard: {
    backgroundColor: partnerTheme.cardElevated,
    borderTopLeftRadius: partnerRadii.xl,
    borderTopRightRadius: partnerRadii.xl,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
    maxHeight: '100%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: partnerTheme.cardBorder,
    marginBottom: 14,
  },
  sheetTitle: { color: partnerTheme.text, fontSize: 20, fontWeight: '800', marginBottom: 8 },
  sheetScrollContent: { paddingBottom: 8 },
});
