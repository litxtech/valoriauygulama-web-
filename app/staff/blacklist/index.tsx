import { SecurityBlacklistViewGate } from '@/components/securityBlacklist/SecurityBlacklistViewGate';
import { SecurityBlacklistListScreen } from '@/components/securityBlacklist/SecurityBlacklistListScreen';

export default function StaffSecurityBlacklistIndex() {
  return (
    <SecurityBlacklistViewGate>
      <SecurityBlacklistListScreen />
    </SecurityBlacklistViewGate>
  );
}
