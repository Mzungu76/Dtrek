// Selezione della "prossima uscita" per la card in cima a /diari — docs/diari-restyling-piano.md,
// Fase 1. Lavora sulle righe già restituite da GET /api/percorsi (le Mete di tutti i Diari, con
// planned_date incluso — vedi la select aggiornata in app/api/percorsi/route.ts): niente nuova
// query, la pagina fa già un fetch di quell'endpoint per GlobalRouteSearch.
//
// Priorità, dalla più alla meno specifica:
//  1. La Meta senza Reportage con la planned_date futura più vicina (quella scelta esplicitamente
//     dall'utente per un giorno preciso).
//  2. In assenza di date future, la Meta senza Reportage preferita (favorite) più recente.
//  3. In assenza anche di quella, la Meta senza Reportage creata più di recente — un punto di
//     partenza qualunque, meglio di una card vuota.
// Una Meta con almeno un Reportage non è mai candidata: è già stata camminata, non è "da fare".

export interface CandidataProssimaUscita {
  id: string
  title: string
  distanceMeters: number
  elevationGain: number
  estimatedTimeSeconds: number
  trailScore: number | null
  favorite: boolean
  /** 'YYYY-MM-DD' (colonna DATE), null se non programmata. */
  plannedDate: string | null
  createdAt: string
  reportageCount: number
}

// Generica su T (invece di fissa su CandidataProssimaUscita) così il chiamante può passare
// direttamente le AllPercorsiRow di GET /api/percorsi — che soddisfano questa forma con qualche
// campo in più (diaryTitle, routePolyline, metaType...) — e riottenerle indietro complete, senza
// un giro a parte per recuperare i campi che servono solo alla UI della card.
export function selezionaProssimaUscita<T extends CandidataProssimaUscita>(
  righe: T[],
  oggi: Date = new Date(),
): T | null {
  const candidate = righe.filter(r => r.reportageCount === 0)
  if (candidate.length === 0) return null

  const oggiISO = oggi.toISOString().slice(0, 10)

  const conDataFutura = candidate
    .filter(r => r.plannedDate !== null && r.plannedDate >= oggiISO)
    .sort((a, b) => a.plannedDate!.localeCompare(b.plannedDate!))
  if (conDataFutura.length > 0) return conDataFutura[0]

  const preferite = candidate
    .filter(r => r.favorite)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  if (preferite.length > 0) return preferite[0]

  return [...candidate].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
}
