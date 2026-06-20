'use client'
import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { SILabel, SISignals } from '@/lib/si/types'

interface Props {
  si?: number
  label?: SILabel
  signals?: SISignals
  isGhostTrail?: boolean
  partial?: boolean
  loading?: boolean
  compact?: boolean
  expanded?: boolean
}

interface SignalRow { icon: '✅' | '⚠️' | 'ℹ️'; text: string }

function signedNum(v: number): string {
  return `${v > 0 ? '+' : ''}${v}`
}

function signalRows(s: SISignals): SignalRow[] {
  const rows: SignalRow[] = []

  if (s.osm.accessPenalty < 0) {
    rows.push({ icon: '⚠️', text: `${signedNum(s.osm.accessPenalty)} ${s.osm.accessPenalty <= -60 ? 'Accesso vietato segnalato su OSM' : 'Accesso privato segnalato su OSM'}` })
  }
  if (s.osm.visibilityPenalty < 0) {
    rows.push({ icon: '⚠️', text: `${signedNum(s.osm.visibilityPenalty)} Scarsa visibilità del sentiero su OSM` })
  }
  if (s.osm.freshnessScore > 0) {
    rows.push({ icon: '✅', text: `${signedNum(s.osm.freshnessScore)} Dati OSM aggiornati di recente` })
  } else if (s.osm.freshnessScore < 0) {
    const text = s.osm.freshnessScore <= -30 ? 'Dati OSM non aggiornati da oltre 4 anni' : 'Dati OSM non aggiornati da 2-4 anni'
    rows.push({ icon: '⚠️', text: `${signedNum(s.osm.freshnessScore)} ${text}` })
  }
  if (s.osm.operatorBonus > 0) {
    rows.push({ icon: '✅', text: `${signedNum(s.osm.operatorBonus)} Gestito da una rete escursionistica ufficiale` })
  }

  if (s.weather.totalPenalty < 0) {
    rows.push({ icon: '⚠️', text: `${signedNum(Math.round(s.weather.totalPenalty))} Condizioni meteo/suolo sfavorevoli negli ultimi 7 giorni` })
  }

  if (s.climate.tempPenalty < 0) {
    rows.push({ icon: '⚠️', text: `${signedNum(s.climate.tempPenalty)} Temperature attuali sfavorevoli` })
  }
  if (s.climate.altitudeSeason < 0) {
    rows.push({ icon: '⚠️', text: `${signedNum(s.climate.altitudeSeason)} Quota elevata in stagione invernale` })
  }
  if (s.climate.seasonBonus > 0) {
    rows.push({ icon: '✅', text: `${signedNum(s.climate.seasonBonus)} Stagione favorevole per questo sentiero` })
  }

  if (s.satellite.available) {
    if (s.satellite.ndviDeltaPenalty < 0) rows.push({ icon: '⚠️', text: `${signedNum(s.satellite.ndviDeltaPenalty)} Variazione anomala della vegetazione (satellite)` })
    if (s.satellite.ndviAbsolutePenalty < 0) rows.push({ icon: '⚠️', text: `${signedNum(s.satellite.ndviAbsolutePenalty)} Vegetazione molto fitta (satellite)` })
    if (s.satellite.firePenalty < 0) rows.push({ icon: '⚠️', text: `${signedNum(s.satellite.firePenalty)} Possibile area incendiata (satellite)` })
    if (s.satellite.floodPenalty < 0) rows.push({ icon: '⚠️', text: `${signedNum(s.satellite.floodPenalty)} Possibile area alluvionata (satellite)` })
    if (s.satellite.landslidePenalty < 0) rows.push({ icon: '⚠️', text: `${signedNum(s.satellite.landslidePenalty)} Possibile rischio frana (satellite)` })
  } else {
    rows.push({ icon: 'ℹ️', text: 'Dati satellitari non disponibili' })
  }

  if (s.activity.dtrekBonus > 0) {
    rows.push({ icon: '✅', text: `${signedNum(s.activity.dtrekBonus)} Percorso recentemente registrato su DTrek` })
  }
  rows.push({ icon: 'ℹ️', text: `${signedNum(s.activity.heatmapPenalty)} Analisi heatmap non ancora disponibile` })

  if (s.community.osmNotesPenalty < 0) {
    rows.push({ icon: '⚠️', text: `${signedNum(s.community.osmNotesPenalty)} Segnalazioni recenti della comunità OSM nelle vicinanze` })
  }
  if (s.community.dtrekReviewsScore > 0) {
    rows.push({ icon: '✅', text: `${signedNum(s.community.dtrekReviewsScore)} Recensioni DTrek positive recenti` })
  } else if (s.community.dtrekReviewsScore < 0) {
    rows.push({ icon: '⚠️', text: `${signedNum(s.community.dtrekReviewsScore)} Recensioni DTrek negative recenti` })
  }

  return rows
}

function Pill({ children, className, title }: { children: React.ReactNode; className: string; title?: string }) {
  return <span title={title} className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${className}`}>{children}</span>
}

export function SIBadge({ si, label, signals, isGhostTrail, partial, loading, compact, expanded }: Props) {
  const [open, setOpen] = useState(false)

  if (loading) {
    return compact
      ? <Pill className="bg-stone-100 text-stone-400 animate-pulse">SI —</Pill>
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
        SI {si} — {label.text}{partial ? ' (parziale)' : ''}
      </Pill>
    )
  }

  if (!expanded) return null

  const rows = signals ? signalRows(signals) : []

  return (
    <div className="rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4" style={{ background: `${colorFor(label)}14`, borderBottom: `2px solid ${colorFor(label)}30` }}>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Security Index{partial ? ' (parziale)' : ''}</p>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black" style={{ color: colorFor(label) }}>{si}</span>
            <span className="text-sm font-semibold" style={{ color: colorFor(label) }}>{label.text}</span>
          </div>
        </div>
        <div className="ml-auto text-xs font-bold px-2 py-1 rounded-lg text-white" style={{ backgroundColor: colorFor(label) }}>SI</div>
      </div>

      {/* Toggle */}
      {rows.length > 0 && (
        <div className="px-5 py-3 bg-white">
          <button
            onClick={() => setOpen(v => !v)}
            className="w-full flex items-center justify-center gap-1 text-[11px] text-stone-400 hover:text-stone-600 transition-colors"
          >
            {open ? <><ChevronUp className="w-3.5 h-3.5" /> Nascondi dettagli</> : <><ChevronDown className="w-3.5 h-3.5" /> Mostra dettagli</>}
          </button>
        </div>
      )}

      {/* Expanded details */}
      {open && rows.length > 0 && (
        <div className="border-t border-stone-100 bg-stone-50 px-5 py-4 space-y-1.5">
          {rows.map((r, i) => (
            <p key={i} className="text-xs text-stone-600 leading-tight flex items-start gap-1.5">
              <span>{r.icon}</span><span>{r.text}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

// Tailwind color tokens aren't readable at runtime as hex — map the semantic
// `label.color` name to a hex used only for the inline header tint/text here.
function colorFor(label: SILabel): string {
  switch (label.color) {
    case 'green': return '#277134'
    case 'lime': return '#65a30d'
    case 'amber': return '#d97706'
    case 'red': return '#dc2626'
    default: return '#1f2937'
  }
}
