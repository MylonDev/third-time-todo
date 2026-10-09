import type { Page, Request } from '@playwright/test';
import { addItem, advance, expect, test } from './helpers';

const USER = { id: '33333333-3333-3333-3333-333333333333', email: 'me@example.com' };

/** A token shaped like a real one. Nothing checks the signature on the device. */
function fakeJwt(): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, role: 'authenticated', exp: 4_102_444_800 })}.sig`;
}

const session = () => ({
  access_token: fakeJwt(),
  token_type: 'bearer',
  expires_in: 3600,
  refresh_token: 'refresh',
  user: { id: USER.id, aud: 'authenticated', role: 'authenticated', email: USER.email, app_metadata: {}, user_metadata: {} },
});

interface Mock {
  writes: { table: string; url: string; body: unknown }[];
  /** Rows the "server" returns for a table, as if another device had written them. */
  serve: Record<string, object[]>;
  otpRequests: object[];
  codeIsGood: boolean;
}

async function mockSupabase(page: Page): Promise<Mock> {
  const mock: Mock = { writes: [], serve: {}, otpRequests: [], codeIsGood: true };

  await page.route('**/auth/v1/otp**', async (route) => {
    mock.otpRequests.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/auth/v1/verify**', async (route) => {
    if (!mock.codeIsGood) {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session()) });
  });
  await page.route('**/auth/v1/logout**', (route) => route.fulfill({ status: 204, body: '' }));
  await page.route('**/rest/v1/**', async (route) => {
    const req: Request = route.request();
    const table = new URL(req.url()).pathname.split('/').pop() ?? '';
    if (req.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock.serve[table] ?? []) });
    } else {
      mock.writes.push({ table, url: req.url(), body: req.postDataJSON() });
      await route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    }
  });
  return mock;
}

async function signIn(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Email').fill(USER.email);
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('signing in', () => {
  test('asks for an email, then a code, and never creates an account', async ({ app }) => {
    const mock = await mockSupabase(app);
    await signIn(app);

    await expect(app.getByText(`Signed in as`)).toBeVisible();
    await expect(app.getByText(USER.email)).toBeVisible();
    expect(mock.otpRequests).toHaveLength(1);
    expect(mock.otpRequests[0]).toMatchObject({ email: USER.email, create_user: false });
  });

  test('shows why a wrong code was refused and lets you try again', async ({ app, allowedErrors }) => {
    // The browser notes the 403 itself; the app is expected to handle it.
    allowedErrors.push(/status of 403/);
    const mock = await mockSupabase(app);
    mock.codeIsGood = false;
    await signIn(app);
    await expect(app.getByRole('alert')).toContainText('invalid');
    await expect(app.getByText('Signed in as')).toHaveCount(0);

    mock.codeIsGood = true;
    await app.getByRole('button', { name: 'Sign in' }).click();
    await expect(app.getByText('Signed in as')).toBeVisible();
  });

  test('the session survives a reload', async ({ app }) => {
    await mockSupabase(app);
    await signIn(app);
    await expect(app.getByText('Signed in as')).toBeVisible();
    await app.getByRole('button', { name: 'Done' }).click();

    await app.reload();
    await expect(app.getByTestId('sync-status')).toBeVisible();
    await app.getByRole('button', { name: 'Settings' }).click();
    await expect(app.getByText(USER.email)).toBeVisible();
  });

  test('signing out keeps what is on the device', async ({ app }) => {
    await mockSupabase(app);
    await addItem(app, 'Should', 'Keep me');
    await signIn(app);
    await app.getByRole('button', { name: 'Sign out' }).click();
    await expect(app.getByRole('button', { name: 'Send code' })).toBeVisible();
    await app.getByRole('button', { name: 'Done' }).click();
    await expect(app.getByRole('checkbox', { name: 'Keep me' })).toBeVisible();
  });
});

test.describe('syncing', () => {
  test('sends a new item to the server, owned by the signed-in user', async ({ app }) => {
    const mock = await mockSupabase(app);
    await signIn(app);
    await expect(app.getByText('Signed in as')).toBeVisible();
    await app.getByRole('button', { name: 'Done' }).click();
    await advance(app, 2000);

    await addItem(app, 'Want', 'Play guitar');
    await advance(app, 2000);

    await expect.poll(() => mock.writes.filter((w) => w.table === 'items').length).toBeGreaterThan(0);
    const write = mock.writes.filter((w) => w.table === 'items').at(-1)!;
    expect(write.url).toContain('on_conflict=user_id%2Cid');
    expect(write.body).toEqual([
      expect.objectContaining({ text: 'Play guitar', kind: 'want', user_id: USER.id, done: false }),
    ]);
  });

  test('shows an item another device added', async ({ app }) => {
    const mock = await mockSupabase(app);
    mock.serve['items'] = [
      {
        id: 'from-phone',
        text: 'Added on the phone',
        kind: 'should',
        due_on: '2026-10-12',
        done: false,
        done_at: null,
        repeat: null,
        series_id: null,
        next_id: null,
        sort_order: 1,
        updated_at: 1_760_000_000_000,
        deleted_at: null,
        server_updated_at: '2026-10-12T09:00:00.000001+00:00',
      },
    ];
    await signIn(app);
    await app.getByRole('button', { name: 'Done' }).click();
    await advance(app, 2000);

    await expect(app.getByRole('checkbox', { name: 'Added on the phone' })).toBeVisible();
  });

  test('a timer started while signed in is sent as a running entry', async ({ app }) => {
    const mock = await mockSupabase(app);
    await signIn(app);
    await expect(app.getByText('Signed in as')).toBeVisible();
    await app.getByRole('button', { name: 'Done' }).click();
    await advance(app, 2000);

    await app.getByRole('group', { name: 'Timer state' }).getByRole('button', { name: 'Should', exact: true }).click();
    await advance(app, 2000);

    await expect.poll(() => mock.writes.filter((w) => w.table === 'time_entries').length).toBeGreaterThan(0);
    const body = mock.writes.filter((w) => w.table === 'time_entries').at(-1)!.body as Record<string, unknown>[];
    expect(body[0]).toMatchObject({ state: 'should', ended_at: null, user_id: USER.id });
  });

  test('works with no sign-in at all', async ({ app }) => {
    await addItem(app, 'Should', 'Just local');
    await app.reload();
    await expect(app.getByRole('checkbox', { name: 'Just local' })).toBeVisible();
    await expect(app.getByTestId('sync-status')).toHaveCount(0);
  });
});
