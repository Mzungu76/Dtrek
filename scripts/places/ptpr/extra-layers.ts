/**
 * PTPR Regione Lazio — layer aggiuntivi oltre Tavola B/archeologia → dtrek_places
 *
 * Il piano (§5) chiede, oltre ai 3 layer archeologici già coperti da `import.ts`/`ptpr_pois`:
 * "Borghi identitari; Centri storici; Città di fondazione; altri layer pertinenti". Questo file
 * li affianca (non li fonde in `import.ts`, che resta l'adapter già scritto e testato sopra
 * ptpr_pois — questi 3 layer non sono ancora in quella tabella cache, servono shapefile nuovi).
 *
 * ── Fonti (verificate via WebSearch/WebFetch in questa sessione, 2026-08-30) ───────────────────
 *
 * Aree borghi identitari:
 *   - Layer: https://geoportale.regione.lazio.it/layers/geonode:borghi_identitari
 *   - Dataset Open Data: https://dati.lazio.it/dataset/ptpr-tav-b-aree-borghi-identitari
 *   - Risorsa SHP: https://dati.lazio.it/dataset/ptpr-tav-b-aree-borghi-identitari/resource/1f1e7146-e8ff-47a9-9690-bca47383f3b3
 *   - Proiezione dichiarata dalla pagina dataset: "SRID ED50 fuso 33N" (EPSG:23033 — stessa di
 *     scripts/import-ptpr.ts).
 *
 * Centri storici:
 *   - Layer: https://geoportale.regione.lazio.it/layers/geonode:centri_storici
 *   - Dataset Open Data: https://dati.lazio.it/dataset/ptpr-tav-b-centri-storici
 *   - Risorsa SHP: https://dati.lazio.it/dataset/ptpr-tav-b-centri-storici/resource/b4699415-5e31-4165-a6b7-a45c0b6f79f8
 *   - Proiezione dichiarata: "SRID ED50 fuso 33N" (EPSG:23033).
 *
 * Città di fondazione:
 *   Diversamente dagli altri due, NON risulta un layer GIS scaricabile a parte su dati.lazio.it —
 *   è un progetto/classificazione culturale della Regione Lazio
 *   (https://www.regione.lazio.it/cittadini/cultura/progetti/città-di-fondazione), riferito a un
 *   insieme chiuso e ben documentato di 5 comuni dell'Agro Pontino fondati in epoca fascista
 *   (Wikipedia: https://it.wikipedia.org/wiki/Città_di_fondazione_nel_periodo_fascista — Littoria/
 *   Latina 1932, Sabaudia 1934, Pontinia 1934-35, Aprilia 1935-36, Pomezia anni '30). Trattato qui
 *   come tabella statica curata (5 righe, sotto) invece che come shapefile — i 5 comuni esistono
 *   già come Mete 'borgo_citta' create dall'import ISTAT; questo modulo aggiunge solo il segnale
 *   "città di fondazione" (piano §6, attributo `city_of_foundation`) via `metadata`, che il dedup
 *   (auto-merge per nome+prossimità geografica) collega alla Meta ISTAT esistente invece di
 *   crearne una nuova.
 *
 * ── Verifica ─────────────────────────────────────────────────────────────────────────────────
 * Aree borghi identitari: VERIFICATO byte-per-byte in questa sessione — l'utente ha scaricato
 * `areeborghiidentitari.zip` su una macchina con accesso di rete normale e lo ha caricato qui.
 * Ispezione diretta di `Aree_borghi_identitari.{shp,dbf,prj,cpg}` (47 record) ha corretto
 * un'assunzione sbagliata: questo layer NON condivide lo schema dei 3 layer archeologici gemelli
 * (niente NOME/COMUNE/VINCOLO). I campi reali sono OGGETTO, LOCALITA_, INDIRIZZO, DESTINAZIO
 * (troncato da "DESTINAZIONE"), USO_ATTUAL (troncato da "USO_ATTUALE"), AMBITO, ID_RL — vedi
 * `PtprBorgoIdentitarioRow` e `readBorghiIdentitariLayer` più sotto per il dettaglio. Il `.cpg`
 * reale è UTF-8 (non latin1 come assunto inizialmente). Il `.prj` reale è
 * `ED_1950_UTM_Zone_33N`, che CONFERMA l'assunzione EPSG:23033 (nessuna correzione necessaria lì).
 * Nessun campo COMUNE: LOCALITA_ è un toponimo (es. "Maccarese", "Borgo Montello", "Borgo Grappa")
 * non necessariamente coincidente con un Comune — per questo `municipality` resta `undefined` sul
 * candidato, il dedup lo lega geograficamente invece che per nome-Comune.
 *
 * Centri storici: NON verificato — nessun file per questo layer è stato caricato in questa
 * sessione (solo "Aree borghi identitari" e i due file ISTAT lo sono stati). I nomi di campo
 * assunti sotto (ID_RL, NOME, COMUNE, VINCOLO) restano quelli dei 3 layer Tavola B gemelli già
 * importati da scripts/import-ptpr.ts (stesso ufficio regionale, stessa serie "Tavola B") — una
 * congettura ragionevole ma NON confermata per questo layer specifico, e la lettura resta per
 * questo deliberatamente tollerante (campo mancante → stringa vuota, mai un errore). Verificare il
 * "Tracciato record" (XLSX allegato al dataset) o il file reale al primo uso.
 *
 * Usage:
 *   npx tsx scripts/places/ptpr/extra-layers.ts [--dry-run] [--only borghi|centri|fondazione] [--to-json <file>]
 *
 * File attesi in data/ptpr/ (gitignored, stesso pattern dei 3 layer archeologici già presenti):
 *   borghi_identitari.shp / .dbf / .shx   — rinominato da Aree_borghi_identitari.* al download
 *   centri_storici.shp / .dbf / .shx
 */
import fs from 'fs'
import path from 'path'
import * as shapefile from 'shapefile'
import proj4 from 'proj4'
import { createClient } from '@supabase/supabase-js'
import { importPlaceCandidates } from '../import'
import type { PlaceCandidate } from '../types'

proj4.defs('EPSG:23033', '+proj=utm +zone=33 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs')

const ATTRIBUTION_URL = 'https://geoportale.regione.lazio.it'

// ── Righe grezze (già estratte dallo shapefile, coordinate già WGS84) ───────────────────────────

// Aree borghi identitari — schema VERIFICATO sul file reale caricato dall'utente in questa
// sessione (Aree_borghi_identitari.dbf, 47 record). Niente NOME/COMUNE/VINCOLO: questo layer usa
// un vocabolario diverso dai 3 layer archeologici gemelli.
export interface PtprBorgoIdentitarioRow {
  idRl: string | null
  oggetto: string | null      // OGGETTO — nome proprio dell'insediamento, es. "Villaggio San Giorgio"
  localita: string | null     // LOCALITA_ — toponimo, es. "Maccarese", "Borgo Montello" (non un Comune)
  indirizzo: string | null    // INDIRIZZO
  destinazione: string | null // DESTINAZIO (troncato da "DESTINAZIONE" — limite 10 caratteri del formato .dbf)
  usoAttuale: string | null   // USO_ATTUAL (troncato da "USO_ATTUALE")
  ambito: string | null       // AMBITO
  lat: number
  lon: number
}

// Centri storici — schema NON verificato, vedi nota "Verifica" in cima al file.
export interface PtprCentroStoricoRow {
  idRl: string | null
  nome: string | null
  comune: string | null
  vincolo: string | null
  lat: number
  lon: number
}

// Pura, testabile senza rete/filesystem.
export function borgoIdentitarioToPlaceCandidate(row: PtprBorgoIdentitarioRow): PlaceCandidate {
  const name = row.oggetto?.trim() || row.localita?.trim() || 'Borgo identitario PTPR'
  return {
    name,
    metaType: 'borgo_citta',
    // Classificazione borgo/città (piano §6) NON assegnata qui — resta un segnale in metadata,
    // mai la fonte diretta di `subtype` (che è "classificazione Dtrek", non un'importazione 1:1).
    subtype: undefined,
    // Nessun campo COMUNE in questo layer (vedi nota "Verifica") — LOCALITA_ è un toponimo, non
    // affidabile come nome di Comune, per questo non viene messo in `municipality`.
    address: row.indirizzo?.trim() || undefined,
    latitude: row.lat,
    longitude: row.lon,
    region: 'Lazio',
    source: 'ptpr_lazio',
    sourceId: `borgo_identitario:${row.idRl ?? name}`,
    sourceUrl: ATTRIBUTION_URL,
    rawType: 'borgo_identitario',
    confidence: 1,
    metadata: {
      ptprBorgoIdentitario: true,
      localita: row.localita ?? undefined,
      destinazione: row.destinazione ?? undefined,
      usoAttuale: row.usoAttuale ?? undefined,
      ambito: row.ambito ?? undefined,
    },
  }
}

export function centroStoricoToPlaceCandidate(row: PtprCentroStoricoRow): PlaceCandidate {
  const name = row.comune?.trim() || row.nome?.trim() || 'Centro storico PTPR'
  return {
    name,
    metaType: 'borgo_citta',
    subtype: undefined,
    municipality: row.comune?.trim() || undefined,
    latitude: row.lat,
    longitude: row.lon,
    region: 'Lazio',
    source: 'ptpr_lazio',
    sourceId: `centro_storico:${row.idRl ?? name}`,
    sourceUrl: ATTRIBUTION_URL,
    rawType: 'centro_storico',
    confidence: 1,
    metadata: {
      // Nome esatto usato dal piano §6 come esempio di attributo.
      historicalCenter: true,
      vincolo: row.vincolo ?? undefined,
    },
  }
}

// ── Città di fondazione (tabella statica curata, non uno shapefile — vedi nota in cima) ─────────
export interface CittaDiFondazioneEntry {
  name: string
  istatCode: string   // PRO_COM — verificato via WebSearch (comuni-italiani.it/elesh.it), non da un file scaricato
  province: string
  foundedYear: string
  lat: number
  lon: number
}

export const CITTA_DI_FONDAZIONE: CittaDiFondazioneEntry[] = [
  { name: 'Latina',   istatCode: '059011', province: 'Latina', foundedYear: '1932 (come Littoria)', lat: 41.4676, lon: 12.9037 },
  { name: 'Aprilia',  istatCode: '059001', province: 'Latina', foundedYear: '1936',                  lat: 41.5872, lon: 12.6502 },
  { name: 'Pomezia',  istatCode: '058079', province: 'Roma',   foundedYear: '1939',                  lat: 41.6708, lon: 12.5011 },
  { name: 'Sabaudia', istatCode: '059024', province: 'Latina', foundedYear: '1934',                  lat: 41.3000, lon: 13.0231 },
  { name: 'Pontinia', istatCode: '059017', province: 'Latina', foundedYear: '1935',                  lat: 41.4139, lon: 13.0603 },
]

export function cittaDiFondazioneToPlaceCandidate(entry: CittaDiFondazioneEntry): PlaceCandidate {
  return {
    name: entry.name,
    metaType: 'borgo_citta',
    subtype: undefined,
    municipality: entry.name,
    municipalityIstatCode: entry.istatCode,
    province: entry.province,
    region: 'Lazio',
    latitude: entry.lat,
    longitude: entry.lon,
    source: 'ptpr_lazio',
    sourceId: `citta_fondazione:${entry.istatCode}`,
    sourceUrl: 'https://www.regione.lazio.it/cittadini/cultura/progetti/citt%C3%A0-di-fondazione',
    rawType: 'citta_di_fondazione',
    confidence: 1,
    metadata: {
      // Nome esatto usato dal piano §6 come esempio di attributo.
      cityOfFoundation: true,
      foundedYear: entry.foundedYear,
    },
  }
}

// ── I/O: lettura shapefile ───────────────────────────────────────────────────────────────────
function str(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s.length > 0 ? s : null
}

function toWgs84(coords: number[]): [number, number] {
  const [lon, lat] = proj4('EPSG:23033', 'EPSG:4326', [coords[0], coords[1]])
  return [lon, lat]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function centroidOf(geometry: any): { lat: number; lon: number } | null {
  try {
    if (!geometry) return null
    if (geometry.type === 'Point') {
      const [lon, lat] = toWgs84(geometry.coordinates)
      return { lat, lon }
    }
    const ring: number[][] | undefined = geometry.type === 'Polygon'
      ? geometry.coordinates[0]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates[0]?.[0]
        : undefined
    if (!ring || ring.length === 0) return null
    const converted = ring.map(toWgs84)
    return {
      lat: converted.reduce((s, c) => s + c[1], 0) / converted.length,
      lon: converted.reduce((s, c) => s + c[0], 0) / converted.length,
    }
  } catch {
    return null
  }
}

// Legge le feature grezze di uno shapefile applicando gli stessi controlli di sanità geografica
// (piano/scripts/import-ptpr.ts) — la sola parte condivisa tra i due layer, che dopo la verifica
// sul file reale hanno schemi di campi troppo diversi per una lettura generica unica.
async function readRawFeatures(shpPath: string, encoding: string): Promise<{ props: Record<string, unknown>; lat: number; lon: number }[]> {
  const dbfPath = shpPath.replace(/\.shp$/i, '.dbf')
  const out: { props: Record<string, unknown>; lat: number; lon: number }[] = []
  const source = await shapefile.open(shpPath, dbfPath, { encoding })

  while (true) {
    const { value: feature, done } = await source.read()
    if (done) break
    if (!feature?.geometry) continue

    const centroid = centroidOf(feature.geometry)
    if (!centroid || Number.isNaN(centroid.lat) || Number.isNaN(centroid.lon)) continue
    // Stesso controllo di sanità di scripts/import-ptpr.ts.
    if (centroid.lat < 35 || centroid.lat > 48 || centroid.lon < 6 || centroid.lon > 19) continue

    out.push({ props: (feature.properties ?? {}) as Record<string, unknown>, lat: centroid.lat, lon: centroid.lon })
  }
  return out
}

// Aree borghi identitari — campi VERIFICATI sul file reale (vedi nota "Verifica" in cima al file).
// .cpg reale = UTF-8, non latin1 come i layer Tavola B gemelli.
async function readBorghiIdentitariLayer(shpPath: string): Promise<PtprBorgoIdentitarioRow[]> {
  const features = await readRawFeatures(shpPath, 'utf-8')
  return features.map(({ props, lat, lon }) => ({
    idRl:        str(props['ID_RL']),
    oggetto:     str(props['OGGETTO']),
    localita:    str(props['LOCALITA_']),
    indirizzo:   str(props['INDIRIZZO']),
    destinazione: str(props['DESTINAZIO']),
    usoAttuale:  str(props['USO_ATTUAL']),
    ambito:      str(props['AMBITO']),
    lat,
    lon,
  }))
}

// Centri storici — campi NON verificati (vedi nota "Verifica" in cima al file), assunti identici
// ai layer Tavola B archeologici gemelli già importati da scripts/import-ptpr.ts.
async function readCentroStoriciLayer(shpPath: string): Promise<PtprCentroStoricoRow[]> {
  const features = await readRawFeatures(shpPath, 'latin1')
  return features.map(({ props, lat, lon }) => ({
    idRl:    str(props['ID_RL']),
    nome:    str(props['NOME']),
    comune:  str(props['COMUNE']),
    vincolo: str(props['VINCOLO']),
    lat,
    lon,
  }))
}

async function main() {
  const DRY_RUN = process.argv.includes('--dry-run')
  const onlyIdx = process.argv.indexOf('--only')
  const only = onlyIdx !== -1 ? process.argv[onlyIdx + 1] : null
  // Stesso pattern di scripts/import-ptpr.ts / scripts/places/istat/fetch.ts.
  const toJsonIdx = process.argv.indexOf('--to-json')
  const toJsonFile = toJsonIdx !== -1 ? process.argv[toJsonIdx + 1] : null

  const dataDir = path.join(process.cwd(), 'data', 'ptpr')
  const candidates: PlaceCandidate[] = []

  if (!only || only === 'borghi') {
    const p = path.join(dataDir, 'borghi_identitari.shp')
    if (fs.existsSync(p)) {
      const rows = await readBorghiIdentitariLayer(p)
      console.log(`Borghi identitari: ${rows.length} feature lette.`)
      candidates.push(...rows.map(borgoIdentitarioToPlaceCandidate))
    } else {
      console.warn(`[SKIP] ${p} non trovato — vedi data/ptpr/README.md`)
    }
  }

  if (!only || only === 'centri') {
    const p = path.join(dataDir, 'centri_storici.shp')
    if (fs.existsSync(p)) {
      const rows = await readCentroStoriciLayer(p)
      console.log(`Centri storici: ${rows.length} feature lette.`)
      candidates.push(...rows.map(centroStoricoToPlaceCandidate))
    } else {
      console.warn(`[SKIP] ${p} non trovato — vedi data/ptpr/README.md`)
    }
  }

  if (!only || only === 'fondazione') {
    candidates.push(...CITTA_DI_FONDAZIONE.map(cittaDiFondazioneToPlaceCandidate))
    console.log(`Città di fondazione: ${CITTA_DI_FONDAZIONE.length} righe (tabella statica curata).`)
  }

  if (DRY_RUN) {
    console.log('[DRY RUN] Esempio candidato:', JSON.stringify(candidates[0], null, 2))
    console.log(`[DRY RUN] ${candidates.length} candidati pronti, nessuna scrittura.`)
    return
  }

  if (toJsonFile) {
    fs.writeFileSync(toJsonFile, JSON.stringify(candidates, null, 0))
    console.log(`Scritti ${candidates.length} candidati in ${toJsonFile}`)
    return
  }

  const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) env vars, oppure usa --dry-run.')
    process.exit(1)
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  const stats = await importPlaceCandidates(supabase, candidates)
  console.log(JSON.stringify(stats, null, 2))
}

const isDirectRun = process.argv[1]?.endsWith('extra-layers.ts')
if (isDirectRun) {
  main().catch(err => { console.error(err); process.exit(1) })
}
