'use client'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { WeatherSignal, ClimateSignal } from '@/lib/trailConditions/types'
import { CONDITIONS_PARAM_DESCRIPTIONS } from '@/lib/trailConditions/paramDescriptions'
import { InfoTooltip } from '@/components/InfoTooltip'
import Kicker from '@/components/ui/Kicker'

interface Props {
  osmId?: number
  polyline?: [number, number][]
  plannedId?: string
}

interface SignalRow { icon: '✅' | '⚠️' | 'ℹ️'; text: string; kind: keyof typeof CONDITIONS_PARAM_DESCRIPTIONS }

function queryFor({ osmId, polyline, plannedId }: Props): string | null {
  const plannedSuffix = plannedId ? `&planned_id=${encodeURIComponent(plannedId)}` : ''
  if (osmId != null) return `osm_relation_id=${osmId}${plannedSuffix}`
  if (polyline && polyline.length >= 2) return `polyline=${encodeURIComponent(JSON.stringify(polyline))}${plannedSuffix}`
  return null
}

function currentRows(weather: WeatherSignal, climate: ClimateSignal): SignalRow[] {
  const rows: SignalRow[] = []
  if (weather.totalPenalty < 0) {
    rows.push({ icon: '⚠️', kind: 'weather', text: 'Condizioni meteo/suolo sfavorevoli negli ultimi 7 giorni' })
  }
  if (climate.tempPenalty < 0) {
    rows.push({ icon: '⚠️', kind: 'climateTemp', text: 'Temperature attuali sfavorevoli' })
  }
  if (climate.altitudeSeason < 0) {
    rows.push({ icon: '⚠️', kind: 'climateAltitude', text: 'Quota elevata in stagione invernale' })
  }
  if (climate.seasonBonus > 0) {
    rows.push({ icon: '✅', kind: 'climateSeason', text: 'Stagione favorevole per questo sentiero' })
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
          <InfoTooltip text={CONDITIONS_PARAM_DESCRIPTIONS[r.kind]} />
        </p>
      ))}
    </div>
  )
}

export function CurrentConditionsNotice({ osmId, polyline, plannedId }: Props) {
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
    <div className="space-y-2">
      <Kicker>Condizioni attuali</Kicker>
      {loading ? (
        <p className="text-xs text-stone-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Caricamento…</p>
      ) : conditions ? (
        <RowList rows={currentRows(conditions.weather, conditions.climate)} />
      ) : (
        <p className="text-xs text-stone-400 leading-tight">Condizioni attuali non disponibili.</p>
      )}
    </div>
  )
}
