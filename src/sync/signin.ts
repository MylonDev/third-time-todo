/**
 * What someone might paste into the sign-in box. The emailed message can arrive
 * as a code or as a link, depending on how the project's email is set up, and
 * on a phone it is easier to copy a link than to open it: opening it in Safari
 * signs in Safari, not the installed app.
 */
export type SignInInput =
  /** The digits from a code email. */
  | { kind: 'code'; token: string }
  /** The link as it sits in the email: a one-time token still to be exchanged. */
  | { kind: 'link'; tokenHash: string; type: string }
  /** The address the link redirects to once opened, which already holds a session. */
  | { kind: 'session'; accessToken: string; refreshToken: string };

export function parseSignInInput(text: string): SignInInput | null {
  const raw = text.trim();
  if (/^\d{6,10}$/.test(raw.replace(/\s+/g, ''))) {
    return { kind: 'code', token: raw.replace(/\s+/g, '') };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  // A link that was opened first: the session is in the part after the #.
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const accessToken = hash.get('access_token');
  const refreshToken = hash.get('refresh_token');
  if (accessToken && refreshToken) return { kind: 'session', accessToken, refreshToken };

  // A link straight from the email: /auth/v1/verify?token=...&type=magiclink
  const tokenHash = url.searchParams.get('token');
  const type = url.searchParams.get('type');
  if (tokenHash && type) return { kind: 'link', tokenHash, type };

  return null;
}
