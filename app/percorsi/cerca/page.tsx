'use client'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import RedirectTo from '@/app/components/RedirectTo'

/**
 * Questa pagina non esiste più — docs/allineamento-mockup-piano.md, intervento B: il campo di
 * ricerca reale e i tre scaffali (Sentieri/Borgo e Città/Sito) sono confluiti in app/atlante/
 * page.tsx, che ora è l'unico Atlante (niente più doppione con questa pagina). Il parametro
 * `?q=` viene preservato nel redirect (era già letto qui per il prefill del campo, ora letto da
 * app/atlante/page.tsx allo stesso modo). Elenco completo delle 8 pagine-lapide in
 * docs/diario-valutazione-ux-piano.md §5.4.
 */
function PercorsiCercaPageInner() {
  const searchParams = useSearchParams()
  const q = searchParams.get('q')
  return <RedirectTo href={q ? `/atlante?q=${encodeURIComponent(q)}` : '/atlante'} />
}

export default function PercorsiCercaPage() {
  return (
    <Suspense>
      <PercorsiCercaPageInner />
    </Suspense>
  )
}
