'use client'
import { Suspense } from 'react'
import RedirectTo from '@/app/components/RedirectTo'

/**
 * Questa pagina non esiste più — "le raccolte diventano gli scaffali" (richiesta esplicita
 * dell'utente, supabase/migrations/merge_shelves_into_collections.sql): l'elenco delle raccolte
 * era questa pagina, ora è il banner degli scaffali in /diari (components/libreria/
 * ScaffaliBanner.tsx). Componizione e pubblicazione di UNA raccolta restano su /raccolte/[id],
 * raggiungibile da lì ("Pubblica" su ogni scaffale) — solo l'elenco confluisce nella Libreria.
 * Elenco completo delle 8 pagine-lapide in docs/diario-valutazione-ux-piano.md §5.4.
 */
export default function RaccoltePage() {
  return (
    <Suspense>
      <RedirectTo href="/diari" />
    </Suspense>
  )
}
