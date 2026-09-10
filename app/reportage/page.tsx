'use client'
import { Suspense } from 'react'
import RedirectTo from '@/app/components/RedirectTo'

/**
 * Questa pagina non esiste più — su richiesta esplicita dell'utente, "Tutti i Reportage" è stata
 * eliminata insieme alla voce "Reportage" della barra in basso (components/Navbar.tsx): un
 * Reportage si raggiunge ora solo entrando nel suo Diario, che li elenca (app/diari/[id]/page.tsx).
 * Stesso principio di app/diari/[id]/percorsi/[percorsoId]/page.tsx (il vecchio riepilogo del
 * Percorso, ritirato in Fase 15 di docs/diario-a-libro-piano.md): un link vecchio (bookmark,
 * storico del browser, la voce di menu appena rimossa da una PWA non ancora aggiornata sul
 * dispositivo dell'utente) rimanda quindi allo scaffale dei Diari invece di mostrare un 404.
 * Elenco completo delle 8 pagine-lapide in docs/diario-valutazione-ux-piano.md §5.4.
 */
export default function ReportagePage() {
  return (
    <Suspense>
      <RedirectTo href="/diari" />
    </Suspense>
  )
}
