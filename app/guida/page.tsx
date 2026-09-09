'use client'
import { Suspense, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

/**
 * Questa pagina non esiste più — docs/allineamento-mockup-piano.md, intervento D: GuidaHub (la
 * galleria a stage di tutte le Guide) non aveva alcun link in entrata nell'app — nessuna voce di
 * navigazione portava qui. L'unico modo per leggere una Guida resta il libro (GuideBookPage, da
 * un Percorso dentro un Diario o da una Meta senza Diario in /guida/[id]/[groupKey], entrambe
 * pagine figlie non toccate). Redirect verso l'Atlante, il punto di partenza per trovare una Meta.
 */
function GuidaIndexPageInner() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/atlante')
  }, [router])

  return (
    <div className="flex items-center justify-center py-24 text-stone-400">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  )
}

export default function GuidaIndexPage() {
  return (
    <Suspense>
      <GuidaIndexPageInner />
    </Suspense>
  )
}
