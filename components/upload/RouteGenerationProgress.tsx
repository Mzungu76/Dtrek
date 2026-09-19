'use client'
// Barra di avanzamento condivisa fra Modalità A (SentieroGenerationPanel) e B
// (PersonalizeItineraryPanel) per "genera percorso" — entrambe le pipeline sono spezzate in step
// HTTP sequenziali (lib/routeBuilder/runStepBuild.ts, lib/routeBuilder/runMultiStopStepBuild.ts),
// ciascuno con la propria etichetta testuale passata via `onStage`. Niente percentuale numerica né
// stima di tempo rimanente (nessun dato affidabile per calcolarla, un numero finto sarebbe
// disonesto) — solo una barra che avanza a checkpoint fissi per step e l'etichetta di cosa sta
// facendo l'algoritmo in questo momento, in un linguaggio semplice.
import { useEffect, useState } from 'react'

/** Un checkpoint della pipeline: l'etichetta esatta passata a `onStage` in quello step, e quanto
 *  deve riempirsi la barra una volta raggiunto (0-100, crescente lungo l'array). Definita accanto
 *  a ciascun orchestratore (runStepBuild.ts/runMultiStopStepBuild.ts) — unica fonte di verità,
 *  così l'etichetta qui e quella davvero emessa non possono disallinearsi. */
export interface GenerationStage {
  label: string
  targetPct: number
}

interface Props {
  /** true mentre la generazione è in corso — a false il componente non renderizza nulla (nessuna
   *  barra "vuota" residua quando non c'è niente in corso: il pulsante torna al proprio stato). */
  active: boolean
  /** L'etichetta corrente, esattamente come emessa dall'orchestratore (onStage). */
  stage: string
  stages: GenerationStage[]
}

export default function RouteGenerationProgress({ active, stage, stages }: Props) {
  // Solo crescente: se due step arrivassero fuori ordine (rete, mai osservato ma non impossibile
  // con una risposta fuori sequenza) la barra non deve mai tornare indietro — un progresso che
  // regredisce sembra un errore anche quando non lo è.
  const [pct, setPct] = useState(0)
  useEffect(() => {
    if (!active) { setPct(0); return }
    const matched = stages.find(s => s.label === stage)
    if (matched) setPct(p => Math.max(p, matched.targetPct))
  }, [active, stage, stages])

  if (!active) return null

  return (
    <div className="space-y-1.5">
      <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-terra-500 relative overflow-hidden transition-[width] duration-700 ease-out"
          style={{ width: `${Math.max(6, pct)}%` }}
        >
          {/* Pulsazione leggera sul riempimento — l'unico segnale di "sto ancora lavorando" fra un
             checkpoint e il successivo, quando un singolo step può richiedere diversi secondi. */}
          <div className="absolute inset-0 bg-white/25 animate-pulse" />
        </div>
      </div>
      <p className="text-xs text-stone-500 text-center truncate">{stage || 'Preparo la generazione…'}</p>
    </div>
  )
}
