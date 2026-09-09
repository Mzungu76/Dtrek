'use client'
import { Suspense, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

/**
 * Questa pagina non esiste più — "le raccolte diventano gli scaffali" (richiesta esplicita
 * dell'utente, supabase/migrations/merge_shelves_into_collections.sql): l'elenco delle raccolte
 * era questa pagina, ora è il banner degli scaffali in /diari (components/libreria/
 * ScaffaliBanner.tsx). Componizione e pubblicazione di UNA raccolta restano su /raccolte/[id],
 * raggiungibile da lì ("Pubblica" su ogni scaffale) — solo l'elenco confluisce nella Libreria.
 */
function RaccoltePageInner() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/diari')
  }, [router])

  return (
    <div className="flex items-center justify-center py-24 text-stone-400">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  )
}

export default function RaccoltePage() {
  return (
    <Suspense>
      <RaccoltePageInner />
    </Suspense>
  )
}
