import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'

const VALID_OTP_TYPES: EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email']

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code      = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type      = searchParams.get('type')
  const next      = searchParams.get('next') ?? '/'

  const validType = type && VALID_OTP_TYPES.includes(type as EmailOtpType) ? (type as EmailOtpType) : null

  if (code || (tokenHash && validType)) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll:  () => cookieStore.getAll(),
          setAll: (list) => list.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)),
        },
      },
    )

    // token_hash/verifyOtp non dipende dal code_verifier salvato nel browser che ha avviato la
    // richiesta (a differenza di exchangeCodeForSession sotto, flusso PKCE) — funziona anche
    // quando il link di conferma/reset via email si apre in un browser o dispositivo diverso da
    // quello di partenza, il caso più comune dietro un generico "Errore di autenticazione" per chi
    // apre l'email altrove. Richiede che il template email su Supabase usi {{ .TokenHash }} invece
    // del solo {{ .ConfirmationURL }} — vedi docs/navigator-dtrek-boundary.md per i template esatti.
    const { error } = tokenHash && validType
      ? await supabase.auth.verifyOtp({ type: validType, token_hash: tokenHash })
      : await supabase.auth.exchangeCodeForSession(code!)

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
