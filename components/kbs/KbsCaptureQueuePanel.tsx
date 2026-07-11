import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

export type KbsCaptureQueueImageItem = {
  kind: 'image';
  id: string;
  imageUri: string;
};

export type KbsCaptureQueueTcItem = {
  kind: 'tc';
  id: string;
  tc: string;
  fullName: string;
  phone: string;
};

export type KbsCaptureQueueItem = KbsCaptureQueueImageItem | KbsCaptureQueueTcItem;

type Props = {
  items: KbsCaptureQueueItem[];
  onOpenImage: (id: string) => void;
  onRemove: (id: string) => void;
  removeA11yLabel: string;
  /** Dikey liste — klavye açıkken kaydırma için. */
  layout?: 'list' | 'strip';
  maxListHeight?: number;
};

function QueueRow({
  item,
  index,
  onOpenImage,
  onRemove,
  removeA11yLabel,
}: {
  item: KbsCaptureQueueItem;
  index: number;
  onOpenImage: (id: string) => void;
  onRemove: (id: string) => void;
  removeA11yLabel: string;
}) {
  const isTc = item.kind === 'tc';

  return (
    <View style={styles.row}>
      {isTc ? (
        <View style={styles.rowTcThumb}>
          <Ionicons name="finger-print" size={24} color="#2563eb" />
        </View>
      ) : (
        <Pressable style={styles.rowImageThumbWrap} onPress={() => onOpenImage(item.id)}>
          <Image source={{ uri: item.imageUri }} style={styles.rowImageThumb} contentFit="cover" />
        </Pressable>
      )}

      <View style={styles.rowBody}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowTitle}>{isTc ? 'T.C. kimlik' : `Kimlik ${index + 1}`}</Text>
          <View style={[styles.rowPill, isTc ? styles.rowPillTc : styles.rowPillImage]}>
            <Text style={[styles.rowPillText, isTc ? styles.rowPillTextTc : styles.rowPillTextImage]}>
              {isTc ? 'T.C.' : 'Foto'}
            </Text>
          </View>
        </View>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {isTc ? item.tc : 'Kamera / galeri'}
        </Text>
        {isTc && item.fullName.trim() ? (
          <Text style={styles.rowSub} numberOfLines={1}>
            {item.fullName.trim()}
          </Text>
        ) : null}
        {isTc && item.phone.trim() ? (
          <Text style={styles.rowPhone} numberOfLines={1}>
            {item.phone.trim()}
          </Text>
        ) : null}
      </View>

      <TouchableOpacity
        style={styles.rowRemove}
        onPress={() => onRemove(item.id)}
        hitSlop={8}
        accessibilityLabel={removeA11yLabel}
      >
        <Ionicons name="trash-outline" size={18} color="#f87171" />
      </TouchableOpacity>
    </View>
  );
}

export function KbsCaptureQueuePanel({
  items,
  onOpenImage,
  onRemove,
  removeA11yLabel,
  layout = 'list',
  maxListHeight = 280,
}: Props) {
  if (items.length === 0) return null;

  if (layout === 'strip') {
    return (
      <View style={styles.wrap}>
        <View style={styles.header}>
          <Ionicons name="layers-outline" size={16} color="rgba(255,255,255,0.9)" />
          <Text style={styles.headerText}>{items.length} kayıt</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {items.map((item, index) => (
            <View key={item.id} style={styles.stripCard}>
              {item.kind === 'image' ? (
                <Pressable style={styles.stripImageCard} onPress={() => onOpenImage(item.id)}>
                  <Image source={{ uri: item.imageUri }} style={styles.stripImageThumb} contentFit="cover" />
                </Pressable>
              ) : (
                <View style={styles.stripTcCard}>
                  <Ionicons name="finger-print" size={20} color="#bfdbfe" />
                  <Text style={styles.stripTcNumber} numberOfLines={1}>
                    {item.tc}
                  </Text>
                </View>
              )}
              <TouchableOpacity style={styles.stripRemove} onPress={() => onRemove(item.id)}>
                <Ionicons name="close" size={12} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.stripIndex}>{index + 1}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.listWrap}>
      <View style={styles.listHeader}>
        <Text style={styles.listHeaderTitle}>Kayıt listesi</Text>
        <View style={styles.listCountBadge}>
          <Text style={styles.listCountText}>{items.length}</Text>
        </View>
      </View>
      <ScrollView
        style={[styles.listScroll, { maxHeight: maxListHeight }]}
        contentContainerStyle={styles.listScrollContent}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        showsVerticalScrollIndicator
      >
        {items.map((item, index) => (
          <QueueRow
            key={item.id}
            item={item}
            index={index}
            onOpenImage={onOpenImage}
            onRemove={onRemove}
            removeA11yLabel={removeA11yLabel}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4, paddingBottom: 4 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    marginBottom: 8,
  },
  headerText: { color: 'rgba(255,255,255,0.92)', fontSize: 12, fontWeight: '800' },
  strip: { paddingHorizontal: 16, gap: 10, flexDirection: 'row' },
  stripCard: { width: 88, height: 104, position: 'relative' },
  stripImageCard: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  stripImageThumb: { width: '100%', height: '100%' },
  stripTcCard: {
    flex: 1,
    borderRadius: 14,
    padding: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(147,197,253,0.45)',
    backgroundColor: 'rgba(30,64,175,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  stripTcNumber: { color: '#fff', fontSize: 9, fontWeight: '800' },
  stripRemove: {
    position: 'absolute',
    top: -5,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripIndex: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  listWrap: {
    borderRadius: 18,
    backgroundColor: 'rgba(15,23,42,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.22)',
    overflow: 'hidden',
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148,163,184,0.25)',
  },
  listHeaderTitle: { color: '#f8fafc', fontSize: 13, fontWeight: '800' },
  listCountBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(37,99,235,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listCountText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  listScroll: { flexGrow: 0 },
  listScrollContent: { paddingVertical: 6, paddingHorizontal: 8, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(30,41,59,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.16)',
  },
  rowTcThumb: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowImageThumbWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  rowImageThumb: { width: '100%', height: '100%' },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { color: '#f8fafc', fontSize: 14, fontWeight: '800' },
  rowPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  rowPillTc: { backgroundColor: 'rgba(37,99,235,0.25)' },
  rowPillImage: { backgroundColor: 'rgba(16,185,129,0.22)' },
  rowPillText: { fontSize: 10, fontWeight: '800' },
  rowPillTextTc: { color: '#93c5fd' },
  rowPillTextImage: { color: '#6ee7b7' },
  rowMeta: { color: '#e2e8f0', fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  rowSub: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
  rowPhone: { color: '#93c5fd', fontSize: 12, fontWeight: '700' },
  rowRemove: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(127,29,29,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
