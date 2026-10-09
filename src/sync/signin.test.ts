import { describe, expect, it } from 'vitest';
import { parseSignInInput } from './signin';

describe('parseSignInInput', () => {
  it('reads a code', () => {
    expect(parseSignInInput('123456')).toEqual({ kind: 'code', token: '123456' });
    expect(parseSignInInput('  12345678\n')).toEqual({ kind: 'code', token: '12345678' });
  });

  it('reads a code that was typed with a space in the middle', () => {
    expect(parseSignInInput('123 456')).toEqual({ kind: 'code', token: '123456' });
  });

  it('reads the link as it sits in the email', () => {
    const url =
      'https://abc.supabase.co/auth/v1/verify?token=pkce_8f3a&type=magiclink&redirect_to=https%3A%2F%2Fexample.com%2F';
    expect(parseSignInInput(url)).toEqual({ kind: 'link', tokenHash: 'pkce_8f3a', type: 'magiclink' });
  });

  it('reads the address a link redirects to, which already holds a session', () => {
    const url = 'http://localhost:3000/#access_token=AAA.BBB.CCC&expires_at=1&refresh_token=rrr&token_type=bearer&type=magiclink';
    expect(parseSignInInput(url)).toEqual({ kind: 'session', accessToken: 'AAA.BBB.CCC', refreshToken: 'rrr' });
  });

  it('prefers the session when a link carries both', () => {
    const url = 'https://x.test/?token=h&type=magiclink#access_token=a&refresh_token=r';
    expect(parseSignInInput(url)?.kind).toBe('session');
  });

  it('refuses a session link missing its refresh token', () => {
    expect(parseSignInInput('https://x.test/#access_token=a')).toBeNull();
  });

  it('refuses anything else', () => {
    expect(parseSignInInput('')).toBeNull();
    expect(parseSignInInput('hello')).toBeNull();
    expect(parseSignInInput('12345')).toBeNull();
    expect(parseSignInInput('https://example.com/')).toBeNull();
  });
});
