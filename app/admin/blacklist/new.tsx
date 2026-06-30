import { SecurityBlacklistAccessGate } from '@/components/securityBlacklist/SecurityBlacklistAccessGate';
import { SecurityBlacklistNewScreen } from '@/components/securityBlacklist/SecurityBlacklistNewScreen';

export default function AdminSecurityBlacklistNew() {
  return (
    <SecurityBlacklistAccessGate>
      <SecurityBlacklistNewScreen />
    </SecurityBlacklistAccessGate>
  );
}
