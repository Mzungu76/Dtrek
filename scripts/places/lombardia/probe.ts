/**
 * Regione Lombardia — probe diagnostico delle fonti candidate per Siti georeferenziati reali
 * (non geocodificati) — vedi README.md di questa cartella per il contesto completo.
 *
 * Il fix MiC (geocodifica Nominatim di ripiego, `scripts/places/mic/fetch.ts`) ha girato su
 * Lombardia: ArCo cataloga solo 6 "Istituti e Luoghi della Cultura" per l'intera regione (verificato
 * a limit 20 e limit 5000 — stesso numero, non un limite di query). MiC/ArCo non è la fonte giusta
 * per una copertura vera — questo probe verifica CON DATI REALI (mai con la sola documentazione,
 * stesso errore già fatto due volte con le coordinate MiC prima di usare `--describe`) tre fonti
 * regionali candidate trovate via WebSearch in questa sessione (il sandbox non ha accesso di rete a
 * NESSUNO dei domini sotto — vedi "Bloccante di rete" nel README — quindi nessuna era stata ancora
 * interrogata dal vivo prima di questo script):
 *
 * 1. Socrata "Beni culturali Bella Lombardia" (dati.lombardia.it) — derivato da SIRBeC (Sistema
 *    Informativo Regionale Beni Culturali), la stessa fonte che il piano concordato con l'utente
 *    identifica per la Lombardia. Due dataset: quello "Mappa" (ap3k-i5ip) e quello base (4mr7-hfsh).
 *    Un'API SODA Socrata è JSON nativo, niente CRS da trasformare (le colonne "Location" Socrata
 *    sono sempre WGS84) — se lo schema regge, è una fonte molto più semplice del WFS/ArcGIS sotto.
 * 2. ArcGIS REST "cultura/LBL_GEO" (cartografia.servizirl.it) — trovato indicizzato da un motore di
 *    ricerca nella cartella "cultura" dei servizi ArcGIS della Regione (stesso dataset SIRBeC in
 *    veste GIS, non un'altra fonte). `?f=json` sul MapServer rivela CRS/campi reali senza dover
 *    indovinare la trasformazione (a differenza del PTPR Lazio, dove il `.prj` reale ha confermato
 *    un'assunzione fatta a priori — qui non c'è nessuna assunzione pregressa da confermare).
 * 3. Un endpoint GeoServer WFS "standard" sul dominio principale del geoportale — MAI verificato,
 *    puro tentativo a costo zero (nessuna fonte trovata lo conferma, incluso solo perché il piano
 *    originale ipotizzava un WFS su questo dominio).
 *
 * Nessuna scrittura, nessun Supabase — un solo tentativo per probe (stesso spirito di
 * scripts/places/mic/probe.ts: un segnale onesto, non smussato da retry).
 *
 * Usage:
 *   npx tsx scripts/places/lombardia/probe.ts [--timeout 30000] [--only "socrata-mappa-bella-lombardia"]
 */

const USER_AGENT = 'DTrek/1.0 (places catalog diagnostics; mzulpt@gmail.com)'
const DEFAULT_TIMEOUT_MS = 30000

export interface Probe {
  name: string
  note: string
  url: string
}

export const PROBES: Probe[] = [
  {
    name: 'socrata-mappa-bella-lombardia',
    note: "Dataset Socrata 'Mappa Beni culturali Bella Lombardia' (ap3k-i5ip) — versione con georeferenziazione, derivata da SIRBeC. Candidato principale: API SODA JSON, licenza IODL 2.0 (solo attribuzione), verosimilmente WGS84 nativo (colonne Location Socrata).",
    url: 'https://www.dati.lombardia.it/resource/ap3k-i5ip.json?$limit=5',
  },
  {
    name: 'socrata-bella-lombardia-base',
    note: "Dataset Socrata base 'Beni culturali Bella Lombardia' (4mr7-hfsh) — stessa fonte SIRBeC, per confrontare i campi con la versione 'Mappa' sopra (potrebbe avere più campi testuali ma niente geometria).",
    url: 'https://www.dati.lombardia.it/resource/4mr7-hfsh.json?$limit=5',
  },
  {
    name: 'arcgis-cultura-lblgeo-service-json',
    note: "Descrizione del MapServer ArcGIS 'cultura/LBL_GEO' (cartografia.servizirl.it, folder 'cultura' trovata via WebSearch) — rivela i nomi di campo reali, il geometryType e lo spatialReference (CRS) dichiarati dal servizio stesso, prima di qualunque query sui dati.",
    url: 'https://www.cartografia.servizirl.it/arcgis2/rest/services/cultura/LBL_GEO/MapServer?f=json',
  },
  {
    name: 'arcgis-cultura-lblgeo-query-layer0',
    note: "Query diretta (equivalente ArcGIS REST di un GetFeature) sul layer 0 del MapServer sopra, con outSR=4326 per chiedere il ricampionamento a WGS84 al server stesso invece di trasformarlo a mano — se il servizio lo supporta, elimina il rischio di un CRS indovinato male.",
    url: 'https://www.cartografia.servizirl.it/arcgis2/rest/services/cultura/LBL_GEO/MapServer/0/query?where=1%3D1&outFields=*&outSR=4326&resultRecordCount=5&f=json',
  },
  {
    name: 'arcgis-cultura-lblgeo-wfs-getcapabilities',
    note: "Tentativo di WFS vero e proprio sullo stesso MapServer (ArcGIS Server può esporre un'estensione WFS quando abilitata sul singolo servizio) — se risponde 404/errore, il servizio non ha il WFS abilitato e la query ArcGIS REST sopra resta l'unica via.",
    url: 'https://www.cartografia.servizirl.it/arcgis2/rest/services/cultura/LBL_GEO/MapServer/WFSServer?service=WFS&version=2.0.0&request=GetCapabilities',
  },
  {
    name: 'geoserver-wfs-getcapabilities-guess-non-verificato',
    note: "PURO TENTATIVO, nessuna fonte trovata lo conferma: pattern GeoServer standard (\"/geoserver/wfs\") sul dominio principale del geoportale, ipotizzato dal piano originale prima di qualunque verifica. Incluso solo perché a costo zero — non usare il risultato per scrivere un importer senza prima averlo confermato con --describe su dati reali, stesso errore già fatto (ed evitato) due volte con MiC.",
    url: 'https://www.geoportale.regione.lombardia.it/geoserver/wfs?service=WFS&version=2.0.0&request=GetCapabilities',
  },
]

export interface ProbeResult {
  name: string
  note: string
  url: string
  httpStatus: number | 'TIMEOUT' | 'ERROR'
  durationMs: number
  contentType: string | null
  // Troncato: le risposte XML (WFS GetCapabilities) possono essere enormi — qui serve solo
  // riconoscere la forma della risposta (errore leggibile, JSON, XML) per decidere il prossimo
  // passo, non un dump completo.
  bodySnippet: string | null
  error: string | null
}

async function runProbe(probe: Probe, timeoutMs: number): Promise<ProbeResult> {
  const start = Date.now()
  try {
    const res = await fetch(probe.url, {
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json, application/xml, text/xml, */*' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    const durationMs = Date.now() - start
    const text = await res.text()
    return {
      name: probe.name,
      note: probe.note,
      url: probe.url,
      httpStatus: res.status,
      durationMs,
      contentType: res.headers.get('content-type'),
      bodySnippet: text.slice(0, 4000),
      error: null,
    }
  } catch (e) {
    const durationMs = Date.now() - start
    const isTimeout = e instanceof DOMException && e.name === 'TimeoutError'
    return {
      name: probe.name,
      note: probe.note,
      url: probe.url,
      httpStatus: isTimeout ? 'TIMEOUT' : 'ERROR',
      durationMs,
      contentType: null,
      bodySnippet: null,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

async function main() {
  const timeoutIdx = process.argv.indexOf('--timeout')
  const timeoutMs = timeoutIdx !== -1 ? parseInt(process.argv[timeoutIdx + 1], 10) : DEFAULT_TIMEOUT_MS
  const onlyIdx = process.argv.indexOf('--only')
  const only = onlyIdx !== -1 ? process.argv[onlyIdx + 1] : undefined

  const probes = only ? PROBES.filter(p => p.name === only) : PROBES
  if (only && probes.length === 0) {
    console.error(`Nessun probe con nome "${only}". Disponibili: ${PROBES.map(p => p.name).join(', ')}`)
    process.exit(1)
  }

  // Sequenziale: stessi endpoint pubblici condivisi, stesso motivo di scripts/places/mic/probe.ts.
  console.log(`${probes.length} probe, timeout ${timeoutMs}ms ciascuno, in sequenza, un solo tentativo per probe.\n`)

  const results: ProbeResult[] = []
  for (const probe of probes) {
    process.stdout.write(`→ ${probe.name}... `)
    const result = await runProbe(probe, timeoutMs)
    results.push(result)
    const errorSuffix = result.error ? ` — ERRORE: ${result.error.slice(0, 150)}` : ''
    console.log(`${result.httpStatus} in ${result.durationMs}ms (${result.contentType ?? 'n/a'})${errorSuffix}`)
  }

  console.log('\n--- Risultato completo (JSON) ---')
  console.log(JSON.stringify(results, null, 2))
}

const isDirectRun = process.argv[1]?.endsWith('probe.ts') && process.argv[1]?.includes('lombardia')
if (isDirectRun) {
  main().catch(err => { console.error(err); process.exit(1) })
}
