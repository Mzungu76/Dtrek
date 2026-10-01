import type { MetaType, SiteType } from './metaTypes'

// Quale scheda Guida mostrare per un Borgo/Città o un Sito — decisioni pure, testabili, mai
// duplicate come `if` sparsi nei componenti (stesso principio di lib/metaCard.ts).

export type BorgoCardVariant = 'cammino_urbano' | 'trekking_misto'

/**
 * 'trekking_misto' quando la Meta ha una traccia GPS reale collegata (un cammino che tocca il
 * borgo, non solo la sua posizione) — copertina a mappa, e "Dati e sicurezza" (Trail Score,
 * Sicurezza, dislivello, quota della traccia reale) torna disponibile proprio come per un
 * Sentiero (lib/guideProfiles.ts's guideProfileFor, piano guide-eccellenza §Fase 3 — le due fonti
 * erano in disaccordo prima di quella fase). "Il percorso" resta invece l'override narrativo "Il
 * borgo" del profilo base in ogni caso, con solo la timeline delle tappe interne aggiunta.
 * 'cammino_urbano' (il caso comune) quando non c'è nessuna traccia: copertina a foto, statistiche
 * di visita al posto di quelle escursionistiche, "Dati e sicurezza" mai disponibile.
 */
export function borgoCardVariant(hike: {
  trackPoints?: { lat?: number; lon?: number }[]
  routePolyline?: [number, number][]
}): BorgoCardVariant {
  const hasTrack = (hike.trackPoints?.length ?? 0) > 1 || (hike.routePolyline?.length ?? 0) > 1
  return hasTrack ? 'trekking_misto' : 'cammino_urbano'
}

// piano guide-eccellenza §Fase 4 — CTS/Safety Score si attivavano solo da "esistono ≥2
// trackPoints", non da "è un Sentiero": funzionava per accidente (un Sito/Borgo normale non ha
// mai trackPoints), non per garanzia. Confine ESPLICITO per tipologia, sempre in AND con un
// controllo sui dati (hasEnoughGps) fatto dal chiamante — mai in sua sostituzione: quel controllo
// resta la prima difesa, questo aggiunge una garanzia che non dipenda "per accidente" dalla sola
// presenza di punti traccia (es. un Sito a cui viene iniettata per errore una traccia di 2 punti
// da un bug di import non deve comunque produrre un punteggio).
export function metaEligibleForHikingScores(hike: {
  metaType?: MetaType
  trackPoints?: { lat?: number; lon?: number }[]
  routePolyline?: [number, number][]
}): boolean {
  const metaType = hike.metaType ?? 'sentiero'
  if (metaType === 'sentiero' || metaType === 'cammino') return true
  if (metaType === 'borgo_citta') return borgoCardVariant(hike) === 'trekking_misto'
  return false
}

export type SitoCardFamily = 'scheda_pratica' | 'galleria_sicurezza'

// Sempre "galleria_sicurezza": niente orari fissi da attendere, l'accesso dipende più dalle
// condizioni (meteo, portata d'acqua, luce) che da un cancello che apre/chiude — la foto e un
// avviso di sicurezza contano più di un pannello orari che per questi tipi resterebbe quasi
// sempre vuoto.
const ALWAYS_NATURAL: SiteType[] = ['cascata', 'grotta', 'belvedere', 'area_naturale']

// Verifica post-piano guide-eccellenza — l'unico caso in cui la sezione "Natura" (lib/
// guideProfiles.ts) ha senso per un Sito: una cascata/grotta/belvedere/area naturale è già
// intrinsecamente natura, un museo o un palazzo no. Stessa lista di ALWAYS_NATURAL sopra, mai un
// secondo elenco parallelo.
export function isNaturalSiteType(siteType: SiteType | undefined): boolean {
  return !!siteType && ALWAYS_NATURAL.includes(siteType)
}

// Ambigui: possono essere un istituto con biglietto/orario oppure un luogo minore ad accesso
// libero — la differenza sta nei DATI di questa Meta (website/official_url/opening_hours), non
// nel tipo da solo (discussione "Guida Borgo/Città e Sito", 2026-09-21).
const AMBIGUOUS: SiteType[] = ['sito_archeologico', 'castello', 'monumento']

/**
 * `hasVisitInfo` = presenza di almeno uno tra website/official_url/opening_hours per questa Meta
 * — il segnale reale di "istituzionale" (c'è un'infrastruttura di visita) per i tipi ambigui.
 * Assente/'altro' ricade su 'scheda_pratica', il default più sicuro (mostra il pannello pratico
 * solo se c'è davvero qualcosa da mostrarci, altrimenti resta silenzioso — mai un pannello vuoto).
 */
export function sitoCardFamily(siteType: SiteType | undefined, hasVisitInfo: boolean): SitoCardFamily {
  if (siteType && ALWAYS_NATURAL.includes(siteType)) return 'galleria_sicurezza'
  if (siteType && AMBIGUOUS.includes(siteType)) return hasVisitInfo ? 'scheda_pratica' : 'galleria_sicurezza'
  return 'scheda_pratica'
}
