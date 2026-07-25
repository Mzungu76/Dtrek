'use client'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

// Suggerimenti mostrati a rotazione durante l'attesa (vedi SearchWaitingCard sotto) — un misto di
// funzionalità del wizard che l'utente potrebbe non aver notato (import multiplo, ricerche salvate,
// percorso tra 2 punti anche per "Esistenti") e curiosità da escursionismo, per rendere l'attesa
// meno vuota invece di un semplice spinner. Deliberatamente NON informazioni di avanzamento reale
// (quelle, quando disponibili, restano in `stageLabel` — vedi buildStage in RouteBuilder.tsx): qui
// si intrattiene, non si finge un progresso che il motore non riporta.
const WAITING_TIPS = [
  'Puoi selezionare più risultati insieme e importarli tutti in un colpo solo, dal pulsante "Seleziona più percorsi".',
  'Ogni ricerca riuscita resta salvata — la ritrovi in "Le mie ricerche", senza doverla rifare.',
  'Anche in "Esistenti" puoi impostare una destinazione: solo i percorsi che ci passano vicino restano tra i risultati.',
  'Il punteggio mostrato sui risultati è provvisorio — quello definitivo arriva dopo l\'importazione, con dati reali.',
  'Un sentiero segnato CAI riporta di solito il numero su pali o segnavia bianco-rossi lungo il percorso.',
  'La regola del 3:1 per stimare i tempi: aggiungi circa 1 ora ogni 300-400 m di dislivello positivo, oltre al tempo per la distanza.',
  'Tocca due punti sulla mappa per un percorso "da-a": partenza e destinazione, senza doverli scrivere.',
  'Portare sempre più acqua di quanta sembri necessaria: la sete si avverte spesso in ritardo rispetto alla disidratazione reale.',
] as const

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Sostituisce il vecchio indicatore a riga singola durante ricerca/generazione — ancorato sotto la
 * barra di ricerca/tab modalità in alto (mai in basso: lì convivono già la fila di chip e il FAB, e
 * una card più alta della vecchia pillola vi si sovrapporrebbe) — con un contatore del tempo
 * trascorso e un suggerimento a rotazione (vedi WAITING_TIPS) per rendere l'attesa meno vuota, dato
 * che una ricerca può richiedere diversi secondi (più chiamate HTTP in sequenza — vedi
 * runSearch/runStepBuild). Non inventa un progresso che non c'è: la fase mostrata (`stageLabel`)
 * resta quella reale.
 */
export default function SearchWaitingCard({ stageLabel }: { stageLabel: string }) {
  const [elapsed, setElapsed] = useState(0)
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * WAITING_TIPS.length))

  useEffect(() => {
    setElapsed(0)
    const timer = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const rotate = setInterval(() => setTipIndex(i => (i + 1) % WAITING_TIPS.length), 4500)
    return () => clearInterval(rotate)
  }, [])

  return (
    <div className="absolute left-3 right-3 sm:left-auto sm:right-3 sm:w-80 top-[124px] z-20 bg-white/95 backdrop-blur rounded-2xl shadow-md px-4 py-3">
      <div className="flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-terra-600 shrink-0" />
        <p className="flex-1 text-xs font-semibold text-stone-700 truncate">{stageLabel}</p>
        <span className="shrink-0 text-[10px] font-mono text-stone-400 tabular-nums">{formatElapsed(elapsed)}</span>
      </div>
      <p key={tipIndex} className="mt-1.5 text-[11px] text-stone-500 leading-snug">
        {WAITING_TIPS[tipIndex]}
      </p>
    </div>
  )
}
