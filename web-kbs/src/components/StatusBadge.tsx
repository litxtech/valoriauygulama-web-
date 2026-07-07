import type { KbsCaptureCardStatus } from '../lib/parse';

export function StatusBadge({ status }: { status: KbsCaptureCardStatus }) {
  return <span className={`badge badge-${status.tone}`}>{status.label}</span>;
}
