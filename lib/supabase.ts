import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.warn('[supabase] Missing env vars: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
}

// Singleton server-side client — uses service_role key for full access.
// Never import this in client components.
export const supabase = createClient(url ?? '', key ?? '', {
  auth: { persistSession: false },
  global: {
    // Next.js patches the server-side global fetch() to add its own Data Cache, and that applies
    // to EVERY fetch() call made during a request — including this SDK's own calls to PostgREST —
    // regardless of a route's own `export const dynamic = 'force-dynamic'` (that governs the
    // route's rendering/caching, not third-party fetches nested inside it). Confirmed live in
    // production: /api/activities?digest=1 kept returning the exact same 9-row result across
    // three separate deployments for a user whose row count a direct Postgres connection
    // correctly reported as 10 — a cached, stale fetch() response silently masquerading as fresh
    // data, not a database, RLS, or auth issue. cache: 'no-store' opts every request this client
    // makes out of that cache explicitly instead of relying on force-dynamic to infer it.
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
  },
})
