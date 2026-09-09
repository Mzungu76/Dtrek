'use client'
import { Suspense, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

/**
 * Questa pagina non esiste più — docs/allineamento-mockup-piano.md, intervento A: "Mete" (poi
 * "Percorsi") è confluita nella tavola "Salvate" dell'Atlante (app/atlante/salvate/page.tsx, che
 * ne ha ereditato carta/chip/ricerca/ordinamenti — nessuna funzione persa), filtrata sulle Mete
 * senza ancora un Diario. Stesso principio di app/reportage/page.tsx: un link vecchio (bookmark,
 * storico del browser) rimanda alla nuova destinazione invece di un 404.
 */
function PercorsiPageInner() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/atlante/salvate')
  }, [router])

  return (
    <div className="flex items-center justify-center py-24 text-stone-400">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  )
}

export default function PercorsiPage() {
  return (
    <Suspense>
      <PercorsiPageInner />
    </Suspense>
  )
}
