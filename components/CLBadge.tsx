'use client'
import { useState } from 'react'
import { RefreshCw, Loader2 } from 'lucide-react'
import type { CLLabel, CLSignals } from '@/lib/cl/types'
import { CL_PARAM_DESCRIPTIONS } from '@/lib/cl/paramDescriptions'
import { InfoTooltip } from '@/components/InfoTooltip'
import { ScoreTile } from '@/components/ScoreTile'

interface Props {
  si?: number
  // Trasparenza sulla correzione di densità dati (Trail Score v2 spec §5) — vedi
  // lib/cl/signals/densitySignal.ts. siRaw è il valore prima della correzione,
  // dataDensityFactor il moltiplicatore applicato (0.3-1).
  siRaw?: number
  dataDensityFactor?: number
  label?: CLLabel
  signals?: CLSignals
  isGhostTrail?: boolean
  partial?: boolean
  loading?: boolean
  compact?: boolean
  expanded?: boolean
  defaultOpen?: boolean
  onRefresh?: () => void
  refreshing?: boolean
  refreshError?: string | null
}

interface SignalRow { icon: '✅' | '⚠️' | 'ℹ️'; text: string; kind: keyof typeof CL_PARAM_DESCRIPTIONS }

function signedNum(v: number): string {
  return `${v > 0 ? '+' : ''}${v}`
}

function signalRows(s: CLSignals): SignalRow[] {
  const rows: SignalRow[] = []

  if (s.osm.accessPenalty < 0) {
    rows.push({ icon: '⚠️', kind: 'osmAccess', text: `${signedNum(s.osm.accessPenalty)} ${s.osm.accessPenalty <= -60 ? 'Accesso vietato segnalato su OSM' : 'Accesso privato segnalato su OSM'}` })
  }
  if (s.osm.freshnessScore > 0) {
    rows.push({ icon: '✅', kind: 'osmFreshness', text: `${signedNum(s.osm.freshnessScore)} Dati OSM aggiornati di recente` })
  } else if (s.osm.freshnessScore < 0) {
    const text = s.osm.freshnessScore <= -30 ? 'Dati OSM non aggiornati da oltre 4 anni' : 'Dati OSM non aggiornati da 2-4 anni'
    rows.push({ icon: '⚠️', kind: 'osmFreshness', text: `${signedNum(s.osm.freshnessScore)} ${text}` })
  }
  if (s.osm.operatorBonus > 0) {
    rows.push({ icon: '✅', kind: 'osmOperator', text: `${signedNum(s.osm.operatorBonus)} Gestito da una rete escursionistica ufficiale` })
  }

  if (s.satellite.available) {
    if (s.satellite.ndviDeltaPenalty < 0) rows.push({ icon: '⚠️', kind: 'satelliteNdviDelta', text: `${signedNum(s.satellite.ndviDeltaPenalty)} Variazione anomala della vegetazione (satellite)` })
    if (s.satellite.firePenalty < 0) rows.push({ icon: '⚠️', kind: 'satelliteFire', text: `${signedNum(s.satellite.firePenalty)} Possibile area incendiata (satellite)` })
  } else if (s.satellite.floodSource === 'none' && s.satellite.landslideSource === 'none') {
    rows.push({ icon: 'ℹ️', kind: 'satelliteUnavailable', text: 'Dati satellitari non disponibili' })
  }
  // Flood/landslide rows sit outside the `available` gate: an official PAI polygon is
  // authoritative even when the Sentinel-2 heuristic itself didn't run (see
  // lib/cl/signals/satelliteSignals.ts's applyPaiOverride).
  if (s.satellite.floodPenalty < 0) {
    rows.push(s.satellite.floodSource === 'pai'
      ? { icon: '⚠️', kind: 'paiFlood', text: `${signedNum(s.satellite.floodPenalty)} Rischio alluvione ufficiale PAI (classe ${s.satellite.paiFloodClass})` }
      : { icon: '⚠️', kind: 'satelliteFlood', text: `${signedNum(s.satellite.floodPenalty)} Possibile area alluvionata (satellite)` })
  }
  if (s.satellite.landslidePenalty < 0) {
    rows.push(s.satellite.landslideSource === 'pai'
      ? { icon: '⚠️', kind: 'paiLandslide', text: `${signedNum(s.satellite.landslidePenalty)} Rischio frana ufficiale PAI (classe ${s.satellite.paiLandslideClass})` }
      : { icon: '⚠️', kind: 'satelliteLandslide', text: `${signedNum(s.satellite.landslidePenalty)} Possibile rischio frana (satellite)` })
  }
  if (s.activity.dtrekBonus > 0) {
    rows.push({ icon: '✅', kind: 'activityDtrek', text: `${signedNum(s.activity.dtrekBonus)} Percorso recentemente registrato su DTrek` })
  }
  if (s.community.osmNotesPenalty < 0) {
    rows.push({ icon: '⚠️', kind: 'communityNotes', text: `${signedNum(s.community.osmNotesPenalty)} Segnalazioni recenti della comunità OSM nelle vicinanze` })
  }
  if (s.community.difficultyMarkersPenalty < 0) {
    rows.push({ icon: '⚠️', kind: 'communityMarkers', text: `${signedNum(s.community.difficultyMarkersPenalty)} Tratti difficili segnalati nel tracciato GPX importato` })
  }

  return rows
}

function Pill({ children, className, title }: { children: React.ReactNode; className: string; title?: string }) {
  return <span title={title} className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${className}`}>{children}</span>
}

// Tailwind color tokens aren't readable at runtime as hex — map the semantic
// `label.color` name to a hex used only for the inline header tint/text here.
function colorFor(label: CLLabel): string {
  switch (label.color) {
    case 'green': return '#277134'
    case 'lime': return '#65a30d'
    case 'amber': return '#d97706'
    case 'red': return '#dc2626'
    default: return '#1f2937'
  }
}

export function CLBadge({ si, siRaw, dataDensityFactor, label, signals, isGhostTrail, partial, loading, compact, expanded, defaultOpen, onRefresh, refreshing, refreshError }: Props) {
  const [open, setOpen] = useState(!!defaultOpen)

  if (loading) {
    return compact
      ? <Pill className="bg-stone-100 text-stone-400 animate-pulse">CL —</Pill>
      : (
        <div className="rounded-2xl border border-stone-200 shadow-sm overflow-hidden animate-pulse">
          <div className="px-5 py-4 bg-stone-50 h-20" />
        </div>
      )
  }

  if (isGhostTrail) {
    return compact
      ? <Pill className="bg-stone-200 text-stone-500" title="Nessun riscontro recente: usare con cautela">Sentiero non verificato</Pill>
      : (
        <div className="rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 bg-stone-50 flex items-center gap-3">
            <Pill className="bg-stone-200 text-stone-600">Sentiero non verificato</Pill>
            <p className="text-xs text-stone-400">Nessun dato OSM recente né riscontro di percorrenza — usare con cautela.</p>
          </div>
        </div>
      )
  }

  if (si == null || !label) return null

  if (compact) {
    return (
      <Pill className={`${label.tailwind} text-white`}>
        CL {si} — {label.text}{partial ? ' (parziale)' : ''}
      </Pill>
    )
  }

  if (!expanded) return null

  const rows = signals ? signalRows(signals) : []

  return (
    <ScoreTile
      title={`Confidence Level${partial ? ' (parziale)' : ''}`}
      score={si}
      label={label.text}
      color={colorFor(label)}
      badge="CL"
      open={open}
      onToggle={() => setOpen(v => !v)}
      hasDetail={rows.length > 0 || !!onRefresh}
    >
      <div className="space-y-1.5">
        {dataDensityFactor != null && dataDensityFactor < 0.999 && siRaw != null && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5">
            <span>📊</span>
            <span className="flex-1">
              Corretto da {Math.round(siRaw)} a {si} per bassa densità di dati indipendenti in questa zona (pochi contributor OSM o osservazioni naturalistiche nei dintorni).
            </span>
            <InfoTooltip text={CL_PARAM_DESCRIPTIONS.dataDensity} />
          </p>
        )}
        {rows.map((r, i) => (
          <p key={i} className="text-xs text-stone-600 leading-tight flex items-start gap-1.5">
            <span>{r.icon}</span>
            <span className="flex-1">{r.text}</span>
            <InfoTooltip text={CL_PARAM_DESCRIPTIONS[r.kind]} />
          </p>
        ))}
      </div>

      {onRefresh && (
        <div className="mt-3 pt-3 border-t border-stone-200">
          <button
            onClick={e => { e.stopPropagation(); onRefresh() }}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-medium transition-colors"
          >
            {refreshing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Aggiornamento…</> : <><RefreshCw className="w-3.5 h-3.5" /> Aggiorna CL</>}
          </button>
          {refreshError && <p className="text-[11px] text-amber-600 mt-1.5">{refreshError}</p>}
        </div>
      )}
    </ScoreTile>
  )
}
