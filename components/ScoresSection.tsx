'use client'
import { Loader2, RefreshCw } from 'lucide-react'
import type { CLLabel, CLSignals } from '@/lib/cl/types'
import type { SafetyScore } from '@/lib/safetyScore'
import type { TrailScoreResult } from '@/lib/trailScore'
import type { BeautyScore } from '@/lib/beautyScore'
import type { Sentinel2Data } from '@/lib/cl/types'
import { CLBadge } from '@/components/CLBadge'
import { CurrentConditionsNotice } from '@/components/CurrentConditionsNotice'
import { SafetyScoreWidget } from '@/components/SafetyScoreWidget'
import { ComfortTrailScoreWidget } from '@/components/ComfortTrailScoreWidget'
import { ShadeWaterTile } from '@/components/ShadeWaterTile'

interface CLProps {
  si?: number
  label?: CLLabel
  signals?: CLSignals
  isGhostTrail?: boolean
  partial?: boolean
  loading?: boolean
  notMatched?: boolean
  onRefresh?: () => void
  refreshing?: boolean
  refreshError?: string | null
  // Trail identification for the live "Condizioni attuali" fetch.
  osmId?: number
  polyline?: [number, number][]
  plannedId?: string
}

interface CtsProps {
  result: TrailScoreResult | null
  cached?: number
  beautyScore?: BeautyScore
  computing?: boolean
  onCompute?: () => void
}

export function ScoresSection({
  cl, safety, cts, shadeWater,
}: {
  cl: CLProps
  safety: SafetyScore | null
  cts: CtsProps
  shadeWater: { data: Sentinel2Data | null; loading?: boolean }
}) {
  const hasCts = cts.result != null || cts.cached != null

  return (
    <div className="space-y-3">
      <h2 className="font-display text-xl font-semibold text-stone-700">Punteggi</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
        {cl.notMatched
          ? <p className="text-sm text-stone-400 col-span-full">Sentiero non identificato — impossibile calcolare il livello di affidabilità.</p>
          : <CLBadge
              si={cl.si} label={cl.label} signals={cl.signals} isGhostTrail={cl.isGhostTrail}
              partial={cl.partial} loading={cl.loading} expanded
              onRefresh={cl.onRefresh} refreshing={cl.refreshing} refreshError={cl.refreshError}
            />}

        {safety && <SafetyScoreWidget safety={safety} />}

        {hasCts ? (
          <ComfortTrailScoreWidget result={cts.result} cached={cts.cached} beautyScore={cts.beautyScore} />
        ) : cts.onCompute ? (
          <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3.5 flex flex-col gap-2 justify-center">
            <p className="text-xs text-stone-500">Comfort TrailScore non calcolato.</p>
            <button
              onClick={cts.onCompute}
              disabled={cts.computing}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-medium transition-colors"
            >
              {cts.computing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Calcolo…</> : <><RefreshCw className="w-3.5 h-3.5" /> Calcola CTS</>}
            </button>
          </div>
        ) : null}

        <ShadeWaterTile data={shadeWater.data} loading={shadeWater.loading} />
      </div>

      {!cl.notMatched && (
        <CurrentConditionsNotice
          osmId={cl.osmId}
          polyline={cl.polyline}
          plannedId={cl.plannedId}
          signals={cl.signals}
        />
      )}
    </div>
  )
}
