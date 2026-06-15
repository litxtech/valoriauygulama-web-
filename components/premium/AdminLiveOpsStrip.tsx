import { View, StyleSheet } from 'react-native';
import { LiveStatusIsland } from '@/components/premium/LiveStatusIsland';
import { OpsWidgetGrid } from '@/components/premium/OpsWidgetGrid';
import { AdminLivePeopleList } from '@/components/admin/AdminLivePeopleList';
import { useHotelLiveMetrics } from '@/hooks/useHotelLiveMetrics';

type Props = { refreshKey?: number };

export function AdminLiveOpsStrip({ refreshKey = 0 }: Props) {
  const metrics = useHotelLiveMetrics(refreshKey);

  return (
    <View style={styles.wrap}>
      <LiveStatusIsland metrics={metrics} />
      <OpsWidgetGrid metrics={metrics} />
      <AdminLivePeopleList refreshKey={refreshKey} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 4, paddingBottom: 4 },
});
