import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { LiveStatusIsland } from '@/components/premium/LiveStatusIsland';
import { OpsWidgetGrid } from '@/components/premium/OpsWidgetGrid';
import { useHotelLiveMetrics } from '@/hooks/useHotelLiveMetrics';
import { AiReceptionFab } from '@/components/premium/AiReceptionFab';
import { FeedQuickAssignButton } from '@/components/premium/FeedQuickAssignButton';

type Props = { refreshKey?: number };

/** Feed üstü: durum şeridi + operasyon kısayolları + AI */
export const StaffFeedDashboardStrip = memo(function StaffFeedDashboardStrip({ refreshKey = 0 }: Props) {
  const metrics = useHotelLiveMetrics(refreshKey);

  return (
    <View style={styles.wrap} collapsable={false}>
      <LiveStatusIsland metrics={metrics} />
      <OpsWidgetGrid metrics={metrics} />
      <FeedQuickAssignButton />
      <AiReceptionFab />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { paddingTop: 4 },
});
