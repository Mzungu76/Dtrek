'use client'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { WeatherSignal, ClimateSignal } from '@/lib/trailConditions/types'
import type { ClosureSignal } from '@/lib/community/closureSummary'
import { CONDITIONS_PARAM_DESCRIPTIONS } from '@/lib/trailConditions/paramDescriptions'
import { MAX_NOTE_LENGTH } from '@/lib/community/moderation'
import { InfoTooltip } from '@/components/InfoTooltip'
import Kicker from '@/components/ui/Kicker'

interface Props {
  osmId?: number
  polyline?: [number, number][]
  plannedId?: string
}

type Conditions = { weather: WeatherSignal; climate: ClimateSignal; closure: ClosureSignal }

interface SignalRow { icon: '✅' | '⚠️' | 'ℹ️'; text: string; kind: keyof typeof CONDITIONS_PARAM_DESCRIPTIONS }

function queryFor({ osmId, polyline, plannedId }: Props): string | null {
  const plannedSuffix = plannedId ? `&planned_id=${encodeURIComponent(plannedId)}` : ''
  if (osmId != null) return `osm_relation_id=${osmId}${plannedSuffix}`
  if (polyline && polyline.length >= 2) return `polyline=${encodeURIComponent(JSON.stringify(polyline))}${plannedSuffix}`
  return null
}

function currentRows(weather: WeatherSignal, climate: ClimateSignal): SignalRow[] {
  const rows: SignalRow[] = []
  // Un fallimento di rete verso Open-Meteo non deve leggersi come "nessuna segnalazione" (che
  // suggerisce condizioni verificate buone) — va detto esplicitamente che il dato manca.
  if (weather.unavailable) {
    rows.push({ icon: 'ℹ️', kind: 'weather', text: 'Condizioni meteo/suolo non disponibili al momento' })
  } else if (weather.totalPenalty < 0) {
    rows.push({ icon: '⚠️', kind: 'weather', text: 'Condizioni meteo/suolo sfavorevoli negli ultimi 7 giorni' })
  }
  if (climate.unavailable) {
    rows.push({ icon: 'ℹ️', kind: 'climateTemp', text: 'Temperatura/quota non disponibili al momento' })
  } else {
    if (climate.tempPenalty < 0) {
      rows.push({ icon: '⚠️', kind: 'climateTemp', text: 'Temperature attuali sfavorevoli' })
    }
    if (climate.altitudeSeason < 0) {
      rows.push({ icon: '⚠️', kind: 'climateAltitude', text: 'Quota elevata in stagione invernale' })
    }
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

// DTREK-AUDIT.md P0 #5 — a differenza delle righe meteo/clima sopra (correttivi morbidi), una
// chiusura confermata/segnalata è un fatto di sicurezza binario: merita un riquadro a sé,
// sempre in cima, mai annegato tra le altre righe informative.
function ClosureNotice({ closure }: { closure: ClosureSignal }) {
  if (closure.status !== 'confirmed' && closure.status !== 'reported') return null
  const confirmed = closure.status === 'confirmed'
  return (
    <div
      className={`rounded-lg px-3 py-2 text-xs leading-snug flex items-start gap-1.5 border ${
        confirmed ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'
      }`}
    >
      <span>{confirmed ? '⚠️' : 'ℹ️'}</span>
      <span className="flex-1">
        {confirmed
          ? `Sentiero probabilmente chiuso — segnalato da almeno ${closure.reporterCount} escursionisti`
          : 'Un escursionista ha segnalato una possibile chiusura — non confermato'}
        {closure.reason && <span className="block mt-0.5 italic">&ldquo;{closure.reason}&rdquo;</span>}
      </span>
    </div>
  )
}

// Form di segnalazione minimo — riusa osmId/polyline già ricevuti come prop dal componente
// (stesso dual-mode di /api/trails/closures), nessuna nuova prop richiesta ai chiamanti.
function ClosureReportForm({ osmId, polyline, onSubmitted }: { osmId?: number; polyline?: [number, number][]; onSubmitted: () => void }) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState<'closed' | 'reopened' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  if (osmId == null && (!polyline || polyline.length < 2)) return null

  const submit = async (status: 'closed' | 'reopened') => {
    setSubmitting(status)
    setError(null)
    try {
      const res = await fetch('/api/trails/closures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          osmRelationId: osmId,
          routePolyline: osmId == null ? polyline : undefined,
          status,
          reason: reason.trim() || undefined,
        }),
      })
      if (!res.ok) {
        if (res.status === 401) throw new Error('Accedi per inviare una segnalazione')
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Errore durante l’invio')
      }
      setSent(true)
      setReason('')
      onSubmitted()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore durante l’invio')
    } finally {
      setSubmitting(null)
    }
  }

  if (sent) {
    return <p className="text-xs text-forest-600 leading-tight">Grazie, segnalazione inviata.</p>
  }

  return (
    <div className="space-y-1.5 pt-1 border-t border-stone-100">
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value.slice(0, MAX_NOTE_LENGTH))}
        placeholder="Motivo facoltativo (es. frana, manutenzione)"
        rows={1}
        className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs text-stone-800 font-body resize-none focus:outline-none focus:ring-2 focus:ring-forest-400"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => submit('closed')}
          disabled={submitting != null}
          className="flex-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-700 border border-red-200 disabled:opacity-50"
        >
          {submitting === 'closed' ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : '🚫 Segnala chiuso'}
        </button>
        <button
          type="button"
          onClick={() => submit('reopened')}
          disabled={submitting != null}
          className="flex-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-forest-50 text-forest-700 border border-forest-200 disabled:opacity-50"
        >
          {submitting === 'reopened' ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : '✅ Segnala riaperto'}
        </button>
      </div>
      {error && <p className="text-[11px] text-red-500 leading-tight">{error}</p>}
    </div>
  )
}

export function CurrentConditionsNotice({ osmId, polyline, plannedId }: Props) {
  const [conditions, setConditions] = useState<Conditions | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const polylineKey = polyline ? JSON.stringify(polyline) : null

  useEffect(() => {
    const qs = queryFor({ osmId, polyline, plannedId })
    if (!qs) { setConditions(null); return }

    let cancelled = false
    setLoading(true)
    fetch(`/api/trails/conditions?${qs}`)
      .then(res => res.json())
      .then((data: Conditions | { error: string }) => {
        if (cancelled) return
        if ('weather' in data) setConditions(data)
        else setConditions(null)
      })
      .catch(() => { if (!cancelled) setConditions(null) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [osmId, polylineKey, plannedId, refreshKey])

  return (
    <div className="space-y-2">
      <Kicker>Condizioni attuali</Kicker>
      {loading ? (
        <p className="text-xs text-stone-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Caricamento…</p>
      ) : conditions ? (
        <>
          <ClosureNotice closure={conditions.closure} />
          <RowList rows={currentRows(conditions.weather, conditions.climate)} />
          <ClosureReportForm osmId={osmId} polyline={polyline} onSubmitted={() => setRefreshKey((k) => k + 1)} />
        </>
      ) : (
        <p className="text-xs text-stone-400 leading-tight">Condizioni attuali non disponibili.</p>
      )}
    </div>
  )
}
