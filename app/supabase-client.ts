import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Only create the client in the browser where `NEXT_PUBLIC_` env vars are expected.
// This prevents build-time prerender errors when env vars are not available.
let supabase: ReturnType<typeof createClient> | null = null;
if (typeof window !== "undefined" && supabaseUrl && supabaseAnonKey) {
	supabase = createClient(supabaseUrl, supabaseAnonKey);
}

export default supabase as unknown as ReturnType<typeof createClient> | null;
