'use client'
import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'

/**
 * Questa pagina non esiste più — docs/allineamento-mockup-piano.md, intervento B: il campo di
 * ricerca reale e i tre scaffali (Sentieri/Borgo e Città/Sito) sono confluiti in app/atlante/
 * page.tsx, che ora è l'unico Atlante (niente più doppione con questa pagina). Il parametro
 * `?q=` viene preservato nel redirect (era già letto qui per il prefill del campo, ora letto da
 * app/atlante/page.tsx allo stesso modo).
 */
function PercorsiCercaPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const q = searchParams.get('q')
    router.replace(q ? `/atlante?q=${encodeURIComponent(q)}` : '/atlante')
  }, [router, searchParams])

  return (
    <div className="flex items-center justify-center py-24 text-stone-400">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  )
}

export default function PercorsiCercaPage() {
  return (
    <Suspense>
      <PercorsiCercaPageInner />
    </Suspense>
  )
}
