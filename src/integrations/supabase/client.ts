import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Export these for use in direct API calls (e.g., edge function calls)
// Use environment variables with hardcoded fallbacks for backwards compatibility
// NOTE: The anon key is a *public* key (embedded in client JS) — it is NOT a secret.
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://vhzipqarkmmfuqadefep.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoemlwcWFya21tZnVxYWRlZmVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY2MTcxMTMsImV4cCI6MjA2MjE5MzExM30.M653TuQcthJx8vZW4jPkUTdB67D_Dm48ItLcu_XBh2g';

// Supabase client
// IMPORTANT: do not override storageKey/storage; letting supabase-js manage this
// ensures the user session is correctly loaded and Authorization uses the user JWT.
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

/**
 * Type-safe accessor for tables not yet in the generated Database types.
 * Returns an untyped query builder — prefer adding the table to the codegen
 * schema long-term, but this avoids scattering `as any` throughout the codebase.
 *
 * Usage: `untypedFrom('my_new_table').select('*')`
 */
type KnownTable = keyof Database['public']['Tables'];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function untypedFrom(table: string) {
  return supabase.from(table as KnownTable) as any;
}
