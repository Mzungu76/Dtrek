/**
 * "Simulazione utente reale" (docs/piano-test.md §3): rigioca fix GPS realmente registrati su
 * un'escursione vera (scaricati dal database Supabase, account owner, tabella `activities`)
 * dentro NavigationEngine vero — non solo i singoli motori (offRouteEngine, escapeEngine, ...)
 * già testati isolatamente altrove in questa cartella. Fixture in ./fixtures/faggeta-cimino.json,
 * generata una tantum da una query diretta sul database (non rigenerata a ogni run di test).
 *
 * Risponde anche a una domanda lasciata esplicitamente aperta nel piano: se NavigationEngine
 * giri "headless" sotto vitest/Node senza mock aggiuntivi oltre al location provider iniettabile.
 * Confermato qui: sì — nessun mock di Capacitor/browser è servito.
 *
 * **Perché questo test copre solo i primi minuti della traccia, non l'intera escursione da
 * 4h07m**: PositionEngine.checkFixQuality() rifiuta come "stale fix" qualunque fix con `ts` più
 * vecchio di 30s rispetto al vero Date.now() al momento dell'ingest (anti-replay, vedi
 * lib/navigation/positionEngine.ts) — quindi riprodurre l'intera traccia richiede che il tempo
 * reale trascorso durante il test resti sempre entro quella finestra di 30s rispetto ai
 * timestamp dei fix. Comprimerli in modo aggressivo per accelerare il playback è stato provato
 * e scartato per due motivi verificati in questa sessione, non ipotizzati:
 * 1. Un dt troppo piccolo tra fix consecutivi (sotto la soglia di 0.05s del filtro di Kalman,
 *    lib/navigation/positionEngine.ts's predictAxis) inietta rumore di processo sproporzionato
 *    a ogni passo; su un percorso ad anello (le due direttrici si passano vicine in più punti)
 *    questo ha fatto perdere l'aggancio al tratto giusto del percorso, con la distanza percorsa
 *    che tornava indietro invece di crescere — osservato concretamente, non solo temuto.
 * 2. Anche restando sopra quella soglia, la velocità implicita fix-a-fix non può eccedere il
 *    tetto di plausibilità del Position Engine (~14 m/s) — che fissa un limite fisico
 *    invalicabile al tempo minimo di riproduzione: un percorso reale di 14km non può essere
 *    "riprodotto" in meno di ~17 minuti reali senza travestirsi da spoofing GPS, che è
 *    esattamente ciò che quel controllo esiste per impedire. Per questo un test end-to-end
 *    sull'INTERA escursione appartiene a una fascia di test lenta/manuale, non alla suite
 *    veloce che gira a ogni push — vedi docs/piano-test.md §3 per i dettagli.
 *
 * Il fattore di compressione usato qui (15x) resta sopra entrambe le soglie per i segmenti
 * "veloci" osservati nelle finestre usate sotto — non è stato scelto a caso, vedi il commento
 * su rebaseFixesToNowCompressed(). I test seguenti ("deviazione e rientro", "GPS perso e
 * ripristinato", "vie di fuga", "batteria in calo") iniettano scenari sintetici su questi stessi
 * dati reali per esercitare anche i casi off_route/rientro, gps_lost/gpsRecovered,
 * computeEscapeOptions() e LocationModeDecider (scenari §3.2-§3.5 del piano) — vedi i loro
 * commenti per i dettagli di ciascuno. L'ultimo, non passando da NavigationEngine, è anche
 * l'unico che copre l'intera escursione reale invece di una finestra breve.
 */
import { describe, it, expect } from 'vitest'
import { NavigationEngine } from '@/lib/navigation/navigationEngine'
import { SimulationLocationProvider } from '@/lib/navigation/simulation/simulationLocationProvider'
import { injectDeviation, injectGpsLoss } from '@/lib/navigation/simulation/scenarioBuilder'
import { RouteTracker } from '../routeDeviation'
import { computeEscapeOptions } from '../escapeEngine'
import { LocationModeDecider } from '../locationModeDecider'
import type { WalkNetwork } from '@/lib/routeBuilder/osmGraph'
import fixture from './fixtures/faggeta-cimino.json'
import { rebaseFixesToNowCompressed, type RealTrackFixture } from './helpers/realTrackFixture'
import type { GeoFix } from '../types'

const track = fixture as RealTrackFixture

const EARTH_RADIUS_M = 6371000
/** Stesso spostamento punto-per-bearing/distanza usato da scenarioBuilder.ts (privato lì), qui per costruire la posizione deviata e i nodi sintetici del grafo. */
function offsetLatLon(lat: number, lon: number, headingDeg: number, distanceM: number): [number, number] {
  const rad = (headingDeg * Math.PI) / 180
  const dLat = (distanceM * Math.cos(rad)) / EARTH_RADIUS_M
  const dLon = (distanceM * Math.sin(rad)) / (EARTH_RADIUS_M * Math.cos((lat * Math.PI) / 180))
  return [lat + (dLat * 180) / Math.PI, lon + (dLon * 180) / Math.PI]
}

interface RunResult {
  states: string[]
  events: string[]
  traveledHistory: number[]
}

/** Rigioca `fixes` fino in fondo dentro un NavigationEngine vero, registrando stati, eventi ("gpsLost"/"gpsRecovered") e la distanza percorsa a ogni fix. */
function runToCompletion(fixes: GeoFix[]): Promise<RunResult> {
  return new Promise((resolve) => {
    const states: string[] = []
    const events: string[] = []
    const traveledHistory: number[] = []
    const engine = new NavigationEngine({
      routePolyline: track.routePolyline,
      pois: [],
      locationProviderFactory: (onFix, onError) =>
        new SimulationLocationProvider({ fixes, speed: 1 }, onFix, onError),
    })
    engine.on('stateChanged', (s) => states.push(s.to))
    engine.on('gpsLost', () => events.push('gpsLost'))
    engine.on('gpsRecovered', () => events.push('gpsRecovered'))

    let delivered = 0
    engine.on('positionUpdated', (p) => {
      delivered++
      traveledHistory.push(p.traveledDistanceM)
      if (delivered >= fixes.length) {
        engine.stop()
        resolve({ states, events, traveledHistory })
      }
    })
    engine.start()
  })
}

describe('percorso reale end-to-end (Monte Cimino, fix GPS realmente registrati)', () => {
  it('non entra mai in off_route sui primi minuti di fix GPS realmente registrati sul campo', async () => {
    const speedFactor = 15
    const realFixes = rebaseFixesToNowCompressed(track.trackPoints.slice(0, 13), speedFactor)

    const { states } = await runToCompletion(realFixes)

    expect(states).not.toContain('off_route')
    expect(states).not.toContain('wrong_direction')
  }, 60_000)

  it('deviazione e rientro: transita da navigating a off_route e torna indietro (scenario §3.2 del piano)', async () => {
    // injectDeviation() sposta di 360m, in 12 passi crescenti, un tratto di fix REALMENTE
    // REGISTRATI (non sintetici) — la crescita di 30m/passo domina l'andamento naturale (non
    // monotono: il sentiero vero curva) della distanza dal percorso, altrimenti l'Off-Route
    // Engine non vede mai un trend sostenuto abbastanza a lungo da dichiarare off_route (vedi
    // il commento in cima al file su isSpike/Kalman per l'altro limite — qui 30m/passo a
    // dt≈2.4s resta ben sotto la soglia di velocità plausibile). I punti successivi alla
    // finestra deviata restano quelli originali non modificati, quindi il "rientro" è naturale:
    // l'escursionista torna semplicemente sulla propria traccia reale.
    const speedFactor = 15
    const base = rebaseFixesToNowCompressed(track.trackPoints.slice(0, 28), speedFactor)
    const fixIntervalS = (base[1].ts - base[0].ts) / 1000
    const deviatedFixes = injectDeviation(base, 5, 360, 90, 12 * fixIntervalS, fixIntervalS)

    const { states } = await runToCompletion(deviatedFixes)

    expect(states).toContain('off_route')

    const lastOffRouteIdx = states.lastIndexOf('off_route')
    const recoveredAfter = states.slice(lastOffRouteIdx + 1).indexOf('navigating')
    expect(recoveredAfter).toBeGreaterThanOrEqual(0)
  }, 90_000)

  it('GPS perso e ripristinato: emette gpsLost/gpsRecovered senza corrompere la distanza percorsa (scenario §3.3 del piano)', async () => {
    // GPS_LOST_MS (15s, lib/navigation/navigationEngine.ts) è un timer sul vero orologio di
    // sistema — armato/riarmato a ogni fix ricevuto — non sui timestamp (compressi) dei fix, a
    // differenza dell'Off-Route Engine. Perché scatti davvero serve quindi un vuoto REALE di
    // oltre 15s fra due consegne: qui si rimuovono 7 fix reali consecutivi (indici 4-10), che a
    // un fattore di compressione 15x lasciano un vuoto di consegna di ~19.5s — sopra soglia con
    // margine, senza dover allungare la finestra complessiva del test.
    const speedFactor = 15
    const base = rebaseFixesToNowCompressed(track.trackPoints.slice(0, 16), speedFactor)
    const fixIntervalS = (base[1].ts - base[0].ts) / 1000
    const fixesWithGap = injectGpsLoss(base, 4, 7 * fixIntervalS, fixIntervalS)

    const { events, traveledHistory } = await runToCompletion(fixesWithGap)

    expect(events.indexOf('gpsLost')).toBeGreaterThanOrEqual(0)
    expect(events.indexOf('gpsRecovered')).toBeGreaterThan(events.indexOf('gpsLost'))

    // "Senza corrompere la distanza già accumulata": la distanza continua a crescere in modo
    // plausibile una volta ripristinato il segnale, non si azzera né esplode per il vuoto.
    const beforeGap = traveledHistory[3] // ultimo fix prima del vuoto (indici 0-3)
    const afterRecovery = traveledHistory[traveledHistory.length - 1]
    expect(afterRecovery).toBeGreaterThanOrEqual(beforeGap)
    expect(afterRecovery - beforeGap).toBeLessThan(500) // niente salti implausibili sul vuoto
  }, 60_000)

  it('vie di fuga nel punto di massima deviazione: "torna sul percorso" è sempre proposta (scenario §3.4 del piano)', () => {
    // Lo scenario originale (docs/piano-test.md §3) prevedeva "il trail graph realmente
    // scaricato per quell'area" via fetchWalkNetwork() (lib/routeBuilder/osmGraph.ts), che
    // interroga Overpass API dal vivo. Verificato in questa sessione: il proxy di rete
    // dell'ambiente rifiuta con 403 esplicito tutti gli endpoint Overpass/Nominatim configurati
    // — non un timeout, un rifiuto di policy — e il grafo sentieri, quando l'app lo scarica
    // davvero, resta solo in IndexedDB sul dispositivo (lib/navigation/trailGraphStore.ts), mai
    // su Supabase: non esiste da nessuna parte un grafo già scaricato per quest'area recuperabile
    // da qui. Scelta esplicita (chiesta all'utente): costruire un WalkNetwork sintetico ancorato
    // alla geometria reale del percorso — nodi presi dalla route_polyline reale come dorsale, più
    // due diramazioni sintetiche (un sentiero e una strada) e un rifugio sintetico vicino al
    // punto deviato — invece di un vero dump OSM. Esercita comunque la logica reale di
    // computeEscapeOptions() (Dijkstra sul grafo, classificazione per tipo/qualità highway,
    // "back_to_route" sempre presente), solo la rete sentieri sottostante non è OSM autentico.
    const routePolyline = track.routePolyline

    // "Punto di massima deviazione" coerente con lo scenario §3.2: stesso punto reale, stesso
    // offset (360m, heading 90°) applicato direttamente (qui non serve la rampa, basta la
    // posizione finale).
    const basePoint = track.trackPoints[10]
    const [currentLat, currentLon] = offsetLatLon(basePoint.lat, basePoint.lon, 90, 360)

    const network: WalkNetwork = { nodes: new Map() }
    let nextId = 1
    const anchorId = nextId++
    network.nodes.set(anchorId, { lat: currentLat, lon: currentLon, edges: [] })

    const addBranch = (headingDeg: number, distanceM: number, highway: string): number => {
      const [lat, lon] = offsetLatLon(currentLat, currentLon, headingDeg, distanceM)
      const id = nextId++
      network.nodes.set(id, { lat, lon, edges: [] })
      const distM = distanceM // rettilineo dall'anchor, coerente con l'offset appena calcolato
      network.nodes.get(anchorId)!.edges.push({ to: id, distM, wayId: id, highway })
      network.nodes.get(id)!.edges.push({ to: anchorId, distM, wayId: id, highway })
      return id
    }
    const trailNodeId = addBranch(200, 150, 'track')
    const roadNodeId = addBranch(250, 400, 'unclassified')

    const [hutLat, hutLon] = offsetLatLon(currentLat, currentLon, 0, 800)

    const progress = new RouteTracker(routePolyline).update(currentLat, currentLon)
    const options = computeEscapeOptions({
      network,
      routePolyline,
      currentLat,
      currentLon,
      progress,
      pois: [{ id: 'rifugio-test', lat: hutLat, lon: hutLon, name: 'Rifugio di prova', type: 'hut' }],
    })

    const backToRoute = options.find((o) => o.kind === 'back_to_route')
    expect(backToRoute).toBeDefined()
    expect(backToRoute?.reason).toBeTruthy()

    // Bonus rispetto al minimo richiesto dal piano: con la rete sintetica sopra, anche le altre
    // tre tipologie sono raggiungibili e vengono trovate — non solo "non crasha", ma trova
    // davvero i nodi giusti.
    const trail = options.find((o) => o.kind === 'alternative_trail')
    expect(trail?.targetLat).toBeCloseTo(network.nodes.get(trailNodeId)!.lat, 6)
    const road = options.find((o) => o.kind === 'road')
    expect(road?.targetLat).toBeCloseTo(network.nodes.get(roadNodeId)!.lat, 6)
    expect(options.find((o) => o.kind === 'safe_poi')).toBeDefined()

    for (const option of options) expect(option.reason.length).toBeGreaterThan(0)
  })

  it('batteria in calo durante l\'intera uscita: passa a battery_save una sola volta, senza sfarfallare (scenario §3.5 del piano)', () => {
    // A differenza degli altri test in questo file, LocationModeDecider non passa da
    // NavigationEngine/PositionEngine — è una funzione pura più un piccolo wrapper stateful che
    // prende `nowMs` come parametro esplicito, non `Date.now()`. Non serve quindi né riprodurre
    // in tempo reale né comprimere nulla: si può alimentare con l'INTERA escursione reale
    // (tutti i 400 fix, 4h07m) usando i suoi timestamp originali così come sono — l'unico test in
    // questo file che copre davvero il percorso per intero, non solo una finestra breve (vedi il
    // commento in cima al file sul perché gli altri non possono).
    const points = track.trackPoints
    const t0 = new Date(points[0].time).getTime()
    const tLast = new Date(points[points.length - 1].time).getTime()
    const spanMs = tLast - t0

    const decider = new LocationModeDecider('trekking')
    const changes: { mode: string; atMs: number; index: number }[] = []
    let firstBelowThresholdAtMs: number | null = null

    for (let i = 0; i < points.length; i++) {
      const atMs = new Date(points[i].time).getTime()
      const fraction = spanMs > 0 ? (atMs - t0) / spanMs : 0
      const batteryLevel = 0.95 - fraction * 0.90 // scende linearmente da 95% a 5% sull'intera uscita

      if (batteryLevel < 0.30 && firstBelowThresholdAtMs == null) firstBelowThresholdAtMs = atMs

      const mode = decider.update({
        state: 'navigating',
        instantSpeedMs: points[i].speedMs ?? 0,
        accuracyM: 8,
        distanceToNextInstructionM: null,
        batteryLevel,
        batteryCharging: false,
      }, atMs)

      if (mode) changes.push({ mode, atMs, index: i })
    }

    // Esattamente una transizione in tutta l'uscita: se il decider sfarfallasse (es. rimbalzasse
    // dentro e fuori da battery_save per rumore vicino alla soglia) qui ne vedremmo più di una.
    expect(changes.length).toBe(1)
    expect(changes[0].mode).toBe('battery_save')
    expect(firstBelowThresholdAtMs).not.toBeNull()

    // La transizione arriva dopo l'isteresi dichiarata (MODE_CHANGE_DWELL_MS, 8s) dal primo
    // campione sotto soglia, non prima — e comunque entro un solo intervallo fra due fix reali
    // (~37s), visto che la cadenza reale è già molto più larga della finestra di isteresi.
    const dwellMs = changes[0].atMs - firstBelowThresholdAtMs!
    expect(dwellMs).toBeGreaterThanOrEqual(8000)
    expect(dwellMs).toBeLessThan(80_000)
  })
})
