'use client'
import { useState } from 'react'
import { Compass, Layers } from 'lucide-react'
import { ScoreRing, computeTrailScoreBreakdown, isTrailScoreVetoed, type CLProps, type CtsProps, type ShadeWaterProps } from '@/components/ScoreRing'
import { TrailScoreGaugeBadge } from '@/components/TrailScoreGaugeBadge'
import type { SafetyScore } from '@/lib/safetyScore'
import { glassTile, textMuted } from '@/components/routehub/overlayTheme'
import Kicker from '@/components/ui/Kicker'

interface Props {
  cl: CLProps
  safety: SafetyScore | null
  cts: CtsProps
  shadeWater: ShadeWaterProps
  /** Temperatura prevista (°C) nel giorno dell'escursione — vedi app/guida/useForecastTemp.ts.
   *  Passata a ScoreRing per la ponderazione stagionale di Ombra&Acqua nel Trail Score v2. */
  forecastTempC?: number | null
  showAspectToggle: boolean
  showGradientToggle: boolean
  showAspect: boolean
  showGradient: boolean
  onToggleAspect: () => void
  onToggleGradient: () => void
}

type ScoreView = 'sintesi' | 'dettaglio'

/** Punteggi (CL/Sicurezza/Comfort Trail Score/ombra-acqua) — spostati dalla vecchia tab
 *  "Dati & punteggi" nella sezione "Dati e sicurezza" della guida magazine. Due grafici in due
 *  sotto-tab: "Sintesi" (il badge a doppio anello, stesso usato in copertina/galleria — primo
 *  visibile) e "Dettaglio" (il radar a 3 assi con ogni segmento espandibile). Smontano/rimontano
 *  al cambio di sotto-tab (non solo si nascondono) così ciascun grafico riparte con la propria
 *  animazione d'ingresso ogni volta che ci si torna, invece di restare statico dopo il primo mount
 *  — stesso principio già usato da components/guida/widgets/DatiSicurezzaTabs.tsx per le sue tab. */
export default function ScoresWidget({
  cl, safety, cts, shadeWater, forecastTempC,
  showAspectToggle, showGradientToggle, showAspect, showGradient, onToggleAspect, onToggleGradient,
}: Props) {
  const [view, setView] = useState<ScoreView>('sintesi')
  const breakdown = computeTrailScoreBreakdown(cl, safety, cts, shadeWater, forecastTempC)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Kicker>Punteggio complessivo</Kicker>
        <div className="inline-flex bg-stone-100 rounded-full p-0.5 shrink-0">
          {(['sintesi', 'dettaglio'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 rounded-full text-[11px] font-bold capitalize transition-colors ${
                view === v ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === 'sintesi' && (
        <div className="rounded-2xl bg-gradient-to-br from-stone-900 to-stone-800 px-5 py-7 flex items-center justify-center">
          <TrailScoreGaugeBadge
            total={breakdown.total > 0 ? breakdown.total : null}
            value={breakdown.value}
            safety={safety}
            vetoed={isTrailScoreVetoed(safety)}
            size={128}
          />
        </div>
      )}
      {view === 'dettaglio' && (
        <ScoreRing cl={cl} safety={safety} cts={cts} shadeWater={shadeWater} forecastTempC={forecastTempC} />
      )}

      {(showAspectToggle || showGradientToggle) && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {showAspectToggle && (
            <button onClick={onToggleAspect}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border transition-colors ${showAspect ? 'bg-sky-500 text-white border-sky-500' : `${glassTile} ${textMuted}`}`}>
              <Compass className="w-3 h-3" /> Esposizione
            </button>
          )}
          {showGradientToggle && (
            <button onClick={onToggleGradient}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border transition-colors ${showGradient ? 'bg-sky-500 text-white border-sky-500' : `${glassTile} ${textMuted}`}`}>
              <Layers className="w-3 h-3" /> Pendenza
            </button>
          )}
        </div>
      )}
    </div>
  )
}
