'use client'
import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { getBrowserSupabase } from '@/lib/supabaseBrowser'

export default function ResetPasswordPage() {
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [done,    setDone]    = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: err } = await getBrowserSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/auth/callback?next=/aggiorna-password`,
    })
    setLoading(false)
    if (err) { setError(err.message); return }
    setDone(true)
  }

  return (
    <div className="min-h-screen bg-forest-800 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 gap-3">
          <Image src="/icon-192.png" alt="DTrek" width={72} height={72} className="rounded-2xl shadow-lg" />
          <h1 className="font-display font-bold text-2xl text-white tracking-tight">Diario Trekking</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6">
          {done ? (
            <div className="text-center py-2">
              <CheckCircle2 className="w-12 h-12 text-forest-500 mx-auto mb-3" />
              <h2 className="font-semibold text-lg text-stone-800 mb-2">Email inviata</h2>
              <p className="text-sm text-stone-500">
                Controlla la tua casella di posta e clicca il link per reimpostare la password.
              </p>
              <Link href="/login" className="mt-4 inline-block text-sm font-medium text-forest-600 hover:text-forest-700">
                Torna al login
              </Link>
            </div>
          ) : (
            <>
              <h2 className="font-semibold text-xl text-stone-800 mb-1">Password dimenticata?</h2>
              <p className="text-sm text-stone-500 mb-5">
                Inserisci la tua email e ti mandiamo un link per reimpostare la password.
              </p>

              {error && (
                <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-500/20 transition"
                  placeholder="nome@esempio.it"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-forest-600 hover:bg-forest-700 disabled:opacity-60 text-white font-semibold rounded-lg py-2.5 text-sm transition flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? 'Invio in corso…' : 'Invia link di reset'}
                </button>
              </form>

              <p className="mt-4 text-center text-sm text-stone-500">
                <Link href="/login" className="font-medium text-forest-600 hover:text-forest-700">
                  Torna al login
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
