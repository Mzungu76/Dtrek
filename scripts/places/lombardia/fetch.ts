/**
 * Regione Lombardia — SIRBeC (Sistema Informativo Regionale Beni Culturali) → dtrek_places
 *
 * MiC/ArCo (`scripts/places/mic/fetch.ts`) è stato verificato insufficiente per la Lombardia:
 * cataloga solo 6 "Istituti e Luoghi della Cultura" per l'intera regione (verificato a limit 20 e
 * limit 5000 — stesso numero, non un limite di query). Cercare Siti vicino a Milano dava quasi
 * nulla. Questo file usa la fonte regionale reale, verificata con due round di probe dal vivo
 * (`scripts/places/lombardia/probe.ts`, eseguiti dall'utente via
 * `.github/workflows/import-places-lombardia.yml` il 2026-09-22 — vedi README.md di questa
 * cartella per il dettaglio completo di entrambi i round).
 *
 * ── Fonte ────────────────────────────────────────────────────────────────────────────────────
 *
 * Layer ArcGIS `cultura/LBL_GEO` (servizio "cultura", layer `Beni_Culturali`), infrastruttura IT
 * di Regione Lombardia:
 *
 *     https://www.cartografia.servizirl.it/arcgis2/rest/services/cultura/LBL_GEO/MapServer/0/query
 *
 * Trovato via WebSearch (nessuna documentazione ufficiale indicizzata lo elenca esplicitamente —
 * indicizzato come risultato di ricerca della cartella `cultura` dei servizi ArcGIS regionali),
 * poi VERIFICATO con dati reali (non assunto dal nome): stessa fonte SIRBeC del dataset Socrata
 * "Beni culturali Bella Lombardia" (dati.lombardia.it, id `4mr7-hfsh`) — i due condividono il nome
 * di campo `IDBENE`/`idbene` e il dominio delle foto (`bellalombardia.regione.lombardia.it`).
 *
 * Non esiste un vero WFS per questa fonte: sia `.../MapServer/WFSServer?service=WFS&request=
 * GetCapabilities` sia un GeoServer generico sul dominio del geoportale principale hanno risposto
 * con una pagina HTML (rispettivamente la solita directory REST di ArcGIS, e "Pagina non trovata")
 * — MAI un vero documento GetCapabilities. La query REST nativa di ArcGIS usata qui è comunque più
 * semplice di un WFS.
 *
 * ── CRS — risolto senza trasformazione manuale (diversamente dal PTPR Lazio, EPSG:23033) ───────
 *
 * Il servizio dichiara di default `spatialReference: {wkid: 102100}` (Web Mercator, per il
 * rendering della mappa) — MA la query supporta `outSR=4326`, e il server RIPROIETTA lui stesso:
 * verificato dal vivo (`arcgis-lblgeo-geometry-sample-milano`, round 2) con 3 record reali su
 * Milano, coordinate plausibili (lon ~9.17-9.18, lat ~45.45-45.47 — esattamente Milano). Nessun
 * proj4/trasformazione a mano necessaria: `outSR=4326` in ogni query basta.
 *
 * ── Categorie — verificato che NON serve un filtro oggetti/opere d'arte ─────────────────────────
 *
 * Il dataset Socrata gemello (stessa fonte SIRBeC) cataloga ANCHE oggetti singoli (es. "Statuetta
 * fittile di vignaiolo", categoria "Capolavori") oltre ai luoghi — un rischio reale di importare
 * opere d'arte come "Siti" se il layer ArcGIS avesse la stessa mescolanza. Verificato con un
 * conteggio reale (round 2, `arcgis-lblgeo-categorie-distinte`): i valori distinti di `CATEGORIA`
 * nel layer (`LDC` 110, `B` 146, `A4` 133, `A1` 207, `A3` 40, `SA` 10, `A2` 5) sommano ESATTAMENTE
 * al conteggio totale del layer (651, `arcgis-lblgeo-count-totale`) — nessuna categoria residua
 * "oggetto singolo" nascosta. Il layer risulta già curato ai soli luoghi. Nessun filtro CATEGORIA
 * applicato di conseguenza — la classificazione sotto lavora comunque sul testo di `TIPOLOGIA` per
 * ogni record (mai sul codice `CATEGORIA`, il cui significato esatto non è documentato), stesso
 * approccio a sottostringa di `MIC_TYPE_MAP` in `scripts/places/mic/fetch.ts`.
 *
 * ── Copertura reale (round 2, 2026-09-22) ────────────────────────────────────────────────────
 *
 * 651 record in tutta la Lombardia (contro i 6 di MiC/ArCo), di cui 70 nel solo Comune di Milano —
 * il numero concreto che risolve il problema segnalato dall'utente ("cerco Siti vicino a Milano,
 * quasi nulla"). Tutti risultano avere geometria valida (layer puntuale specifico per la mappa).
 *
 * ── Licenza — CC0 1.0, confermata sul dataset gemello, NON confermata su questo canale ArcGIS ──
 *
 * Il dataset Socrata "Beni culturali Bella Lombardia" (`4mr7-hfsh`) e la sua vista mappa
 * (`ap3k-i5ip`) dichiarano entrambi `licenseId: "CC0_10"` (Creative Commons Zero — pubblico
 * dominio) nella loro metadata Socrata, con `attribution: "Regione Lombardia"` come cortesia non
 * obbligatoria. Il servizio ArcGIS interrogato qui ha `copyrightText` VUOTO — nessuna licenza
 * dichiarata a livello di servizio. Trattato qui come CC0 per analogia (stessa fonte SIRBeC,
 * stesso IDBENE, stesso progetto "Bella Lombardia" — non un'invenzione, ma nemmeno una conferma
 * indipendente per questo canale specifico). `sourceUrl` punta al portale pubblico del progetto
 * come attribuzione di cortesia, non perché richiesta da una licenza confermata.
 *
 * Usage:
 *   npx tsx scripts/places/lombardia/fetch.ts --describe                    (diagnostica, un record arbitrario)
 *   npx tsx scripts/places/lombardia/fetch.ts --describe --name "Museo"     (diagnostica, filtrato per nome)
 *   npx tsx scripts/places/lombardia/fetch.ts --dry-run [--limit 5000]      (nessuna scrittura)
 *   npx tsx scripts/places/lombardia/fetch.ts [--limit 5000]                (scrittura reale)
 *
 * --limit di default copre l'intera regione (651 record verificati, ben sotto 5000) — la
 * paginazione sotto (resultOffset, pagine da 1000 come da `maxRecordCount` dichiarato dal
 * servizio) resta comunque corretta anche se la fonte crescesse oltre 1000 record in futuro.
 */
import { createClient } from '@supabase/supabase-js'
import { importPlaceCandidates } from '../import'
import type { PlaceCandidate } from '../types'
import type { SiteType } from '../../../lib/metaTypes'

const QUERY_ENDPOINT = 'https://www.cartografia.servizirl.it/arcgis2/rest/services/cultura/LBL_GEO/MapServer/0/query'
const USER_AGENT = 'DTrek/1.0 (places catalog batch import; mzulpt@gmail.com)'
const ATTRIBUTION_URL = 'http://www.bellalombardia.regione.lombardia.it/'
const PAGE_SIZE = 1000 // maxRecordCount dichiarato dal servizio (arcgis-cultura-lblgeo-service-json, round 1)

const OUT_FIELDS = ['IDBENE', 'DENOMINAZIONE', 'TIPOLOGIA', 'TIPOMUSEO', 'CATEGORIA', 'INDIRIZZO', 'COMUNE', 'PROVINCIA', 'ABSTRACT', 'URLFOTOL']

// ── TIPOLOGIA (testo libero, non un codice) → SiteType ──────────────────────────────────────────
// Solo 3 valori osservati DAL VIVO finora (round 1/2 di probe.ts): 'anfiteatro', 'Museo, galleria
// non a scopo di lucro e/o raccolta', 'convento' — le altre voci sotto sono per analogia con
// MIC_TYPE_MAP (stesso dominio: tipologie di beni culturali italiani), NON ancora verificate su
// questo dataset specifico. Un --dry-run su tutta la regione mostrerà la distribuzione reale di
// TIPOLOGIA (loggata sotto) — da rivedere contro quella prima di un write su scala piena se compare
// molto 'altro'.
const LOMBARDIA_TYPE_MAP: [string, SiteType][] = [
  ['anfiteatro', 'sito_archeologico'], // osservato dal vivo (Milano, IDBENE 8839)
  ['area archeologic', 'sito_archeologico'],
  ['scavi', 'sito_archeologico'],
  ['necropoli', 'sito_archeologico'],
  ['castello', 'castello'],
  ['rocca', 'castello'],
  ['fortezza', 'castello'],
  ['abbazia', 'abbazia'],
  ['monastero', 'abbazia'],
  ['convento', 'abbazia'], // osservato dal vivo (Milano, "Convento di S. Maria delle Grazie")
  ['eremo', 'abbazia'],
  ['chiesa', 'chiesa'],
  ['basilica', 'chiesa'],
  ['cattedrale', 'chiesa'],
  ['santuario', 'chiesa'],
  ['duomo', 'chiesa'],
  ['battistero', 'chiesa'],
  ['palazzo', 'palazzo'],
  ['villa', 'palazzo'],
  ['teatro', 'teatro'],
  ['museo', 'museo'], // osservato dal vivo (Lecco/Milano, "Museo, galleria non a scopo di lucro e/o raccolta")
  ['galleria', 'museo'],
  ['pinacoteca', 'museo'],
  ['collezione', 'museo'],
  ['monumento', 'monumento'],
  ['mausoleo', 'monumento'],
]

export function lombardiaTipologiaToSiteType(tipologia: string | undefined | null): SiteType {
  if (!tipologia) return 'altro'
  const lower = tipologia.toLowerCase()
  for (const [needle, type] of LOMBARDIA_TYPE_MAP) {
    if (lower.includes(needle)) return type
  }
  return 'altro'
}

// Pura, testabile senza rete. Conta i valori REALI di `tipologia` (mai un'ipotesi) che cadono su un
// dato subtype — usata dal dry-run per mostrare ESATTAMENTE cosa manca a LOMBARDIA_TYPE_MAP prima
// di estenderla, invece di indovinare dalla sola percentuale di 'altro'.
export function countRawTipologiaForSubtype(features: { tipologia?: string }[], subtype: SiteType): [string, number][] {
  const counts = new Map<string, number>()
  for (const f of features) {
    if (lombardiaTipologiaToSiteType(f.tipologia) !== subtype) continue
    const key = f.tipologia ?? '(assente)'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

// ── Feature ArcGIS grezza → PlaceCandidate ───────────────────────────────────────────────────────
export interface LombardiaFeature {
  idBene: string
  denominazione: string
  tipologia?: string
  tipoMuseo?: string
  categoria?: string
  indirizzo?: string
  comune?: string
  provincia?: string
  abstract?: string
  urlFoto?: string
  lat: number
  lon: number
}

// Pura, testabile senza rete.
export function lombardiaFeatureToPlaceCandidate(f: LombardiaFeature): PlaceCandidate {
  const sourceUrl = ATTRIBUTION_URL
  return {
    name: f.denominazione || 'Sito Lombardia',
    metaType: 'sito',
    subtype: lombardiaTipologiaToSiteType(f.tipologia),
    description: f.abstract,
    latitude: f.lat,
    longitude: f.lon,
    region: 'Lombardia',
    province: f.provincia,
    municipality: f.comune,
    address: f.indirizzo,
    imageUrl: f.urlFoto,
    source: 'lombardia_sirbec',
    sourceId: f.idBene,
    sourceUrl,
    rawType: f.tipologia,
    // Come MIC_TYPE_MAP: 1 solo quando la classificazione testuale ha trovato un match noto, più
    // basso quando è caduta su 'altro' — mai spacciata per affidabile quanto un campo strutturato
    // chiuso (ISTAT/PTPR).
    confidence: f.tipologia && lombardiaTipologiaToSiteType(f.tipologia) !== 'altro' ? 0.85 : 0.6,
    metadata: {
      sirbecCategoria: f.categoria,
      sirbecTipoMuseo: f.tipoMuseo,
      sirbecTipologia: f.tipologia,
    },
  }
}

// ── HTTP (ArcGIS REST — nessun vero WFS disponibile, vedi nota in cima al file) ──────────────────
const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504])
const MAX_RETRIES = 4

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchArcgisJson(params: Record<string, string>): Promise<unknown> {
  const url = `${QUERY_ENDPOINT}?${new URLSearchParams(params).toString()}`
  let lastError: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1)) // 1s, 2s, 4s, 8s

    let res: Response
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(30000),
      })
    } catch (e) {
      lastError = e
      continue
    }
    if (res.ok) {
      const data = await res.json() as { error?: { code: number; message: string } }
      // ArcGIS risponde 200 anche per un errore applicativo (parametro non valido, layer
      // inesistente) — un corpo con `error` non è un successo, stesso trattamento di uno status
      // HTTP non-ok (vedi mic/fetch.ts, fetchSparqlJson, per lo stesso principio su un'altra API).
      if (data.error) {
        lastError = new Error(`Lombardia ArcGIS error ${data.error.code}: ${data.error.message}`)
        continue
      }
      return data
    }
    const bodyText = (await res.text()).slice(0, 500)
    if (!TRANSIENT_STATUS.has(res.status)) throw new Error(`Lombardia ArcGIS ${res.status}: ${bodyText}`)
    lastError = new Error(`Lombardia ArcGIS ${res.status}: ${bodyText}`)
  }
  throw lastError instanceof Error ? lastError : new Error('Lombardia ArcGIS: troppi tentativi falliti')
}

interface ArcgisQueryResponse {
  features: {
    attributes: Record<string, string | number | null>
    geometry?: { x: number; y: number }
  }[]
}

// Pura, testabile senza rete.
export function arcgisFeatureToLombardiaFeature(raw: ArcgisQueryResponse['features'][number]): LombardiaFeature | null {
  if (!raw.geometry) return null
  const { x: lon, y: lat } = raw.geometry
  if (typeof lon !== 'number' || typeof lat !== 'number' || Number.isNaN(lon) || Number.isNaN(lat)) return null
  const a = raw.attributes
  const idBene = a.IDBENE
  if (idBene === null || idBene === undefined) return null
  const str = (v: string | number | null | undefined): string | undefined => {
    if (v === null || v === undefined) return undefined
    const s = String(v).trim()
    return s.length > 0 ? s : undefined
  }
  return {
    idBene: String(idBene),
    denominazione: str(a.DENOMINAZIONE) ?? '',
    tipologia: str(a.TIPOLOGIA),
    tipoMuseo: str(a.TIPOMUSEO),
    categoria: str(a.CATEGORIA),
    indirizzo: str(a.INDIRIZZO),
    comune: str(a.COMUNE),
    provincia: str(a.PROVINCIA),
    abstract: str(a.ABSTRACT),
    urlFoto: str(a.URLFOTOL),
    lat,
    lon,
  }
}

// Paginazione via resultOffset — PAGE_SIZE (1000) è il maxRecordCount dichiarato dal servizio
// stesso (round 1), corretta anche se la fonte crescesse oltre una pagina in futuro (oggi 651
// record, tutti in una sola pagina).
async function fetchAllFeatures(limit: number): Promise<LombardiaFeature[]> {
  const out: LombardiaFeature[] = []
  let offset = 0
  while (out.length < limit) {
    const pageSize = Math.min(PAGE_SIZE, limit - out.length)
    const data = await fetchArcgisJson({
      where: '1=1',
      outFields: OUT_FIELDS.join(','),
      outSR: '4326',
      f: 'json',
      resultRecordCount: String(pageSize),
      resultOffset: String(offset),
    }) as ArcgisQueryResponse
    const features = data.features ?? []
    for (const raw of features) {
      const f = arcgisFeatureToLombardiaFeature(raw)
      if (f) out.push(f)
    }
    if (features.length < pageSize) break // ultima pagina
    offset += features.length
  }
  return out
}

// ── Diagnostica (--describe) ─────────────────────────────────────────────────────────────────
async function runDescribe(name: string | null): Promise<void> {
  const where = name ? `UPPER(DENOMINAZIONE) LIKE UPPER('%${name.replace(/'/g, "''")}%')` : '1=1'
  console.log(`Interrogo ${QUERY_ENDPOINT} — record ${name ? `con DENOMINAZIONE contenente "${name}"` : 'arbitrario'}…`)
  const data = await fetchArcgisJson({
    where,
    outFields: '*',
    outSR: '4326',
    f: 'json',
    resultRecordCount: '1',
  })
  console.log(JSON.stringify(data, null, 2))
}

async function main() {
  if (process.argv.includes('--describe')) {
    const nameIdx = process.argv.indexOf('--name')
    const name = nameIdx !== -1 ? process.argv[nameIdx + 1] : null
    await runDescribe(name)
    return
  }

  const DRY_RUN = process.argv.includes('--dry-run')
  const limitIdx = process.argv.indexOf('--limit')
  const limit = limitIdx !== -1 ? parseInt(process.argv[limitIdx + 1], 10) : 5000

  console.log(`Interrogo ${QUERY_ENDPOINT} (limit ${limit})…`)
  const features = await fetchAllFeatures(limit)
  console.log(`${features.length} record con geometria valida.`)

  // Distribuzione TIPOLOGIA→SiteType — vedi nota su LOMBARDIA_TYPE_MAP (solo 3 valori verificati
  // dal vivo finora): un conteggio alto su 'altro' segnala che la mappa va estesa prima di un write
  // su scala piena.
  const bySubtype = new Map<string, number>()
  for (const f of features) {
    const subtype = lombardiaTipologiaToSiteType(f.tipologia)
    bySubtype.set(subtype, (bySubtype.get(subtype) ?? 0) + 1)
  }
  console.log('Distribuzione per subtype:', Object.fromEntries(bySubtype))
  if ((bySubtype.get('altro') ?? 0) > 0) {
    console.log("Valori TIPOLOGIA reali che cadono su 'altro' (da usare per estendere LOMBARDIA_TYPE_MAP, mai indovinati):")
    console.log(countRawTipologiaForSubtype(features, 'altro'))
  }

  const candidates = features.map(lombardiaFeatureToPlaceCandidate)

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

const isDirectRun = process.argv[1]?.endsWith('fetch.ts') && process.argv[1]?.includes('lombardia')
if (isDirectRun) {
  main().catch(err => { console.error(err); process.exit(1) })
}
