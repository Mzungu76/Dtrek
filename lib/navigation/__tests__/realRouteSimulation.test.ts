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
 * su rebaseFixesToNowCompressed(). Il secondo test sotto ("deviazione e rientro") inietta una
 * deviazione sintetica su questi stessi fix reali per esercitare anche il caso off_route/rientro
 * (scenario §3.2 del piano) — vedi il suo commento per i dettagli di quella parte.
 */
import { describe, it, expect } from 'vitest'
import { NavigationEngine } from '@/lib/navigation/navigationEngine'
import { SimulationLocationProvider } from '@/lib/navigation/simulation/simulationLocationProvider'
import { injectDeviation } from '@/lib/navigation/simulation/scenarioBuilder'
import fixture from './fixtures/faggeta-cimino.json'
import { rebaseFixesToNowCompressed, type RealTrackFixture } from './helpers/realTrackFixture'
import type { GeoFix } from '../types'

const track = fixture as RealTrackFixture

/** Rigioca `fixes` fino in fondo dentro un NavigationEngine vero, restituendo la sequenza di stati attraversati. */
function runToCompletion(fixes: GeoFix[]): Promise<string[]> {
  return new Promise((resolve) => {
    const states: string[] = []
    const engine = new NavigationEngine({
      routePolyline: track.routePolyline,
      pois: [],
      locationProviderFactory: (onFix, onError) =>
        new SimulationLocationProvider({ fixes, speed: 1 }, onFix, onError),
    })
    engine.on('stateChanged', (s) => states.push(s.to))

    let delivered = 0
    engine.on('positionUpdated', () => {
      delivered++
      if (delivered >= fixes.length) {
        engine.stop()
        resolve(states)
      }
    })
    engine.start()
  })
}

describe('percorso reale end-to-end (Monte Cimino, fix GPS realmente registrati)', () => {
  it('non entra mai in off_route sui primi minuti di fix GPS realmente registrati sul campo', async () => {
    const speedFactor = 15
    const realFixes = rebaseFixesToNowCompressed(track.trackPoints.slice(0, 13), speedFactor)

    const states = await runToCompletion(realFixes)

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

    const states = await runToCompletion(deviatedFixes)

    expect(states).toContain('off_route')

    const lastOffRouteIdx = states.lastIndexOf('off_route')
    const recoveredAfter = states.slice(lastOffRouteIdx + 1).indexOf('navigating')
    expect(recoveredAfter).toBeGreaterThanOrEqual(0)
  }, 90_000)
})
