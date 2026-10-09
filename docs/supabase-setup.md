# Setting up Supabase

One-time setup for syncing between devices. The app works without it; everything
just stays on the device.

Use a standard Postgres project (not OrioleDB).

## 1. Create your user and close sign-ups

1. Authentication, Users, Add user. Enter your email and tick **Auto Confirm User**.
   Any password will do: you sign in with an emailed code.
2. Authentication, Sign In / Providers, switch off **Allow new users to sign up**.
   Nobody else can then register, and the app never tries to create an account.

## 2. URLs

Authentication, URL Configuration:

- **Site URL:** `https://mylondev.github.io/third-time-todo/`
- **Redirect URLs:** the same URL, and `http://localhost:5173`

## 3. Show the code in the email

Authentication, Emails, Templates, **Magic Link**. The default only holds a link,
which opens in Safari and doesn't sign the installed app in. Put the code in:

```html
<h2>Your Third Time code</h2>
<p>{{ .Token }}</p>
```

Supabase's built-in email sender is rate limited to a few messages an hour, which
is plenty for signing in on a new device.

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

Open the app, Settings, Sync. Enter your email, then the code from the email.
Do this once on each device.
