import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FeedCreateAnchorMenu, type FeedCreateMenuItem } from '@/components/header/FeedCreateAnchorMenu';

type Props = {
  visible: boolean;
  onClose: () => void;
  canCreateFeed: boolean;
  onPost: () => void;
  onStory: () => void;
};

export function StaffFeedShareSheet({
  visible,
  onClose,
  canCreateFeed,
  onPost,
  onStory,
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
    return list;
  }, [canCreateFeed, onPost, onStory, t]);

  return <FeedCreateAnchorMenu visible={visible} onClose={onClose} items={items} />;
}
