// Raggruppamento per stagione dei Diari nella pagina di atterraggio — docs/diari-restyling-piano.md,
// Fase 1. Dedotto da `lastActivityAt`, mai mantenuto a mano: è la differenza deliberata rispetto a
// una raccolta come cartella (docs/mockup-diari-redesign/README.md) — l'utente non sposta niente,
// il gruppo di un Diario cambia da solo quando ci registra dentro una nuova uscita.
//
// Tre tipi di gruppo, nell'ordine in cui la pagina li mostra:
//  - "stagione_corrente": i Diari con l'ultima uscita nell'anno in corso, o senza ancora nessuna
//    uscita (un Diario appena creato è per definizione "di questa stagione") — mostrati come righe
//    individuali, quelle con più a cuore (uscita più recente prima).
//  - "stagione_passata": un gruppo per ogni anno solare precedente con almeno un Diario non
//    archiviato — collassato in una riga sola nella UI.
//  - "archivio": tutti i Diari archiviati insieme, sempre l'ultimo gruppo, indipendentemente
//    dall'anno della loro ultima uscita.
import type { DiarySummary } from './aggregateDiaries'

export type GruppoTipo = 'stagione_corrente' | 'stagione_passata' | 'archivio'

export interface GruppoDiari {
  tipo: GruppoTipo
  /** Anno come stringa per le stagioni, 'archivio' per il gruppo archiviati — chiave stabile per
   *  `key` React, non mostrata all'utente. */
  chiave: string
  etichetta: string
  diari: DiarySummary[]
}

function ordinaPerUltimaUscita(a: DiarySummary, b: DiarySummary): number {
  return (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '')
}

export function raggruppaDiari(diari: DiarySummary[], oggi: Date = new Date()): GruppoDiari[] {
  const annoCorrente = oggi.getFullYear()

  const correnti: DiarySummary[] = []
  const perAnnoPassato = new Map<number, DiarySummary[]>()
  const archiviati: DiarySummary[] = []

  for (const d of diari) {
    if (d.archivedAt) {
      archiviati.push(d)
      continue
    }
    const anno = d.lastActivityAt ? new Date(d.lastActivityAt).getFullYear() : annoCorrente
    if (anno >= annoCorrente) {
      correnti.push(d)
    } else {
      const lista = perAnnoPassato.get(anno) ?? []
      lista.push(d)
      perAnnoPassato.set(anno, lista)
    }
  }

  const gruppi: GruppoDiari[] = []

  if (correnti.length > 0) {
    gruppi.push({
      tipo: 'stagione_corrente',
      chiave: String(annoCorrente),
      etichetta: `Stagione ${annoCorrente}`,
      diari: correnti.sort(ordinaPerUltimaUscita),
    })
  }

  const anniPassatiOrdinati = Array.from(perAnnoPassato.keys()).sort((a, b) => b - a)
  for (const anno of anniPassatiOrdinati) {
    gruppi.push({
      tipo: 'stagione_passata',
      chiave: String(anno),
      etichetta: `Stagione ${anno}`,
      diari: perAnnoPassato.get(anno)!.sort(ordinaPerUltimaUscita),
    })
  }

  if (archiviati.length > 0) {
    gruppi.push({
      tipo: 'archivio',
      chiave: 'archivio',
      etichetta: 'Archivio',
      diari: archiviati.sort(ordinaPerUltimaUscita),
    })
  }

  return gruppi
}
