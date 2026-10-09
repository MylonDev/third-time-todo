import type { RealtimeChannel } from '@supabase/supabase-js';
import { useItems } from '../store/items';
import { useSettings } from '../store/settings';
import { useTimer } from '../store/timer';
import { FRESH_CURSORS, mergeIncoming, syncOnce, type Local } from './engine';
import { supabaseRemote } from './remote';
import { parseSignInInput } from './signin';
import { useSyncMeta, useSyncStatus } from './status';
import { supabase, syncConfigured } from './supabase';

const RETRY_MS = 15_000;
const SAFETY_NET_MS = 5 * 60_000;

/** The app's stores, seen as the engine wants them. */
const local: Local = {
  read: () => {
    const s = useSettings.getState();
    return {
      entries: useTimer.getState().entries,
      items: useItems.getState().items,
      settings: { dayEndHour: s.dayEndHour, shouldTargetMin: s.shouldTargetMin, updatedAt: s.updatedAt },
    };
  },
  apply: (incoming) => {
    const cur = local.read();
    const next = mergeIncoming(cur, incoming);
    if (next === cur) return;
    // Only write what changed, so an idle sync wakes nothing.
    if (next.entries !== cur.entries) useTimer.setState({ entries: next.entries });
    if (next.items !== cur.items) useItems.setState({ items: next.items });
    if (next.settings !== cur.settings) useSettings.setState({ ...next.settings });
  },
};

type Kind = 'push' | 'full';

let pending: Kind | null = null;
let running = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let channel: RealtimeChannel | null = null;
let started = false;

function schedule(kind: Kind, delayMs: number) {
  pending = pending === 'full' || kind === 'full' ? 'full' : 'push';
  clearTimeout(timer);
  timer = setTimeout(flush, delayMs);
}

async function flush() {
  const { userId } = useSyncStatus.getState();
  if (!userId || !pending) return;
  if (running) return; // the run in flight reschedules itself if more came in
  const kind = pending;
  pending = null;
  running = true;
  useSyncStatus.setState({ phase: 'syncing', error: null });

  try {
    const meta = useSyncMeta.getState();
    const cursors = meta.userId === userId ? meta.cursors : FRESH_CURSORS;
    const next = await syncOnce(local, supabaseRemote(supabase(), userId), cursors, { pull: kind === 'full' });
    useSyncMeta.getState().set(userId, next);
    useSyncStatus.setState({ phase: 'idle', lastSyncedAt: Date.now(), error: null });
  } catch (e) {
    const offline = !navigator.onLine || (e instanceof TypeError && /fetch|network/i.test(e.message));
    useSyncStatus.setState({
      phase: offline ? 'offline' : 'error',
      error: e instanceof Error ? e.message : 'Sync failed',
    });
    // Whatever failed, it is retried: nothing is lost, the rows are still local.
    pending = 'full';
    clearTimeout(timer);
    timer = setTimeout(flush, RETRY_MS);
  } finally {
    running = false;
    if (pending && useSyncStatus.getState().phase !== 'offline' && useSyncStatus.getState().phase !== 'error') {
      schedule(pending, 0);
    }
  }
}

function listen() {
  // The e2e suite has no websocket server to talk to, so it switches this off.
  if (channel || import.meta.env.VITE_SYNC_REALTIME === 'off') return;
  const sb = supabase();
  const ping = () => schedule('full', 200);
  channel = sb
    .channel('tt-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'time_entries' }, ping)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, ping)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'user_settings' }, ping)
    .subscribe();
}

function stopListening() {
  if (channel) void supabase().removeChannel(channel);
  channel = null;
}

function onSession(session: { user: { id: string; email?: string } } | null) {
  if (session) {
    useSyncStatus.setState({
      userId: session.user.id,
      email: session.user.email ?? null,
      phase: 'idle',
    });
    listen();
    schedule('full', 0);
  } else {
    stopListening();
    clearTimeout(timer);
    pending = null;
    useSyncStatus.setState({ userId: null, email: null, phase: 'signed-out', error: null });
  }
}

/** Sign in with the code from the email. Throws with a readable message. */
export async function sendCode(email: string) {
  const { error } = await supabase().auth.signInWithOtp({
    email: email.trim(),
    // Sign-ups are closed: this is a single-user app and the account exists already.
    options: { shouldCreateUser: false },
  });
  if (error) throw new Error(error.message);
}

export async function verifyCode(email: string, token: string) {
  const { error } = await supabase().auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'email' });
  if (error) throw new Error(error.message);
}

/**
 * Finish signing in from whatever was pasted: the code from the email, or its
 * link (copied from the message, or from the address bar after opening it).
 */
export async function signInWithPasted(email: string, pasted: string) {
  const input = parseSignInInput(pasted);
  if (!input) throw new Error('That is not a code or a sign-in link. Copy the whole link from the email.');
  const auth = supabase().auth;

  if (input.kind === 'code') {
    if (!email.trim()) throw new Error('Enter your email first. A code needs it.');
    return verifyCode(email, input.token);
  }
  const { error } =
    input.kind === 'session'
      ? await auth.setSession({ access_token: input.accessToken, refresh_token: input.refreshToken })
      : await auth.verifyOtp({ token_hash: input.tokenHash, type: input.type as 'magiclink' });
  if (error) throw new Error(error.message);
}

export async function signInWithPassword(email: string, password: string) {
  const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(error.message);
}

/** Set (or change) the password for the account you are signed in to. */
export async function setPassword(password: string) {
  const { error } = await supabase().auth.updateUser({ password });
  if (error) throw new Error(error.message);
}

/** Sign out. What is on this device stays on this device. */
export async function signOut() {
  await supabase().auth.signOut();
  useSyncMeta.getState().set(null, FRESH_CURSORS);
}

/** Retry now, e.g. from the Account screen. */
export function syncNow() {
  schedule('full', 0);
}

/** Start syncing if this build has a Supabase key. Safe to call once at startup. */
export function startSync() {
  if (started) return;
  started = true;
  if (!syncConfigured) return;

  useSyncStatus.setState({ phase: 'signed-out' });
  const sb = supabase();
  void sb.auth.getSession().then(({ data }) => onSession(data.session));
  sb.auth.onAuthStateChange((_event, session) => {
    const had = useSyncStatus.getState().userId;
    if ((session?.user.id ?? null) !== had) onSession(session);
  });

  // Anything the user does is sent shortly after; coming back to the app, or the
  // network returning, is when other devices' changes are fetched.
  const changed = () => schedule('push', 800);
  useTimer.subscribe(changed);
  useItems.subscribe(changed);
  useSettings.subscribe(changed);
  const resume = () => schedule('full', 0);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && resume());
  window.addEventListener('online', resume);
  window.addEventListener('focus', resume);
  // The realtime socket can die quietly, particularly on a phone.
  setInterval(() => document.visibilityState === 'visible' && resume(), SAFETY_NET_MS);
}
