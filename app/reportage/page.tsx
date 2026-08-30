'use client'
import { Suspense, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

/**
 * Questa pagina non esiste più — su richiesta esplicita dell'utente, "Tutti i Reportage" è stata
 * eliminata insieme alla voce "Reportage" della barra in basso (components/Navbar.tsx): un
 * Reportage si raggiunge ora solo entrando nel suo Diario, che li elenca (app/diari/[id]/page.tsx).
 * Stesso principio di app/diari/[id]/percorsi/[percorsoId]/page.tsx (il vecchio riepilogo del
 * Percorso, ritirato in Fase 15 di docs/diario-a-libro-piano.md): un link vecchio (bookmark,
 * storico del browser, la voce di menu appena rimossa da una PWA non ancora aggiornata sul
 * dispositivo dell'utente) rimanda quindi allo scaffale dei Diari invece di mostrare un 404.
 */
function ReportagePageInner() {
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

export default function ReportagePage() {
  return (
    <Suspense>
      <ReportagePageInner />
    </Suspense>
  )
}
