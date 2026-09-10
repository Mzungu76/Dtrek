'use client'
// Home dell'app — sempre la Libreria (docs/libreria-atlante-piano.md, Fase 1). Prima redirectava
// direttamente al Sommario dell'ultimo Diario aperto (Fase 11 di docs/diario-a-libro-piano.md);
// quella risoluzione (lastDiaryId, verificato contro l'elenco vero) ora vive dentro
// app/diari/page.tsx stessa, che è diventata la copertina del Diario in uso — l'app "si apre con
// l'ultimo Diario aperto" mostrandolo, non saltandolo a piè pari sull'indice.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function RootPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/diari')
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center text-stone-400">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  )
}
