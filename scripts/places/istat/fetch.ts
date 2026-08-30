/**
 * ISTAT "Confini delle unità amministrative a fini statistici" (Basi Territoriali) → dtrek_places
 *
 * Base geografica dei Comuni italiani (piano §4.1) — nome, codice ISTAT, provincia, regione,
 * centroide. ISTAT definisce l'entità territoriale, NON la classificazione turistica: qui
 * `subtype` resta sempre `undefined` (borgo/città è un giudizio Dtrek successivo, piano §6).
 *
 * Fonti verificate in questa sessione (WebSearch/WebFetch, 2026-08-30 — questo ambiente NON ha
 * accesso di rete diretto a istat.it per gli shapefile stessi, vedi nota "Verifica" più sotto):
 *
 *   - Pagina prodotto: https://www.istat.it/it/archivio/222527
 *     ("Confini delle unità amministrative a fini statistici")
 *   - URL di download (pattern stabile, un archivio per anno):
 *     https://www.istat.it/storage/cartografia/confini_amministrativi/generalizzati/<ANNO>/Limiti0101<ANNO>_g.zip
 *     (versione "generalizzata" — geometria semplificata, sufficiente per un centroide; la
 *     versione "non_generalizzati" ha lo stesso path con "non_generalizzati" al posto di
 *     "generalizzati" e senza suffisso "_g", per un confine più dettagliato se in futuro servirà
 *     un poligono comunale reale invece del solo centroide)
 *   - Metadati campi: https://www.istat.it/wp-content/uploads/2024/04/Descrizione-dati-Confini-unita-amministrative-fini-statistici.pdf
 *     → shapefile Comuni `Com0101<ANNO>_g.shp` (+ .dbf, .shx, .cpg, .prj), campi:
 *       PRO_COM (codice numerico Comune), PRO_COM_T (codice alfanumerico), COMUNE (denominazione),
 *       COD_PROV, COD_REG, COD_RIP — SENZA le denominazioni di Provincia/Regione (solo codici).
 *     Proiezione dichiarata dalla pagina prodotto: "WGS84 UTM32N" → EPSG:32632.
 *   - Tabella di codifica (nomi Provincia/Regione mancanti nello shapefile): pagina
 *     https://www.istat.it/classificazione/codici-dei-comuni-delle-province-e-delle-regioni/ →
 *     permalink dichiarato stabile https://www.istat.it/storage/codici-unita-amministrative/Elenco-comuni-italiani.xlsx
 *
 * Verifica: WebFetch/WebSearch in questa sessione confermano che questi URL/pagine esistono e
 * descrivono questa struttura, ma il download effettivo degli shapefile/xlsx non è stato
 * possibile — il proxy di rete di questo ambiente rifiuta esplicitamente la connessione a
 * istat.it per policy dell'organizzazione (stesso blocco già incontrato dalla sessione precedente
 * per motivi diversi, verificato qui con `curl -v` → "CONNECT tunnel failed, response 403",
 * dettaglio "gateway answered 403 to CONNECT (policy denial)"). Questo script è quindi scritto e
 * testato contro fixture realistiche (vedi `__tests__/istat.test.ts`) coerenti con i nomi di campo
 * sopra, ma NON eseguito contro i file reali in questa sessione. Un utente con accesso di rete
 * (locale, o un ambiente con policy diversa) deve scaricare i due file sopra in data/istat/ prima
 * di eseguire questo script — vedi data/istat/README.md.
 *
 * Usage:
 *   npx tsx scripts/places/istat/fetch.ts [--dry-run] [--region "Lazio"]
 *
 * File attesi in data/istat/ (gitignored, stesso pattern di data/ptpr/):
 *   Com0101<ANNO>_g.shp / .dbf / .shx   — confini/centroidi comunali (EPSG:32632)
 *   Elenco-comuni-italiani.xlsx          — codici e denominazioni Comune/Provincia/Regione
 *
 * --region filtra sulla Denominazione Regione dalla tabella di codifica (utile per il pilota
 * Lazio, piano §42) — omesso, importa tutti i Comuni italiani trovati nello shapefile (la base
 * ISTAT è nazionale per costruzione, piano §4.1).
 */
import fs from 'fs'
import path from 'path'
import * as shapefile from 'shapefile'
import proj4 from 'proj4'
import * as XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'
import { importPlaceCandidates } from '../import'
import type { PlaceCandidate } from '../types'

// WGS84 / UTM zone 32N — proiezione dichiarata dalla pagina prodotto ISTAT per questo dataset
// (diversa da EPSG:23033 usata da scripts/import-ptpr.ts per il PTPR Lazio, che è ED50/UTM33N).
proj4.defs('EPSG:32632', '+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs')

const SOURCE_URL = 'https://www.istat.it/it/archivio/222527'

// ── Riga geometria (shapefile Comuni) ────────────────────────────────────────────────────────
export interface IstatComuneGeoRow {
  proCom: string   // PRO_COM — codice numerico, chiave di join con la tabella di codifica
  comune: string   // COMUNE — denominazione dallo shapefile (fallback se manca nella tabella)
  codProv: string
  codReg: string
  lat: number
  lon: number
}

// ── Riga tabella di codifica (Elenco-comuni-italiani.xlsx) ──────────────────────────────────────
export interface IstatCodesRow {
  proCom: string
  comune: string
  provincia?: string
  regione?: string
}

// Fallback solo per il nome Regione, usato esclusivamente se la tabella di codifica non è
// disponibile o non espone una colonna Regione riconoscibile — i 20 codici ISTAT delle regioni
// sono uno standard stabile, non specifico di un'edizione del dataset.
const REGION_NAME_BY_CODE: Record<string, string> = {
  '1': 'Piemonte', '2': "Valle d'Aosta", '3': 'Lombardia', '4': 'Trentino-Alto Adige',
  '5': 'Veneto', '6': 'Friuli-Venezia Giulia', '7': 'Liguria', '8': 'Emilia-Romagna',
  '9': 'Toscana', '10': 'Umbria', '11': 'Marche', '12': 'Lazio', '13': 'Abruzzo',
  '14': 'Molise', '15': 'Campania', '16': 'Puglia', '17': 'Basilicata', '18': 'Calabria',
  '19': 'Sicilia', '20': 'Sardegna',
}

// Pura, testabile senza rete/filesystem — unisce una riga di geometria con la corrispondente riga
// della tabella di codifica (join su PRO_COM) in un PlaceCandidate. `codesRow` è opzionale: se la
// tabella di codifica manca o non contiene questo Comune, il candidato viene comunque prodotto
// (nome dallo shapefile, regione dal fallback sopra, provincia assente) invece di scartarlo — un
// Comune con solo la geometria è comunque un'entità amministrativa valida (piano §4.1).
export function istatRowToPlaceCandidate(geoRow: IstatComuneGeoRow, codesRow?: IstatCodesRow): PlaceCandidate {
  const name = codesRow?.comune?.trim() || geoRow.comune
  const region = codesRow?.regione || REGION_NAME_BY_CODE[geoRow.codReg]

  return {
    name,
    metaType: 'borgo_citta',
    // La classificazione borgo/città (piano §6) NON viene da ISTAT — resta indefinita finché un
    // passo successivo (Blocco C) non la assegna esplicitamente.
    subtype: undefined,
    latitude: geoRow.lat,
    longitude: geoRow.lon,
    region,
    province: codesRow?.provincia,
    municipality: name,
    municipalityIstatCode: geoRow.proCom,
    source: 'istat',
    sourceId: geoRow.proCom,
    sourceUrl: SOURCE_URL,
    rawType: 'comune',
    confidence: 1,
    metadata: {
      codProv: geoRow.codProv,
      codReg: geoRow.codReg,
    },
  }
}

// ── I/O: lettura shapefile + tabella di codifica ─────────────────────────────────────────────

function toWgs84FromUtm32N(coords: number[]): [number, number] {
  const [lon, lat] = proj4('EPSG:32632', 'EPSG:4326', [coords[0], coords[1]])
  return [lon, lat]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function centroidOf(geometry: any): { lat: number; lon: number } | null {
  try {
    if (!geometry) return null
    if (geometry.type === 'Point') {
      const [lon, lat] = toWgs84FromUtm32N(geometry.coordinates)
      return { lat, lon }
    }
    if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
      // Anello esterno del primo poligono — sufficiente per un centroide approssimativo di un
      // confine comunale (stesso approccio di extractCentroid in scripts/import-ptpr.ts).
      const ring: number[][] = geometry.type === 'Polygon'
        ? geometry.coordinates[0]
        : geometry.coordinates[0][0]
      if (!ring || ring.length === 0) return null
      const converted = ring.map(toWgs84FromUtm32N)
      return {
        lat: converted.reduce((s, c) => s + c[1], 0) / converted.length,
        lon: converted.reduce((s, c) => s + c[0], 0) / converted.length,
      }
    }
  } catch {}
  return null
}

function findShpFile(dir: string): string | null {
  if (!fs.existsSync(dir)) return null
  const match = fs.readdirSync(dir).find(f => /^Com.*\.shp$/i.test(f))
  return match ? path.join(dir, match) : null
}

async function readGeometryRows(shpPath: string): Promise<IstatComuneGeoRow[]> {
  const dbfPath = shpPath.replace(/\.shp$/i, '.dbf')
  const rows: IstatComuneGeoRow[] = []
  const source = await shapefile.open(shpPath, dbfPath, { encoding: 'utf-8' })

  while (true) {
    const { value: feature, done } = await source.read()
    if (done) break
    if (!feature?.geometry) continue

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props: any = feature.properties ?? {}
    const centroid = centroidOf(feature.geometry)
    if (!centroid || Number.isNaN(centroid.lat) || Number.isNaN(centroid.lon)) continue

    const proCom = props['PRO_COM'] != null ? String(props['PRO_COM']) : null
    const comune = props['COMUNE'] != null ? String(props['COMUNE']).trim() : ''
    if (!proCom || !comune) continue

    rows.push({
      proCom,
      comune,
      codProv: props['COD_PROV'] != null ? String(props['COD_PROV']) : '',
      codReg: props['COD_REG'] != null ? String(props['COD_REG']) : '',
      lat: centroid.lat,
      lon: centroid.lon,
    })
  }
  return rows
}

// Individua le colonne per fuzzy-match sull'intestazione invece di un nome esatto — l'intestazione
// reale del file ISTAT non è stata verificabile byte-per-byte in questa sessione (vedi nota in
// cima al file), quindi un match rigido rischierebbe di rompersi silenziosamente su una variante di
// formattazione (maiuscole, spazi, note a piè di colonna tipo "(Storico)(1)").
function findColumnIndex(header: string[], mustInclude: string[], mustExclude: string[] = []): number {
  return header.findIndex(h => {
    const low = (h ?? '').toString().toLowerCase()
    return mustInclude.every(k => low.includes(k)) && !mustExclude.some(k => low.includes(k))
  })
}

function readCodesRows(xlsxPath: string): Map<string, IstatCodesRow> {
  const map = new Map<string, IstatCodesRow>()
  const wb = XLSX.readFile(xlsxPath)
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false })

  // La riga di intestazione non è necessariamente la prima (i file ISTAT hanno spesso una riga di
  // titolo sopra) — si cerca la prima riga che contiene sia una colonna "regione" sia una colonna
  // "comune", che identifica in modo affidabile l'header vero.
  let headerIdx = rows.findIndex(r =>
    r.some(c => (c ?? '').toString().toLowerCase().includes('regione'))
    && r.some(c => (c ?? '').toString().toLowerCase().includes('comune')),
  )
  if (headerIdx === -1) headerIdx = 0
  const header = (rows[headerIdx] ?? []).map(c => (c ?? '').toString())

  const idxRegione   = findColumnIndex(header, ['denominazione', 'regione'])
  const idxProvincia = findColumnIndex(header, ['denominazione'], ['regione', 'comune', 'lingua', 'unità', 'unita'])
  const idxComuneNum = findColumnIndex(header, ['comune', 'numeric'])
  const idxComuneAlt = findColumnIndex(header, ['comune', 'alfanumeric'])
  const idxComuneNome = findColumnIndex(header, ['denominazione', 'italiano'], ['altra lingua', 'regione'])

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length === 0) continue
    const proComRaw = idxComuneNum >= 0 ? row[idxComuneNum] : undefined
    const proCom = proComRaw != null ? String(proComRaw).trim() : ''
    if (!proCom || !/^\d+$/.test(proCom)) continue

    map.set(proCom, {
      proCom,
      comune:    (idxComuneNome >= 0 ? row[idxComuneNome] : row[idxComuneAlt])?.toString().trim() ?? '',
      provincia: idxProvincia >= 0 ? row[idxProvincia]?.toString().trim() : undefined,
      regione:   idxRegione >= 0 ? row[idxRegione]?.toString().trim() : undefined,
    })
  }
  return map
}

async function main() {
  const DRY_RUN = process.argv.includes('--dry-run')
  const regionArgIdx = process.argv.indexOf('--region')
  const regionFilter = regionArgIdx !== -1 ? process.argv[regionArgIdx + 1] : null

  const dataDir = path.join(process.cwd(), 'data', 'istat')
  const shpPath = findShpFile(dataDir)
  if (!shpPath) {
    console.error(`Nessuno shapefile Com*.shp trovato in ${dataDir}. Vedi data/istat/README.md.`)
    process.exit(1)
  }

  console.log(`Lettura geometrie da ${path.basename(shpPath)}…`)
  const geoRows = await readGeometryRows(shpPath)
  console.log(`${geoRows.length} Comuni letti dallo shapefile.`)

  const xlsxPath = path.join(dataDir, 'Elenco-comuni-italiani.xlsx')
  let codesMap = new Map<string, IstatCodesRow>()
  if (fs.existsSync(xlsxPath)) {
    codesMap = readCodesRows(xlsxPath)
    console.log(`${codesMap.size} righe lette dalla tabella di codifica.`)
  } else {
    console.warn(`Tabella di codifica non trovata (${xlsxPath}) — nomi Provincia/Regione limitati al fallback per codice.`)
  }

  let candidates = geoRows.map(row => istatRowToPlaceCandidate(row, codesMap.get(row.proCom)))

  if (regionFilter) {
    const needle = regionFilter.trim().toLowerCase()
    candidates = candidates.filter(c => (c.region ?? '').toLowerCase() === needle)
    console.log(`Filtrati su regione "${regionFilter}": ${candidates.length} candidati.`)
  }

  if (DRY_RUN) {
    console.log('[DRY RUN] Esempio candidato:', JSON.stringify(candidates[0], null, 2))
    console.log(`[DRY RUN] ${candidates.length} candidati pronti, nessuna scrittura.`)
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

// Guard invece di `require.main === module` — questo file viene anche importato da un test
// vitest (per testare `istatRowToPlaceCandidate` in isolamento, senza filesystem/rete) che gira
// sotto un module loader ESM dove `require` non è garantito disponibile; confrontare
// `process.argv[1]` funziona identicamente in entrambi gli ambienti (tsx CLI diretto vs vitest).
const isDirectRun = process.argv[1]?.endsWith('fetch.ts') && process.argv[1]?.includes('istat')
if (isDirectRun) {
  main().catch(err => { console.error(err); process.exit(1) })
}
