'use client'
import { useEffect, useState } from 'react'
import { getPlannedById, type PlannedHike } from './plannedStore'
import { getCurrentGeoFix, evaluateCheckIn, markMetaVisited } from './visitCompletion'
import { listSelectableDiaries, type DiaryChoice } from './diari/syntheticPercorso'

/** Scelta del Diario in sospeso: la Meta non ne ha ancora uno e l'utente ne ha più d'uno. */
export interface DiaryPrompt {
  id: string
  repeat: boolean
  choices: DiaryChoice[]
}

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
  const [diaryPrompt, setDiaryPrompt] = useState<DiaryPrompt | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  /** `repeat`: registra un'altra visita a un Sito già visitato (nuovo Reportage). `diaryId`: il
   *  Diario scelto dal picker — solo se la Meta non ne ha ancora uno. */
  const confirmVisit = async (id: string, opts: { repeat?: boolean; diaryId?: string } = {}) => {
    if (busy) return
    setBusy(true)
    try {
      const target = await getPlannedById(id)
      if (!target) { setToast({ message: 'Impossibile trovare questa Meta.', ok: false }); return }
      if (target.firstCompletedAt && !opts.repeat) { setToast({ message: 'Visita già registrata per questo Sito.', ok: true }); return }
      // Una Meta senza Diario prende quello scelto qui: con più Diari si chiede, con uno solo (o
      // nessuno leggibile, offline) si prosegue — il ripiego sul default resta in activitySave e,
      // offline, nel server (PATCH /api/planned).
      if (!target.diaryId && !opts.diaryId) {
        const choices = await listSelectableDiaries()
        if (choices.length > 1) { setDiaryPrompt({ id, repeat: !!opts.repeat, choices }); return }
      }
      const fix = await getCurrentGeoFix()
      const result = evaluateCheckIn(fix, { latitude: target.latitude, longitude: target.longitude })
      const verified = result.outcome === 'verified'
      await markMetaVisited(target, fix, verified, { diaryId: opts.diaryId, repeat: opts.repeat })
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

  const chooseDiary = (diaryId: string) => {
    const p = diaryPrompt
    if (!p) return
    setDiaryPrompt(null)
    void confirmVisit(p.id, { repeat: p.repeat, diaryId })
  }
  const cancelDiaryPrompt = () => setDiaryPrompt(null)

  return { busy, toast, confirmVisit, diaryPrompt, chooseDiary, cancelDiaryPrompt }
}
