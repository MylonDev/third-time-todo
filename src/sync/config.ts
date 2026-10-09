/**
 * Both values are public by design: the publishable key only opens what row
 * level security allows, which is each signed-in user's own rows. The
 * service_role / secret key must never appear in this repo.
 */
export const SUPABASE_URL = 'https://adsovripnuawbofptgml.supabase.co';

/**
 * The e2e suite sets VITE_SUPABASE_ANON_KEY to a dummy so it can exercise
 * sign-in against mocked routes without ever reaching the real project.
 */
export const SUPABASE_ANON_KEY: string =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  'sb_publishable_OLFMNdYF241glTyqChQ-Rg_QGO4pGrE';
