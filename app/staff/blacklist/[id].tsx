import { SecurityBlacklistViewGate } from '@/components/securityBlacklist/SecurityBlacklistViewGate';
import { SecurityBlacklistDetailScreen } from '@/components/securityBlacklist/SecurityBlacklistDetailScreen';

export default function StaffSecurityBlacklistDetail() {
  return (
    <SecurityBlacklistViewGate>
      <SecurityBlacklistDetailScreen />
    </SecurityBlacklistViewGate>
  );
}
