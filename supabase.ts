import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder';

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.warn("Supabase URL and Key are missing. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your AI Studio Secrets.");
}

export const supabase = createClient(supabaseUrl, supabaseKey);
