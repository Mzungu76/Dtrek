import { archiveDescriptionCredit, stripEmbeddedAttribution, type DescriptionCredit } from './placeSources'
import { supabase } from './supabase'
import { isTrustedMediaUrl } from './trustedMediaHosts'

// Lato server: il punto, l'immagine e la descrizione del luogo a cui un Reportage di Sito o di
// Borgo/Città appartiene — dalla Meta collegata (planned_hikes) e dall'archivio (dtrek_places).
// Servono a ciò che si legge fuori dal Reportage privato (libro del Diario, pagina pubblica), che non
// ha il Sito in memoria come ReportReader (lib/useSiteContext.ts, la stessa cosa lato client).

export interface SiteInfo {
  /** Il punto del luogo — mai quello in cui l'utente ha registrato la visita. */
  point: { lat: number; lon: number } | null
  /** Immagine del luogo da un host fidato (lib/trustedMediaHosts.ts), altrimenti null. */
  cover: string | null
  /** dtrek_places.description — senza il ripiego Wikipedia della Guida, che è una ricerca dal vivo. */
  description: string | null
  /** Fonte della descrizione (lib/placeSources.ts) — null se non c'è testo o la fonte non è nota. */
  descriptionCredit: DescriptionCredit | null
}

/** Best-effort: se una riga o una colonna manca, quel luogo resta senza info e il resto si pubblica
 *  come prima — mai un errore propagato. Solo per le attività non-sentiero con una Meta collegata. */
export async function fetchSiteInfo(
  activities: { id: string; meta_type?: string | null; linked_planned_id?: string | null }[],
): Promise<Map<string, SiteInfo>> {
  const out = new Map<string, SiteInfo>()
  try {
    const targets = activities.filter(a => a.meta_type && a.meta_type !== 'sentiero' && a.linked_planned_id)
    if (targets.length === 0) return out

    const { data: hikes } = await supabase
      .from('planned_hikes')
      .select('id, latitude, longitude, place_id')
      .in('id', Array.from(new Set(targets.map(a => a.linked_planned_id as string))))

    const placeIds = Array.from(new Set((hikes ?? []).map(h => h.place_id as string | null).filter((x): x is string => !!x)))
    const { data: places } = placeIds.length
      ? await supabase.from('dtrek_places').select('id, image_url, description, source').in('id', placeIds)
      : { data: [] as { id: string; image_url: string | null; description: string | null; source: string | null }[] }
    const placeById = new Map((places ?? []).map(p => [p.id as string, p]))
    const hikeById = new Map((hikes ?? []).map(h => [h.id as string, h]))

    for (const a of targets) {
      const h = hikeById.get(a.linked_planned_id as string)
      if (!h) continue
      const place = h.place_id ? placeById.get(h.place_id as string) : undefined
      const img = (place?.image_url as string | null | undefined) ?? null
      // Senza l'attribuzione PTPR che l'importer incorpora nel testo: la fonte si mostra a parte.
      const rawDescription = (place?.description as string | null | undefined)?.trim() || null
      const description = rawDescription ? (stripEmbeddedAttribution(rawDescription) || null) : null
      out.set(a.id, {
        point: typeof h.latitude === 'number' && typeof h.longitude === 'number' ? { lat: h.latitude, lon: h.longitude } : null,
        cover: img && isTrustedMediaUrl(img) ? img : null,
        description,
        descriptionCredit: description ? archiveDescriptionCredit(place?.source as string | null | undefined) : null,
      })
    }
  } catch { /* nessuna info sul luogo: il Reportage resta com'era */ }
  return out
}
