'use client'
import { Suspense } from 'react'
import RedirectTo from '@/app/components/RedirectTo'

/**
 * Questa pagina non esiste più — docs/allineamento-mockup-piano.md, intervento D: GuidaHub (la
 * galleria a stage di tutte le Guide) non aveva alcun link in entrata nell'app — nessuna voce di
 * navigazione portava qui. L'unico modo per leggere una Guida resta il libro (GuideBookPage, da
 * un Percorso dentro un Diario o da una Meta senza Diario in /guida/[id]/[groupKey], entrambe
 * pagine figlie non toccate). Redirect verso l'Atlante, il punto di partenza per trovare una Meta.
 * Elenco completo delle 8 pagine-lapide in docs/diario-valutazione-ux-piano.md §5.4.
 */
export default function GuidaIndexPage() {
  return (
    <Suspense>
      <RedirectTo href="/atlante" />
    </Suspense>
  )
}
