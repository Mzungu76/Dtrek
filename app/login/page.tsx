'use client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { getBrowserSupabase } from '@/lib/supabaseBrowser'
import type { Session } from '@supabase/supabase-js'

const ERRORS: Record<string, string> = {
  'Invalid login credentials': 'Email o password non corretti.',
  'Email not confirmed':        'Controlla la tua email e clicca il link di conferma.',
  'Too many requests':          'Troppi tentativi. Riprova tra qualche minuto.',
  'auth':                       'Errore di autenticazione. Riprova.',
}

function mapError(msg: string) {
  return ERRORS[msg] ?? `Accesso non riuscito: ${msg}`
}

export default function LoginPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const next         = searchParams.get('next') ?? '/'

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(
    searchParams.get('error') ? mapError(searchParams.get('error')!) : null,
  )

  // If already logged in, redirect immediately
  useEffect(() => {
    getBrowserSupabase().auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      if (data.session) router.replace(next)
    })
  }, [next, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: err } = await getBrowserSupabase().auth.signInWithPassword({ email, password })
    setLoading(false)
    if (err) { setError(mapError(err.message)); return }
    router.push(next)
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-forest-800 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <Image src="/icon-192.png" alt="DTrek" width={72} height={72} className="rounded-2xl shadow-lg" />
          <div className="text-center">
            <h1 className="font-display font-bold text-2xl text-white tracking-tight">Diario Trekking</h1>
            <p className="text-forest-300 text-sm mt-0.5">Il tuo diario personale di escursioni</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <h2 className="font-semibold text-xl text-stone-800 mb-5">Accedi</h2>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Email</label>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-500/20 transition"
                placeholder="nome@esempio.it"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-stone-700">Password</label>
                <Link href="/reset-password" className="text-xs text-forest-600 hover:text-forest-700">
                  Password dimenticata?
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2.5 pr-10 text-sm outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-500/20 transition"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-forest-600 hover:bg-forest-700 disabled:opacity-60 text-white font-semibold rounded-lg py-2.5 text-sm transition flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Accesso in corso…' : 'Accedi'}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-stone-500">
            Non hai un account?{' '}
            <Link href="/signup" className="font-medium text-forest-600 hover:text-forest-700">
              Registrati
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
