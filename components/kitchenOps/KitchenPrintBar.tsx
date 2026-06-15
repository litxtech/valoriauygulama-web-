import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  KITCHEN_CARI_PRINT_OPTIONS,
  KITCHEN_PRINT_REPORT_TITLES,
  type KitchenPrintReportKind,
} from '@/lib/kitchenOps/kitchenPrintReports';
import { alertKitchenPrintError, runKitchenPrintAction } from '@/lib/kitchenOps/kitchenPrintActions';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function toggleDrawerAnimation() {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
}

type Props = {
  kind?: KitchenPrintReportKind;
  kinds?: { kind: KitchenPrintReportKind; label: string }[];
  compact?: boolean;
  /** Üst satırda bölüm adı — örn. Mutfak / Otel */
  sectionLabel?: string;
};

export function KitchenPrintBar({ kind, kinds, compact, sectionLabel = 'Mutfak' }: Props) {
  const options = kinds ?? (kind ? [{ kind, label: KITCHEN_PRINT_REPORT_TITLES[kind] }] : []);
  const [selected, setSelected] = useState(options[0]?.kind);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'pdf' | 'print' | 'email' | null>(null);

  if (options.length === 0 || !selected) return null;

  const selectedLabel = options.find((o) => o.kind === selected)?.label ?? KITCHEN_PRINT_REPORT_TITLES[selected];

  const setOpenAnimated = (next: boolean) => {
    toggleDrawerAnimation();
    setOpen(next);
  };

  const run = async (action: 'pdf' | 'print' | 'email') => {
    setBusy(action);
    try {
      await runKitchenPrintAction(selected, action);
      if (action === 'email') {
        Alert.alert('Gönderildi', 'Belge yazıcı e-postasına iletildi.');
      }
    } catch (e) {
      alertKitchenPrintError(e);
    } finally {
      setBusy(null);
    }
  };

  const showSegments = options.length > 1;

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact, open && styles.wrapOpen]}>
      <TouchableOpacity
        style={styles.drawerHeader}
        onPress={() => setOpenAnimated(!open)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? 'Yazdırma menüsünü kapat' : 'Yazdırma menüsünü aç'}
      >
        <View style={styles.headerIconWrap}>
          <Ionicons name="print-outline" size={20} color="#0d9488" />
        </View>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>Yazdır / PDF</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            Valoria Hotel · {sectionLabel} · {selectedLabel}
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={22} color="#0f766e" />
      </TouchableOpacity>

      {open ? (
        <View style={styles.drawerBody}>
          {showSegments ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.segments}
              contentContainerStyle={styles.segmentsContent}
            >
              {options.map((o) => {
                const active = o.kind === selected;
                return (
                  <TouchableOpacity
                    key={o.kind}
                    style={[styles.segment, active && styles.segmentActive]}
                    onPress={() => {
                      if (o.kind !== selected) {
                        toggleDrawerAnimation();
                        setSelected(o.kind);
                      }
                    }}
                    disabled={!!busy}
                  >
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{o.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : null}

          <View style={styles.actions}>
            <PrintBtn icon="download-outline" label="PDF" loading={busy === 'pdf'} disabled={!!busy} onPress={() => run('pdf')} />
            <PrintBtn icon="print-outline" label="Yazdır" loading={busy === 'print'} disabled={!!busy} onPress={() => run('print')} />
            <PrintBtn icon="mail-outline" label="Yazıcıya mail" loading={busy === 'email'} disabled={!!busy} onPress={() => run('email')} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function PrintBtn({
  icon,
  label,
  loading,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.btn} onPress={onPress} disabled={disabled || loading} activeOpacity={0.85}>
      {loading ? <ActivityIndicator size="small" color="#0d9488" /> : <Ionicons name={icon} size={18} color="#0d9488" />}
      <Text style={styles.btnText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function KitchenCariPrintBar(props: { compact?: boolean }) {
  return <KitchenPrintBar kinds={KITCHEN_CARI_PRINT_OPTIONS} compact={props.compact} />;
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#ecfdf5',
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#99f6e4',
    overflow: 'hidden',
  },
  wrapOpen: {
    paddingBottom: 12,
  },
  wrapCompact: { marginHorizontal: 0 },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  headerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  headerTextWrap: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 14, fontWeight: '800', color: '#0f766e' },
  headerSub: { fontSize: 11, fontWeight: '600', color: '#64748b', marginTop: 2 },
  drawerBody: {
    paddingHorizontal: 12,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#a7f3d0',
  },
  segments: { marginBottom: 10, maxHeight: 40 },
  segmentsContent: { gap: 6, paddingRight: 4 },
  segment: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  segmentActive: { backgroundColor: '#0d9488', borderColor: '#0d9488' },
  segmentText: { fontSize: 12, fontWeight: '700', color: '#0f766e' },
  segmentTextActive: { color: '#fff' },
  actions: { flexDirection: 'row', gap: 8 },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  btnText: { fontSize: 11, fontWeight: '800', color: '#0f766e' },
});
