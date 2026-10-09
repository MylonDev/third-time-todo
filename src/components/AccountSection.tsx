import { useState } from 'react';
import { sendCode, setPassword, signInWithPassword, signInWithPasted, signOut, syncNow } from '../sync/runtime';
import { useSyncStatus } from '../sync/status';

const FIELD = 'min-h-12 rounded-lg px-3 bg-surface-2 border border-border text-text outline-none';

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

/** Sign in, and see whether this device is in step with the others. */
export function AccountSection() {
  const { phase, email: signedInAs, error, lastSyncedAt } = useSyncStatus();
  const [email, setEmail] = useState('');
  const [pasted, setPasted] = useState('');
  const [password, setPasswordText] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [step, setStep] = useState<'email' | 'paste' | 'password'>('email');
  const [emailed, setEmailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    setNote(null);
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

      {phase === 'signed-out' && step === 'email' && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await sendCode(email);
              setEmailed(true);
              setStep('paste');
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
              className={FIELD}
            />
          </label>
          <button
            type="submit"
            disabled={busy || email.trim() === ''}
            className="min-h-12 rounded-xl border border-border-strong text-text font-medium cursor-pointer disabled:opacity-40"
          >
            Email me a sign-in code or link
          </button>
          <button
            type="button"
            onClick={() => {
              setStep('password');
              setProblem(null);
            }}
            className="min-h-10 text-sm text-text-muted underline cursor-pointer hover:text-text"
          >
            Use a password instead
          </button>
          <button
            type="button"
            onClick={() => {
              setEmailed(false);
              setStep('paste');
              setProblem(null);
            }}
            className="min-h-10 text-sm text-text-muted underline cursor-pointer hover:text-text"
          >
            I already have a link
          </button>
        </form>
      )}

      {phase === 'signed-out' && step === 'paste' && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await signInWithPasted(email, pasted);
              setStep('email');
              setPasted('');
            });
          }}
        >
          {emailed ? (
            <p className="text-sm text-text-muted">
              We emailed {email}. Paste the code from it, or the link. On a phone, press and hold the link in the email,
              choose Copy Link, and paste it here without opening it.
            </p>
          ) : (
            <>
              <p className="text-sm text-text-muted">
                Paste a sign-in link you already have. A code also works if you enter your email below.
              </p>
              <label className="flex flex-col gap-1.5">
                <span className="section-label">Email (only needed for a code)</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={FIELD}
                />
              </label>
            </>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="section-label">Code or link</span>
            <textarea
              rows={3}
              required
              autoComplete="one-time-code"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              className={`${FIELD} py-2 font-timer text-sm break-all`}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setStep('email');
                setPasted('');
                setProblem(null);
              }}
              className="min-h-12 rounded-xl border border-border text-text-muted font-medium cursor-pointer hover:text-text"
            >
              {emailed ? 'Change email' : 'Back'}
            </button>
            <button
              type="submit"
              disabled={busy || pasted.trim() === ''}
              className="min-h-12 rounded-xl bg-accent text-on-accent font-semibold cursor-pointer disabled:opacity-40"
            >
              Sign in
            </button>
          </div>
        </form>
      )}

      {phase === 'signed-out' && step === 'password' && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await signInWithPassword(email, password);
              setPasswordText('');
              setStep('email');
            });
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="section-label">Email</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="section-label">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPasswordText(e.target.value)}
              className={FIELD}
            />
          </label>
          <button
            type="submit"
            disabled={busy || email.trim() === '' || password === ''}
            className="min-h-12 rounded-xl bg-accent text-on-accent font-semibold cursor-pointer disabled:opacity-40"
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setStep('email');
              setProblem(null);
            }}
            className="min-h-10 text-sm text-text-muted underline cursor-pointer hover:text-text"
          >
            Email me a code or link instead
          </button>
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

          <form
            className="flex flex-col gap-2 border-t border-border pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await setPassword(newPassword);
                setNewPassword('');
                setNote('Password saved. You can sign in with it on any device.');
              });
            }}
          >
            <label className="flex flex-col gap-1.5">
              <span className="section-label">Set a password</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={FIELD}
              />
            </label>
            <span className="text-xs text-text-muted">
              Optional. Lets a device sign in without waiting for an email, and your phone can fill it in.
            </span>
            <button
              type="submit"
              disabled={busy || newPassword.length < 8}
              className="min-h-11 rounded-xl border border-border text-text-muted font-medium cursor-pointer hover:text-text disabled:opacity-40"
            >
              Save password
            </button>
          </form>
        </div>
      )}

      {note && (
        <p role="status" className="text-sm text-text-muted">
          {note}
        </p>
      )}
      {problem && (
        <p role="alert" className="text-sm text-debt">
          {problem}
        </p>
      )}
    </section>
  );
}
