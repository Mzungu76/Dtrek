'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

/**
 * Fase 5 del riordino UI/UX (docs/diario-valutazione-ux-piano.md): il corpo — spinner + redirect
 * via `router.replace` — era ripetuto identico in 8 pagine-lapide (rotte ritirate durante
 * altrettante ristrutturazioni, tenute solo perché un bookmark o lo storico del browser di
 * qualcuno potrebbero ancora puntarci). Ogni pagina resta responsabile del PROPRIO motivo (un
 * commento breve, specifico) e di calcolare la propria destinazione quando dipende da parametri
 * di rotta o di ricerca — questo componente accorcia solo la parte meccanica uguale ovunque.
 * L'elenco completo delle 8 rotte, con provenienza e destinazione, è in
 * docs/diario-valutazione-ux-piano.md §5.4 — un solo punto da consultare invece di aprire 8 file.
 *
 * Il chiamante resta comunque dentro il proprio `<Suspense>`: qui dentro non c'è nulla che lo
 * richieda di per sé, ma le pagine che calcolano `href` da `useSearchParams()` ne hanno bisogno, e
 * tenerlo nel chiamante invece che qui evita un secondo confine di Suspense inutile per le altre.
 */
export default function RedirectTo({ href }: { href: string }) {
  const router = useRouter()

  useEffect(() => {
    router.replace(href)
  }, [router, href])

  return (
    <div className="flex items-center justify-center py-24 text-stone-400">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  )
}
