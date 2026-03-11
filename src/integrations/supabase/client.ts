import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Export these for use in direct API calls (e.g., edge function calls)
// SECURITY: Require environment variables — no hardcoded credentials
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.',
  );
}

export const SUPABASE_URL: string = supabaseUrl;
export const SUPABASE_PUBLISHABLE_KEY: string = supabaseAnonKey;

// Supabase client
// IMPORTANT: do not override storageKey/storage; letting supabase-js manage this
// ensures the user session is correctly loaded and Authorization uses the user JWT.
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
