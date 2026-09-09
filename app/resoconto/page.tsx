'use client'
import { Suspense, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

/**
 * Questa pagina non esiste più — docs/allineamento-mockup-piano.md, intervento D: ResocontoHub
 * (la galleria a stage di tutti i Resoconti) non aveva alcun link in entrata nell'app. Ogni
 * Resoconto si raggiunge dal proprio Diario (pagine figlie /resoconto/[id]/* non toccate).
 * Redirect verso la Libreria, dove vivono i Diari.
 */
function ResocontoIndexPageInner() {
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

export default function ResocontoIndexPage() {
  return (
    <Suspense>
      <ResocontoIndexPageInner />
    </Suspense>
  )
}
