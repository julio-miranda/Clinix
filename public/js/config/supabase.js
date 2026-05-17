import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://ealnghnhwuyjdsnpzwkx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_SdLcM21SyaMBWdcNpMgH6w_eJ8JUQCT";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});