// Canale di passaggio tra "la pagina che se ne va" e "la pagina che arriva" nel Dtrek Page Turning
// Engine. Le due sono due istanze React separate — ogni pagina del libro (Guida/Reportage) vive
// nel proprio `page.tsx` di Next.js, quindi cambiare sezione smonta la vecchia e ne monta una
// nuova, non è un carosello lato client — ma essendo una navigazione client-side (`router.push`,
// mai un reload) restano nello stesso runtime JS: un semplice modulo con una variabile "in
// transito" sopravvive perfettamente allo smontaggio/rimontaggio di React che lo circonda, senza
// bisogno di un Context/Provider condiviso a livello di root layout.
//
// Chi lascia la pagina (DtrekPageTurn.tsx, sul finire della propria animazione di uscita) scrive
// qui *da dove* sta arrivando la pagina successiva ("mi sono girata fino a X, entra da lì
// all'incontrario"); chi monta la pagina successiva lo legge una sola volta, al primo render utile,
// e lo consuma (lo rimuove) — una lettura successiva (doppio mount, StrictMode, o semplicemente
// un'altra pagina che monta più tardi senza essere lei la destinazione di quel volta pagina) non
// deve più trovarlo. Un `timestamp` con una soglia di freschezza copre il caso limite in cui la
// scrittura resti "orfana" (l'utente ha premuto Indietro nel browser proprio mentre la nuova pagina
// stava per montare, ecc.) — non impedisce nulla di funzionalmente rilevante, evita solo che un
// valore vecchio di secondi venga applicato a un mount che non c'entra.
import type { HingeSide } from './pageTurnMath'

export interface PageTurnHandoff {
  /** Da che valore di `flipProgress` deve partire l'animazione di ingresso (1 → 0, "atterraggio"). */
  enterFromProgress: number
  /** Lato del cardine da usare per l'ingresso — lo stesso della pagina che se n'è andata: il verso
   *  di rotazione della pagina in arrivo è quello che la fa "incontrare a metà" con l'uscita. */
  hinge: HingeSide
  timestamp: number
}

const FRESHNESS_MS = 900

let pending: PageTurnHandoff | null = null

export function writePageTurnHandoff(handoff: Omit<PageTurnHandoff, 'timestamp'>): void {
  pending = { ...handoff, timestamp: Date.now() }
}

/** Legge e consuma (rimuove) il passaggio in sospeso — `null` se non c'è nulla, o se c'è ma è
 *  troppo vecchio per essere ancora pertinente. */
export function consumePageTurnHandoff(): PageTurnHandoff | null {
  const value = pending
  pending = null
  if (!value) return null
  if (Date.now() - value.timestamp > FRESHNESS_MS) return null
  return value
}
