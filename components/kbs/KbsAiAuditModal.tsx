import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import type { ParsedDocument } from '@/lib/scanner/types';
import { formatParsedSummary } from '@/lib/kbsCaptureOcr';

export type KbsAiAuditRow = {
  id: string;
  imageUri: string;
  parsed: ParsedDocument | null;
  missingFields: string[];
};

type Props = {
  visible: boolean;
  title?: string;
  rows: KbsAiAuditRow[];
  onClose: () => void;
};

export function KbsAiAuditModal({ visible, title = 'Yedek okuma (AI)', rows, onClose }: Props) {
  const incomplete = rows.filter((r) => r.missingFields.length > 0).length;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={26} color={theme.colors.text} />
          </Pressable>
        </View>
        <Text style={styles.sub}>
          {incomplete > 0
            ? `${incomplete} kayıtta eksik alan var — liste aşağıda.`
            : 'Tüm seçili kimliklerde temel alanlar okundu.'}
        </Text>
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <View style={styles.card}>
              <Image source={{ uri: item.imageUri }} style={styles.thumb} contentFit="cover" />
              <View style={styles.body}>
                <Text style={styles.index}>#{index + 1}</Text>
                <Text style={styles.summary} numberOfLines={2}>
                  {item.parsed ? formatParsedSummary(item.parsed) : 'Okunamadı'}
                </Text>
                {item.missingFields.length > 0 ? (
                  <Text style={styles.missing}>Eksik: {item.missingFields.join(', ')}</Text>
                ) : (
                  <Text style={styles.ok}>Tamam</Text>
                )}
              </View>
            </View>
          )}
        />
        <Pressable style={styles.doneBtn} onPress={onClose}>
          <Text style={styles.doneText}>Kapat</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.backgroundSecondary, paddingTop: 48, paddingHorizontal: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: 18, fontWeight: '800', color: theme.colors.text, flex: 1 },
  sub: { fontSize: 13, color: theme.colors.textSecondary, marginBottom: 12, lineHeight: 18 },
  list: { paddingBottom: 16, gap: 8 },
  card: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    padding: 10,
  },
  thumb: { width: 64, height: 84, borderRadius: 8, backgroundColor: '#e2e8f0' },
  body: { flex: 1, minWidth: 0 },
  index: { fontSize: 11, fontWeight: '800', color: theme.colors.primary },
  summary: { fontSize: 14, fontWeight: '700', color: theme.colors.text, marginTop: 2 },
  missing: { fontSize: 12, fontWeight: '700', color: '#b45309', marginTop: 6 },
  ok: { fontSize: 12, fontWeight: '700', color: theme.colors.success, marginTop: 6 },
  doneBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 24,
  },
  doneText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
