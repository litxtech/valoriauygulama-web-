import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FeedCreateAnchorMenu, type FeedCreateMenuItem } from '@/components/header/FeedCreateAnchorMenu';

type Props = {
  visible: boolean;
  onClose: () => void;
  canCreateFeed: boolean;
  canKbsMrz: boolean;
  onPost: () => void;
  onStory: () => void;
  onMrz: () => void;
};

export function StaffFeedShareSheet({
  visible,
  onClose,
  canCreateFeed,
  canKbsMrz,
  onPost,
  onStory,
  onMrz,
}: Props) {
  const { t } = useTranslation();

  const items = useMemo(() => {
    const list: FeedCreateMenuItem[] = [];
    if (canCreateFeed) {
      list.push({
        key: 'post',
        label: t('post'),
        icon: 'images',
        iconColor: '#8b5cf6',
        onPress: onPost,
      });
      list.push({
        key: 'story',
        label: t('story'),
        icon: 'add-circle',
        iconColor: '#e1306c',
        onPress: onStory,
      });
    }
    if (canKbsMrz) {
      list.push({
        key: 'mrz',
        label: t('staffPassportsTitle'),
        icon: 'scan',
        iconColor: '#0f766e',
        onPress: onMrz,
      });
    }
    return list;
  }, [canCreateFeed, canKbsMrz, onPost, onStory, onMrz, t]);

  return <FeedCreateAnchorMenu visible={visible} onClose={onClose} items={items} />;
}
