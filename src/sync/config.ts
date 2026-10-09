/**
 * Both values are public by design: the anon key only opens what row level
 * security allows, which is each signed-in user's own rows. The service_role
 * key must never appear in this repo.
 */
export const SUPABASE_URL = 'https://adsovripnuawbofptgml.supabase.co';

/** Fill in from Project Settings, API Keys. Empty keeps sync switched off. */
export const SUPABASE_ANON_KEY: string = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
