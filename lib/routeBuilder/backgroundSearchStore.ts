'use client'
// Stato della ricerca/generazione route builder ("Esistenti" e "Su misura") condiviso con TUTTA
// l'app, non solo col wizard che l'ha avviata — un modulo singleton (non uno stato React), perché
// deve restare leggibile anche se components/upload/RouteBuilder.tsx si smonta (l'utente naviga su
// un'altra pagina di DTrek). La pipeline stessa (fetch chain in RouteBuilder.tsx) NON dipende da
// questo store per proseguire — una Promise avviata da un click handler continua a girare
// nell'event loop del browser indipendentemente dal componente React che l'ha originata — questo
// store serve solo a dare a QUALSIASI pagina un modo di sapere "c'è una ricerca in corso" e "è
// pronta", tramite GlobalSearchStatusPill.tsx (montato una volta nel layout root).
//
// Limite onesto: questo copre la navigazione DENTRO l'app (SPA, nessun full reload). Se l'utente
// chiude la scheda/l'app durante la generazione, la pipeline si interrompe come oggi — nessun vero
// job server la farebbe proseguire. Il risultato resta comunque recuperabile da "Le mie ricerche"
// per qualunque ricerca che sia arrivata a salvarsi prima dell'interruzione.
export type BgSearchStatus = 'idle' | 'running' | 'done' | 'error'

export interface BgSearchState {
  status: BgSearchStatus
  mode: 'esistenti' | 'su_misura' | null
  stage: string
  startedAt: number | null
  resultCount: number | null
  searchHistoryId: string | null
  errorMessage: string | null
  // Il wizard che ha avviato la ricerca mostra già il proprio indicatore (SearchWaitingCard) mentre
  // resta montato — la pillola globale si silenzia in quella finestra per non duplicare la stessa
  // informazione due volte sullo schermo, e ricompare da sola se l'utente naviga via prima che la
  // ricerca finisca (vedi RouteBuilder.tsx's useEffect su suppressPill).
  suppressed: boolean
}

const IDLE_STATE: BgSearchState = {
  status: 'idle', mode: null, stage: '', startedAt: null, resultCount: null,
  searchHistoryId: null, errorMessage: null, suppressed: false,
}

let state: BgSearchState = IDLE_STATE
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach(l => l())
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSnapshot(): BgSearchState {
  return state
}

export function start(mode: 'esistenti' | 'su_misura'): void {
  state = { ...IDLE_STATE, status: 'running', mode, startedAt: Date.now() }
  emit()
}

export function setStage(stage: string): void {
  if (state.status !== 'running') return
  state = { ...state, stage }
  emit()
}

export function setSuppressed(suppressed: boolean): void {
  state = { ...state, suppressed }
  emit()
}

export function finish(resultCount: number, searchHistoryId: string | null): void {
  state = { ...state, status: 'done', resultCount, searchHistoryId }
  emit()
}

// "Ricerca finita ma senza nulla da mostrare" (0 risultati) — a differenza di finish, non lascia
// una pillola "pronto" (non c'è nulla da aprire): torna semplicemente a idle, in silenzio.
export function finishEmpty(): void {
  state = IDLE_STATE
  emit()
}

export function fail(message: string): void {
  state = { ...state, status: 'error', errorMessage: message }
  emit()
}

export function dismiss(): void {
  state = IDLE_STATE
  emit()
}
