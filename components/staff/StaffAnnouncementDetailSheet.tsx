import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  isTaskAssignmentBoardRow,
  priorityAccent,
  priorityLabel,
  type StaffAnnouncementRow,
} from '@/lib/staffBoard';
import { formatDateTime } from '@/lib/date';
import { pds } from '@/constants/personelDesignSystem';
import { AnnouncementRichViewer } from '@/components/announcements/AnnouncementRichViewer';

type Props = {
  visible: boolean;
  row: StaffAnnouncementRow | null;
  busy?: boolean;
  onClose: () => void;
  onAcknowledge?: () => void;
  onCompleteTask?: () => void;
  onOpenTasks?: () => void;
  onOpenActionUrl?: (href: string) => void;
};

export function StaffAnnouncementDetailSheet({
  visible,
  row,
  busy,
  onClose,
  onAcknowledge,
  onCompleteTask,
  onOpenTasks,
  onOpenActionUrl,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  if (!row) return null;

  const accent = priorityAccent(row.priority, row);
  const isTask = isTaskAssignmentBoardRow(row);
  const isUnread = !row.read_at;
  const hasLegacyLink = !!row.action_url?.trim() && !row.media_payload;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <View style={[styles.priorityPill, { backgroundColor: `${accent}18`, borderColor: `${accent}55` }]}>
            <Text style={[styles.priorityText, { color: accent }]}>{priorityLabel(row.priority, row)}</Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color="#64748b" />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>{row.title}</Text>
          <Text style={styles.meta}>{formatDateTime(row.created_at)}</Text>
          {row.read_at ? (
            <Text style={styles.readMeta}>{t('staffBoardReadAt', { time: formatDateTime(row.read_at) })}</Text>
          ) : null}
          <Text style={styles.body}>{row.content}</Text>
          <AnnouncementRichViewer
            media={row.media_payload}
            legacyImageUrl={row.image_url}
            legacyActionUrl={row.action_url}
            legacyActionText={row.action_text}
            onOpenScreen={onOpenActionUrl}
          />
        </ScrollView>

        <View style={styles.footer}>
          {hasLegacyLink && onOpenActionUrl ? (
            <TouchableOpacity
              style={styles.linkBtn}
              onPress={() => onOpenActionUrl(row.action_url!)}
              activeOpacity={0.88}
            >
              <Ionicons name="open-outline" size={18} color={pds.indigo} />
              <Text style={styles.linkBtnText}>{row.action_text?.trim() || t('staffBoardOpenLink')}</Text>
            </TouchableOpacity>
          ) : null}

          {isTask && onCompleteTask ? (
            <View style={styles.taskRow}>
              <TouchableOpacity
                style={[styles.primaryBtn, busy && styles.btnBusy]}
                onPress={onCompleteTask}
                disabled={busy}
                activeOpacity={0.88}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-done-outline" size={18} color="#fff" />
                    <Text style={styles.primaryBtnText}>{t('staffBoardCompleteTask')}</Text>
                  </>
                )}
              </TouchableOpacity>
              {onOpenTasks ? (
                <TouchableOpacity style={styles.secondaryBtn} onPress={onOpenTasks} activeOpacity={0.88}>
                  <Text style={styles.secondaryBtnText}>{t('staffBoardOpenTask')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : isUnread && onAcknowledge ? (
            <TouchableOpacity
              style={[styles.primaryBtn, busy && styles.btnBusy]}
              onPress={onAcknowledge}
              disabled={busy}
              activeOpacity={0.88}
            >
              {busy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-done-outline" size={18} color="#fff" />
                  <Text style={styles.primaryBtnText}>{t('staffBoardAcknowledge')}</Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '88%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e2e8f0',
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  priorityPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  priorityText: { fontSize: 11, fontWeight: '800' },
  closeBtn: { padding: 4 },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 12 },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a', lineHeight: 26 },
  meta: { marginTop: 8, fontSize: 12, color: '#94a3b8', fontWeight: '600' },
  readMeta: { marginTop: 4, fontSize: 11, color: '#64748b', fontWeight: '600' },
  body: { marginTop: 16, fontSize: 16, color: '#334155', lineHeight: 24 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#c7d2fe',
    backgroundColor: '#eef2ff',
  },
  linkBtnText: { color: pds.indigo, fontWeight: '700', fontSize: 14 },
  taskRow: { gap: 8 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 13,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  secondaryBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2563eb',
  },
  secondaryBtnText: { color: '#2563eb', fontWeight: '700', fontSize: 14 },
  btnBusy: { opacity: 0.7 },
});
