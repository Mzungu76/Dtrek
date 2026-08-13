'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabase } from '@/lib/supabaseBrowser'
import { lsClearAll } from '@/lib/localStore'
import { clearProfile } from '@/lib/userProfile'
import { Loader2, ChevronDown, TriangleAlert } from 'lucide-react'

/**
 * Danger zone — cancellazione account e di tutti i dati personali (docs/navigator-dtrek-boundary.md).
 * Conferma per digitazione dell'email esatta, stesso pattern di sicurezza usato da GitHub/Vercel per
 * azioni distruttive senza ritorno: un click da solo è troppo facile da premere per sbaglio.
 */
export default function SectionEliminaAccount() {
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadEmail() {
      const { data } = await getBrowserSupabase().auth.getUser()
      setEmail(data.user?.email ?? null)
    }
    loadEmail()
  }, [])

  const canDelete = !!email && confirmText.trim().toLowerCase() === email.toLowerCase()

  async function handleDelete() {
    if (!canDelete || deleting) return
    setError(null)
    setDeleting(true)
    try {
      const res = await fetch('/api/account/delete', { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message || body.error || `Errore ${res.status}`)
      }
      await getBrowserSupabase().auth.signOut()
      await lsClearAll()
      clearProfile()
      router.push('/login')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Eliminazione non riuscita — riprova.')
      setDeleting(false)
    }
  }

  return (
    <details className="group bg-white rounded-2xl border border-red-200 shadow-sm overflow-hidden">
      <summary className="cursor-pointer list-none flex items-center justify-between gap-3 p-6 select-none">
        <div className="flex items-center gap-2.5">
          <TriangleAlert className="w-5 h-5 text-red-500 shrink-0" />
          <div>
            <h2 className="text-sm font-semibold text-red-700">Elimina account</h2>
            <p className="text-xs text-stone-400">Cancella definitivamente il tuo account e tutti i tuoi dati</p>
          </div>
        </div>
        <ChevronDown className="w-4 h-4 text-stone-400 shrink-0 transition-transform group-open:rotate-180" />
      </summary>

      <div className="px-6 pb-6 pt-1 border-t border-red-100 space-y-4">
        <p className="text-sm text-stone-600">
          Elimina in modo permanente il tuo account e tutti i percorsi, resoconti, foto, diario e impostazioni
          associati — l&apos;email torna subito libera per una nuova registrazione. Non è reversibile.
          I dati eventualmente confluiti in cache condivise tra utenti (es. testi generati sui punti di
          interesse) restano, come per ogni altro utente.
        </p>

        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">
            Scrivi <strong>{email ?? 'la tua email'}</strong> per confermare
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            disabled={!email || deleting}
            className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition disabled:opacity-60"
            placeholder="nome@esempio.it"
            autoComplete="off"
          />
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          onClick={handleDelete}
          disabled={!canDelete || deleting}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition"
        >
          {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
          {deleting ? 'Eliminazione in corso…' : 'Elimina account definitivamente'}
        </button>
      </div>
    </details>
  )
}
