'use client'
import { useEffect, useState } from 'react'
import { getPlannedById } from './plannedStore'
import type { MetaType } from './metaTypes'
import type { DescriptionCredit } from './placeSources'

/** Il Sito (o Borgo/Città) a cui un Reportage appartiene, com'è nella sua Guida: il punto del sito (mai il punto in
 *  cui l'utente ha registrato la visita), la sua descrizione e l'immagine di copertina. */
export interface SiteContext {
  latitude?: number
  longitude?: number
  /** Stessa descrizione della Guida (dtrek_places.description, altrimenti estratto Wikipedia). */
  description?: string
  /** Fonte della descrizione (archivio o Wikipedia) — la stessa mostrata dalla Guida. */
  descriptionCredit?: DescriptionCredit | null
  imageUrl?: string
  imageCredit?: string
}

// Il dato è del luogo, non del singolo Reportage: due visite allo stesso sito condividono la cache.
const placeCache = new Map<string, SiteContext>()

interface PlaceResponse {
  description?: string | null
  latitude?: number
  longitude?: number
  imageUrl?: string | null
  imageCredit?: string | null
  wikipedia?: { extract?: string; url?: string } | null
  descriptionCredit?: DescriptionCredit | null
}

/** Solo per un Reportage di Sito o di Borgo/Città (un Sentiero non ne ha bisogno): legge la Meta collegata
 *  per le coordinate e `/api/places/[placeId]` — lo stesso endpoint della Guida — per descrizione e
 *  copertina. Mai un errore mostrato: se qualcosa manca il Reportage resta com'era. */
export function useSiteContext(
  activity: { metaType?: MetaType; linkedPlannedId?: string } | null | undefined,
): SiteContext | null {
  const [ctx, setCtx] = useState<SiteContext | null>(null)
  const plannedId = activity?.metaType && activity.metaType !== 'sentiero' ? activity.linkedPlannedId : undefined

  useEffect(() => {
    setCtx(null)
    if (!plannedId) return
    let cancelled = false
    ;(async () => {
      try {
        const hike = await getPlannedById(plannedId)
        if (!hike || cancelled) return
        const base: SiteContext = { latitude: hike.latitude, longitude: hike.longitude }
        if (cancelled) return
        setCtx(base)
        if (!hike.placeId) return
        const cached = placeCache.get(hike.placeId)
        if (cached) { if (!cancelled) setCtx({ ...base, ...cached }); return }
        const res = await fetch(`/api/places/${hike.placeId}`)
        if (!res.ok || cancelled) return
        const p = (await res.json()) as PlaceResponse
        const description = p.description?.trim() || p.wikipedia?.extract?.trim() || undefined
        const detail: SiteContext = {
          description,
          descriptionCredit: description ? p.descriptionCredit ?? null : null,
          imageUrl: p.imageUrl ?? undefined,
          imageCredit: p.imageCredit ?? undefined,
        }
        placeCache.set(hike.placeId, detail)
        if (!cancelled) setCtx({ ...base, ...detail })
      } catch { /* il Reportage resta com'era */ }
    })()
    return () => { cancelled = true }
  }, [plannedId])

  return ctx
}
