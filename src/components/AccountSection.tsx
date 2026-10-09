import { useState } from 'react';
import { sendCode, signOut, syncNow, verifyCode } from '../sync/runtime';
import { useSyncStatus } from '../sync/status';

function statusLine(phase: string, error: string | null, lastSyncedAt: number | null): string {
  switch (phase) {
    case 'syncing':
      return 'Syncing…';
    case 'offline':
      return 'Offline. Your changes are kept and will sync when you are back.';
    case 'error':
      return `Sync problem: ${error ?? 'unknown'}. Trying again shortly.`;
    default:
      return lastSyncedAt
        ? `Synced at ${new Date(lastSyncedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}.`
        : 'Signed in.';
  }
}

/** Sign in with an emailed code, and see whether this device is in step with the others. */
export function AccountSection() {
  const { phase, email: signedInAs, error, lastSyncedAt } = useSyncStatus();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    try {
      await work();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Account" className="flex flex-col gap-3 border-t border-border pt-5">
      <h3 className="section-label">Sync</h3>

      {phase === 'off' && (
        <p className="text-sm text-text-muted">Sync is not switched on in this build. Everything stays on this device.</p>
      )}

      {phase === 'signed-out' && !sent && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await sendCode(email);
              setSent(true);
            });
          }}
        >
          <p className="text-sm text-text-muted">Sign in to keep your phone and computer in step.</p>
          <label className="flex flex-col gap-1.5">
            <span className="section-label">Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-12 rounded-lg px-3 bg-surface-2 border border-border text-text outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={busy || email.trim() === ''}
            className="min-h-12 rounded-xl border border-border-strong text-text font-medium cursor-pointer disabled:opacity-40"
          >
            Send code
          </button>
        </form>
      )}

      {phase === 'signed-out' && sent && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await verifyCode(email, code);
              setSent(false);
              setCode('');
            });
          }}
        >
          <p className="text-sm text-text-muted">We emailed a code to {email}. It can take a minute.</p>
          <label className="flex flex-col gap-1.5">
            <span className="section-label">Code</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="min-h-12 rounded-lg px-3 bg-surface-2 border border-border text-text outline-none font-timer"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setSent(false);
                setCode('');
                setProblem(null);
              }}
              className="min-h-12 rounded-xl border border-border text-text-muted font-medium cursor-pointer hover:text-text"
            >
              Change email
            </button>
            <button
              type="submit"
              disabled={busy || code.trim() === ''}
              className="min-h-12 rounded-xl bg-accent text-on-accent font-semibold cursor-pointer disabled:opacity-40"
            >
              Sign in
            </button>
          </div>
        </form>
      )}

      {phase !== 'off' && phase !== 'signed-out' && (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            Signed in as <strong>{signedInAs}</strong>
          </p>
          <p role="status" className="text-sm text-text-muted">
            {statusLine(phase, error, lastSyncedAt)}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={syncNow}
              className="min-h-12 rounded-xl border border-border-strong text-text font-medium cursor-pointer hover:bg-surface-2"
            >
              Sync now
            </button>
            <button
              type="button"
              onClick={() => void run(signOut)}
              disabled={busy}
              className="min-h-12 rounded-xl border border-border text-text-muted font-medium cursor-pointer hover:text-text"
            >
              Sign out
            </button>
          </div>
        </div>
      )}

      {problem && (
        <p role="alert" className="text-sm text-debt">
          {problem}
        </p>
      )}
    </section>
  );
}
