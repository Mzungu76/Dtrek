'use client'
import { useEffect, useState } from 'react'
import { getPlannedById, type PlannedHike } from './plannedStore'
import { getCurrentGeoFix, evaluateCheckIn, markMetaVisited } from './visitCompletion'

export interface CheckInToast {
  message: string
  ok: boolean
}

/** Stato + handler condivisi del check-in GPS di un Sito — usati sia dalla Guida aperta in
 *  app/guida/GuidaHub.tsx (Sito autonomo, o una qualunque scheda della galleria) sia da
 *  components/guida/SiteGuideOverlay.tsx (Sito annidato dentro la Guida di un Borgo/Città). Un
 *  solo posto per l'interazione (stato busy/toast, refetch dopo il salvataggio) — lib/
 *  visitCompletion.ts resta l'unica fonte della logica di dominio (quando una visita è verificata,
 *  come si salva), mai duplicata qui.
 *
 * `onVisited` riceve la Meta aggiornata (con firstCompletedAt ora valorizzato) solo quando il
 * check-in va a buon fine — il chiamante decide se/come aggiornare il proprio stato locale (per
 * es. solo se combacia con l'hike attualmente aperto).
 */
export function useSiteCheckIn(onVisited?: (hike: PlannedHike) => void) {
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<CheckInToast | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const confirmVisit = async (id: string) => {
    if (busy) return
    setBusy(true)
    try {
      const target = await getPlannedById(id)
      if (!target) { setToast({ message: 'Impossibile trovare questa Meta.', ok: false }); return }
      if (target.firstCompletedAt) { setToast({ message: 'Visita già registrata per questo Sito.', ok: true }); return }
      const fix = await getCurrentGeoFix()
      const result = evaluateCheckIn(fix, { latitude: target.latitude, longitude: target.longitude })
      const verified = result.outcome === 'verified'
      await markMetaVisited(target, fix, verified)
      setToast(
        verified
          ? { message: 'Visita confermata', ok: true }
          : {
              message: result.outcome === 'no_gps'
                ? 'Visita registrata — posizione non disponibile, resterà non verificata se pubblicata.'
                : 'Visita registrata — sembri fuori zona, resterà non verificata se pubblicata.',
              ok: false,
            },
      )
      const refreshed = await getPlannedById(id)
      if (refreshed) onVisited?.(refreshed)
    } catch {
      setToast({ message: 'Impossibile confermare la visita, riprova.', ok: false })
    } finally {
      setBusy(false)
    }
  }

  return { busy, toast, confirmVisit }
}
