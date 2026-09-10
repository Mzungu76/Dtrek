'use client'
import { Suspense } from 'react'
import RedirectTo from '@/app/components/RedirectTo'

/**
 * Questa pagina non esiste più — docs/allineamento-mockup-piano.md, intervento D: ResocontoHub
 * (la galleria a stage di tutti i Resoconti) non aveva alcun link in entrata nell'app. Ogni
 * Resoconto si raggiunge dal proprio Diario (pagine figlie /resoconto/[id]/* non toccate).
 * Redirect verso la Libreria, dove vivono i Diari. Elenco completo delle 8 pagine-lapide in
 * docs/diario-valutazione-ux-piano.md §5.4.
 */
export default function ResocontoIndexPage() {
  return (
    <Suspense>
      <RedirectTo href="/diari" />
    </Suspense>
  )
}
