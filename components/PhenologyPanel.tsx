'use client'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { TreePine, Leaf } from 'lucide-react'
import type { Sentinel2Data } from '@/lib/si/types'
import type { FloraResult } from '@/lib/floraTypes'

const MONTH_LABEL = Array.from({ length: 12 }, (_, i) => format(new Date(2024, i, 1), 'MMM', { locale: it }))

const LEAF_TYPE_LABEL: Record<string, string> = {
  broadleaved: 'Latifoglie',
  needleleaved: 'Conifere',
  mixed: 'Bosco misto',
}

interface Props {
  data: Sentinel2Data | null
  loading?: boolean
  flora: FloraResult | null
  floraLoading?: boolean
}

// ── Phenology chart ───────────────────────────────────────────────────────────

function PhenologyChart({ data }: { data: Sentinel2Data }) {
  if (!data.ndviMonthly) return null
  const chartData = data.ndviMonthly.map((ndvi, i) => ({ month: MONTH_LABEL[i], ndvi: Math.round(ndvi * 1000) / 1000 }))
  const peakLabel = data.phenologyPeakMonth ? MONTH_LABEL[data.phenologyPeakMonth - 1] : null

  const insights: string[] = []
  if (peakLabel) insights.push(`Picco di vegetazione a ${peakLabel}`)
  if (data.ndviDelta != null && data.ndviDelta < -0.1) insights.push('Calo recente della vegetazione rispetto alla media stagionale')
  else if (data.ndviDelta != null && data.ndviDelta > 0.1) insights.push('Vegetazione in forte crescita rispetto alla media stagionale')
  if (data.landscapeVariety != null) {
    insights.push(data.landscapeVariety > 0.12 ? 'Paesaggio molto variegato lungo il percorso' : 'Paesaggio piuttosto uniforme lungo il percorso')
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-stone-700">Fenologia della vegetazione</p>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="ndviGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#277134" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#277134" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" />
            <XAxis dataKey="month" tick={{ fontSize: 11, fontFamily: 'DM Sans' }} tickLine={false} />
            <YAxis domain={[0, 1]} tick={{ fontSize: 11, fontFamily: 'DM Sans' }} tickLine={false} axisLine={false} width={36} />
            <Tooltip
              formatter={(v: number) => [v.toFixed(2), 'NDVI']}
              contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 13 }}
            />
            {peakLabel && <ReferenceLine x={peakLabel} stroke="#277134" strokeDasharray="4 4" />}
            <Area type="monotone" dataKey="ndvi" stroke="#277134" strokeWidth={2} fill="url(#ndviGrad)" dot={false} activeDot={{ r: 4 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {insights.length > 0 && (
        <ul className="text-xs text-stone-500 space-y-0.5">
          {insights.map((t, i) => <li key={i}>• {t}</li>)}
        </ul>
      )}
      {data.landscapeVariety != null && (
        <div className="flex items-center justify-between text-xs text-stone-500 pt-1 border-t border-stone-100">
          <span className="flex items-center gap-1.5"><TreePine className="w-3.5 h-3.5 text-emerald-600" /> Varietà del paesaggio</span>
          <span className="font-semibold text-stone-700">{data.landscapeVariety.toFixed(2)}</span>
        </div>
      )}
    </div>
  )
}

// ── Flora / specie arboree ─────────────────────────────────────────────────────

function FloraSection({ flora, loading }: { flora: FloraResult | null; loading?: boolean }) {
  if (loading) {
    return <div className="h-16 bg-stone-50 rounded-xl animate-pulse" />
  }
  if (!flora || !flora.available) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold text-stone-700 flex items-center gap-1.5"><Leaf className="w-4 h-4 text-emerald-600" /> Specie arboree e flora</p>
        <p className="text-xs text-stone-400">Dati sulla vegetazione non disponibili per questo percorso.</p>
      </div>
    )
  }

  const belt = flora.estimatedBelt

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-stone-700 flex items-center gap-1.5"><Leaf className="w-4 h-4 text-emerald-600" /> Specie arboree e flora</p>
      {flora.leafTypeDominant ? (
        <p className="text-xs text-stone-600">
          Bosco prevalente: <span className="font-semibold">{LEAF_TYPE_LABEL[flora.leafTypeDominant]}</span>
          {flora.forestCoveragePct != null && <span className="text-stone-400"> · copertura boschiva ~{flora.forestCoveragePct}%</span>}
        </p>
      ) : belt ? (
        <p className="text-xs text-stone-600">
          <span className="text-[10px] font-semibold uppercase text-amber-600 mr-1">Stima</span>
          Tipo di bosco non mappato su OSM — in base a quota e posizione è probabile la <span className="font-semibold">{belt.label}</span>.
        </p>
      ) : (
        <p className="text-xs text-stone-400">Nessuna area boschiva rilevata via OSM lungo il percorso.</p>
      )}
      {flora.speciesFound.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {flora.speciesFound.map(s => (
            <span key={s} className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">{s}</span>
          ))}
        </div>
      ) : belt ? (
        <p className="text-[11px] text-stone-500 leading-snug">
          <span className="italic">Specie non annotate su OSM. </span>{belt.description}
        </p>
      ) : (
        <p className="text-[11px] text-stone-400 italic">Nessuna specie o genere arboreo specifico annotato su OSM per quest&apos;area.</p>
      )}
    </div>
  )
}

// ── Main panel ─────────────────────────────────────────────────────────────────

export function PhenologyPanel({ data, loading, flora, floraLoading }: Props) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-stone-200 shadow-sm p-5 animate-pulse">
        <div className="h-48 bg-stone-50 rounded-xl" />
      </div>
    )
  }

  if (!data || !data.available) {
    const message = (() => {
      switch (data?.reason) {
        case 'unreachable':
          return 'Servizio satellitare temporaneamente non raggiungibile — riprova più tardi.'
        case 'no_data':
          return 'Nessuna scena satellitare recente sufficientemente priva di nuvole per questo percorso.'
        case 'api_error':
          return 'Servizio satellitare temporaneamente non disponibile — riprova più tardi.'
        case 'no_geometry':
          return 'Dati satellitari non disponibili per questo percorso.'
        default:
          return 'Dati satellitari non disponibili per questo percorso.'
      }
    })()

    return (
      <div className="rounded-2xl border border-stone-200 bg-stone-50 px-5 py-4 space-y-4">
        <div>
          <p className="text-sm text-stone-500">{message}</p>
          {data?.debugInfo && (
            <p className="text-xs text-stone-400 font-mono mt-1.5">{data.debugInfo}</p>
          )}
        </div>
        <FloraSection flora={flora} loading={floraLoading} />
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-stone-200 shadow-sm p-5 space-y-5">
      <PhenologyChart data={data} />
      <div className="pt-1 border-t border-stone-100">
        <FloraSection flora={flora} loading={floraLoading} />
      </div>
    </div>
  )
}
