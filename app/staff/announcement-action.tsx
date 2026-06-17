import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StaffAnnouncementActionPanel } from '@/components/staff/StaffAnnouncementActionPanel';
import { AnnouncementRichViewer } from '@/components/announcements/AnnouncementRichViewer';
import { theme } from '@/constants/theme';

export default function StaffAnnouncementActionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    title?: string;
    body?: string;
    videoUrl?: string;
    videoTitle?: string;
    openScreen?: string;
    actionLabel?: string;
    imageUrls?: string;
  }>();

  const title = typeof params.title === 'string' ? params.title : '';
  const body = typeof params.body === 'string' ? params.body : '';
  const imageUrls = typeof params.imageUrls === 'string'
    ? params.imageUrls.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title.trim() || 'Duyuru'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <StaffAnnouncementActionPanel
          title={title}
          body={body}
          videoUrl={typeof params.videoUrl === 'string' ? params.videoUrl : undefined}
          videoTitle={typeof params.videoTitle === 'string' ? params.videoTitle : undefined}
          openScreen={typeof params.openScreen === 'string' ? params.openScreen : undefined}
          actionLabel={typeof params.actionLabel === 'string' ? params.actionLabel : undefined}
          onOpenScreen={(href) => router.push(href as never)}
        />
        {imageUrls.length > 0 ? (
          <AnnouncementRichViewer
            media={{ images: imageUrls }}
            onOpenScreen={(href) => router.push(href as never)}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: theme.colors.text },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
});
