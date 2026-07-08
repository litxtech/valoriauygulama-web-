import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { LiveStatusIsland } from '@/components/premium/LiveStatusIsland';
import { OpsWidgetGrid } from '@/components/premium/OpsWidgetGrid';
import { AdminLivePeopleList } from '@/components/admin/AdminLivePeopleList';
import { useHotelLiveMetrics } from '@/hooks/useHotelLiveMetrics';
import { ADMIN_HOME_LIVE_PEOPLE } from '@/lib/adminHomePerf';

type Props = {
  refreshKey?: number;
  /** Canlı kişi listesi (ek ağ yükü) */
  showPeople?: boolean;
};

function AdminLiveOpsStripInner({
  refreshKey = 0,
  showPeople = ADMIN_HOME_LIVE_PEOPLE,
}: Props) {
  const metrics = useHotelLiveMetrics(refreshKey, { enablePolling: true });

  return (
    <View style={styles.wrap}>
      <LiveStatusIsland metrics={metrics} />
      <OpsWidgetGrid metrics={metrics} />
      {showPeople ? <AdminLivePeopleList refreshKey={refreshKey} includeMapSnapshot={false} /> : null}
    </View>
  );
}

export const AdminLiveOpsStrip = memo(AdminLiveOpsStripInner);

const styles = StyleSheet.create({
  wrap: { paddingTop: 4, paddingBottom: 4 },
});
