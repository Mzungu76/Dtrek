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
 * su rebaseFixesToNowCompressed(). Gli altri due test sotto ("deviazione e rientro", "GPS perso
 * e ripristinato") iniettano scenari sintetici su questi stessi fix reali per esercitare anche i
 * casi off_route/rientro e gps_lost/gpsRecovered (scenari §3.2 e §3.3 del piano) — vedi i loro
 * commenti per i dettagli di ciascuno.
 */
import { describe, it, expect } from 'vitest'
import { NavigationEngine } from '@/lib/navigation/navigationEngine'
import { SimulationLocationProvider } from '@/lib/navigation/simulation/simulationLocationProvider'
import { injectDeviation, injectGpsLoss } from '@/lib/navigation/simulation/scenarioBuilder'
import fixture from './fixtures/faggeta-cimino.json'
import { rebaseFixesToNowCompressed, type RealTrackFixture } from './helpers/realTrackFixture'
import type { GeoFix } from '../types'

const track = fixture as RealTrackFixture

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
})
