'use client'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { CLSignals, WeatherSignal, ClimateSignal } from '@/lib/cl/types'
import { CL_PARAM_DESCRIPTIONS } from '@/lib/cl/paramDescriptions'
import { InfoTooltip } from '@/components/InfoTooltip'

interface Params {
  osmId?: number
  polyline?: [number, number][]
  plannedId?: string
}

interface Props extends Params {
  // The already-fetched CL result's signals — used for the "permanent risks"
  // half so we don't hit the network for data the parent already has.
  signals?: CLSignals
}

interface SignalRow { icon: '✅' | '⚠️' | 'ℹ️'; text: string; kind: keyof typeof CL_PARAM_DESCRIPTIONS }

function signedNum(v: number): string {
  return `${v > 0 ? '+' : ''}${v}`
}

function queryFor({ osmId, polyline, plannedId }: Params): string | null {
  const plannedSuffix = plannedId ? `&planned_id=${encodeURIComponent(plannedId)}` : ''
  if (osmId != null) return `osm_relation_id=${osmId}${plannedSuffix}`
  if (polyline && polyline.length >= 2) return `polyline=${encodeURIComponent(JSON.stringify(polyline))}${plannedSuffix}`
  return null
}

// Weather + climate rows — same copy as CLBadge's signalRows, but only the
// live-fetched current-conditions signals belong in this section.
function currentRows(weather: WeatherSignal, climate: ClimateSignal): SignalRow[] {
  const rows: SignalRow[] = []
  if (weather.totalPenalty < 0) {
    rows.push({ icon: '⚠️', kind: 'weather', text: `${signedNum(Math.round(weather.totalPenalty))} Condizioni meteo/suolo sfavorevoli negli ultimi 7 giorni` })
  }
  if (climate.tempPenalty < 0) {
    rows.push({ icon: '⚠️', kind: 'climateTemp', text: `${signedNum(climate.tempPenalty)} Temperature attuali sfavorevoli` })
  }
  if (climate.altitudeSeason < 0) {
    rows.push({ icon: '⚠️', kind: 'climateAltitude', text: `${signedNum(climate.altitudeSeason)} Quota elevata in stagione invernale` })
  }
  if (climate.seasonBonus > 0) {
    rows.push({ icon: '✅', kind: 'climateSeason', text: `${signedNum(climate.seasonBonus)} Stagione favorevole per questo sentiero` })
  }
  return rows
}

// Permanent place risks — read directly from the cached CL signals.
function permanentRows(s: CLSignals): SignalRow[] {
  const rows: SignalRow[] = []
  if (s.satellite.rockfallPenalty < 0) {
    rows.push({ icon: '⚠️', kind: 'rockfall', text: `${signedNum(s.satellite.rockfallPenalty)} Rischio crollo roccioso da litologia CARG (classe ${s.satellite.rockfallClass})` })
  }
  if (s.osm.visibilityPenalty < 0) {
    rows.push({ icon: '⚠️', kind: 'osmVisibility', text: `${signedNum(s.osm.visibilityPenalty)} Scarsa visibilità del sentiero su OSM` })
  }
  if (s.satellite.ndviAbsolutePenalty < 0) {
    rows.push({ icon: '⚠️', kind: 'satelliteNdviAbs', text: `${signedNum(s.satellite.ndviAbsolutePenalty)} Vegetazione molto fitta (satellite)` })
  }
  return rows
}

function RowList({ rows }: { rows: SignalRow[] }) {
  if (rows.length === 0) {
    return <p className="text-xs text-stone-400 leading-tight">Nessuna segnalazione.</p>
  }
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <p key={i} className="text-xs text-stone-600 leading-tight flex items-start gap-1.5">
          <span>{r.icon}</span>
          <span className="flex-1">{r.text}</span>
          <InfoTooltip text={CL_PARAM_DESCRIPTIONS[r.kind]} />
        </p>
      ))}
    </div>
  )
}

export function CurrentConditionsNotice({ osmId, polyline, plannedId, signals }: Props) {
  const [conditions, setConditions] = useState<{ weather: WeatherSignal; climate: ClimateSignal } | null>(null)
  const [loading, setLoading] = useState(false)
  const polylineKey = polyline ? JSON.stringify(polyline) : null

  useEffect(() => {
    const qs = queryFor({ osmId, polyline, plannedId })
    if (!qs) { setConditions(null); return }

    let cancelled = false
    setLoading(true)
    fetch(`/api/trails/conditions?${qs}`)
      .then(res => res.json())
      .then((data: { weather: WeatherSignal; climate: ClimateSignal } | { error: string }) => {
        if (cancelled) return
        if ('weather' in data) setConditions(data)
        else setConditions(null)
      })
      .catch(() => { if (!cancelled) setConditions(null) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [osmId, polylineKey, plannedId])

  return (
    <div className="rounded-2xl border border-stone-200 shadow-sm overflow-hidden bg-white">
      <div className="px-5 py-4 space-y-4">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-stone-700">Condizioni attuali</h3>
          {loading ? (
            <p className="text-xs text-stone-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Caricamento…</p>
          ) : conditions ? (
            <RowList rows={currentRows(conditions.weather, conditions.climate)} />
          ) : (
            <p className="text-xs text-stone-400 leading-tight">Condizioni attuali non disponibili.</p>
          )}
        </div>

        <div className="space-y-2 pt-3 border-t border-stone-200">
          <h3 className="text-sm font-semibold text-stone-700">Rischi permanenti del luogo</h3>
          {signals ? (
            <RowList rows={permanentRows(signals)} />
          ) : (
            <p className="text-xs text-stone-400 leading-tight">Dati non disponibili.</p>
          )}
        </div>
      </div>
    </div>
  )
}
