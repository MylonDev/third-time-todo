import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

export const syncConfigured = SUPABASE_ANON_KEY !== '';

let client: SupabaseClient | null = null;

/** The one client. Only call this when `syncConfigured`. */
export function supabase(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Sign-in is an emailed code, never a link, so there is nothing in the URL to read.
      detectSessionInUrl: false,
      storageKey: 'tt2-auth',
    },
  });
  return client;
}
