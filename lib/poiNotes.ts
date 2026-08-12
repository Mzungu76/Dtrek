// Estrae, dal testo già generato per la sezione "I luoghi da non perdere" della guida
// (app/api/guide/route.ts), un blocco di testo per singolo POI — nessuna chiamata IA aggiuntiva,
// solo persistenza strutturata di un output che oggi va perso non appena renderizzato una volta.
// Chiave di riuso: poi_id (id OSM), la stessa già usata per la deduplica in
// app/lib/guide/buildGuideContent.ts (decisione 2, artifact "La Guida IA").
import type { PoiItem } from '@/lib/overpass'
import type { WikiPage } from '@/lib/wikipedia'

export interface PoiNote {
  poiId: number
  name: string
  text: string
}

/** Stessa logica di risoluzione nome→POI di lib/poiNameMatch.ts (findPoiByName), ma con l'id
 *  incluso — findPoiByName ritorna solo lat/lon, insufficiente qui perché poi_notes è keyed
 *  sull'id, non sulle coordinate. Duplicata piuttosto che modificare quella firma condivisa (usata
 *  anche da lib/epochPois.ts) per un bisogno diverso dal suo. */
function findPoiIdByName(name: string, cachedPois: PoiItem[], cachedPoiWiki: { poi: PoiItem; wiki: WikiPage }[]): PoiItem | null {
  const target = name.trim().toLowerCase()
  const wikiMatch = cachedPoiWiki.find((e) => e.wiki?.title?.trim().toLowerCase() === target)
  if (wikiMatch) return wikiMatch.poi
  const poiMatch = cachedPois.find((p) => p.name?.trim().toLowerCase() === target)
  return poiMatch ?? null
}

const MAX_NOTE_CHARS = 1200 // margine ampio sopra i ~200 parole/luogo del tier più lungo (guideSections.ts)

/** [curiosita] (lib/guideText.ts) è un tag globale, non legato a un POI per nome — se il modello
 *  ne piazza uno dentro un blocco "### Nome luogo" (capita: è "l'aneddoto più memorabile" e i
 *  luoghi ne sono la fonte più comune), il testo va tenuto ma senza il markup a parentesi visibile,
 *  altrimenti finirebbe letto ad alta voce parola per parola in Navigator. */
function stripCuriositaMarkup(text: string): string {
  return text.replace(/\[curiosita\]([\s\S]*?)\[\/curiosita\]/g, '$1').replace(/\s{2,}/g, ' ').trim()
}

/**
 * `luoghiBody` è il testo della sezione "luoghi" già ripulito dai tag [epoca] (extractEpochPois
 * gira prima di questo, vedi app/api/guide/route.ts) — resta solo markdown con un `### Nome luogo`
 * per ogni posto trattato (vincolo di prompt esistente). Un blocco il cui nome non matcha un POI
 * noto viene scartato, mai salvato con un id indovinato.
 */
export function extractPoiNotes(luoghiBody: string, cachedPois: PoiItem[], cachedPoiWiki: { poi: PoiItem; wiki: WikiPage }[]): PoiNote[] {
  const notes: PoiNote[] = []
  const blocks = luoghiBody.split(/^### /m).slice(1) // slice(1): scarta l'eventuale preambolo prima del primo ###
  for (const block of blocks) {
    const nl = block.indexOf('\n')
    const name = (nl === -1 ? block : block.slice(0, nl)).trim()
    const text = (nl === -1 ? '' : block.slice(nl + 1)).trim()
    if (!name || !text) continue
    const poi = findPoiIdByName(name, cachedPois, cachedPoiWiki)
    if (!poi) continue
    const sanitized = stripCuriositaMarkup(text)
    if (!sanitized) continue
    notes.push({ poiId: poi.id, name, text: sanitized.slice(0, MAX_NOTE_CHARS) })
  }
  return notes
}
