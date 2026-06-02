import { createBrowserClient } from '@supabase/ssr'

let _client: ReturnType<typeof createBrowserClient> | null = null

/** Singleton browser-side Supabase client. Safe to call from client components. */
export function getBrowserSupabase() {
  if (_client) return _client
  _client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  return _client
}
