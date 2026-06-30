import { SecurityBlacklistViewGate } from '@/components/securityBlacklist/SecurityBlacklistViewGate';
import { SecurityBlacklistDetailScreen } from '@/components/securityBlacklist/SecurityBlacklistDetailScreen';

export default function AdminSecurityBlacklistDetail() {
  return (
    <SecurityBlacklistViewGate>
      <SecurityBlacklistDetailScreen />
    </SecurityBlacklistViewGate>
  );
}
