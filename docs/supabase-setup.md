# Setting up Supabase

One-time setup for syncing between devices. The app works without it; everything
just stays on the device.

Use a standard Postgres project (not OrioleDB).

## 1. Create your user and close sign-ups

1. Authentication, Users, Add user. Enter your email and tick **Auto Confirm User**.
   Any password will do: you sign in with an emailed code.
2. Authentication, Sign In / Providers, switch off **Allow new users to sign up**.
   Nobody else can then register, and the app never tries to create an account.

## 2. URLs (optional)

Authentication, URL Configuration. Set **Site URL** to
`https://mylondev.github.io/third-time-todo/`, and add that and
`http://localhost:5173` to **Redirect URLs**. Supabase's default is
`http://localhost:3000`, which only matters if you open a sign-in link in a
browser. The app doesn't need you to.

## 3. The sign-in email

Supabase's default email contains a **link**. The app takes that link without
you opening it:

1. Settings, Sync, enter your email, **Email me a sign-in code or link**.
2. In the email, press and hold the link, choose **Copy Link** (on a computer,
   right-click, Copy link address), and paste it into the **Code or link** box.
3. **Sign in.**

Opening the link in a browser instead signs in that browser, not the installed
Home Screen app, which is why it is copied.

If you would rather get a six digit code, the **Magic Link** email template needs
`{{ .Token }}` in it. Supabase only lets you edit templates once custom SMTP is
set up (Authentication, Emails, SMTP Settings), which needs an email provider, so
this is optional. Pasting the code works the same way as pasting the link.

### Or use a password

After your first sign-in, Settings, Sync, **Set a password**. Any device can then
use **Use a password instead**, and the phone can fill it in from its keychain.

## 4. Create the tables

SQL Editor, new query, paste the contents of
`supabase/migrations/20261009120000_sync_schema.sql`, and run it. (If the project
is connected to this repository through the GitHub integration, the file in
`supabase/migrations/` is picked up from there instead.)

It creates three tables, turns **row level security on for each**, and adds a
policy so a signed-in user can only see and change their own rows.

Check: Table Editor should show `time_entries`, `items` and `user_settings`, each
labelled with RLS enabled.

## 5. Give the app the key

Project Settings, API Keys: the **publishable** key (or legacy anon key) is already in
`src/sync/config.ts`. If you ever rotate it, paste the new one there (never the
`service_role` or secret key). The URL and this key are public by
design; row level security is what protects the data.

## 6. Sign in

Once on each device, as described in section 3.
