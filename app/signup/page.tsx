'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react'
import { getBrowserSupabase } from '@/lib/supabaseBrowser'

const ERRORS: Record<string, string> = {
  'User already registered': 'Questa email è già registrata. Prova ad accedere.',
  'Password should be at least 6 characters': 'La password deve avere almeno 6 caratteri.',
  'Signup requires a valid password': 'Inserisci una password valida.',
}

function mapError(msg: string) {
  return ERRORS[msg] ?? `Registrazione non riuscita: ${msg}`
}

export default function SignupPage() {
  const router = useRouter()

  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [done,     setDone]     = useState(false)   // email confirmation sent

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) { setError('La password deve avere almeno 6 caratteri.'); return }
    setError(null)
    setLoading(true)

    const { error: err } = await getBrowserSupabase().auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name.trim() || null },
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    })

    setLoading(false)

    if (err) { setError(mapError(err.message)); return }

    // Supabase may auto-confirm (if email confirm is disabled in project settings)
    // or send a confirmation email. Either way, redirect works.
    const { data: { session } } = await getBrowserSupabase().auth.getSession()
    if (session) {
      router.push('/')
      router.refresh()
    } else {
      setDone(true)  // waiting for email confirmation
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-forest-800 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8 text-center">
          <CheckCircle2 className="w-14 h-14 text-forest-500 mx-auto mb-4" />
          <h2 className="font-bold text-xl text-stone-800 mb-2">Controlla la tua email</h2>
          <p className="text-stone-500 text-sm">
            Abbiamo inviato un link di conferma a <strong>{email}</strong>.
            Clicca il link per attivare il tuo account.
          </p>
          <Link href="/login" className="mt-6 inline-block text-sm font-medium text-forest-600 hover:text-forest-700">
            Torna al login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-forest-800 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        <div className="flex flex-col items-center mb-8 gap-3">
          <Image src="/icon-192.png" alt="DTrek" width={72} height={72} className="rounded-2xl shadow-lg" />
          <div className="text-center">
            <h1 className="font-display font-bold text-2xl text-white tracking-tight">Diario Trekking</h1>
            <p className="text-forest-300 text-sm mt-0.5">Crea il tuo account</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6">
          <h2 className="font-semibold text-xl text-stone-800 mb-5">Registrati</h2>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Nome (opzionale)</label>
              <input
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-500/20 transition"
                placeholder="Mario Rossi"
              />
            </div>

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
              <label className="block text-sm font-medium text-stone-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2.5 pr-10 text-sm outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-500/20 transition"
                  placeholder="Almeno 6 caratteri"
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
              {loading ? 'Registrazione in corso…' : 'Registrati'}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-stone-500">
            Hai già un account?{' '}
            <Link href="/login" className="font-medium text-forest-600 hover:text-forest-700">
              Accedi
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
