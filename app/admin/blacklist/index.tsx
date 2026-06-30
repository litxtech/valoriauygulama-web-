import { SecurityBlacklistViewGate } from '@/components/securityBlacklist/SecurityBlacklistViewGate';
import { SecurityBlacklistListScreen } from '@/components/securityBlacklist/SecurityBlacklistListScreen';

export default function AdminSecurityBlacklistIndex() {
  return (
    <SecurityBlacklistViewGate>
      <SecurityBlacklistListScreen />
    </SecurityBlacklistViewGate>
  );
}
