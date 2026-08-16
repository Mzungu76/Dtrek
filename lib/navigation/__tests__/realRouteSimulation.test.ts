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
 * Il fattore di compressione usato qui (15x, su una finestra di 13 fix reali) resta sopra
 * entrambe le soglie per il segmento più "veloce" osservato in questa finestra — non è stato
 * scelto a caso, vedi il commento su rebaseFixesToNowCompressed().
 */
import { describe, it, expect } from 'vitest'
import { NavigationEngine } from '@/lib/navigation/navigationEngine'
import { SimulationLocationProvider } from '@/lib/navigation/simulation/simulationLocationProvider'
import fixture from './fixtures/faggeta-cimino.json'
import { rebaseFixesToNowCompressed, type RealTrackFixture } from './helpers/realTrackFixture'

const track = fixture as RealTrackFixture

describe('percorso reale end-to-end (Monte Cimino, fix GPS realmente registrati)', () => {
  it('non entra mai in off_route sui primi minuti di fix GPS realmente registrati sul campo', async () => {
    const speedFactor = 15
    const realFixes = rebaseFixesToNowCompressed(track.trackPoints.slice(0, 13), speedFactor)

    const states: string[] = []
    const done = new Promise<void>((resolve) => {
      const engine = new NavigationEngine({
        routePolyline: track.routePolyline,
        pois: [],
        locationProviderFactory: (onFix, onError) =>
          new SimulationLocationProvider({ fixes: realFixes, speed: 1 }, onFix, onError),
      })
      engine.on('stateChanged', (s) => states.push(s.to))

      let delivered = 0
      engine.on('positionUpdated', () => {
        delivered++
        if (delivered >= realFixes.length) {
          engine.stop()
          resolve()
        }
      })
      engine.start()
    })

    await done

    expect(states).not.toContain('off_route')
    expect(states).not.toContain('wrong_direction')
  }, 60_000)
})
