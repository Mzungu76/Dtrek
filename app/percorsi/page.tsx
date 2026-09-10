'use client'
import { Suspense } from 'react'
import RedirectTo from '@/app/components/RedirectTo'

/**
 * Questa pagina non esiste più — docs/allineamento-mockup-piano.md, intervento A: "Mete" (poi
 * "Percorsi") è confluita nella tavola "Salvate" dell'Atlante (app/atlante/salvate/page.tsx, che
 * ne ha ereditato carta/chip/ricerca/ordinamenti — nessuna funzione persa), filtrata sulle Mete
 * senza ancora un Diario. Stesso principio di app/reportage/page.tsx: un link vecchio (bookmark,
 * storico del browser) rimanda alla nuova destinazione invece di un 404. Elenco completo delle 8
 * pagine-lapide in docs/diario-valutazione-ux-piano.md §5.4.
 */
export default function PercorsiPage() {
  return (
    <Suspense>
      <RedirectTo href="/atlante/salvate" />
    </Suspense>
  )
}
