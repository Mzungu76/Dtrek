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
})
