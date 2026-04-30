import { createClient } from '@supabase/supabase-js';

import { config } from '@/config/index';
import type { Database } from '@/types/supabase';

if (!config?.SUPABASE_URL || !config?.SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase configuration environment variables.');
}

// Public client — uses anon key, respects RLS
export const supabase = createClient<Database>(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// Admin client — bypasses RLS, for server-side operations only
export const supabaseAdmin = createClient<Database>(
  config.SUPABASE_URL,
  config.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);