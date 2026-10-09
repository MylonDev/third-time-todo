import { useSyncStatus } from '../sync/status';

const LABEL = { idle: 'Synced', syncing: 'Syncing…', offline: 'Offline', error: 'Sync problem' } as const;

/** A quiet word in the header, only once you're signed in. */
export function SyncIndicator() {
  const phase = useSyncStatus((s) => s.phase);
  if (phase !== 'idle' && phase !== 'syncing' && phase !== 'offline' && phase !== 'error') return null;
  return (
    <span
      role="status"
      className={`text-xs ${phase === 'error' ? 'text-debt' : 'text-text-muted'}`}
      data-testid="sync-status"
    >
      {LABEL[phase]}
    </span>
  );
}
