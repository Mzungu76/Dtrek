// Verifica diagnostica (una tantum, non fa parte della pipeline di import) per la sessione
// "arricchimento contenuto Guide dei Siti/Borghi" — vedi discussione in
// docs/piano-mete-multitipologia.md §51/§52. Nessuna scrittura su Supabase: solo fetch verso
// fonti pubbliche (Wikidata, Wikimedia Commons, OpenStreetMap Nominatim/Overpass) su un campione
// di luoghi reali, per capire se i 5 arricchimenti proposti sono coperti da dati reali o restano
// teorici. Eseguito via .github/workflows/verify-content-sources.yml (questo sandbox blocca quegli
// host in uscita, stesso problema già visto con MiC/ArCo — vedi MIC_DATA_SOURCES.md).
//
// Uso: npx tsx scripts/verify/content-sources-check.ts
//
// Nessuna dipendenza esterna: solo fetch globale (Node 22+). Un User-Agent esplicito è richiesto
// dalla policy di OSM/Wikimedia per traffico automatico.

const UA = 'Dtrek-ContentSourcesCheck/1.0 (verifica diagnostica, contatto: mzulpt@gmail.com)'

async function getJson(url: string, extraHeaders: Record<string, string> = {}): Promise<any> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...extraHeaders } })
  if (!res.ok) throw new Error(`HTTP ${res.status} su ${url}`)
  return res.json()
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Punto 1: Borghi — percorso a piedi + altimetria + foto per tappa ──────────────────────────

async function checkBorgo(nome: string, categoriaCommons: string) {
  const out: Record<string, unknown> = { luogo: nome }

  // Coordinate reali via Nominatim (OSM)
  try {
    const geo = await getJson(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(nome + ', Italia')}&format=json&limit=1`,
    )
    if (!geo[0]) throw new Error('nessun risultato Nominatim')
    const { lat, lon } = geo[0]
    out.coordinate = `${lat},${lon}`

    await sleep(1100) // Nominatim/Overpass: 1 richiesta al secondo

    // Percorribilità a piedi: vie pedonali reali in OSM entro 700m dal centro
    const overpassQuery = `[out:json][timeout:25];(way["highway"~"^(footway|path|pedestrian|steps|living_street)$"](around:700,${lat},${lon}););out count;`
    const ov = await getJson(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`)
    out.vie_pedonali_osm_700m = ov?.elements?.[0]?.tags?.total ?? 'n/d'
  } catch (e) {
    out.osm_errore = String(e)
  }

  await sleep(1100)

  // Foto reali per il borgo (categoria Commons)
  try {
    const cm = await getJson(
      `https://commons.wikimedia.org/w/api.php?action=query&format=json&list=categorymembers&cmtitle=${encodeURIComponent('Category:' + categoriaCommons)}&cmtype=file&cmlimit=50`,
    )
    out.foto_commons = cm?.query?.categorymembers?.length ?? 0
  } catch (e) {
    out.commons_errore = String(e)
  }

  return out
}

// ── Punto 2: Musei — opere reali collegate (ArCo via Wikidata come proxy interrogabile qui) ────

async function checkMuseo(nomeRicerca: string) {
  const out: Record<string, unknown> = { luogo: nomeRicerca }
  try {
    const search = await getJson(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=it&type=item&search=${encodeURIComponent(nomeRicerca)}`,
    )
    const qid = search?.search?.[0]?.id
    if (!qid) throw new Error('nessun QID trovato')
    out.wikidata_qid = qid

    const q = `SELECT (COUNT(DISTINCT ?opera) AS ?count) (COUNT(DISTINCT ?operaConVoce) AS ?conVoce) WHERE {
      ?opera wdt:P195 wd:${qid} .
      OPTIONAL { ?operaConVoce schema:about ?opera ; schema:isPartOf <https://it.wikipedia.org/> . }
    }`
    const sparql = await getJson(`https://query.wikidata.org/sparql?query=${encodeURIComponent(q)}&format=json`)
    const b = sparql?.results?.bindings?.[0]
    out.opere_collegate_P195 = b?.count?.value ?? 'n/d'
    out.opere_con_voce_wikipedia = b?.conVoce?.value ?? 'n/d'
  } catch (e) {
    out.errore = String(e)
  }
  return out
}

// ── Punto 3: Timeline + "ieri e oggi" ───────────────────────────────────────────────────────────

async function checkTimeline(nomeRicerca: string, terminebg: string) {
  const out: Record<string, unknown> = { luogo: nomeRicerca }
  try {
    const search = await getJson(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=it&type=item&search=${encodeURIComponent(nomeRicerca)}`,
    )
    const qid = search?.search?.[0]?.id
    if (!qid) throw new Error('nessun QID trovato')
    out.wikidata_qid = qid

    const q = `SELECT ?inception ?inceptionLabel WHERE {
      OPTIONAL { wd:${qid} wdt:P571 ?inception . }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "it". }
    } LIMIT 1`
    const sparql = await getJson(`https://query.wikidata.org/sparql?query=${encodeURIComponent(q)}&format=json`)
    out.data_fondazione_P571 = sparql?.results?.bindings?.[0]?.inception?.value ?? 'assente'
  } catch (e) {
    out.wikidata_errore = String(e)
  }

  await sleep(1100)

  try {
    const s = await getJson(
      `https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srnamespace=6&srsearch=${encodeURIComponent(terminebg)}&srlimit=20`,
    )
    out.foto_storiche_commons_stimate = s?.query?.searchinfo?.totalhits ?? 0
  } catch (e) {
    out.commons_errore = String(e)
  }
  return out
}

// ── Punto 4: Siti archeologici/all'aperto come mini-sentieri ───────────────────────────────────

async function checkSitoAperto(nome: string) {
  const out: Record<string, unknown> = { luogo: nome }
  try {
    const geo = await getJson(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(nome + ', Italia')}&format=json&limit=1`,
    )
    if (!geo[0]) throw new Error('nessun risultato Nominatim')
    const { lat, lon } = geo[0]
    out.coordinate = `${lat},${lon}`

    await sleep(1100)

    const q = `[out:json][timeout:25];(node["historic"](around:600,${lat},${lon});way["historic"](around:600,${lat},${lon});node["tourism"="attraction"](around:600,${lat},${lon}););out count;`
    const ov = await getJson(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`)
    out.punti_interesse_osm_600m = ov?.elements?.[0]?.tags?.total ?? 'n/d'
  } catch (e) {
    out.errore = String(e)
  }
  return out
}

// ── Main ────────────────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== 1. BORGHI — percorso OSM + foto per tappa ===')
  for (const [nome, cat] of [
    ['Civita di Bagnoregio', 'Civita di Bagnoregio'],
    ['Castelmezzano', 'Castelmezzano'],
    ['Pitigliano', 'Pitigliano'],
  ]) {
    console.log(JSON.stringify(await checkBorgo(nome, cat)))
    await sleep(1100)
  }

  console.log('\n=== 2. MUSEI — opere collegate (proxy ArCo via Wikidata P195) ===')
  for (const nome of ['Museo Egizio Torino', 'Galleria degli Uffizi', 'Museo Archeologico Nazionale di Napoli']) {
    console.log(JSON.stringify(await checkMuseo(nome)))
    await sleep(1100)
  }

  console.log('\n=== 3. TIMELINE + IERI/OGGI ===')
  for (const [nome, termine] of [
    ['Castello Estense', 'Castello Estense Ferrara'],
    ['Pitigliano', 'Pitigliano storico'],
  ]) {
    console.log(JSON.stringify(await checkTimeline(nome, termine)))
    await sleep(1100)
  }

  console.log('\n=== 4. SITI ARCHEOLOGICI/APERTI — densità POI OSM per mini-percorso ===')
  for (const nome of ['Parco Archeologico di Paestum', 'Parco Archeologico di Pompei', 'Castello di Fenis']) {
    console.log(JSON.stringify(await checkSitoAperto(nome)))
    await sleep(1100)
  }

  console.log('\n=== 5. AUDIOGUIDA — nessuna verifica di rete necessaria ===')
  console.log(
    JSON.stringify({
      nota:
        'Legge il testo narrativo già generato dall\'AI (lib/guideProfiles.ts) con sintesi vocale; nessuna nuova fonte dati, nessun dato da verificare qui.',
    }),
  )
}

main().catch(e => {
  console.error('ERRORE FATALE', e)
  process.exit(1)
})
