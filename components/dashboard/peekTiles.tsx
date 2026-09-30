'use client'
// Tessere del peek: i widget fissati sulla mappa della Home, in versione compatta "vetro" ma con la
// stessa grafica dei widget della dashboard (anelli, icone, andamenti, barre di avanzamento).
// - PeekTile: tessera generica alimentata da un riassunto calcolato subito (peekSummaries.ts).
// - Tessere dedicate per chi ha contenuto che arriva in ritardo (foto, meteo, curiosità): mostrano
//   un indicatore di caricamento finché il dato non c'è.
import Link from 'next/link'
import { useState } from 'react'
import { Loader2, CloudOff } from 'lucide-react'
import { wmoInfo } from '@/lib/weather'
import { useArchivePhoto, PhotoLightbox, useNextOutingWeather, useCuriosity, CuriosityModal } from './widgetsExtra'
import { fmtDate } from './widgetKit'
import type { PeekSummary, PeekVisual } from './peekSummaries'
import type { DashboardData } from './types'
import type { DashboardWidgetId } from '@/lib/dashboardConfig'

const GLASS = 'flex-1 min-w-0 min-h-[84px] rounded-2xl bg-white/14 backdrop-blur-md border border-white/20'
const LABEL = 'font-barlow text-[10px] font-bold tracking-wide uppercase text-white/65 truncate'

export function GlassRing({ value, color, size = 40 }: { value: number; color: string; size?: number }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div
      className="rounded-full shrink-0 flex items-center justify-center"
      style={{ width: size, height: size, background: `conic-gradient(${color} ${pct}%, rgba(255,255,255,0.18) ${pct}% 100%)` }}
    >
      <div className="rounded-full bg-[#0b1a24]/90 flex items-center justify-center" style={{ width: size - 9, height: size - 9 }}>
        <span className="font-display font-bold text-white" style={{ fontSize: size * 0.3 }}>{Math.round(value)}</span>
      </div>
    </div>
  )
}

/** Andamento in miniatura (area + linea), come i grafici di Volume e Bilancio fisico. */
function Spark({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null
  const min = Math.min(...values), max = Math.max(...values)
  const span = max - min || 1
  const W = 100, H = 26
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 2 - ((v - min) / span) * (H - 6)] as const)
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${W},${H} L0,${H} Z`
  const last = pts[pts.length - 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-6 mt-1.5" preserveAspectRatio="none" aria-hidden>
      <path d={area} fill={color} fillOpacity={0.25} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r={2} fill={color} />
    </svg>
  )
}

function LeftVisual({ v }: { v: PeekVisual }) {
  if (v.kind === 'ring') return <GlassRing value={v.value} color={v.color} />
  if (v.kind === 'icon') return <v.icon className={`w-8 h-8 shrink-0 ${v.className}`} />
  if (v.kind === 'emoji') return <span className="text-3xl leading-none shrink-0" aria-hidden>{v.text}</span>
  if (v.kind === 'image') {
    return (
      <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/10 flex items-center justify-center shrink-0">
        {v.url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={v.url} alt="" className="w-full h-full object-cover" />
          : <v.fallback className="w-5 h-5 text-white/75" />}
      </div>
    )
  }
  return null
}

/** Tessera generica: grafica a sinistra (anello, icona, emoji, copertina) oppure sotto (andamento,
 *  barra di avanzamento), poi etichetta, valore e didascalia. */
export function PeekTile({ summary }: { summary: PeekSummary }) {
  const v = summary.visual
  const below = v && (v.kind === 'spark' || v.kind === 'bar')
  const body = (
    <div className="flex items-center gap-2.5">
      {v && !below && <LeftVisual v={v} />}
      <div className="min-w-0 flex-1">
        <div className={LABEL}>{summary.label}</div>
        <div className="font-display font-semibold text-[13px] text-white truncate mt-0.5">{summary.value}</div>
        {summary.caption && <div className="text-[10px] text-white/65 mt-0.5 truncate">{summary.caption}</div>}
        {v?.kind === 'spark' && <Spark values={v.values} color={v.color} />}
        {v?.kind === 'bar' && (
          <div className="h-1.5 rounded-full bg-white/18 overflow-hidden mt-1.5">
            <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, v.pct))}%`, background: v.color }} />
          </div>
        )}
      </div>
    </div>
  )
  return (
    <div className={`${GLASS} p-3.5 flex items-center`}>
      <div className="w-full min-w-0">{summary.href ? <Link href={summary.href} className="block">{body}</Link> : body}</div>
    </div>
  )
}

function Loading({ label, text }: { label: string; text: string }) {
  return (
    <div className={`${GLASS} p-3.5`}>
      <div className={LABEL}>{label}</div>
      <div className="flex items-center gap-2 text-[11px] text-white/70 mt-2">
        <Loader2 className="w-4 h-4 animate-spin shrink-0" /> {text}
      </div>
    </div>
  )
}

function Message({ label, text, unavailable }: { label: string; text: string; unavailable?: boolean }) {
  return (
    <div className={`${GLASS} p-3.5`}>
      <div className={LABEL}>{label}</div>
      <div className="flex items-start gap-2 font-lora italic text-[11px] text-white/60 leading-snug mt-1.5">
        {unavailable && <CloudOff className="w-3.5 h-3.5 shrink-0 mt-0.5" />} {text}
      </div>
    </div>
  )
}

/** Foto dal tuo archivio: miniatura che si ingrandisce con un tocco. */
function PhotoPeekTile({ data }: { data: DashboardData }) {
  const { found, another } = useArchivePhoto(data.activities)
  const [open, setOpen] = useState(false)
  if (found === undefined) return <Loading label="Dal tuo archivio" text="Cerco una foto…" />
  if (found === null) return <Message label="Dal tuo archivio" text="Nessuna foto ancora" />
  return (
    <div className={`${GLASS} p-2 flex items-center gap-2.5`}>
      <button onClick={() => setOpen(true)} aria-label="Ingrandisci la foto" className="shrink-0 w-[68px] h-[68px] rounded-xl overflow-hidden bg-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={found.thumb} alt={found.caption || found.activity.title} className="w-full h-full object-cover" loading="lazy" />
      </button>
      <div className="min-w-0">
        <div className={LABEL}>Dal tuo archivio</div>
        <div className="font-display font-semibold text-[13px] text-white truncate mt-0.5">{found.activity.title}</div>
        <div className="text-[10px] text-white/65 mt-0.5 truncate">{fmtDate(found.activity.startTime)}</div>
      </div>
      {open && <PhotoLightbox photo={found} onClose={() => setOpen(false)} onAnother={another} />}
    </div>
  )
}

/** Meteo del giorno della prossima uscita: le ore principali con icona e temperatura. */
function MeteoPeekTile({ data }: { data: DashboardData }) {
  const w = useNextOutingWeather(data)
  if (w.status === 'loading') return <Loading label="Meteo prossima uscita" text="Carico le previsioni…" />
  if (w.status === 'none') return <Message label="Meteo prossima uscita" text="Nessuna uscita in programma" />
  if (w.status === 'nopoint') return <Message label="Meteo prossima uscita" text="Il percorso non ha un punto di partenza" />
  if (w.status === 'error') return <Message label="Meteo prossima uscita" text="Previsioni non disponibili per questa data" unavailable />
  const slots = w.hours.filter((h) => [9, 12, 15, 18].includes(Number(h.time.slice(11, 13))))
  return (
    <div className={`${GLASS} p-3`}>
      <div className={LABEL}>Meteo · {w.title}</div>
      <div className="flex justify-between gap-1 mt-1.5">
        {slots.map((h) => (
          <div key={h.time} className="text-center min-w-0">
            <div className="text-[9.5px] text-white/60 tabular-nums">{h.time.slice(11, 13)}</div>
            <div className="text-lg leading-tight" title={wmoInfo(h.weathercode).label}>{wmoInfo(h.weathercode).emoji}</div>
            <div className="font-display font-bold text-[12px] text-white tabular-nums">{Math.round(h.temperature)}°</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Lo sapevi che: titolo e inizio della voce; un tocco apre il testo intero. */
function CuriosityPeekTile({ data }: { data: DashboardData }) {
  const c = useCuriosity(data)
  const [open, setOpen] = useState(false)
  if (c.status === 'loading') return <Loading label="Lo sapevi che" text="Cerco curiosità…" />
  if (c.status === 'noref') return <Message label="Lo sapevi che" text="Registra o pianifica un’uscita" />
  if (c.status === 'error') return <Message label="Lo sapevi che" text="Wikipedia non raggiungibile" unavailable />
  if (c.status === 'empty') return <Message label="Lo sapevi che" text="Nessuna voce nei dintorni" />
  return (
    <div className={`${GLASS} p-3.5`}>
      <button onClick={() => setOpen(true)} className="block w-full text-left">
        <div className={LABEL}>Lo sapevi che</div>
        <div className="font-display font-semibold text-[13px] text-white truncate mt-0.5">{c.page.title}</div>
        <p className="font-lora text-[10.5px] text-white/70 leading-snug mt-0.5 line-clamp-2">{c.page.extract}</p>
      </button>
      {open && <CuriosityModal page={c.page} label={c.label} onClose={() => setOpen(false)} onAnother={c.count > 1 ? c.another : undefined} />}
    </div>
  )
}

export const PEEK_TILES: Partial<Record<DashboardWidgetId, React.ComponentType<{ data: DashboardData }>>> = {
  'foto-diario': PhotoPeekTile,
  'meteo-uscita': MeteoPeekTile,
  'lo-sapevi': CuriosityPeekTile,
}
