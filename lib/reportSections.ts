import type { MetaType, SiteType } from './metaTypes'
import { metaEligibleForHikingScores, isNaturalSiteType } from './guideCardVariant'

// Le stesse 5 chiavi di sempre (components/resoconto/sectionStyle.ts, che ne resta l'unica fonte
// per icone/colori/titoli di default) — qui vive solo la LOGICA di quali si applicano a quale
// tipologia, mai la presentazione.
export type ReportFixedSectionKey = 'descrizione_sito' | 'dati_punteggi' | 'andamento' | 'natura' | 'poi' | 'galleria_foto'

/**
 * Quali sezioni fisse (dati non narrativi) includere nel Reportage, in ordine, per tipologia —
 * stesso principio già applicato alla Guida (availableSections, lib/guideProfiles.ts): mai una
 * sezione vuota o con dati fasulli (CTS "non ancora calcolato" per un Sito, "Passo medio"/"Quota
 * massima 0.00 m" per un check-in GPS senza traccia) solo perché la lista era la stessa per tutte
 * le tipologie.
 *
 * dati_punteggi/andamento (CTS/Trail Score, profilo altimetrico, velocità/passo) — solo se la Meta
 * è idonea alle metriche escursionistiche (metaEligibleForHikingScores, lib/guideCardVariant.ts):
 * sempre per un Sentiero, solo per un Borgo/Città 'trekking_misto' (traccia GPS reale collegata),
 * mai per un Sito o un Borgo cammino_urbano — stesso confine già usato per il CTS/Safety Score
 * della Guida, qui applicato al Reportage.
 *
 * natura (flora/fauna) — stessa idoneità escursionistica sopra, oppure un Sito "naturale"
 * (isNaturalSiteType: cascata/grotta/belvedere/area_naturale) — un museo o un castello non ha
 * flora/fauna da raccontare a parte, ma una cascata sì anche senza traccia GPS. MAI per un Borgo/
 * Città (sessione conversazionale: rimossa a favore di "Sapori e tradizioni", una sezione
 * narrativa — lib/reportProfiles.ts — non un widget dati).
 *
 * poi/galleria_foto — sempre presenti per ogni tipologia: un Sito senza POI nei dintorni o senza
 * foto mostra semplicemente una card vuota (stesso comportamento già accettato per galleria_foto,
 * che resta il solo punto da cui aggiungere la prima foto).
 */
export function reportFixedSectionsFor(hike: {
  metaType?: MetaType
  siteType?: SiteType
  trackPoints?: { lat?: number; lon?: number }[]
  routePolyline?: [number, number][]
}): ReportFixedSectionKey[] {
  const metaType = hike.metaType ?? 'sentiero'
  const hikingEligible = metaEligibleForHikingScores(hike)
  const sections: ReportFixedSectionKey[] = []
  if (hikingEligible) sections.push('dati_punteggi', 'andamento')
  if (metaType !== 'borgo_citta' && (hikingEligible || isNaturalSiteType(hike.siteType))) sections.push('natura')
  sections.push('poi', 'galleria_foto')
  return sections
}

/** Titolo della sezione "poi" — "Punti di interesse" per un Sentiero (lungo il tracciato), "Luoghi
 *  visitati" per un Borgo/Città (i luoghi toccati durante la visita), "Nei dintorni" per un Sito (è
 *  lui stesso il luogo visitato: qui stanno solo i punti d'interesse attorno al suo punto). Le altre chiavi non variano per tipologia: restano quelle di default
 *  (components/resoconto/sectionStyle.ts's REPORT_SECTION_TITLE), passato qui come fallback per
 *  non duplicarne l'elenco. */
export function reportSectionTitle(
  key: ReportFixedSectionKey,
  metaType: MetaType | undefined,
  defaultTitle: string,
): string {
  if (key === 'poi' && metaType === 'sito') return 'Nei dintorni'
  if (key === 'poi' && (metaType ?? 'sentiero') !== 'sentiero') return 'Luoghi visitati'
  return defaultTitle
}
