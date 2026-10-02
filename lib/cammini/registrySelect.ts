import { REGISTRY, type RegistryEntry } from './registry'

// Scelta dei cammini da importare: un id (o nome), `tutti` oppure `ondata-N`. Funzioni pure.

/** Minuscolo, senza accenti, solo lettere/cifre separate da un trattino: "Via  Francigena" = "via-francigena". */
export function normalizeKey(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export type ResolveResult = { ok: true; entry: RegistryEntry } | { ok: false; error: string }

/** Id esatto, poi nome, poi `searchName` (tutti confrontati con normalizeKey). */
export function resolveRegistryEntry(input: string, entries: RegistryEntry[] = REGISTRY): ResolveResult {
  const key = normalizeKey(input)
  if (key) {
    const found = entries.find(e => normalizeKey(e.id) === key)
      ?? entries.find(e => normalizeKey(e.name) === key)
      ?? entries.find(e => e.searchName && normalizeKey(e.searchName) === key)
    if (found) return { ok: true, entry: found }
  }
  return { ok: false, error: `Cammino sconosciuto: "${input}". Id validi: ${entries.map(e => e.id).join(', ')} (oppure "tutti", "ondata-1", "ondata-2", "ondata-3").` }
}

export interface SkippedEntry { entry: RegistryEntry; reason: string }
export interface Selection { selected: RegistryEntry[]; skipped: SkippedEntry[] }

/**
 * `tutti` / `ondata-N`: salta le voci con tappe in rifugio (non ancora supportate) e, tra due voci
 * sovrapposte (`overlapsWith`), tiene sempre la prima del registro, così non si importano due volte
 * gli stessi tratti anche quando le ondate girano in job separati.
 */
export function selectEntries(selector: string, entries: RegistryEntry[] = REGISTRY): Selection | { error: string } {
  const key = normalizeKey(selector)
  const wave = /^ondata-([123])$/.exec(key)
  if (key !== 'tutti' && !wave) return { error: `Selettore non valido: "${selector}".` }
  const selected: RegistryEntry[] = []
  const skipped: SkippedEntry[] = []
  for (const e of entries) {
    if (wave && e.wave !== Number(wave[1])) continue
    if (e.anchors === 'rifugi') { skipped.push({ entry: e, reason: 'tappe in rifugio non ancora supportate (ondata 3)' }); continue }
    const partner = e.overlapsWith ? entries.find(x => x.id === e.overlapsWith) : undefined
    if (partner && partner.anchors !== 'rifugi' && entries.indexOf(partner) < entries.indexOf(e)) {
      skipped.push({ entry: e, reason: `sovrapposto a ${partner.id} (già importato da quello)` }); continue
    }
    selected.push(e)
  }
  return { selected, skipped }
}

/** Selettori multi-cammino: per l'input del workflow. */
export const isMultiSelector = (s: string) => /^(tutti|ondata-[123])$/.test(normalizeKey(s))
