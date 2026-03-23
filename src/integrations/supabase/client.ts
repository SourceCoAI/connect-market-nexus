import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// C-10 FIX: Warn loudly when falling back to hardcoded credentials so misconfiguration
// is visible during development. Fallbacks kept to avoid breaking production.
const SUPABASE_FALLBACK_URL = 'https://vhzipqarkmmfuqadefep.supabase.co';
const SUPABASE_FALLBACK_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoemlwcWFya21tZnVxYWRlZmVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY2MTcxMTMsImV4cCI6MjA2MjE5MzExM30.M653TuQcthJx8vZW4jPkUTdB67D_Dm48ItLcu_XBh2g';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || SUPABASE_FALLBACK_URL;
export const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || SUPABASE_FALLBACK_KEY;

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.warn(
    '[SUPABASE] WARNING: Using hardcoded fallback credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.',
  );
}

// Supabase client
// IMPORTANT: do not override storageKey/storage; letting supabase-js manage this
// ensures the user session is correctly loaded and Authorization uses the user JWT.
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
