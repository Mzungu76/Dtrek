/**
 * Regione Toscana — probe diagnostico delle fonti candidate per Siti georeferenziati reali
 * (non geocodificati) — stesso spirito di scripts/places/lombardia/probe.ts, PRIMA verifica MAI
 * fatta di questi endpoint da questa sessione (il sandbox non ha accesso di rete a nessuno dei
 * domini sotto — vedi scripts/places/mic/README.md "Bloccante di rete" — quindi tutti questi probe
 * vanno lanciati dal workflow GitHub Actions, mai da qui).
 *
 * ── Perché questo file esiste (contesto) ────────────────────────────────────────────────────────
 * Verifica utente (2026-09-25): "quali altre regioni sono scarne nel mic in Supabase?" ha rivelato
 * **0 Siti con source='mic' per la Toscana** (e per la Valle d'Aosta) — stesso ordine di gravità
 * del caso Lombardia (2 soli record MiC) che aveva già portato a costruire una fonte dedicata
 * (SIRBeC ArcGIS, vedi scripts/places/lombardia/).
 *
 * MA per la Toscana la priorità NON è questo file: `scripts/places/mic/fetch.ts` porta già, dal fix
 * del 2026-09-21/22 ("coordinate mancanti Lombardia/Toscana"), una geocodifica di ripiego
 * (Nominatim) per i record ArCo che hanno un indirizzo strutturato ma MAI una tripla di
 * coordinate — esattamente il pattern documentato per il sotto-grafo ArCo di Lombardia/Toscana
 * (namespace w3id.org/arco/resource/<Regione>/..., diverso da quello nazionale). Verificato dal
 * vivo SOLO per la Lombardia (run GitHub Actions 2026-09-22: 6/6 record geocodificati con
 * successo) — MAI ancora testato per la Toscana. Il valore "Toscana: 0" osservato oggi in Supabase
 * risale a un run precedente a quel fix (2026-09-17, "tutta Italia" — vedi MIC_DATA_SOURCES.md §3)
 * ed è quindi quasi certamente OBSOLETO.
 *
 * **Prima cosa da fare quando le GitHub Actions saranno di nuovo disponibili**: un
 * `mode: dry-run`, `region: Toscana` sul workflow "Import Places — MiC" (fetch.ts già pronto, nessun
 * codice nuovo necessario). Se quel test trova un numero di Siti ragionevole (anche solo
 * qualche decina, come per Canepina/Lazio), la Toscana potrebbe non aver bisogno affatto di una
 * fonte dedicata come questa. Questo file (probe.ts) è la RISERVA, da usare solo se quel dry-run
 * MiC conferma una copertura povera anche con la geocodifica (come già successo per la Lombardia,
 * dove ArCo aveva solo 6 record totali indipendentemente dal fix coordinate).
 *
 * ── Fonti candidate (trovate via WebSearch in questa sessione, 2026-09-25 — NESSUNA verificata
 * con una richiesta HTTP reale) ──────────────────────────────────────────────────────────────────
 *
 * 1. CKAN "OpenData Regione Toscana" (dati.toscana.it) — portale open data ufficiale della Regione,
 *    piattaforma CKAN standard (API REST documentata, `/api/3/action/*`). Candidato principale:
 *    stesso ruolo del Socrata lombardo, ma CKAN invece di Socrata — verificare con
 *    `package_search` quali dataset esistono per "beni culturali"/"musei" prima di assumere un
 *    dataset_id specifico.
 * 2. GEOscopio — Sistema Informativo Territoriale ed Ambientale della Regione Toscana
 *    (www502.regione.toscana.it), il portale WebGIS regionale con un layer dedicato
 *    "BENI_CULTURALI_E_DEL_PAESAGGIO" (vincoli su beni culturali e paesaggistici, poligoni).
 *    Le due pagine di documentazione HTML sotto sono REALI (trovate via WebSearch), ma l'URL
 *    esatto del servizio WFS che sta dietro NON è stato confermato (serve leggere la pagina HTML
 *    o interrogare un GetCapabilities per scoprirlo) — i probe `geoserver-wfs-*` sotto sono
 *    tentativi sul pattern GeoServer standard, non una conferma.
 * 3. `scripts/places/mic/fetch.ts` menziona esplicitamente "il sistema della Regione
 *    Toscana/Consorzio LaMMA" come fonte georeferenziata originale dei record ArCo senza
 *    coordinate — LaMMA (Laboratorio di Monitoraggio e Modellistica Ambientale) è il consorzio
 *    Regione Toscana/CNR che gestisce parte dell'infrastruttura dati ambientale toscana
 *    (lamma.toscana.it) — un possibile quarto candidato se i primi tre non bastano, non ancora
 *    approfondito.
 *
 * Nessuna scrittura, nessun Supabase — un solo tentativo per probe (stesso spirito di
 * scripts/places/mic/probe.ts e scripts/places/lombardia/probe.ts: un segnale onesto, non
 * smussato da retry).
 *
 * Usage:
 *   npx tsx scripts/places/toscana/probe.ts [--timeout 30000] [--only "ckan-package-search-beni-culturali"]
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
    name: 'ckan-package-search-beni-culturali',
    note: "API CKAN standard di dati.toscana.it — cerca i dataset il cui titolo/descrizione contiene 'beni culturali', senza assumere un dataset_id specifico. Se risponde 200 con risultati, rivela i veri nomi/ID dei dataset disponibili (da usare nei probe successivi, mai indovinati).",
    url: 'https://dati.toscana.it/api/3/action/package_search?q=beni%20culturali&rows=10',
  },
  {
    name: 'ckan-package-search-musei',
    note: "Stessa API, query 'musei' — un termine più specifico di 'beni culturali' che potrebbe trovare un dataset diverso (es. un elenco musei separato dai vincoli paesaggistici).",
    url: 'https://dati.toscana.it/api/3/action/package_search?q=musei&rows=10',
  },
  {
    name: 'ckan-dataset-km4city-show',
    note: "Dataset 'Km4City' (Smart City API) trovato via WebSearch, descritto come comprendente anche turismo/beni culturali oltre a trasporti/commercio — package_show rivela le risorse reali (formato, URL) senza scaricare dati.",
    url: 'https://dati.toscana.it/api/3/action/package_show?id=km4city',
  },
  {
    name: 'ckan-dataset-rt-archivi-show',
    note: "Dataset 'rt-archivi' (oltre 230 archivi, perlopiù enti pubblici) trovato via WebSearch — probabilmente non luoghi/musei ma verificare le risorse reali prima di escluderlo.",
    url: 'https://dati.toscana.it/api/3/action/package_show?id=rt-archivi',
  },
  {
    name: 'geoscopio-beni-culturali-pagina-html',
    note: "Pagina del geoportale GEOscopio dedicata a 'Beni Culturali e Paesaggistici' (SIPT) — HTML, non un'API, ma la fonte primaria per scoprire l'URL WFS reale (cercare nel body un link 'GetCapabilities' o 'wfs'). Verificare lo status HTTP prima di tutto: se il dominio risponde, si può proseguire a leggere il contenuto.",
    url: 'https://www502.regione.toscana.it/geoscopio/beniculturaliedelpaesaggio.html',
  },
  {
    name: 'geoscopio-wms-servizio-pagina-html',
    note: "Pagina di documentazione del servizio WMS 'BENI_CULTURALI_E_DEL_PAESAGGIO' — dovrebbe elencare il layer name reale e, spesso in queste pagine GEOscopio, anche l'URL del WFS gemello per le query attributarie (i WMS disegnano, i WFS interrogano).",
    url: 'https://www502.regione.toscana.it/geoscopio/servizi/wms/BENI_CULTURALI_E_DEL_PAESAGGIO.htm',
  },
  {
    name: 'geoserver-wfs-getcapabilities-guess-1-non-verificato',
    note: "PURO TENTATIVO, nessuna fonte trovata lo conferma: pattern GeoServer standard su www502.regione.toscana.it/geoserver — stesso genere di tentativo a costo zero già fatto per la Lombardia (lì aveva dato 404, il servizio vero era un ArcGIS REST). Non usare il risultato per scrivere un importer senza prima averlo confermato con dati reali.",
    url: 'https://www502.regione.toscana.it/geoserver/wfs?service=WFS&version=2.0.0&request=GetCapabilities',
  },
  {
    name: 'geoserver-wfs-getcapabilities-guess-2-non-verificato',
    note: "Secondo tentativo, path annidato sotto /geoscopio/ invece che alla radice — pattern osservato su altri portali GEOscopio regionali che ospitano il proprio GeoServer sotto un sottopercorso invece che alla radice del dominio.",
    url: 'https://www502.regione.toscana.it/geoscopio/geoserver/wfs?service=WFS&version=2.0.0&request=GetCapabilities',
  },
]

export interface ProbeResult {
  name: string
  note: string
  url: string
  httpStatus: number | 'TIMEOUT' | 'ERROR'
  durationMs: number
  contentType: string | null
  // Troncato: le risposte XML (WFS GetCapabilities) o HTML possono essere enormi — qui serve solo
  // riconoscere la forma della risposta (errore leggibile, JSON, XML, HTML) per decidere il
  // prossimo passo, non un dump completo.
  bodySnippet: string | null
  error: string | null
}

async function runProbe(probe: Probe, timeoutMs: number): Promise<ProbeResult> {
  const start = Date.now()
  try {
    const res = await fetch(probe.url, {
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json, application/xml, text/xml, text/html, */*' },
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

  // Sequenziale: stessi endpoint pubblici condivisi, stesso motivo di scripts/places/mic/probe.ts
  // e scripts/places/lombardia/probe.ts.
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

const isDirectRun = process.argv[1]?.endsWith('probe.ts') && process.argv[1]?.includes('toscana')
if (isDirectRun) {
  main().catch(err => { console.error(err); process.exit(1) })
}
