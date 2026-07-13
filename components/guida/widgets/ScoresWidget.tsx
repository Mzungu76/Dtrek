'use client'
import { Compass, Layers } from 'lucide-react'
import { ScoreRing, type CLProps, type CtsProps, type ShadeWaterProps } from '@/components/ScoreRing'
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

/** Punteggi (CL/Sicurezza/Comfort Trail Score/ombra-acqua) — spostati dalla vecchia tab
 *  "Dati & punteggi" nella sezione "Dati e sicurezza" della guida magazine. */
export default function ScoresWidget({
  cl, safety, cts, shadeWater, forecastTempC,
  showAspectToggle, showGradientToggle, showAspect, showGradient, onToggleAspect, onToggleGradient,
}: Props) {
  return (
    <div className="space-y-3">
      <Kicker>Punteggio complessivo</Kicker>
      <ScoreRing cl={cl} safety={safety} cts={cts} shadeWater={shadeWater} forecastTempC={forecastTempC} />

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
